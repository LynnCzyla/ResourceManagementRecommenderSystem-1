//backend\controllers\feedbackController.js
const { spawn } = require('child_process');  // ← ADD THIS LINE
const pythonService = require('../services/pythonService');
const storageService = require('../services/storageService');
const supabase = require('../supabase');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

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
            const key = skill.skill_name.toLowerCase().trim();
            if (!uniqueSkills[key]) {
                uniqueSkills[key] = skill.id;
            } else {
                // Update employee_skills to use master
                const { error: updateError } = await supabase
                    .from('employee_skills')
                    .update({ skill_id: uniqueSkills[key] })
                    .eq('skill_id', skill.id);
                
                if (!updateError) {
                    toDelete.push(skill.id);
                    deletedCount++;
                    console.log(`   ✅ Merged: ${skill.skill_name} → ${skill.skill_name}`);
                }
            }
        }
        
        if (toDelete.length > 0) {
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



// ============ ADD THIS NEW FUNCTION ============
async function syncSkillsFromJsonToDatabase() {
    try {
        console.log('🔄 Syncing skills from learned_skills.json to database...');
        
        // 1. Read the learned_skills.json file
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
        
        // 2. Get all skills currently in database
        const { data: dbSkills, error: fetchError } = await supabase
            .from('skills')
            .select('id, skill_name');
        
        if (fetchError) throw fetchError;
        
        // Create lookup maps
        const dbSkillMap = new Map();
        dbSkills.forEach(s => dbSkillMap.set(s.skill_name.toLowerCase().trim(), {
            id: s.id,
            category: s.category
        }));
        
        let added = 0;
        let updated = 0;
        let skipped = 0;
        
        // 3. Process each skill from JSON
        for (const skillName of learnedSkills) {
            const normalizedName = skillName.toLowerCase().trim();
            const category = dictionary[skillName] || 'Other';
            
            if (dbSkillMap.has(normalizedName)) {
                // Skill exists in database
                const existing = dbSkillMap.get(normalizedName);
                
                // Check if category needs update
                if (existing.category !== category) {
                    // Update category
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
                // New skill - insert
                const { error: insertError } = await supabase
                    .from('skills')
                    .insert({
                        skill_name: skillName,
                        category: category,
                        created_at: new Date().toISOString()
                    });
                
                if (!insertError) {
                    added++;
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
// ==================================================

/**
 * Clean up duplicate skills in database
 * POST /api/employee/cleanup-duplicates
 */
exports.cleanupDuplicateSkills = async (req, res) => {
    try {
        const { employeeId } = req.query;
        
        // 1. Get all skills
        const { data: allSkills, error: skillsError } = await supabase
            .from('skills')
            .select('id, skill_name')
            .order('skill_name');
        
        if (skillsError) throw skillsError;
        
        // 2. Find duplicates by skill_name (case-insensitive)
        const duplicates = {};
        const uniqueSkills = {};
        const toDelete = [];
        const toKeep = {};
        
        for (const skill of allSkills) {
            const key = skill.skill_name.toLowerCase().trim();
            if (!uniqueSkills[key]) {
                uniqueSkills[key] = skill.id;
                toKeep[skill.id] = skill.skill_name;
            } else {
                // This is a duplicate
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
        
        // 3. For each duplicate, update employee_skills to point to master
        for (const [key, dupList] of Object.entries(duplicates)) {
            for (const dup of dupList) {
                // Update employee_skills to use master skill_id
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
        
        // 4. Delete duplicate skills
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
        
        // 5. Also clean up learned_skills.json
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

exports.processDocument = async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const { documentType } = req.body;

        // SECURITY: Get employeeId from token, not body
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
                extracted_skills: result.nlp?.skills || [],
                skills_approved: false,
                feedback_pending: true,
                approved_skills: [],
                rejected_skills: []
            })
            .select()
            .single();

        if (docError) console.error('Error saving document:', docError);

        return res.json({
            success: true,
            data: {
                documentId: documentData?.id || result.document_id,
                fileUrl: uploadResult.publicUrl,
                ocr: result.ocr,
                nlp: {
                    skills: result.nlp?.skills || [],
                    categorized_skills: result.nlp?.categorized_skills || [],
                    prc_license: result.nlp?.prc_license || null,
                    prc_verified: result.nlp?.prc_verified || false
                },
                summary: result.summary,
                feedback_required: true,
                pending_skills: result.nlp?.skills || []
            },
            message: 'Document processed. Please review and approve skills.'
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
            .select('*')
            .eq('employee_id', profileData.employee_id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data: data });

    } catch (error) {
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

        const skills = data.map(item => item.skills).filter(Boolean);
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

        // ============ SAVE SKILLS TO DATABASE ============
        if (approved_skills && approved_skills.length > 0) {
            console.log(`✅ Saving ${approved_skills.length} approved skills to database...`);
            
            for (const skillName of approved_skills) {
                const { data: existingSkill } = await supabase
                    .from('skills')
                    .select('id')
                    .eq('skill_name', skillName)
                    .maybeSingle();

                let skillId;
                if (existingSkill) {
                    skillId = existingSkill.id;
                } else {
                    const { data: newSkill } = await supabase
                        .from('skills')
                        .insert({ skill_name: skillName })
                        .select()
                        .single();
                    skillId = newSkill?.id;
                    if (skillId) {
                        console.log(`   ✅ Added new skill: ${skillName}`);
                    }
                }

                if (skillId) {
                    const { data: existingLink } = await supabase
                        .from('employee_skills')
                        .select('id')
                        .eq('profile_id', profileData.id)
                        .eq('skill_id', skillId)
                        .maybeSingle();

                    if (!existingLink) {
                        await supabase
                            .from('employee_skills')
                            .insert({
                                profile_id: profileData.id,
                                skill_id: skillId
                            });
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

        // ============ UPDATE LEARNING SYSTEM (WITH AUTO-MERGE) ============
        let merged = 0;
        try {
            const result = await updateLearningSystem(approved_skills || [], rejected_skills || []);
            merged = result?.merged || 0;
            console.log(`✅ Learning system updated!`);
        } catch (learningError) {
            console.error('⚠️ Learning system update failed:', learningError.message);
        }

        try {
            console.log('🔄 Syncing learned_skills.json to database...');
            const syncResult = await syncSkillsFromJsonToDatabase();
            console.log(`✅ Database sync: +${syncResult.added} added, ~${syncResult.updated} updated`);
        } catch (syncError) {
            console.error('⚠️ Database sync failed:', syncError.message);
        }

        // ============ 🔥 AUTO-CLEAN DATABASE ============
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
            data: { documentId: updatedDocument.id },
            message: `✅ ${approved_skills?.length || 0} skills saved and ${merged} duplicates merged!`
        });

    } catch (error) {
        console.error('Error saving skill feedback:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};


// ============ ADD THIS EXPORT ============
/**
 * Manually sync skills from learned_skills.json to database
 * POST /api/employee/sync-skills
 */
exports.syncSkills = async (req, res) => {
    try {
        const result = await syncSkillsFromJsonToDatabase();
        
        // Also clean up duplicates after sync
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


/**
 * Reset database skills to match learned_skills.json
 * POST /api/employee/reset-skills
 */
exports.resetSkillsFromJson = async (req, res) => {
    try {
        console.log('🔄 Resetting database to match learned_skills.json...');
        
        // 1. Read normalized skills from JSON
        const jsonPath = path.join(__dirname, '../../shared-data/skills_db/learned_skills.json');
        
        if (!fs.existsSync(jsonPath)) {
            return res.status(404).json({ success: false, error: 'learned_skills.json not found' });
        }
        
        const rawData = fs.readFileSync(jsonPath, 'utf8');
        const data = JSON.parse(rawData);
        const normalizedSkills = data.learned_skills || [];
        
        console.log(`📊 Found ${normalizedSkills.length} normalized skills in JSON`);
        
        // 2. Get current skills in database
        const { data: dbSkills, error: fetchError } = await supabase
            .from('skills')
            .select('id, skill_name');
        
        if (fetchError) throw fetchError;
        
        console.log(`📊 Found ${dbSkills.length} skills in database`);
        
        // 3. Find which skills are in database but NOT in normalized list
        const normalizedSet = new Set(normalizedSkills.map(s => s.toLowerCase().trim()));
        const dbSkillMap = {};
        dbSkills.forEach(s => {
            dbSkillMap[s.skill_name.toLowerCase().trim()] = s.id;
        });
        
        const toDelete = [];
        const toKeep = [];
        
        for (const skill of dbSkills) {
            const key = skill.skill_name.toLowerCase().trim();
            if (!normalizedSet.has(key)) {
                toDelete.push(skill.id);
                console.log(`   🗑️ Marked for deletion: ${skill.skill_name}`);
            } else {
                toKeep.push(skill.id);
            }
        }
        
        // 4. Delete skills not in normalized list
        let deleted = 0;
        if (toDelete.length > 0) {
            // First, update employee_skills to remove references
            for (const id of toDelete) {
                await supabase
                    .from('employee_skills')
                    .delete()
                    .eq('skill_id', id);
            }
            
            // Then delete the skills
            const { error: deleteError } = await supabase
                .from('skills')
                .delete()
                .in('id', toDelete);
            
            if (!deleteError) {
                deleted = toDelete.length;
                console.log(`   ✅ Deleted ${deleted} skills`);
            }
        }
        
        // 5. Add missing normalized skills
        let added = 0;
        for (const skillName of normalizedSkills) {
            const key = skillName.toLowerCase().trim();
            if (!dbSkillMap[key]) {
                const { error: insertError } = await supabase
                    .from('skills')
                    .insert({ skill_name: skillName });
                
                if (!insertError) {
                    added++;
                    console.log(`   ✅ Added: ${skillName}`);
                }
            }
        }
        
        // 6. Get final count
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