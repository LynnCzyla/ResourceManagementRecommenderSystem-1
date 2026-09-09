//backend\controllers\documentController.js
const pythonService = require('../services/pythonService');
const storageService = require('../services/storageService');
const supabase = require('../supabase');
const path = require('path');
const fs = require('fs');

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

// Helper: normalize skill names consistently (module-level, used everywhere below)
const normalizeSkill = (skill) => {
    if (typeof skill === 'string') return skill.trim();
    if (typeof skill === 'object' && skill !== null) {
        return (skill.skill_name || skill.skill_tag || skill.skill || String(skill)).trim();
    }
    return String(skill).trim();
};

// ============ NEW: canonical key for ALL comparisons/dedup ============
// Case-insensitive, whitespace-collapsed. Never used for display — only for matching.
const skillKey = (skill) => normalizeSkill(skill).toLowerCase().replace(/\s+/g, ' ').trim();

// Secondary key for looser matching in auto-approve fallback.
// Helps match variants like "Power Point" vs "PowerPoint".
const compactSkillKey = (skill) => normalizeSkill(skill).toLowerCase().replace(/[^a-z0-9]+/g, '');

const singularizeToken = (token) => {
    if (!token || token.length < 4) return token;
    if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
    if (token.endsWith('ses') || token.endsWith('xes') || token.endsWith('zes')) return token.slice(0, -2);
    if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
    return token;
};

const singularSkillKey = (skill) => {
    const tokens = skillKey(skill).split(' ').map(singularizeToken).filter(Boolean);
    return tokens.join(' ').trim();
};

const singularCompactSkillKey = (skill) => {
    const tokens = skillKey(skill).split(' ').map(singularizeToken).filter(Boolean);
    return tokens.join('').replace(/[^a-z0-9]+/g, '');
};

const buildComparisonKeys = (skill) => {
    const strict = skillKey(skill);
    const compact = compactSkillKey(skill);
    const singular = singularSkillKey(skill);
    const singularCompact = singularCompactSkillKey(skill);

    return [strict, compact, singular, singularCompact].filter(Boolean);
};

const addComparisonKeys = (set, skill) => {
    for (const key of buildComparisonKeys(skill)) {
        set.add(key);
    }
};

const hasComparisonKey = (set, skill) => {
    return buildComparisonKeys(skill).some(key => set.has(key));
};

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

// ============ NEW: global rejected-noise history ============
// Any phrase repeatedly marked as Not Skill by other employees should be
// treated as learned noise and should not be shown again for manual review.
async function getGlobalRejectedNoiseKeys() {
    const rejectedKeys = new Set();

    try {
        const { data: feedbackRows, error } = await supabase
            .from('feedback_training')
            .select('phrase')
            .eq('label', 'Not Skill');

        if (error) {
            console.error('⚠️ Could not load global rejected-noise history:', error.message);
            return rejectedKeys;
        }

        for (const row of feedbackRows || []) {
            addComparisonKeys(rejectedKeys, row.phrase);
        }

        console.log(`📊 Global rejected-noise keys: ${rejectedKeys.size}`);
    } catch (e) {
        console.error('⚠️ Error loading global rejected-noise history:', e.message);
    }

    return rejectedKeys;
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

        let knowledgeBaseSkills = [];
        try {
            const { data: kbSkills } = await supabase
                .from('skills')
                .select('skill_name');
            knowledgeBaseSkills = Array.isArray(kbSkills) ? kbSkills.map(row => normalizeSkill(row.skill_name)).filter(Boolean) : [];
        } catch (kbError) {
            console.log('⚠️ Could not load knowledge base skills for auto-approve fallback:', kbError.message);
        }

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

        // ============ NEW: FILTER OUT SKILLS THIS EMPLOYEE HAS ALREADY REVIEWED ============
        // Reads the employee's full feedback_training history (approved + rejected,
        // across ALL of their documents) and strips those skills out of both
        // finalNeedsReview and autoApprovedNormalized. This is the fix: previously
        // this controller only checked approved_skills/rejected_skills on a single
        // document row, so a skill rejected on Document A (e.g. "Level", "Engr",
        // "Basic Use") would still show up as "Pending" on Document B, C, etc.
        const { approvedKeys: historyApprovedKeys, rejectedKeys: historyRejectedKeys } =
            await getEmployeeFeedbackHistory(employeeId);
        const globalRejectedNoiseKeys = await getGlobalRejectedNoiseKeys();

        let previouslyRejected = [...historyRejectedKeys];

        if (historyApprovedKeys.size > 0 || historyRejectedKeys.size > 0) {
            const beforeCount = finalNeedsReview.length;

            finalNeedsReview = finalNeedsReview.filter(skill => {
                if (hasComparisonKey(historyRejectedKeys, skill)) {
                    console.log(`   ⏭️  Skipping "${skill}" (already REJECTED by this employee before) ❌`);
                    return false;
                }
                if (hasComparisonKey(historyApprovedKeys, skill)) {
                    console.log(`   ⏭️  Skipping "${skill}" (already approved by this employee before)`);
                    return false;
                }
                return true;
            });

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
            .select('id, document_type, file_name, created_at, processed_at, feedback_pending, skills_approved, extraction_method, ocr_confidence, word_count')
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
        const { first_name, last_name, department, role, avatar_url, contact_number, location, years_experience } = req.body;

        const updateData = { updated_at: new Date().toISOString() };
        if (first_name !== undefined) updateData.first_name = first_name;
        if (last_name !== undefined) updateData.last_name = last_name;
        if (department !== undefined) updateData.department = department;
        if (role !== undefined) updateData.role = role;
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

        const skills = data.map(item => item.skills).filter(Boolean);
        res.json({ success: true, data: skills });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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