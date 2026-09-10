//backend/controllers/feedbackController.js
const { spawn } = require('child_process');
const pythonService = require('../services/pythonService');
const supabase = require('../supabase');
const path = require('path');
const {
    normalizeSkill,
    skillKey,
    buildComparisonKeys,
    addComparisonKeys,
    hasComparisonKey
} = require('../utils/skillNormalizer');

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

        console.log('ðŸ§  Updating learning system...');
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
            console.log(`ðŸ ${data.toString().trim()}`);
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error('âŒ Learning update error:', stderrData);
                reject(new Error(stderrData));
            } else {
                try {
                    const result = JSON.parse(stdoutData);
                    console.log(`âœ… Learning system updated! ${result.skills_learned || 0} skills learned`);
                    if (result.merged > 0) {
                        console.log(`   âœ… ${result.merged} duplicate skills auto-merged!`);
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
        console.log('ðŸ§¹ Cleaning database duplicates...');

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
                    console.log(`   âœ… Merged duplicate: ${skill.skill_name}`);
                }
            }
        }

        if (toDelete.length > 0) {
            // ============ FIX: dedupe employee_skills BEFORE deleting the
            // duplicate skill rows, otherwise an employee who already had
            // BOTH the master and the duplicate skill linked ends up with
            // two employee_skills rows pointing at the same master id
            // after the update above â€” still a duplicate in the portfolio.
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
                    console.log(`   âœ… Removed ${linkDupIds.length} duplicate employee_skills links`);
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
                console.log(`âœ… Deleted ${toDelete.length} duplicate skills from database`);
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
        console.log('ðŸ”„ Syncing skills from learned_skills.json to database...');

        const jsonPath = path.join(__dirname, '../../shared-data/skills_db/learned_skills.json');

        if (!fs.existsSync(jsonPath)) {
            console.log('âš ï¸ learned_skills.json not found, skipping sync');
            return { added: 0, updated: 0 };
        }

        const rawData = fs.readFileSync(jsonPath, 'utf8');
        const data = JSON.parse(rawData);

        const learnedSkills = data.learned_skills || [];
        const dictionary = data.dictionary || {};

        console.log(`ðŸ“Š learned_skills.json has ${learnedSkills.length} skills`);

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
                        console.log(`   ðŸ”„ Updated: ${skillName} â†’ ${category}`);
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
                    console.log(`   âœ… Added: ${skillName} (${category})`);
                }
            }
        }

        console.log(`âœ… Sync complete: +${added} added, ~${updated} updated, ${skipped} already exist`);

        return { added, updated, total: learnedSkills.length };

    } catch (error) {
        console.error('âŒ Sync error:', error);
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
            console.log(`ðŸ ${data.toString().trim()}`);
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
            console.log(`ðŸ ${data.toString().trim()}`);
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

        console.log(`ðŸ” Found ${toDelete.length} duplicate skills`);
        console.log(`ðŸ“Š ${Object.keys(duplicates).length} duplicate groups`);

        for (const [key, dupList] of Object.entries(duplicates)) {
            for (const dup of dupList) {
                const { error: updateError } = await supabase
                    .from('employee_skills')
                    .update({ skill_id: dup.master_id })
                    .eq('skill_id', dup.id);

                if (updateError) {
                    console.error(`Error updating skill ${dup.id}:`, updateError);
                } else {
                    console.log(`   âœ… Updated employee_skills: ${dup.name} â†’ ${dup.master_id}`);
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
                    console.log(`   âœ… Removed ${linkDupIds.length} duplicate employee_skills links`);
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
                console.log(`âœ… Deleted ${toDelete.length} duplicate skills`);
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

// â”€â”€â”€ Dead/duplicate functions removed (Phase 1 clean-up) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// processDocument, getDocuments, getDocumentOcrText, getProfile, updateProfile,
// getSkills, getStats were never mounted in any route. All live implementations
// now reside exclusively in documentController.js where the routes point.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// ============ GET PENDING FEEDBACK ============
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
        const { documentId, approved_skills = [], rejected_skills = [], document_type, skill_predictions = {} } = req.body;

        // ============ NORMALIZE skill_predictions FOR CASE-INSENSITIVE LOOKUP ============
        // skill_predictions comes from the frontend as { "<original skill name>": { prediction, confidence } },
        // carrying the ORIGINAL ML prediction/confidence computed once during document
        // processing (module2_nlp.py's _is_likely_skill -> nlp.needs_review_predictions).
        // It must never be regenerated here - only looked up and stored alongside the
        // human label, which stays a separate column.
        const predictionByKey = new Map();
        if (skill_predictions && typeof skill_predictions === 'object') {
            for (const [skillName, meta] of Object.entries(skill_predictions)) {
                if (!meta || typeof meta !== 'object') continue;
                const key = skillKey(skillName);
                const prediction = typeof meta.prediction === 'string' ? meta.prediction : null;
                const confidence = typeof meta.confidence === 'number' ? meta.confidence : null;
                predictionByKey.set(key, { prediction, confidence });
            }
        }
        // If prediction metadata is genuinely unavailable for a skill, this returns
        // { prediction: null, confidence: null } rather than inventing a value -
        // Postgres/Supabase will store those as NULL.
        const getMlMeta = (skillName) => predictionByKey.get(skillKey(skillName)) || { prediction: null, confidence: null };

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

        // ============ SAVE SKILLS TO DATABASE (BATCHED, CASE-INSENSITIVE DEDUP) ============
        if (approved_skills && approved_skills.length > 0) {
            console.log(`âœ… Saving ${approved_skills.length} approved skills to database...`);

            // Normalize + dedupe the incoming batch itself first (in-memory,
            // free) so we never issue two DB calls for the same skill twice.
            const normalizedNames = [];
            const seenKeys = new Set();
            for (const raw of approved_skills) {
                const name = normalizeSkill(raw);
                if (!name) continue;
                const key = skillKey(name);
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);
                normalizedNames.push({ key, name });
            }

            // TARGETED fetch: only the rows that could match THIS batch,
            // via case-insensitive exact match (ilike with no wildcards),
            // instead of pulling the entire skills table. Bounded by
            // approved_skills.length, not by total skills in the system.
            let skillMap = new Map();
            if (normalizedNames.length > 0) {
                const orFilter = normalizedNames
                    .map(({ name }) => `skill_name.ilike.${name.replace(/[(),]/g, '')}`)
                    .join(',');
                const { data: matchingSkills } = await supabase
                    .from('skills')
                    .select('id, skill_name')
                    .or(orFilter);
                (matchingSkills || []).forEach(s => skillMap.set(skillKey(s.skill_name), s.id));
            }

            // BATCH insert whatever wasn't found â€” ONE call for all new
            // skills instead of one INSERT per missing skill.
            const toInsert = normalizedNames
                .filter(({ key }) => !skillMap.has(key))
                .map(({ name }) => ({ skill_name: name }));

            if (toInsert.length > 0) {
                const { data: insertedSkills, error: insertSkillError } = await supabase
                    .from('skills')
                    .upsert(toInsert, { onConflict: 'skill_name', ignoreDuplicates: false })
                    .select('id, skill_name');
                if (!insertSkillError && insertedSkills) {
                    insertedSkills.forEach(s => skillMap.set(skillKey(s.skill_name), s.id));
                    console.log(`   âœ… Added ${insertedSkills.length} new skill(s)`);
                } else if (insertSkillError) {
                    console.error('   âŒ Batch skill insert error:', insertSkillError.message);
                }
            }

            const relevantSkillIds = [...skillMap.values()];

            // TARGETED fetch of this employee's existing links, filtered to
            // only the skill ids relevant to this batch (not the employee's
            // whole skill list, and never anyone else's).
            let linkedSkillIds = new Set();
            if (relevantSkillIds.length > 0) {
                const { data: existingLinks } = await supabase
                    .from('employee_skills')
                    .select('skill_id')
                    .eq('profile_id', profileData.id)
                    .in('skill_id', relevantSkillIds);
                linkedSkillIds = new Set((existingLinks || []).map(l => l.skill_id));
            }

            // BATCH insert the missing links â€” ONE call for all of them.
            const linksToInsert = relevantSkillIds
                .filter(id => !linkedSkillIds.has(id))
                .map(id => ({ profile_id: profileData.id, skill_id: id }));

            if (linksToInsert.length > 0) {
                const { error: linkError } = await supabase
                    .from('employee_skills')
                    .insert(linksToInsert);
                if (linkError) {
                    console.error('   âŒ Batch link insert error:', linkError.message);
                } else {
                    console.log(`   âœ… Linked ${linksToInsert.length} new skill(s) to profile`);
                }
            }
            console.log(`âœ… Skills saved to employee profile`);
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

        // Return after the user-facing database save. Learning, training,
        // retraining, and cleanup are maintenance work and must not block Save.
        res.json({
            success: true,
            data: {
                documentId: updatedDocument.id,
                approved_skills: approved_skills || [],
                rejected_skills: rejected_skills || []
            },
            message: `âœ… ${approved_skills?.length || 0} skills saved!`
        });

        setImmediate(async () => {
            try {

        // ============ UPDATE LEARNING SYSTEM ============
        let merged = 0;
        try {
            const result = await updateLearningSystem(approved_skills || [], rejected_skills || []);
            merged = result?.merged || 0;
            console.log(`âœ… Learning system updated!`);
        } catch (learningError) {
            console.error('âš ï¸ Learning system update failed:', learningError.message);
        }

        // ============ SYNC JSON TO DATABASE ============
        try {
            console.log('ðŸ”„ Syncing learned_skills.json to database...');
            const syncResult = await syncSkillsFromJsonToDatabase();
            console.log(`âœ… Database sync: +${syncResult.added} added, ~${syncResult.updated} updated`);
        } catch (syncError) {
            console.error('âš ï¸ Database sync failed:', syncError.message);
        }

        // ============ SAVE TO FEEDBACK TRAINING TABLE (CASE-INSENSITIVE DEDUP) ============
        try {
            console.log('ðŸ“Š Saving feedback to training table...');

            // Pull existing feedback rows for THIS employee once, match by
            // skillKey in-memory. Old code did a per-skill exact `.eq('phrase', skill)`
            // query, so "Level" vs "level" (different casing across scans) would
            // both get inserted, and the rejection would fail to match next time.
            const { data: existingFeedback } = await supabase
                .from('feedback_training')
                .select('phrase, label')
                .eq('employee_id', profileData.employee_id);

            // âœ… Phase 1: Use buildComparisonKeys for consistent plural/singular dedup.
            // Previously used plain skillKey(), so "Electrical System" and
            // "Electrical Systems" would both pass and be inserted as separate rows.
            const existingApprovedKeys = new Set();
            const existingRejectedKeys = new Set();
            for (const r of (existingFeedback || [])) {
                if (r.label === 'Skill') addComparisonKeys(existingApprovedKeys, r.phrase);
                if (r.label === 'Not Skill') addComparisonKeys(existingRejectedKeys, r.phrase);
            }

            // Both loops insert reviewed_at = now, since this row is being written
            // BECAUSE a human (profileData.id) just reviewed it. That's also what
            // makes it eligible to be counted as "human-reviewed" for the ML
            // retraining threshold below - a row is only ever human-reviewed once
            // both reviewed_by and reviewed_at are set, and prior to this fix
            // reviewed_at was never populated at all.
            const reviewedAt = new Date().toISOString();
            let feedbackRowsWritten = 0;

            for (const skillRaw of approved_skills) {
                const skill = normalizeSkill(skillRaw);
                if (!skill) continue;
                // âœ… hasComparisonKey checks all 4 variants (strict, compact, singular, singularCompact)
                if (hasComparisonKey(existingApprovedKeys, skill)) continue;

                // The human decision (label='Skill') and the original ML prediction/
                // confidence are stored in separate columns and must never overwrite
                // each other - e.g. ML may have predicted "Not Skill" and a human
                // still approved it; both facts are preserved.
                const mlMeta = getMlMeta(skill);
                await supabase
                    .from('feedback_training')
                    .insert({
                        phrase: skill,
                        label: 'Skill',
                        prediction: mlMeta.prediction,
                        confidence: mlMeta.confidence,
                        reviewed_by: profileData.id,
                        reviewed_at: reviewedAt,
                        document_id: documentId,
                        employee_id: profileData.employee_id
                    });
                existingApprovedKeys.add(key);
                feedbackRowsWritten++;
            }

            for (const skillRaw of rejected_skills) {
                const skill = normalizeSkill(skillRaw);
                if (!skill) continue;
                if (hasComparisonKey(existingRejectedKeys, skill)) continue;

                const mlMeta = getMlMeta(skill);
                await supabase
                    .from('feedback_training')
                    .insert({
                        phrase: skill,
                        label: 'Not Skill',
                        prediction: mlMeta.prediction,
                        confidence: mlMeta.confidence,
                        reviewed_by: profileData.id,
                        reviewed_at: reviewedAt,
                        document_id: documentId,
                        employee_id: profileData.employee_id
                    });
                existingRejectedKeys.add(key);
                feedbackRowsWritten++;
            }

            console.log(`âœ… Feedback saved to training table!`);

            // ============ GATED ML RETRAINING ============
            // Only actually retrains when >= 20 NEW human-reviewed rows have
            // accumulated since the last successful training; otherwise this is a
            // fast no-op. This is the only place ML retraining is triggered now -
            // module2_nlp.py's learn_from_feedback() no longer trains inline on
            // every submission. Awaited (not fire-and-forget) so a successful
            // retrain is guaranteed to have persisted to skill_classifier.pkl
            // before this request completes, and errors don't break feedback
            // saving (the feedback_training rows above are already committed).
            if (feedbackRowsWritten > 0) {
                try {
                    const retrainResult = await pythonService.retrainIfNeeded(20);
                    if (retrainResult?.retrained) {
                        console.log(`ðŸŽ“ ML retrained automatically: ${retrainResult.total_reviewed_count} human-reviewed rows`);
                    } else {
                        console.log(`â„¹ï¸  ML retrain check: ${retrainResult?.reason || 'not needed'} `
                            + `(${retrainResult?.new_reviewed_count ?? '?'} new reviewed rows)`);
                    }
                } catch (retrainError) {
                    console.error('âš ï¸ ML retrain check failed:', retrainError.message);
                }
            }
        } catch (feedbackError) {
            console.error('âš ï¸ Error saving feedback to training table:', feedbackError.message);
        }

        // ============ AUTO-CLEAN DATABASE ============
        if (merged > 0 || approved_skills.length > 5) {
            try {
                console.log('ðŸ§¹ Auto-cleaning database duplicates...');
                const cleanupResult = await cleanupDatabaseDuplicates();
                console.log(`âœ… Database cleaned! (${cleanupResult.deleted} duplicates removed)`);
            } catch (cleanupError) {
                console.error('âš ï¸ Database cleanup failed:', cleanupError.message);
            }
        }

            } catch (backgroundError) {
                console.error('âš ï¸ Post-save learning work failed:', backgroundError.message);
            }
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
        console.log('ðŸ”„ Resetting database to match learned_skills.json...');

        const jsonPath = path.join(__dirname, '../../shared-data/skills_db/learned_skills.json');

        if (!fs.existsSync(jsonPath)) {
            return res.status(404).json({ success: false, error: 'learned_skills.json not found' });
        }

        const rawData = fs.readFileSync(jsonPath, 'utf8');
        const data = JSON.parse(rawData);
        const normalizedSkills = data.learned_skills || [];

        console.log(`ðŸ“Š Found ${normalizedSkills.length} normalized skills in JSON`);

        const { data: dbSkills, error: fetchError } = await supabase
            .from('skills')
            .select('id, skill_name');

        if (fetchError) throw fetchError;

        console.log(`ðŸ“Š Found ${dbSkills.length} skills in database`);

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
                console.log(`   ðŸ—‘ï¸ Marked for deletion: ${skill.skill_name}`);
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
                console.log(`   âœ… Deleted ${deleted} skills`);
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
                    console.log(`   âœ… Added: ${skillName}`);
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
            message: `âœ… Database reset: ${deleted} removed, ${added} added. Now has ${finalSkills?.length || 0} normalized skills!`
        });

    } catch (error) {
        console.error('âŒ Reset error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============ RETRAIN ML ============
exports.retrainML = async (req, res) => {
    try {
        // Reporting counts here now match what Python will actually train on
        // (retrain_ml -> train_and_replace_if_needed only ever uses rows where
        // reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL) - previously this
        // counted/reported ALL feedback_training rows including unreviewed ones,
        // which didn't match what got trained on.
        const { data: feedbackData, error: fetchError } = await supabase
            .from('feedback_training')
            .select('phrase, label')
            .not('reviewed_by', 'is', null)
            .not('reviewed_at', 'is', null)
            .in('label', ['Skill', 'Not Skill']);

        if (fetchError) throw fetchError;

        const totalCount = feedbackData?.length || 0;

        if (totalCount < 10) {
            return res.status(400).json({
                success: false,
                error: `Need at least 10 human-reviewed feedback items. Currently have ${totalCount}.`
            });
        }

        console.log(`ðŸ“Š Manually retraining ML (${totalCount} human-reviewed feedback items available)...`);

        const labels = feedbackData.map(row => row.label === 'Skill' ? 1 : 0);

        // texts/labels are still passed for backward compatibility with the CLI
        // signature, but runner.py's retrain_ml now ignores them and re-fetches
        // human-reviewed rows directly from Supabase itself via the same safe
        // candidate-train/evaluate/replace path the automatic retrain uses -
        // see runner.py and skill_classifier.train_and_replace_if_needed().
        const texts = feedbackData.map(row => row.phrase);
        const result = await retrainMLPython(texts, labels);

        res.json({
            success: true,
            data: {
                total_feedback: result.total_reviewed_count ?? totalCount,
                skills: labels.filter(l => l === 1).length,
                not_skills: labels.filter(l => l === 0).length,
                retrained: !!result.retrained
            },
            message: result.retrained
                ? `âœ… ML retrained with ${result.total_reviewed_count ?? totalCount} human-reviewed feedback items!`
                : `â„¹ï¸ Retrain did not run: ${result.reason || result.error || 'unknown reason'}`
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
