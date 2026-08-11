//backend/controllers/feedbackController.js
const { spawn } = require('child_process');
const pythonService = require('../services/pythonService');
const storageService = require('../services/storageService');
const supabase = require('../supabase');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// ============ NORMALIZATION HELPERS (used everywhere below) ============
const normalizeSkill = (skill) => {
    if (typeof skill === 'string') return skill.trim();
    if (typeof skill === 'object' && skill !== null) {
        return (skill.skill_name || skill.skill_tag || skill.skill || String(skill)).trim();
    }
    return String(skill).trim();
};

// Canonical key used for ALL comparisons/dedup (case-insensitive,
// whitespace-collapsed). Never used for display — only for matching.
const skillKey = (skill) => normalizeSkill(skill).toLowerCase().replace(/\s+/g, ' ').trim();

// ============ ADD THIS HELPER FUNCTION ============
async function updateLearningSystem(approved_skills, rejected_skills) {
    return new Promise((resolve, reject) => {
        const rootPath = path.join(__dirname, '../..');
        const pythonPath = process.platform === 'win32'
            ? path.join(rootPath, 'python', 'venv', 'Scripts', 'python.exe')
            : path.join(rootPath, 'python', 'venv', 'bin', 'python');
        const scriptPath = path.join(rootPath, 'python', 'scripts');

        const args = [
            '-u',
            path.join(scriptPath, 'runner.py'),
            'learn_feedback',
            JSON.stringify(approved_skills || []),
            JSON.stringify(rejected_skills || [])
        ];

        console.log('🧠 Updating learning system...');
        console.log(`   Approved: ${approved_skills?.length || 0}`);
        console.log(`   Rejected: ${rejected_skills?.length || 0}`);

        const pythonProcess = spawn(pythonPath, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });

        let stdoutData = '';
        let stderrData = '';

        pythonProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
            console.log(`🐍 ${data.toString().trim()}`);
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error('❌ Learning update error:', stderrData);
                reject(new Error(stderrData));
            } else {
                try {
                    const result = JSON.parse(stdoutData);
                    console.log(`✅ Learning system updated! ${result.skills_learned || 0} skills learned`);
                    if (result.merged > 0) {
                        console.log(`   ✅ ${result.merged} duplicate skills auto-merged!`);
                    }
                    resolve(result);
                } catch (e) {
                    resolve({ success: true, message: 'Learning updated' });
                }
            }
        });

        pythonProcess.on('error', (err) => {
            reject(err);
        });
    });
}

async function cleanupDatabaseDuplicates() {
    try {
        console.log('🧹 Cleaning database duplicates...');

        const { data: allSkills, error: skillsError } = await supabase
            .from('skills')
            .select('id, skill_name')
            .order('skill_name');

        if (skillsError) throw skillsError;

        const uniqueSkills = {};
        const toDelete = [];
        let deletedCount = 0;

        for (const skill of allSkills) {
            const key = skillKey(skill.skill_name);
            if (!uniqueSkills[key]) {
                uniqueSkills[key] = skill.id;
            } else {
                const { error: updateError } = await supabase
                    .from('employee_skills')
                    .update({ skill_id: uniqueSkills[key] })
                    .eq('skill_id', skill.id);

                if (!updateError) {
                    toDelete.push(skill.id);
                    deletedCount++;
                    console.log(`   ✅ Merged duplicate: ${skill.skill_name}`);
                }
            }
        }

        if (toDelete.length > 0) {
            // ============ FIX: dedupe employee_skills BEFORE deleting the
            // duplicate skill rows, otherwise an employee who already had
            // BOTH the master and the duplicate skill linked ends up with
            // two employee_skills rows pointing at the same master id
            // after the update above — still a duplicate in the portfolio.
            const { data: allLinks } = await supabase
                .from('employee_skills')
                .select('id, profile_id, skill_id')
                .in('skill_id', Object.values(uniqueSkills));

            if (allLinks && allLinks.length > 0) {
                const seen = new Set();
                const linkDupIds = [];
                for (const link of allLinks) {
                    const linkKey = `${link.profile_id}::${link.skill_id}`;
                    if (seen.has(linkKey)) {
                        linkDupIds.push(link.id);
                    } else {
                        seen.add(linkKey);
                    }
                }
                if (linkDupIds.length > 0) {
                    await supabase.from('employee_skills').delete().in('id', linkDupIds);
                    console.log(`   ✅ Removed ${linkDupIds.length} duplicate employee_skills links`);
                }
            }
            // ===================================================================

            const { error: deleteError } = await supabase
                .from('skills')
                .delete()
                .in('id', toDelete);

            if (deleteError) {
                console.error('Error deleting duplicates:', deleteError);
            } else {
                console.log(`✅ Deleted ${toDelete.length} duplicate skills from database`);
            }
        }

        return { deleted: deletedCount };
    } catch (error) {
        console.error('Database cleanup error:', error);
        return { deleted: 0 };
    }
}

async function syncSkillsFromJsonToDatabase() {
    try {
        console.log('🔄 Syncing skills from learned_skills.json to database...');

        const jsonPath = path.join(__dirname, '../../shared-data/skills_db/learned_skills.json');

        if (!fs.existsSync(jsonPath)) {
            console.log('⚠️ learned_skills.json not found, skipping sync');
            return { added: 0, updated: 0 };
        }

        const rawData = fs.readFileSync(jsonPath, 'utf8');
        const data = JSON.parse(rawData);

        const learnedSkills = data.learned_skills || [];
        const dictionary = data.dictionary || {};

        console.log(`📊 learned_skills.json has ${learnedSkills.length} skills`);

        if (learnedSkills.length === 0) {
            return { added: 0, updated: 0 };
        }

        const { data: dbSkills, error: fetchError } = await supabase
            .from('skills')
            .select('id, skill_name');

        if (fetchError) throw fetchError;

        const dbSkillMap = new Map();
        dbSkills.forEach(s => dbSkillMap.set(skillKey(s.skill_name), {
            id: s.id,
            category: s.category
        }));

        let added = 0;
        let updated = 0;
        let skipped = 0;

        for (const skillName of learnedSkills) {
            const key = skillKey(skillName);
            const category = dictionary[skillName] || 'Other';

            if (dbSkillMap.has(key)) {
                const existing = dbSkillMap.get(key);
                if (existing.category !== category) {
                    const { error: updateError } = await supabase
                        .from('skills')
                        .update({
                            category: category,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existing.id);

                    if (!updateError) {
                        updated++;
                        console.log(`   🔄 Updated: ${skillName} → ${category}`);
                    }
                } else {
                    skipped++;
                }
            } else {
                const { error: insertError } = await supabase
                    .from('skills')
                    .insert({
                        skill_name: skillName,
                        category: category,
                        created_at: new Date().toISOString()
                    });

                if (!insertError) {
                    added++;
                    dbSkillMap.set(key, { id: null, category }); // avoid re-inserting in same run
                    console.log(`   ✅ Added: ${skillName} (${category})`);
                }
            }
        }

        console.log(`✅ Sync complete: +${added} added, ~${updated} updated, ${skipped} already exist`);

        return { added, updated, total: learnedSkills.length };

    } catch (error) {
        console.error('❌ Sync error:', error);
        return { added: 0, updated: 0, error: error.message };
    }
}

// ============ RETRAIN ML HELPER ============
async function retrainMLPython(texts, labels) {
    return new Promise((resolve, reject) => {
        const rootPath = path.join(__dirname, '../..');
        const pythonPath = process.platform === 'win32'
            ? path.join(rootPath, 'python', 'venv', 'Scripts', 'python.exe')
            : path.join(rootPath, 'python', 'venv', 'bin', 'python');
        const scriptPath = path.join(rootPath, 'python', 'scripts');

        const args = [
            '-u',
            path.join(scriptPath, 'runner.py'),
            'retrain_ml',
            JSON.stringify(texts),
            JSON.stringify(labels)
        ];

        const pythonProcess = spawn(pythonPath, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });

        let stdoutData = '';
        let stderrData = '';

        pythonProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
            console.log(`🐍 ${data.toString().trim()}`);
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(stderrData));
            } else {
                try {
                    const result = JSON.parse(stdoutData);
                    resolve(result);
                } catch (e) {
                    resolve({ success: true });
                }
            }
        });

        pythonProcess.on('error', (err) => {
            reject(err);
        });
    });
}

// ============ GET ML STATUS ============
async function getMLStatusPython() {
    return new Promise((resolve, reject) => {
        const rootPath = path.join(__dirname, '../..');
        const pythonPath = process.platform === 'win32'
            ? path.join(rootPath, 'python', 'venv', 'Scripts', 'python.exe')
            : path.join(rootPath, 'python', 'venv', 'bin', 'python');
        const scriptPath = path.join(rootPath, 'python', 'scripts');

        const args = [
            '-u',
            path.join(scriptPath, 'runner.py'),
            'ml_status'
        ];

        const pythonProcess = spawn(pythonPath, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });

        let stdoutData = '';
        let stderrData = '';

        pythonProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
            console.log(`🐍 ${data.toString().trim()}`);
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(stderrData));
            } else {
                try {
                    const result = JSON.parse(stdoutData);
                    resolve(result);
                } catch (e) {
                    resolve({ success: true, ml_active: false, error: 'Parse error' });
                }
            }
        });

        pythonProcess.on('error', (err) => {
            reject(err);
        });
    });
}

// ============ EXPORTS ============

exports.cleanupDuplicateSkills = async (req, res) => {
    try {
        const { employeeId } = req.query;

        const { data: allSkills, error: skillsError } = await supabase
            .from('skills')
            .select('id, skill_name')
            .order('skill_name');

        if (skillsError) throw skillsError;

        const duplicates = {};
        const uniqueSkills = {};
        const toDelete = [];
        const toKeep = {};

        for (const skill of allSkills) {
            const key = skillKey(skill.skill_name);
            if (!uniqueSkills[key]) {
                uniqueSkills[key] = skill.id;
                toKeep[skill.id] = skill.skill_name;
            } else {
                if (!duplicates[key]) {
                    duplicates[key] = [];
                }
                duplicates[key].push({
                    id: skill.id,
                    name: skill.skill_name,
                    master_id: uniqueSkills[key]
                });
                toDelete.push(skill.id);
            }
        }

        console.log(`🔍 Found ${toDelete.length} duplicate skills`);
        console.log(`📊 ${Object.keys(duplicates).length} duplicate groups`);

        for (const [key, dupList] of Object.entries(duplicates)) {
            for (const dup of dupList) {
                const { error: updateError } = await supabase
                    .from('employee_skills')
                    .update({ skill_id: dup.master_id })
                    .eq('skill_id', dup.id);

                if (updateError) {
                    console.error(`Error updating skill ${dup.id}:`, updateError);
                } else {
                    console.log(`   ✅ Updated employee_skills: ${dup.name} → ${dup.master_id}`);
                }
            }
        }

        // ============ FIX: dedupe employee_skills links after repointing ============
        if (toDelete.length > 0) {
            const masterIds = Object.values(uniqueSkills);
            const { data: allLinks } = await supabase
                .from('employee_skills')
                .select('id, profile_id, skill_id')
                .in('skill_id', masterIds);

            if (allLinks && allLinks.length > 0) {
                const seen = new Set();
                const linkDupIds = [];
                for (const link of allLinks) {
                    const linkKey = `${link.profile_id}::${link.skill_id}`;
                    if (seen.has(linkKey)) {
                        linkDupIds.push(link.id);
                    } else {
                        seen.add(linkKey);
                    }
                }
                if (linkDupIds.length > 0) {
                    await supabase.from('employee_skills').delete().in('id', linkDupIds);
                    console.log(`   ✅ Removed ${linkDupIds.length} duplicate employee_skills links`);
                }
            }
        }
        // ==========================================================================

        if (toDelete.length > 0) {
            const { error: deleteError } = await supabase
                .from('skills')
                .delete()
                .in('id', toDelete);

            if (deleteError) {
                console.error('Error deleting duplicates:', deleteError);
            } else {
                console.log(`✅ Deleted ${toDelete.length} duplicate skills`);
            }
        }

        try {
            const pythonService = require('../services/pythonService');
            await pythonService.cleanupLearnedSkills();
        } catch (e) {
            console.error('Error cleaning learned_skills:', e);
        }

        res.json({
            success: true,
            data: {
                duplicates_found: toDelete.length,
                duplicate_groups: Object.keys(duplicates).length,
                deleted: toDelete.length,
                message: `Cleaned up ${toDelete.length} duplicate skills`
            }
        });

    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// ============ PROCESS DOCUMENT (UPDATED) ============
exports.processDocument = async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const { documentType } = req.body;

        const loggedInEmail = req.user.email;
        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('employee_id')
            .eq('email', loggedInEmail)
            .single();

        if (profileError || !profileData) {
            return res.status(403).json({ success: false, error: 'Profile not found for logged-in user' });
        }

        const employeeId = profileData.employee_id;

        console.log(`📄 Processing: ${file.originalname}`);
        console.log(`👤 Verified Employee: ${employeeId}`);

        const uploadResult = await storageService.uploadFile(file, employeeId, documentType);

        const tempPath = path.join(__dirname, '../../shared-data/uploads', file.originalname);
        const uploadDir = path.dirname(tempPath);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        fs.writeFileSync(tempPath, file.buffer);

        const result = await pythonService.processDocument(tempPath, employeeId, documentType);

        try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch (e) {}

        if (!result || !result.success) {
            return res.status(500).json({ success: false, error: result?.error || 'Python processing failed' });
        }

        // ============ EXTRACT DATA ============
        const nlpResult = result.nlp || {};
        const allSkills = nlpResult.skills || [];
        const categorizedSkills = nlpResult.categorized_skills || {};
        const autoApproved = nlpResult.auto_approved || [];
        const needsReview = nlpResult.needs_review || [];

        console.log('🔍 RAW autoApproved:', JSON.stringify(autoApproved));
        console.log('🔍 RAW needsReview (first 5):', JSON.stringify(needsReview.slice(0, 5)));
        console.log('🔍 RAW allSkills count:', allSkills.length);

        // ============ Normalize skills (using module-level normalizeSkill/skillKey) ============
        const autoApprovedNormalized = autoApproved.map(normalizeSkill);
        const needsReviewNormalized = needsReview.map(normalizeSkill);

        // Case-insensitive Set for lookup
        const autoApprovedSet = new Set(autoApprovedNormalized.map(skillKey));

        const finalAutoApproved = autoApprovedNormalized;
        const finalNeedsReview = needsReviewNormalized.filter(skill => {
            return !autoApprovedSet.has(skillKey(skill)) && skill.length > 0;
        });

        console.log(`📊 Skill separation: ${finalAutoApproved.length} auto-approved, ${finalNeedsReview.length} needs review`);

        // ============ CHECK FOR EXISTING DOCUMENT WITH FEEDBACK (using hash) ============
        const documentHash = result.ocr?.document_hash || '';
        console.log(`🔍 Document hash: ${documentHash || 'NOT AVAILABLE'}`);

        let existingDoc = null;
        if (documentHash) {
            const { data: foundDoc, error: existingError } = await supabase
                .from('documents')
                .select('id, approved_skills, rejected_skills, feedback_pending, file_name')
                .eq('employee_id', employeeId)
                .eq('document_type', documentType)
                .eq('document_hash', documentHash)
                .maybeSingle();

            if (!existingError && foundDoc) {
                existingDoc = foundDoc;
                console.log(`✅ Found existing document (by hash): ${foundDoc.file_name}`);
            }
        }

        let documentId = existingDoc?.id;
        let previouslyApproved = [];
        let previouslyRejected = [];

        // ============ METHOD 1: Check documents table ============
        console.log(`🔍 [METHOD 1] Loading rejection history from previous documents...`);
        const { data: allPreviousDocs, error: allDocsError } = await supabase
            .from('documents')
            .select('id, approved_skills, rejected_skills, file_name')
            .eq('employee_id', employeeId)
            .eq('document_type', documentType)
            .order('created_at', { ascending: false });

        if (!allDocsError && allPreviousDocs && allPreviousDocs.length > 0) {
            allPreviousDocs.forEach(doc => {
                if (doc.approved_skills && Array.isArray(doc.approved_skills)) {
                    previouslyApproved.push(...doc.approved_skills.map(normalizeSkill));
                }
                if (doc.rejected_skills && Array.isArray(doc.rejected_skills)) {
                    previouslyRejected.push(...doc.rejected_skills.map(normalizeSkill));
                }
            });

            console.log(`   📝 Found ${allPreviousDocs.length} documents`);
            console.log(`   ✅ From documents table: ${previouslyApproved.length} approved, ${previouslyRejected.length} rejected`);
        } else {
            console.log(`   ℹ️  No previous documents found`);
        }

        // ============ METHOD 2: FALLBACK - Check feedback_training table directly ============
        console.log(`🔍 [METHOD 2] FALLBACK - Loading from feedback_training table...`);
        console.log(`   Looking for employee_id: ${employeeId}, label: 'Not Skill'`);

        const { data: feedbackRecords, error: feedbackError } = await supabase
            .from('feedback_training')
            .select('phrase, label')
            .eq('employee_id', employeeId)
            .eq('label', 'Not Skill');

        if (feedbackError) {
            console.error(`   ❌ ERROR querying feedback_training:`, feedbackError);
        } else if (feedbackRecords && feedbackRecords.length > 0) {
            const feedbackRejected = feedbackRecords.map(r => normalizeSkill(r.phrase));
            previouslyRejected.push(...feedbackRejected);
            console.log(`   ✅ From feedback_training: ${feedbackRecords.length} rejected skills`);
            console.log(`   Samples: ${feedbackRejected.slice(0, 3).join(', ')}`);
        } else {
            console.log(`   ℹ️  No rejected skills found in feedback_training`);
        }

        // ============ ALSO PULL APPROVED FROM feedback_training (was missing — a
        // skill approved once but never re-scanned via `documents` rows was not
        // being recognized as "already reviewed" either) ============
        const { data: approvedFeedbackRecords, error: approvedFeedbackError } = await supabase
            .from('feedback_training')
            .select('phrase, label')
            .eq('employee_id', employeeId)
            .eq('label', 'Skill');

        if (!approvedFeedbackError && approvedFeedbackRecords && approvedFeedbackRecords.length > 0) {
            previouslyApproved.push(...approvedFeedbackRecords.map(r => normalizeSkill(r.phrase)));
        }

        // ============ Deduplicate using canonical keys (CASE-INSENSITIVE FIX) ============
        if (previouslyApproved.length > 0 || previouslyRejected.length > 0) {
            previouslyApproved = [...new Set(previouslyApproved.map(skillKey))];
            previouslyRejected = [...new Set(previouslyRejected.map(skillKey))];

            console.log(`📊 FINAL REJECTION HISTORY:`);
            console.log(`   ✅ Approved (total unique): ${previouslyApproved.length}`);
            console.log(`   ❌ Rejected (total unique): ${previouslyRejected.length}`);
        }

        if (existingDoc && !documentId) {
            documentId = existingDoc.id;
        }

        if (previouslyApproved.length > 0 || previouslyRejected.length > 0) {
            const approvedSet = new Set(previouslyApproved); // already skillKey'd above
            const rejectedSet = new Set(previouslyRejected);

            // ============ FILTER OUT ALREADY-REVIEWED SKILLS (case-insensitive) ============
            const filteredNeedsReview = finalNeedsReview.filter(skill => {
                const key = skillKey(skill);
                const isApproved = approvedSet.has(key);
                const isRejected = rejectedSet.has(key);

                if (isApproved) {
                    console.log(`   ⏭️  Skipping "${skill}" (already approved in previous scan)`);
                }
                if (isRejected) {
                    console.log(`   ⏭️  Skipping "${skill}" (already REJECTED in previous scan) ❌`);
                }

                return !isApproved && !isRejected;
            });

            console.log(`📊 After filtering: ${filteredNeedsReview.length} skills left to review`);

            while (finalNeedsReview.length > 0) {
                finalNeedsReview.pop();
            }
            finalNeedsReview.push(...filteredNeedsReview);

            // ============ ALSO filter finalAutoApproved — a skill that is in the
            // Knowledge Base AND was previously rejected by THIS employee should
            // not silently auto-save again either. ============
            const filteredAutoApproved = finalAutoApproved.filter(skill => !rejectedSet.has(skillKey(skill)));
            while (finalAutoApproved.length > 0) {
                finalAutoApproved.pop();
            }
            finalAutoApproved.push(...filteredAutoApproved);
        }

        // ============ SAVE TO DATABASE ============
        if (!existingDoc) {
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
                    document_hash: result.ocr?.document_hash || '',
                    processed_at: new Date().toISOString(),
                    extraction_method: result.ocr?.method || 'unknown',
                    extracted_skills: allSkills,
                    skills_approved: false,
                    feedback_pending: true,
                    approved_skills: [],
                    rejected_skills: []
                })
                .select()
                .single();

            if (docError) console.error('Error saving document:', docError);
            documentId = documentData?.id || result.document_id;
        }

        // ============ FILTER ALL SKILLS TOO (case-insensitive) ============
        const finalAllSkills = allSkills
            .map(normalizeSkill)
            .filter(skill => {
                return !autoApprovedSet.has(skillKey(skill)) && skill.length > 0;
            });

        // ============ RETURN RESPONSE ============
        return res.json({
            success: true,
            data: {
                documentId: documentId,
                fileUrl: uploadResult.publicUrl,
                ocr: result.ocr,
                nlp: {
                    skills: finalAllSkills,
                    categorized_skills: categorizedSkills,
                    auto_approved: finalAutoApproved,
                    needs_review: finalNeedsReview,
                    prc_license: nlpResult.prc_license || null,
                    prc_verified: nlpResult.prc_verified || false
                },
                summary: result.summary,
                feedback_required: finalNeedsReview.length > 0,
                pending_skills: finalNeedsReview
            },
            message: finalNeedsReview.length > 0
                ? `Document processed. Please review ${finalNeedsReview.length} skills.`
                : previouslyApproved.length > 0 || previouslyRejected.length > 0
                ? `Document processed. All skills have been reviewed! (${previouslyApproved.length} approved, ${previouslyRejected.length} rejected)`
                : `Document processed. ${finalAutoApproved.length} skills auto-approved!`
        });
    } catch (error) {
        console.error('Document processing error:', error);
        res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
};

exports.getDocuments = async (req, res) => {
    try {
        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('employee_id')
            .eq('id', req.user.id)
            .single();

        if (profileError || !profileData) {
            return res.status(403).json({ success: false, error: 'Profile not found' });
        }

        const { data, error } = await supabase
            .from('documents')
            .select(`
                id,
                employee_id,
                document_type,
                file_name,
                file_path,
                file_size,
                mime_type,
                created_at,
                updated_at,
                processed_at,
                ocr_confidence,
                word_count,
                char_count,
                document_hash,
                extraction_method,
                extracted_skills,
                skills_approved,
                feedback_pending,
                approved_skills,
                rejected_skills
            `)
            .eq('employee_id', profileData.employee_id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data: data });

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

        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('employee_id')
            .eq('id', req.user.id)
            .single();

        if (profileError || !profileData) {
            return res.status(403).json({ success: false, error: 'Profile not found' });
        }

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

exports.getProfile = async (req, res) => {
    try {
        const { employeeId } = req.params;

        const { data: ownProfile, error: ownError } = await supabase
            .from('profiles')
            .select('employee_id')
            .eq('id', req.user.id)
            .single();

        if (ownError || !ownProfile) {
            return res.status(403).json({ success: false, error: 'Profile not found' });
        }

        if (ownProfile.employee_id !== employeeId) {
            return res.status(403).json({ success: false, error: 'You can only view your own profile' });
        }

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('employee_id', employeeId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.json({
                    success: true,
                    data: {
                        employee_id: employeeId,
                        first_name: 'Employee',
                        last_name: 'Not Found',
                        email: '', department: '', role: '',
                        avatar_url: '', status: 'Active',
                        availability_status: 'Available'
                    }
                });
            }
            throw error;
        }

        res.json({ success: true, data: data });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { data: ownProfile, error: ownError } = await supabase
            .from('profiles')
            .select('employee_id')
            .eq('id', req.user.id)
            .single();

        if (ownError || !ownProfile) {
            return res.status(403).json({ success: false, error: 'Profile not found' });
        }

        const employeeId = ownProfile.employee_id;
        const {
            first_name, last_name, email, department,
            role, avatar_url, contact_number, location, years_experience
        } = req.body;

        const updateData = { updated_at: new Date().toISOString() };
        if (first_name !== undefined) updateData.first_name = first_name;
        if (last_name !== undefined) updateData.last_name = last_name;
        if (email !== undefined) updateData.email = email;
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
        res.json({ success: true, data: data, message: 'Profile updated successfully' });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getSkills = async (req, res) => {
    try {
        const { data: ownProfile, error: profileError } = await supabase
            .from('profiles')
            .select('id, employee_id')
            .eq('id', req.user.id)
            .single();

        if (profileError || !ownProfile) {
            return res.json({ success: true, data: [] });
        }

        const { data, error } = await supabase
            .from('employee_skills')
            .select(`id, skill_id, skills ( id, skill_name, created_at )`)
            .eq('profile_id', ownProfile.id);

        if (error) throw error;

        // ============ FIX: dedupe at read-time too, as a safety net, in case
        // any duplicate links still exist from before this fix was deployed.
        const seen = new Set();
        const skills = [];
        for (const item of data) {
            if (!item.skills) continue;
            const key = skillKey(item.skills.skill_name);
            if (seen.has(key)) continue;
            seen.add(key);
            skills.push(item.skills);
        }

        res.json({ success: true, data: skills });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getStats = async (req, res) => {
    try {
        const stats = await pythonService.getStats();
        res.json({ success: true, stats: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getPendingFeedback = async (req, res) => {
    try {
        const { documentId } = req.params;

        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('employee_id')
            .eq('id', req.user.id)
            .single();

        if (profileError || !profileData) {
            return res.status(403).json({ success: false, error: 'Profile not found' });
        }

        const { data: document, error: documentError } = await supabase
            .from('documents')
            .select('id, employee_id, approved_skills, rejected_skills, feedback_pending')
            .eq('id', documentId)
            .single();

        if (documentError) {
            if (documentError.code === 'PGRST116') {
                return res.status(404).json({ success: false, error: 'Document not found' });
            }
            throw documentError;
        }

        if (!document) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }

        if (document.employee_id !== profileData.employee_id) {
            return res.status(403).json({ success: false, error: 'You can only view feedback for your own documents' });
        }

        res.json({
            success: true,
            data: {
                has_feedback: document.feedback_pending === false,
                approved_skills: document.approved_skills || [],
                rejected_skills: document.rejected_skills || []
            }
        });
    } catch (error) {
        console.error('Error fetching pending feedback:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============ SAVE SKILL FEEDBACK (FIXED: case-insensitive dedup everywhere) ============
exports.saveSkillFeedback = async (req, res) => {
    try {
        const { documentId, approved_skills = [], rejected_skills = [], document_type } = req.body;

        if (!documentId) {
            return res.status(400).json({ success: false, error: 'Document ID is required' });
        }

        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id, employee_id')
            .eq('id', req.user.id)
            .single();

        if (profileError || !profileData) {
            return res.status(403).json({ success: false, error: 'Profile not found' });
        }

        const { data: document, error: documentError } = await supabase
            .from('documents')
            .select('id, employee_id')
            .eq('id', documentId)
            .single();

        if (documentError || !document) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }

        if (document.employee_id !== profileData.employee_id) {
            return res.status(403).json({ success: false, error: 'You can only save feedback for your own documents' });
        }

        // ============ SAVE SKILLS TO DATABASE (CASE-INSENSITIVE DEDUP) ============
        if (approved_skills && approved_skills.length > 0) {
            console.log(`✅ Saving ${approved_skills.length} approved skills to database...`);

            // Pull the full skills table ONCE and match in-memory by skillKey,
            // instead of N sequential case-sensitive .eq() queries. This is
            // what was letting "Microsoft Excel" and "microsoft excel" become
            // two separate rows.
            const { data: existingSkillsAll } = await supabase
                .from('skills')
                .select('id, skill_name');
            const skillMap = new Map((existingSkillsAll || []).map(s => [skillKey(s.skill_name), s.id]));

            const { data: existingLinksAll } = await supabase
                .from('employee_skills')
                .select('id, skill_id')
                .eq('profile_id', profileData.id);
            const linkedSkillIds = new Set((existingLinksAll || []).map(l => l.skill_id));

            for (const skillNameRaw of approved_skills) {
                const skillName = normalizeSkill(skillNameRaw);
                if (!skillName) continue;
                const key = skillKey(skillName);

                let skillId = skillMap.get(key);
                if (!skillId) {
                    const { data: newSkill, error: insertSkillError } = await supabase
                        .from('skills')
                        .insert({ skill_name: skillName })
                        .select()
                        .single();
                    if (!insertSkillError && newSkill) {
                        skillId = newSkill.id;
                        skillMap.set(key, skillId);
                        console.log(`   ✅ Added new skill: ${skillName}`);
                    }
                }

                if (skillId && !linkedSkillIds.has(skillId)) {
                    const { error: linkError } = await supabase
                        .from('employee_skills')
                        .insert({
                            profile_id: profileData.id,
                            skill_id: skillId
                        });
                    if (!linkError) {
                        linkedSkillIds.add(skillId); // prevent re-inserting in same batch
                    }
                }
            }
            console.log(`✅ Skills saved to employee profile`);
        }

        // ============ UPDATE DOCUMENT ============
        const updatePayload = {
            approved_skills: approved_skills || [],
            rejected_skills: rejected_skills || [],
            feedback_pending: false,
            skills_approved: true,
            updated_at: new Date().toISOString()
        };

        if (document_type !== undefined) {
            updatePayload.document_type = document_type;
        }

        const { data: updatedDocument, error: updateError } = await supabase
            .from('documents')
            .update(updatePayload)
            .eq('id', documentId)
            .select()
            .single();

        if (updateError) {
            throw updateError;
        }

        // ============ UPDATE LEARNING SYSTEM ============
        let merged = 0;
        try {
            const result = await updateLearningSystem(approved_skills || [], rejected_skills || []);
            merged = result?.merged || 0;
            console.log(`✅ Learning system updated!`);
        } catch (learningError) {
            console.error('⚠️ Learning system update failed:', learningError.message);
        }

        // ============ SYNC JSON TO DATABASE ============
        try {
            console.log('🔄 Syncing learned_skills.json to database...');
            const syncResult = await syncSkillsFromJsonToDatabase();
            console.log(`✅ Database sync: +${syncResult.added} added, ~${syncResult.updated} updated`);
        } catch (syncError) {
            console.error('⚠️ Database sync failed:', syncError.message);
        }

        // ============ SAVE TO FEEDBACK TRAINING TABLE (CASE-INSENSITIVE DEDUP) ============
        try {
            console.log('📊 Saving feedback to training table...');

            // Pull existing feedback rows for THIS employee once, match by
            // skillKey in-memory. Old code did a per-skill exact `.eq('phrase', skill)`
            // query, so "Level" vs "level" (different casing across scans) would
            // both get inserted, and the rejection would fail to match next time.
            const { data: existingFeedback } = await supabase
                .from('feedback_training')
                .select('phrase, label')
                .eq('employee_id', profileData.employee_id);

            const existingApprovedKeys = new Set(
                (existingFeedback || []).filter(r => r.label === 'Skill').map(r => skillKey(r.phrase))
            );
            const existingRejectedKeys = new Set(
                (existingFeedback || []).filter(r => r.label === 'Not Skill').map(r => skillKey(r.phrase))
            );

            for (const skillRaw of approved_skills) {
                const skill = normalizeSkill(skillRaw);
                if (!skill) continue;
                const key = skillKey(skill);
                if (existingApprovedKeys.has(key)) continue;

                await supabase
                    .from('feedback_training')
                    .insert({
                        phrase: skill,
                        label: 'Skill',
                        reviewed_by: profileData.id,
                        document_id: documentId,
                        employee_id: profileData.employee_id
                    });
                existingApprovedKeys.add(key);
            }

            for (const skillRaw of rejected_skills) {
                const skill = normalizeSkill(skillRaw);
                if (!skill) continue;
                const key = skillKey(skill);
                if (existingRejectedKeys.has(key)) continue;

                await supabase
                    .from('feedback_training')
                    .insert({
                        phrase: skill,
                        label: 'Not Skill',
                        reviewed_by: profileData.id,
                        document_id: documentId,
                        employee_id: profileData.employee_id
                    });
                existingRejectedKeys.add(key);
            }

            console.log(`✅ Feedback saved to training table!`);
        } catch (feedbackError) {
            console.error('⚠️ Error saving feedback to training table:', feedbackError.message);
        }

        // ============ AUTO-CLEAN DATABASE ============
        if (merged > 0 || approved_skills.length > 5) {
            try {
                console.log('🧹 Auto-cleaning database duplicates...');
                const cleanupResult = await cleanupDatabaseDuplicates();
                console.log(`✅ Database cleaned! (${cleanupResult.deleted} duplicates removed)`);
            } catch (cleanupError) {
                console.error('⚠️ Database cleanup failed:', cleanupError.message);
            }
        }

        res.json({
            success: true,
            data: {
                documentId: updatedDocument.id,
                approved_skills: approved_skills || [],
                rejected_skills: rejected_skills || []
            },
            message: `✅ ${approved_skills?.length || 0} skills saved!`
        });

    } catch (error) {
        console.error('Error saving skill feedback:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============ SYNC SKILLS ============
exports.syncSkills = async (req, res) => {
    try {
        const result = await syncSkillsFromJsonToDatabase();
        const cleanupResult = await cleanupDatabaseDuplicates();

        res.json({
            success: true,
            data: {
                ...result,
                duplicates_removed: cleanupResult.deleted
            },
            message: `Synced ${result.total} skills from JSON: +${result.added} added, ~${result.updated} updated, ${cleanupResult.deleted} duplicates removed`
        });

    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============ RESET SKILLS ============
exports.resetSkillsFromJson = async (req, res) => {
    try {
        console.log('🔄 Resetting database to match learned_skills.json...');

        const jsonPath = path.join(__dirname, '../../shared-data/skills_db/learned_skills.json');

        if (!fs.existsSync(jsonPath)) {
            return res.status(404).json({ success: false, error: 'learned_skills.json not found' });
        }

        const rawData = fs.readFileSync(jsonPath, 'utf8');
        const data = JSON.parse(rawData);
        const normalizedSkills = data.learned_skills || [];

        console.log(`📊 Found ${normalizedSkills.length} normalized skills in JSON`);

        const { data: dbSkills, error: fetchError } = await supabase
            .from('skills')
            .select('id, skill_name');

        if (fetchError) throw fetchError;

        console.log(`📊 Found ${dbSkills.length} skills in database`);

        const normalizedSet = new Set(normalizedSkills.map(skillKey));
        const dbSkillMap = {};
        dbSkills.forEach(s => {
            dbSkillMap[skillKey(s.skill_name)] = s.id;
        });

        const toDelete = [];
        const toKeep = [];

        for (const skill of dbSkills) {
            const key = skillKey(skill.skill_name);
            if (!normalizedSet.has(key)) {
                toDelete.push(skill.id);
                console.log(`   🗑️ Marked for deletion: ${skill.skill_name}`);
            } else {
                toKeep.push(skill.id);
            }
        }

        let deleted = 0;
        if (toDelete.length > 0) {
            for (const id of toDelete) {
                await supabase
                    .from('employee_skills')
                    .delete()
                    .eq('skill_id', id);
            }

            const { error: deleteError } = await supabase
                .from('skills')
                .delete()
                .in('id', toDelete);

            if (!deleteError) {
                deleted = toDelete.length;
                console.log(`   ✅ Deleted ${deleted} skills`);
            }
        }

        let added = 0;
        for (const skillName of normalizedSkills) {
            const key = skillKey(skillName);
            if (!dbSkillMap[key]) {
                const { error: insertError } = await supabase
                    .from('skills')
                    .insert({ skill_name: skillName });

                if (!insertError) {
                    added++;
                    dbSkillMap[key] = true; // avoid dup insert in same run
                    console.log(`   ✅ Added: ${skillName}`);
                }
            }
        }

        const { data: finalSkills } = await supabase
            .from('skills')
            .select('id, skill_name');

        res.json({
            success: true,
            data: {
                deleted: deleted,
                added: added,
                total_in_json: normalizedSkills.length,
                total_in_db: finalSkills?.length || 0
            },
            message: `✅ Database reset: ${deleted} removed, ${added} added. Now has ${finalSkills?.length || 0} normalized skills!`
        });

    } catch (error) {
        console.error('❌ Reset error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============ RETRAIN ML ============
exports.retrainML = async (req, res) => {
    try {
        const { count: totalCount, error: countError } = await supabase
            .from('feedback_training')
            .select('*', { count: 'exact', head: true });

        if (countError) throw countError;

        if (totalCount < 10) {
            return res.status(400).json({
                success: false,
                error: `Need at least 10 feedback items. Currently have ${totalCount}.`
            });
        }

        const { data: feedbackData, error: fetchError } = await supabase
            .from('feedback_training')
            .select('phrase, label');

        if (fetchError) throw fetchError;

        console.log(`📊 Retraining ML with ${feedbackData.length} feedback items...`);

        const texts = feedbackData.map(row => row.phrase);
        const labels = feedbackData.map(row => row.label === 'Skill' ? 1 : 0);

        const result = await retrainMLPython(texts, labels);

        res.json({
            success: true,
            data: {
                total_feedback: feedbackData.length,
                skills: labels.filter(l => l === 1).length,
                not_skills: labels.filter(l => l === 0).length,
                retrained: result.success
            },
            message: `✅ ML retrained with ${feedbackData.length} feedback items!`
        });

    } catch (error) {
        console.error('Retrain error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============ GET FEEDBACK STATS ============
exports.getFeedbackStats = async (req, res) => {
    try {
        const { count: totalCount } = await supabase
            .from('feedback_training')
            .select('*', { count: 'exact', head: true });

        const { count: skillCount } = await supabase
            .from('feedback_training')
            .select('*', { count: 'exact', head: true })
            .eq('label', 'Skill');

        const { count: notSkillCount } = await supabase
            .from('feedback_training')
            .select('*', { count: 'exact', head: true })
            .eq('label', 'Not Skill');

        const { data: recent } = await supabase
            .from('feedback_training')
            .select('phrase, label, created_at')
            .order('created_at', { ascending: false })
            .limit(10);

        res.json({
            success: true,
            data: {
                total: totalCount || 0,
                skills: skillCount || 0,
                not_skills: notSkillCount || 0,
                recent: recent || []
            }
        });

    } catch (error) {
        console.error('Feedback stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============ GET ML STATUS ============
exports.getMLStatus = async (req, res) => {
    try {
        const pythonResult = await getMLStatusPython();

        const { count: totalCount } = await supabase
            .from('feedback_training')
            .select('*', { count: 'exact', head: true });

        const { count: skillCount } = await supabase
            .from('feedback_training')
            .select('*', { count: 'exact', head: true })
            .eq('label', 'Skill');

        const { count: notSkillCount } = await supabase
            .from('feedback_training')
            .select('*', { count: 'exact', head: true })
            .eq('label', 'Not Skill');

        res.json({
            success: true,
            data: {
                ml_active: pythonResult?.ml_active || false,
                ml_trained: pythonResult?.ml_trained || false,
                total_skills: pythonResult?.total_skills || 0,
                total_categories: pythonResult?.total_categories || 0,
                alias_groups: pythonResult?.alias_groups || 0,
                feedback_approved: pythonResult?.feedback_approved || 0,
                feedback_rejected: pythonResult?.feedback_rejected || 0,
                feedback_total: totalCount || 0,
                feedback_skills: skillCount || 0,
                feedback_not_skills: notSkillCount || 0,
                status: pythonResult?.ml_active ? 'active' :
                       pythonResult?.ml_trained ? 'trained_but_inactive' : 'untrained',
                message: pythonResult?.ml_active ? 'ML is active and running!' :
                         pythonResult?.ml_trained ? 'ML is trained but not active' :
                         'ML is not trained yet'
            }
        });

    } catch (error) {
        console.error('ML Status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};