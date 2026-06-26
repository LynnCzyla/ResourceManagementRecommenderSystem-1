const supabase = require('../supabase');
const { v4: uuidv4 } = require('uuid');

/**
 * Save skill feedback - THIS IS WHERE SKILLS ARE ACTUALLY SAVED
 * POST /api/employee/skill-feedback
 */
exports.saveSkillFeedback = async (req, res) => {
    try {
        const { 
            employeeId, 
            documentId, 
            approved_skills, 
            rejected_skills,
            document_type 
        } = req.body;

        console.log('📝 Saving skill feedback...');
        console.log(`   Employee: ${employeeId}`);
        console.log(`   Document: ${documentId}`);
        console.log(`   Approved: ${approved_skills?.length || 0}`);
        console.log(`   Rejected: ${rejected_skills?.length || 0}`);

        if (!employeeId || !documentId) {
            return res.status(400).json({
                success: false,
                error: 'employeeId and documentId are required'
            });
        }

        // ============ SAVE SKILLS ONLY IF APPROVED ============
        if (approved_skills && approved_skills.length > 0) {
            console.log(`✅ Saving ${approved_skills.length} approved skills...`);
            
            // Get employee profile_id
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('id')
                .eq('employee_id', employeeId)
                .single();

            if (profileError) {
                console.error('Error fetching profile:', profileError);
                return res.status(500).json({
                    success: false,
                    error: 'Profile not found'
                });
            }

            // Add each approved skill
            let skillsSaved = 0;
            for (const skillName of approved_skills) {
                // Check if skill exists
                const { data: existingSkill } = await supabase
                    .from('skills')
                    .select('id')
                    .eq('skill_name', skillName)
                    .maybeSingle();

                let skillId;
                if (existingSkill) {
                    skillId = existingSkill.id;
                } else {
                    // Insert new skill
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
                    // Check if already linked to employee
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
                        skillsSaved++;
                    }
                }
            }
            console.log(`✅ Saved ${skillsSaved} skills to employee profile`);
        }

        // ============ SAVE FEEDBACK RECORD ============
        const { data: feedbackData, error: feedbackError } = await supabase
            .from('skill_feedback')
            .insert({
                id: uuidv4(),
                employee_id: employeeId,
                document_id: documentId,
                approved_skills: approved_skills || [],
                rejected_skills: rejected_skills || [],
                document_type: document_type || 'Resume',
                created_at: new Date().toISOString(),
                processed: true,
                processed_at: new Date().toISOString()
            })
            .select()
            .single();

        if (feedbackError) {
            console.error('Error saving feedback:', feedbackError);
            return res.status(500).json({
                success: false,
                error: feedbackError.message
            });
        }

        // ============ UPDATE DOCUMENT WITH APPROVED SKILLS ============
        const { error: docError } = await supabase
            .from('documents')
            .update({
                approved_skills: approved_skills || [],
                rejected_skills: rejected_skills || [],
                skills_approved: true,
                feedback_pending: false,
                updated_at: new Date().toISOString()
            })
            .eq('id', documentId);

        if (docError) {
            console.error('Error updating document:', docError);
        }

        res.json({
            success: true,
            data: feedbackData,
            message: `✅ ${approved_skills?.length || 0} skills saved successfully!`
        });

    } catch (error) {
        console.error('Save feedback error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Get pending feedback for a document
 * GET /api/employee/pending-feedback/:documentId
 */
exports.getPendingFeedback = async (req, res) => {
    try {
        const { documentId } = req.params;
        const { employeeId } = req.query;

        if (!documentId) {
            return res.status(400).json({
                success: false,
                error: 'documentId is required'
            });
        }

        // Get the document
        const { data: docData, error: docError } = await supabase
            .from('documents')
            .select('*')
            .eq('id', documentId)
            .single();

        if (docError) {
            console.error('Error fetching document:', docError);
            return res.status(500).json({
                success: false,
                error: docError.message
            });
        }

        // Check if feedback already exists
        const { data: existingFeedback, error: feedbackError } = await supabase
            .from('skill_feedback')
            .select('*')
            .eq('document_id', documentId)
            .eq('employee_id', employeeId)
            .maybeSingle();

        // Get extracted skills from document
        const extractedSkills = docData.extracted_skills || [];

        if (existingFeedback) {
            const approved = existingFeedback.approved_skills || [];
            const rejected = existingFeedback.rejected_skills || [];
            const pending = extractedSkills.filter(
                s => !approved.includes(s) && !rejected.includes(s)
            );

            return res.json({
                success: true,
                data: {
                    document_id: documentId,
                    extracted_skills: extractedSkills,
                    approved_skills: approved,
                    rejected_skills: rejected,
                    pending_skills: pending,
                    has_feedback: true,
                    feedback: existingFeedback
                }
            });
        }

        res.json({
            success: true,
            data: {
                document_id: documentId,
                extracted_skills: extractedSkills,
                approved_skills: [],
                rejected_skills: [],
                pending_skills: extractedSkills,
                has_feedback: false
            }
        });

    } catch (error) {
        console.error('Get pending feedback error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Get feedback statistics
 * GET /api/employee/feedback-stats
 */
exports.getFeedbackStats = async (req, res) => {
    try {
        const { employeeId } = req.query;

        let query = supabase.from('skill_feedback').select('*');

        if (employeeId) {
            query = query.eq('employee_id', employeeId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching feedback stats:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        const totalFeedback = data.length;
        const totalApproved = data.reduce((sum, f) => sum + (f.approved_skills?.length || 0), 0);
        const totalRejected = data.reduce((sum, f) => sum + (f.rejected_skills?.length || 0), 0);

        const allApproved = new Set();
        const allRejected = new Set();
        data.forEach(f => {
            (f.approved_skills || []).forEach(s => allApproved.add(s));
            (f.rejected_skills || []).forEach(s => allRejected.add(s));
        });

        res.json({
            success: true,
            data: {
                total_feedback_sessions: totalFeedback,
                total_approved_skills: totalApproved,
                total_rejected_skills: totalRejected,
                unique_approved_skills: allApproved.size,
                unique_rejected_skills: allRejected.size,
                approved_skills_list: Array.from(allApproved),
                rejected_skills_list: Array.from(allRejected)
            }
        });

    } catch (error) {
        console.error('Get feedback stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};