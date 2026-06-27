const pythonService = require('../services/pythonService');
const storageService = require('../services/storageService');
const supabase = require('../supabase');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

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

        res.json({
            success: true,
            data: { documentId: updatedDocument.id },
            message: 'Feedback saved successfully'
        });
    } catch (error) {
        console.error('Error saving skill feedback:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};