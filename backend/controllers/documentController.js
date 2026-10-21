//backend\controllers\documentController.js
const pythonService = require('../services/pythonService');
const storageService = require('../services/storageService');
const supabase = require('../supabase');
const path = require('path');
const fs = require('fs');
const {
    normalizeSkill,
    skillKey,
    compactSkillKey,
    singularCompactSkillKey,
    buildComparisonKeys,
    addComparisonKeys,
    hasComparisonKey
} = require('../utils/skillNormalizer');
const { logAuditEvent } = require('../utils/auditLogger');

// Acronyms to preserve casing for (e.g. CRM, ERP, PLC)
const KNOWN_ACRONYMS = new Map([
    ['crm', 'CRM'],
    ['erp', 'ERP'],
    ['plc', 'PLC'],
    ['sql', 'SQL'],
    ['cad', 'CAD'],
    ['cam', 'CAM'],
    ['scada', 'SCADA'],
    ['api', 'API'],
    ['aws', 'AWS'],
    ['gcp', 'GCP'],
    ['html', 'HTML'],
    ['css', 'CSS'],
    ['ui', 'UI'],
    ['ux', 'UX'],
    ['hr', 'HR'],
    ['seo', 'SEO'],
    ['qa', 'QA'],
    ['ai', 'AI'],
    ['ml', 'ML'],
    ['iot', 'IoT'],
    ['it', 'IT'],
    ['saas', 'SaaS'],
    ['hvac', 'HVAC'],
    ['cnc', 'CNC'],
    ['pcb', 'PCB'],
    ['vlsi', 'VLSI']
]);

function formatSkillNameWithAcronyms(name) {
    if (!name) return '';
    const trimmed = typeof normalizeSkill === 'function' ? normalizeSkill(name) : String(name).trim();
    return trimmed.split(/(\s+|-|\/)/).map(token => {
        const lower = token.toLowerCase();
        if (KNOWN_ACRONYMS.has(lower)) {
            return KNOWN_ACRONYMS.get(lower);
        }
        return token;
    }).join('');
}

// ============================================================
// Cached Profile Helper — avoids re-querying `profiles` on every
// request within a 5-minute window for the same user.
// ============================================================
const profileCache = new Map();

const getProfileFromToken = async (userId) => {
    if (profileCache.has(userId)) {
        return profileCache.get(userId);
    }

    const { data, error } = await supabase
        .from('profiles')
        .select('id, employee_id, first_name, middle_name, last_name')
        .eq('id', userId)
        .single();

    const result = { data, error };

    if (!error && data) {
        profileCache.set(userId, result);
        setTimeout(() => profileCache.delete(userId), 5 * 60 * 1000);
    }

    return result;
};

// All normalization helpers imported from backend/utils/skillNormalizer.js
// (normalizeSkill, skillKey, compactSkillKey, singularCompactSkillKey,
//  buildComparisonKeys, addComparisonKeys, hasComparisonKey)

// ============ NEW: load this employee's full feedback history ============
// Pulls every skill this employee has ever approved or rejected from the
// feedback_training table (across ALL documents, not just the current one),
// so a skill rejected once (e.g. "Level", "Engr") never resurfaces in
// "Pending" again — whether it's a brand-new document or a rescan.
async function getEmployeeFeedbackHistory(employeeId) {
    const approvedKeys = new Set();
    const rejectedKeys = new Set();

    try {
        const { data: feedbackRows, error } = await supabase
            .from('feedback_training')
            .select('phrase, label')
            .eq('employee_id', employeeId);

        if (error) {
            console.error('⚠️ Could not load feedback_training history:', error.message);
            return { approvedKeys, rejectedKeys };
        }

        for (const row of feedbackRows || []) {
            if (row.label === 'Skill') addComparisonKeys(approvedKeys, row.phrase);
            if (row.label === 'Not Skill') addComparisonKeys(rejectedKeys, row.phrase);
        }

        console.log(`📊 Feedback history for ${employeeId}: ${approvedKeys.size} approved, ${rejectedKeys.size} rejected`);
    } catch (e) {
        console.error('⚠️ Error loading feedback history:', e.message);
    }

    return { approvedKeys, rejectedKeys };
}

// ============ IN-MEMORY CACHES (5-minute TTL) ============
let cachedGlobalNoise = null;
let cachedGlobalNoiseTime = 0;
let cachedKBSkills = null;
let cachedKBSkillsTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// ============ global rejected-noise history ============
// Any phrase repeatedly marked as Not Skill by other employees should be
// treated as learned noise and should not be shown again for manual review.
async function getGlobalRejectedNoiseKeys() {
    const now = Date.now();
    if (cachedGlobalNoise && (now - cachedGlobalNoiseTime < CACHE_TTL_MS)) {
        return cachedGlobalNoise;
    }
    const rejectedKeys = new Set();

    try {
        const { data: feedbackRows, error } = await supabase
            .from('feedback_training')
            .select('phrase')
            .eq('label', 'Not Skill');

        if (error) {
            console.error('⚠️ Could not load global rejected-noise history:', error.message);
            return cachedGlobalNoise || rejectedKeys;
        }

        for (const row of feedbackRows || []) {
            addComparisonKeys(rejectedKeys, row.phrase);
        }

        cachedGlobalNoise = rejectedKeys;
        cachedGlobalNoiseTime = now;
        console.log(`📊 Global rejected-noise keys cached: ${rejectedKeys.size}`);
    } catch (e) {
        console.error('⚠️ Error loading global rejected-noise history:', e.message);
    }

    return cachedGlobalNoise || rejectedKeys;
}

// ============ cached knowledge base skills ============
async function getKnowledgeBaseSkills() {
    const now = Date.now();
    if (cachedKBSkills && (now - cachedKBSkillsTime < CACHE_TTL_MS)) {
        return cachedKBSkills;
    }
    try {
        const { data: kbSkills, error } = await supabase
            .from('skills')
            .select('skill_name');

        if (error) {
            console.error('⚠️ Could not load knowledge base skills:', error.message);
            return cachedKBSkills || [];
        }

        const skills = Array.isArray(kbSkills)
            ? kbSkills.map(row => normalizeSkill(row.skill_name)).filter(Boolean)
            : [];
        cachedKBSkills = skills;
        cachedKBSkillsTime = now;
        return skills;
    } catch (e) {
        console.error('⚠️ Error loading knowledge base skills:', e.message);
        return cachedKBSkills || [];
    }
}

exports.processDocument = async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        const { documentType } = req.body;

        // ✅ STEP 1: Get logged-in employee from token (with full name, cached)
        const { data: profileData, error: profileError } = await getProfileFromToken(req.user.id);
        if (profileError || !profileData) {
            return res.status(403).json({ success: false, error: 'Profile not found for logged-in user' });
        }

        const employeeId = profileData.employee_id;
        const filename = file.originalname;

        console.log(`📄 Processing: ${filename} for employee: ${employeeId}`);

        // Save file temporarily for Python/OCR processing
        const tempPath = path.join(__dirname, '../../shared-data/uploads', filename);
        if (!fs.existsSync(path.dirname(tempPath))) {
            fs.mkdirSync(path.dirname(tempPath), { recursive: true });
        }
        fs.writeFileSync(tempPath, file.buffer);

        // Run OCR + NLP via Python
        const result = await pythonService.processDocument(tempPath, employeeId, documentType);

        // Clean up temp file
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) {}

        if (!result || !result.success) {
            return res.status(500).json({ success: false, error: result?.error || 'Python processing failed' });
        }

        const rawText = result.ocr?.raw_text || result.ocr?.cleaned_text || '';

        // ============ NORMALIZE + SEPARATE AUTO-APPROVED VS NEEDS-REVIEW ============
        const extractedSkills = (result.nlp?.skills || []).map(normalizeSkill).filter(Boolean);
        const pythonAutoApproved = (result.nlp?.auto_approved || []).map(normalizeSkill).filter(Boolean);
        const needsReviewNormalized = (result.nlp?.needs_review || []).map(normalizeSkill).filter(Boolean);

        // Concurrently fetch employee feedback history, global noise, and knowledge base
        const [
            { approvedKeys: historyApprovedKeys, rejectedKeys: historyRejectedKeys },
            globalRejectedNoiseKeys,
            knowledgeBaseSkills
        ] = await Promise.all([
            getEmployeeFeedbackHistory(employeeId),
            getGlobalRejectedNoiseKeys(),
            getKnowledgeBaseSkills()
        ]);

        const knowledgeBaseSet = new Set();
        const knowledgeBaseCompactSet = new Set();
        for (const kbSkill of knowledgeBaseSkills) {
            addComparisonKeys(knowledgeBaseSet, kbSkill);
            const compact = compactSkillKey(kbSkill);
            const singularCompact = singularCompactSkillKey(kbSkill);
            if (compact) knowledgeBaseCompactSet.add(compact);
            if (singularCompact) knowledgeBaseCompactSet.add(singularCompact);
        }
        const fallbackAutoApproved = extractedSkills.filter(skill => {
            if (hasComparisonKey(knowledgeBaseSet, skill)) return true;

            const compactKey = compactSkillKey(skill);
            const singularCompact = singularCompactSkillKey(skill);

            return (
                compactKey.length >= 4 && knowledgeBaseCompactSet.has(compactKey)
            ) || (
                singularCompact.length >= 4 && knowledgeBaseCompactSet.has(singularCompact)
            );
        });

        let autoApprovedNormalized = pythonAutoApproved.length > 0 ? pythonAutoApproved : fallbackAutoApproved;
        const autoApprovedComparisonSet = new Set();
        autoApprovedNormalized.forEach(skill => addComparisonKeys(autoApprovedComparisonSet, skill));
        let finalNeedsReview = (needsReviewNormalized.length > 0 ? needsReviewNormalized : extractedSkills).filter(skill =>
            !hasComparisonKey(autoApprovedComparisonSet, skill) && skill.length > 0
        );

        let previouslyRejected = [...historyRejectedKeys];

        if (historyApprovedKeys.size > 0 || historyRejectedKeys.size > 0) {
            const beforeCount = finalNeedsReview.length;

            const skillsToAutoApprove = [];
            finalNeedsReview = finalNeedsReview.filter(skill => {
                if (hasComparisonKey(historyRejectedKeys, skill)) {
                    console.log(`   ⏭️  Skipping "${skill}" (already REJECTED by this employee before) ❌`);
                    return false;
                }
                if (hasComparisonKey(historyApprovedKeys, skill)) {
                    console.log(`   ✅ Auto-approving "${skill}" (already approved by this employee before)`);
                    skillsToAutoApprove.push(skill);
                    return false;
                }
                return true;
            });

            for (const s of skillsToAutoApprove) {
                if (!hasComparisonKey(autoApprovedComparisonSet, s)) {
                    autoApprovedNormalized.push(s);
                    addComparisonKeys(autoApprovedComparisonSet, s);
                }
            }

            // A knowledge-base skill that this employee specifically rejected before
            // should not silently auto-approve again either.
            autoApprovedNormalized = autoApprovedNormalized.filter(skill => !hasComparisonKey(historyRejectedKeys, skill));

            console.log(`📊 History filter: ${beforeCount} → ${finalNeedsReview.length} skills left to review`);
        }

        // ============ FILTER GLOBAL LEARNED NOISE ============
        // Even for a different employee, previously learned global noise should
        // not trigger "Review Extracted Skills" again.
        if (globalRejectedNoiseKeys.size > 0) {
            const beforeNoiseFilter = finalNeedsReview.length;
            finalNeedsReview = finalNeedsReview.filter(skill => !hasComparisonKey(globalRejectedNoiseKeys, skill));
            autoApprovedNormalized = autoApprovedNormalized.filter(skill => !hasComparisonKey(globalRejectedNoiseKeys, skill));
            if (beforeNoiseFilter !== finalNeedsReview.length) {
                console.log(`📊 Global noise filter: ${beforeNoiseFilter} → ${finalNeedsReview.length}`);
            }
        }

        // ============ CHECK FOR EXISTING DOCUMENT (SAME FILE RESCANNED) ============
        const documentHash = result.ocr?.document_hash || '';
        let existingDoc = null;

        if (documentHash) {
            const { data: foundDoc } = await supabase
                .from('documents')
                .select('id, approved_skills, rejected_skills, file_name, extracted_skills')
                .eq('employee_id', employeeId)
                .eq('document_type', documentType)
                .eq('document_hash', documentHash)
                .maybeSingle();

            if (foundDoc) {
                existingDoc = foundDoc;
                console.log(`✅ Found existing document (rescan): ${foundDoc.file_name}`);
            }
        }

        let documentId;

        if (existingDoc) {
            // ============================================================
            // RESCAN: MERGE skills instead of filtering them out.
            // Preserves original casing (e.g. "React" not "react") using
            // a lowercase-key -> original-case-value map, instead of a
            // plain lowercased Set.
            // ============================================================
            documentId = existingDoc.id;

            console.log(`🔄 Rescanning existing document - MERGING skills`);

            const existingSkills = (existingDoc.extracted_skills || []).map(normalizeSkill);
            const existingApproved = new Set();
            const existingRejected = new Set();
            (existingDoc.approved_skills || []).forEach(s => addComparisonKeys(existingApproved, s));
            (existingDoc.rejected_skills || []).forEach(s => addComparisonKeys(existingRejected, s));

            // Combine this document's own history with the employee's global
            // feedback_training history so nothing rejected anywhere slips back in.
            const combinedRejected = new Set([...existingRejected, ...historyRejectedKeys, ...globalRejectedNoiseKeys]);
            const combinedApproved = new Set([...existingApproved, ...historyApprovedKeys]);
            previouslyRejected = [...combinedRejected];

            console.log(`   📊 Existing skills: ${existingSkills.length}`);
            console.log(`   📊 New skills from this scan: ${finalNeedsReview.length}`);

            // Map lowercase key -> first-seen original casing, so display
            // casing survives the merge/dedupe step.
            const mergedSkillsMap = new Map();
            for (const s of [...existingSkills, ...finalNeedsReview]) {
                const key = skillKey(s);
                if (!mergedSkillsMap.has(key)) mergedSkillsMap.set(key, s);
            }

            const allSkills = Array.from(mergedSkillsMap.values()); // properly-cased, deduped

            console.log(`   ✅ Merged total: ${allSkills.length} skills`);

            // Update the document with merged skills
            const { error: updateError } = await supabase
                .from('documents')
                .update({
                    extracted_skills: allSkills,
                    raw_ocr_text: result.ocr?.raw_text || '',
                    cleaned_ocr_text: result.ocr?.cleaned_text || '',
                    ocr_confidence: result.ocr?.confidence || 0,
                    word_count: result.ocr?.word_count || 0,
                    char_count: result.ocr?.char_count || 0,
                    processed_at: new Date().toISOString(),
                    // Keep existing approved/rejected skills untouched
                    approved_skills: existingDoc.approved_skills || [],
                    rejected_skills: existingDoc.rejected_skills || []
                })
                .eq('id', documentId)
                .select()
                .single();

            if (updateError) {
                console.error('Error updating document:', updateError);
                return res.status(500).json({
                    success: false,
                    error: updateError?.message || 'Failed to update document record'
                });
            }

            // finalNeedsReview = merged skills not yet approved/rejected — checked
            // against BOTH this document's history AND the employee's global
            // feedback_training history, with original casing preserved for display.
            finalNeedsReview = allSkills.filter(skill => {
                return !hasComparisonKey(combinedApproved, skill) && !hasComparisonKey(combinedRejected, skill);
            });

            // Same global-rejection guard applied to auto-approved skills on rescan.
            autoApprovedNormalized = autoApprovedNormalized.filter(skill => !hasComparisonKey(combinedRejected, skill));

            console.log(`📊 Rescan complete: ${finalNeedsReview.length} new skills to review`);

        } else {
            // ============================================================
            // NEW DOCUMENT: keep extracted skills for review, filtering out
            // the employee's own name/ID (security) AND anything already
            // in this employee's feedback_training history (done above).
            // ============================================================
            console.log(`🔍 [NEW DOCUMENT] Processing - keeping unreviewed skills for review`);

            const nameIdExclude = new Set([
                employeeId.toLowerCase(),
                'full name',
                'employee id',
                'name'
            ]);

            const originalCount = finalNeedsReview.length;

            finalNeedsReview = finalNeedsReview.filter(skill => {
                const skillLower = skill.toLowerCase();
                if (nameIdExclude.has(skillLower)) {
                    console.log(`   ⏭️  Skipping "${skill}" (employee name/ID)`);
                    return false;
                }
                return true;
            });

            console.log(`📊 Before: ${originalCount} skills, After: ${finalNeedsReview.length} skills kept`);

            // Deduplicate finalNeedsReview so identical skills never appear twice in pending_skills
            const seenNeedsReviewKeys = new Set();
            finalNeedsReview = finalNeedsReview.filter(skill => {
                const key = skillKey(skill);
                if (seenNeedsReviewKeys.has(key)) return false;
                seenNeedsReviewKeys.add(key);
                return true;
            });

            // Upload to storage and insert a fresh row
            const uploadResult = await storageService.uploadFile(file, employeeId, documentType);

            const { data: documentData, error: docError } = await supabase
                .from('documents')
                .insert({
                    employee_id: employeeId,
                    document_type: documentType,
                    file_name: uploadResult.fileName,
                    file_path: uploadResult.filePath,
                    file_size: uploadResult.fileSize,
                    mime_type: uploadResult.mimeType,
                    raw_ocr_text: result.ocr?.raw_text || '',
                    cleaned_ocr_text: result.ocr?.cleaned_text || '',
                    ocr_confidence: result.ocr?.confidence || 0,
                    word_count: result.ocr?.word_count || 0,
                    char_count: result.ocr?.char_count || 0,
                    document_hash: documentHash,
                    processed_at: new Date().toISOString(),
                    extraction_method: result.ocr?.method || 'unknown',
                    extracted_skills: result.nlp?.skills || [],
                    skills_approved: false,
                    feedback_pending: true,
                    approved_skills: [],
                    rejected_skills: []
                })
                .select()
                .single();

            if (docError || !documentData) {
                console.error('Error saving document:', docError);
                return res.status(docError?.status || 500).json({
                    success: false,
                    error: docError?.message || 'Failed to save document record'
                });
            }
            documentId = documentData.id;
        }

        // ============================================================
        // Clean response - exclude large OCR text
        // ============================================================
        const ocrResponse = {
            confidence: result.ocr?.confidence || 0,
            word_count: result.ocr?.word_count || 0,
            char_count: result.ocr?.char_count || 0,
            method: result.ocr?.method || 'unknown',
            processing_time: result.ocr?.processing_time || 0,
        };

        return res.json({
            success: true,
            data: {
                documentId,
                ocr: ocrResponse,
                nlp: {
                    skills: result.nlp?.skills || [],
                    categorized_skills: result.nlp?.categorized_skills || [],
                    auto_approved: autoApprovedNormalized,
                    needs_review: finalNeedsReview,
                    previously_rejected_skills: previouslyRejected,
                    prc_license: result.nlp?.prc_license || null,
                    prc_verified: result.nlp?.prc_verified || false
                },
                summary: result.summary,
                feedback_required: finalNeedsReview.length > 0,
                pending_skills: finalNeedsReview
            },
            message: finalNeedsReview.length > 0
                ? `Document processed. Please review ${finalNeedsReview.length} new skill(s).`
                : `Document processed. All skills already reviewed!`
        });

    } catch (error) {
        console.error('Document processing error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================================
// getDocuments — narrowed select, excludes large OCR text fields
// ============================================================
exports.getDocuments = async (req, res) => {
    try {
        const { data: profileData, error } = await getProfileFromToken(req.user.id);
        if (error || !profileData) return res.status(403).json({ success: false, error: 'Profile not found' });

        const { data, error: fetchError } = await supabase
            .from('documents')
            .select('id, document_type, file_name, created_at, processed_at, feedback_pending, skills_approved, extraction_method, ocr_confidence, word_count, extracted_skills, approved_skills, rejected_skills')
            .eq('employee_id', profileData.employee_id)
            .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        res.json({ success: true, data });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getDocumentDetails = async (req, res) => {
    try {
        const { documentId } = req.params;

        const { data: profileData, error: profileError } = await getProfileFromToken(req.user.id);
        if (profileError || !profileData) return res.status(403).json({ success: false, error: 'Profile not found' });

        const { data, error: fetchError } = await supabase
            .from('documents')
            .select('*') // full detail only when specifically requested
            .eq('id', documentId)
            .eq('employee_id', profileData.employee_id)
            .single();

        if (fetchError) throw fetchError;
        if (!data) return res.status(404).json({ success: false, error: 'Document not found' });

        res.json({ success: true, data });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getCurrentProfile = async (req, res) => {
    try {
        const { data: profileData, error } = await getProfileFromToken(req.user.id);
        if (error || !profileData) return res.status(403).json({ success: false, error: 'Profile not found' });

        res.json({ success: true, data: profileData });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const { employeeId } = req.params;

        const { data: ownProfile, error: ownError } = await getProfileFromToken(req.user.id);
        if (ownError || !ownProfile) return res.status(403).json({ success: false, error: 'Profile not found' });

        if (ownProfile.employee_id !== employeeId) {
            return res.status(403).json({ success: false, error: 'You can only view your own profile' });
        }

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('employee_id', employeeId)
            .single();

        if (error) throw error;
        res.json({ success: true, data });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { data: ownProfile, error: ownError } = await getProfileFromToken(req.user.id);
        if (ownError || !ownProfile) return res.status(403).json({ success: false, error: 'Profile not found' });

        const employeeId = ownProfile.employee_id;
        const { first_name, last_name, department, avatar_url, contact_number, location, years_experience } = req.body;

        const updateData = { updated_at: new Date().toISOString() };
        if (first_name !== undefined) updateData.first_name = first_name;
        if (last_name !== undefined) updateData.last_name = last_name;
        if (department !== undefined) updateData.department = department;
        if (avatar_url !== undefined) updateData.avatar_url = avatar_url;
        if (contact_number !== undefined) updateData.contact_number = contact_number;
        if (location !== undefined) updateData.location = location;
        if (years_experience !== undefined) updateData.years_experience = years_experience;

        const { data, error } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('employee_id', employeeId)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data, message: 'Profile updated successfully' });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getSkills = async (req, res) => {
    try {
        const { data: ownProfile, error } = await getProfileFromToken(req.user.id);
        if (error || !ownProfile) return res.json({ success: true, data: [] });

        const { data, error: skillsError } = await supabase
            .from('employee_skills')
            .select(`id, skill_id, skills ( id, skill_name, created_at )`)
            .eq('profile_id', ownProfile.id);

        if (skillsError) throw skillsError;

        // Return the employee_skills row id as `es_id` so the client can
        // reference the correct row when deleting, without exposing the
        // internal profile_id.
        const skills = (data || []).map(item => ({
            ...item.skills,
            es_id: item.id   // employee_skills row id (used for DELETE)
        })).filter(s => s && s.skill_name);
        res.json({ success: true, data: skills });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============ MANUAL SKILL ENTRY ============
exports.addManualSkill = async (req, res) => {
    try {
        // 1. Resolve profile_id from JWT (req.user.id), never from req.body
        const { data: ownProfile, error: profileErr } = await getProfileFromToken(req.user.id);
        if (profileErr || !ownProfile) {
            return res.status(401).json({ success: false, error: 'User profile not found' });
        }

        const rawSkillName = req.body.skill_name || req.body.name || req.body.skill;
        if (!rawSkillName || typeof rawSkillName !== 'string' || !rawSkillName.trim()) {
            return res.status(400).json({ success: false, error: 'Skill name is required' });
        }

        // 2. Normalize the name with backend/utils/skillNormalizer.js (keep acronym casing like CRM, ERP, PLC)
        const trimmed = normalizeSkill(rawSkillName);
        const cleanSkillName = formatSkillNameWithAcronyms(trimmed);
        const searchKey = skillKey(cleanSkillName);

        if (!cleanSkillName) {
            return res.status(400).json({ success: false, error: 'Valid skill name is required' });
        }

        // 3. Block duplicates for the same employee with a friendly message
        const { data: existingUserSkills, error: userSkillsErr } = await supabase
            .from('employee_skills')
            .select('skill_id, skills ( id, skill_name )')
            .eq('profile_id', ownProfile.id);

        if (userSkillsErr) throw userSkillsErr;

        const userSkillKeys = new Set();
        (existingUserSkills || []).forEach(item => {
            const existingName = item.skills?.skill_name;
            if (existingName) {
                addComparisonKeys(userSkillKeys, existingName);
            }
        });

        const isDuplicate = hasComparisonKey(userSkillKeys, cleanSkillName);
        if (isDuplicate) {
            return res.status(409).json({
                success: false,
                error: `"${cleanSkillName}" is already in your skills portfolio.`
            });
        }

        // 4. Find it in the skills table (case-insensitive), or create it if new
        const { data: existingMasterSkills, error: masterErr } = await supabase
            .from('skills')
            .select('id, skill_name');

        if (masterErr) throw masterErr;

        let targetSkillId = null;
        let officialSkillName = cleanSkillName;

        if (existingMasterSkills && existingMasterSkills.length > 0) {
            const matched = existingMasterSkills.find(s => {
                const sKeys = new Set(buildComparisonKeys(s.skill_name));
                return hasComparisonKey(sKeys, cleanSkillName);
            });
            if (matched) {
                targetSkillId = matched.id;
                officialSkillName = matched.skill_name;
            }
        }

        if (!targetSkillId) {
            const { data: newSkill, error: insertSkillErr } = await supabase
                .from('skills')
                .insert({ skill_name: cleanSkillName })
                .select()
                .single();

            if (insertSkillErr) {
                // In case of race condition or case-insensitive collision
                const { data: foundSkill } = await supabase
                    .from('skills')
                    .select('id, skill_name')
                    .ilike('skill_name', cleanSkillName)
                    .maybeSingle();

                if (foundSkill) {
                    targetSkillId = foundSkill.id;
                    officialSkillName = foundSkill.skill_name;
                } else {
                    throw insertSkillErr;
                }
            } else {
                targetSkillId = newSkill.id;
                officialSkillName = newSkill.skill_name;
            }
        }

        // 5. Insert into employee_skills (NO schema changes, profile_id from JWT)
        const { error: insertLinkErr } = await supabase
            .from('employee_skills')
            .insert({
                profile_id: ownProfile.id,
                skill_id: targetSkillId
            });

        if (insertLinkErr) {
            if (insertLinkErr.code === '23505') {
                return res.status(409).json({
                    success: false,
                    error: `"${officialSkillName}" is already in your skills portfolio.`
                });
            }
            throw insertLinkErr;
        }

        // 6. Do NOT send manual skills to the ML feedback/training flow.

        // 7. Add an audit log entry
        await logAuditEvent({
            req,
            action: 'CREATE',
            systemCategory: 'Skills Portfolio',
            logDescription: `Employee manually added skill: "${officialSkillName}"`
        });

        return res.json({
            success: true,
            message: `"${officialSkillName}" added to your skills portfolio`,
            data: {
                id: targetSkillId,
                skill_name: officialSkillName
            }
        });

    } catch (error) {
        console.error('Error adding manual skill:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// ============ DELETE A SKILL ============
exports.deleteSkill = async (req, res) => {
    try {
        const { data: ownProfile, error: profileErr } = await getProfileFromToken(req.user.id);
        if (profileErr || !ownProfile) {
            return res.status(401).json({ success: false, error: 'User profile not found' });
        }

        const { skillId } = req.params;
        if (!skillId) {
            return res.status(400).json({ success: false, error: 'Skill ID is required' });
        }

        // Fetch the row first to confirm ownership and get the name for the audit log
        const { data: row, error: fetchErr } = await supabase
            .from('employee_skills')
            .select('id, profile_id, skills ( skill_name )')
            .eq('id', skillId)
            .maybeSingle();

        if (fetchErr) throw fetchErr;
        if (!row) return res.status(404).json({ success: false, error: 'Skill not found' });
        if (row.profile_id !== ownProfile.id) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        const skillName = row.skills?.skill_name || 'Unknown skill';

        const { error: deleteErr } = await supabase
            .from('employee_skills')
            .delete()
            .eq('id', skillId);

        if (deleteErr) throw deleteErr;

        await logAuditEvent({
            req,
            action: 'DELETE',
            systemCategory: 'Skills Portfolio',
            logDescription: `Employee removed skill from portfolio: "${skillName}"`
        });

        return res.json({ success: true, message: `"${skillName}" removed from your skills portfolio` });
    } catch (error) {
        console.error('Error deleting skill:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// ============ APPROVE ALL PENDING SKILLS ============
exports.approveAllPendingSkills = async (req, res) => {
    try {
        const { data: ownProfile, error: profileErr } = await getProfileFromToken(req.user.id);
        if (profileErr || !ownProfile) {
            return res.status(401).json({ success: false, error: 'User profile not found' });
        }

        const employeeId = ownProfile.employee_id || ownProfile.id;

        // Fetch all documents for this employee that have pending feedback or unapproved skills
        const { data: pendingDocs, error: docsErr } = await supabase
            .from('documents')
            .select('id, file_name, extracted_skills, approved_skills, rejected_skills, feedback_pending, skills_approved')
            .eq('employee_id', employeeId)
            .or('feedback_pending.eq.true,skills_approved.eq.false');

        if (docsErr) throw docsErr;

        if (!pendingDocs || pendingDocs.length === 0) {
            return res.json({
                success: true,
                message: 'No pending skills found',
                count: 0
            });
        }

        // Collect all unrejected skills from all pending documents
        const allApprovedToInsert = new Set();
        const docUpdates = [];

        const toSkillArr = (val) => {
            if (Array.isArray(val)) return val;
            if (!val) return [];
            if (typeof val === 'string') {
                try {
                    const p = JSON.parse(val);
                    if (Array.isArray(p)) return p;
                    if (typeof p === 'object' && p !== null) return Object.values(p);
                } catch {
                    return [val];
                }
            }
            if (typeof val === 'object') return Object.values(val);
            return [];
        };

        for (const doc of pendingDocs) {
            const extracted = toSkillArr(doc.extracted_skills);
            const rejected = new Set(toSkillArr(doc.rejected_skills).map(r => skillKey(typeof r === 'string' ? r : (r?.skill_name || ''))));
            const alreadyApproved = new Set(toSkillArr(doc.approved_skills).map(a => skillKey(typeof a === 'string' ? a : (a?.skill_name || ''))));

            const newDocApproved = [...toSkillArr(doc.approved_skills)];

            for (const skill of extracted) {
                const sName = typeof skill === 'string' ? skill : (skill.skill_name || skill.skill || '');
                if (!sName) continue;
                const k = skillKey(sName);
                if (!rejected.has(k)) {
                    allApprovedToInsert.add(sName);
                    if (!alreadyApproved.has(k)) {
                        newDocApproved.push(sName);
                    }
                }
            }

            docUpdates.push({
                id: doc.id,
                approved_skills: newDocApproved,
                feedback_pending: false,
                skills_approved: true
            });
        }

        const skillsToLink = Array.from(allApprovedToInsert);

        if (skillsToLink.length > 0) {
            // Find or create in skills table
            const { data: allMasterSkills } = await supabase
                .from('skills')
                .select('id, skill_name');

            const masterMap = new Map();
            (allMasterSkills || []).forEach(s => {
                masterMap.set(skillKey(s.skill_name), s.id);
            });

            const skillIdsToLink = [];
            for (const sName of skillsToLink) {
                const k = skillKey(sName);
                if (masterMap.has(k)) {
                    skillIdsToLink.push(masterMap.get(k));
                } else {
                    const { data: createdSkill } = await supabase
                        .from('skills')
                        .insert({ skill_name: sName })
                        .select('id')
                        .single();
                    if (createdSkill) {
                        masterMap.set(k, createdSkill.id);
                        skillIdsToLink.push(createdSkill.id);
                    }
                }
            }

            // Check existing links for this profile
            const { data: existingLinks } = await supabase
                .from('employee_skills')
                .select('skill_id')
                .eq('profile_id', ownProfile.id);

            const existingSet = new Set((existingLinks || []).map(l => l.skill_id));
            const missingLinks = [...new Set(skillIdsToLink)]
                .filter(id => !existingSet.has(id))
                .map(id => ({ profile_id: ownProfile.id, skill_id: id, source: 'extracted' }));

            if (missingLinks.length > 0) {
                const { error: insertLinksErr } = await supabase
                    .from('employee_skills')
                    .insert(missingLinks);

                if (insertLinksErr && insertLinksErr.code === '42703') {
                    // Fallback without source column
                    const basicLinks = missingLinks.map(({ profile_id, skill_id }) => ({ profile_id, skill_id }));
                    await supabase.from('employee_skills').insert(basicLinks);
                }
            }

            // Save feedback training records for learning
            const trainingRows = skillsToLink.map(phrase => ({
                phrase,
                label: 1,
                employee_id: employeeId
            }));
            if (trainingRows.length > 0) {
                await supabase.from('feedback_training').insert(trainingRows);
            }
        }

        // Update all documents
        for (const upd of docUpdates) {
            await supabase
                .from('documents')
                .update({
                    approved_skills: upd.approved_skills,
                    feedback_pending: false,
                    skills_approved: true
                })
                .eq('id', upd.id);
        }

        return res.json({
            success: true,
            message: `Successfully approved all pending skills across ${docUpdates.length} document(s)`,
            count: skillsToLink.length
        });

    } catch (error) {
        console.error('Error approving all pending skills:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

exports.getStats = async (req, res) => {
    try {
        const stats = await pythonService.getStats();
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ✅ Get OCR text for a specific document (on-demand)
exports.getDocumentOcrText = async (req, res) => {
    try {
        const { documentId } = req.params;

        if (!documentId) {
            return res.status(400).json({ success: false, error: 'Document ID is required' });
        }

        // Verify user owns this document
        const { data: profileData, error: profileError } = await getProfileFromToken(req.user.id);

        if (profileError || !profileData) {
            return res.status(403).json({ success: false, error: 'Profile not found' });
        }

        // Get only the OCR text for this specific document
        const { data, error } = await supabase
            .from('documents')
            .select('id, raw_ocr_text, cleaned_ocr_text')
            .eq('id', documentId)
            .eq('employee_id', profileData.employee_id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ success: false, error: 'Document not found' });
            }
            throw error;
        }

        res.json({
            success: true,
            data: {
                id: data.id,
                raw_ocr_text: data.raw_ocr_text,
                cleaned_ocr_text: data.cleaned_ocr_text
            }
        });

    } catch (error) {
        console.error('Error fetching OCR text:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.invalidateDocumentCaches = () => {
    cachedGlobalNoise = null;
    cachedGlobalNoiseTime = 0;
    cachedKBSkills = null;
    cachedKBSkillsTime = 0;
};