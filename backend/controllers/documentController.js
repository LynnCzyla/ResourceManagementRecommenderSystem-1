const pythonService = require('../services/pythonService');
const storageService = require('../services/storageService');
const supabase = require('../supabase');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

/**
 * Process document with OCR + NLP
 * POST /api/employee/process-document
 */
exports.processDocument = async (req, res) => {
    try {
        const { employeeId, documentType } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ 
                success: false, 
                error: 'No file uploaded' 
            });
        }

        console.log(`📄 Processing document: ${file.originalname}`);
        console.log(`📏 File size: ${(file.size / 1024).toFixed(2)} KB`);
        console.log(`👤 Employee: ${employeeId}`);
        console.log(`📋 Type: ${documentType}`);
        console.log(`📁 MIME Type: ${file.mimetype}`);

        // 1. Upload file to Supabase Storage
        console.log('📤 Uploading file to Supabase Storage...');
        const uploadResult = await storageService.uploadFile(file, employeeId, documentType);

        // 2. Save file locally for Python processing
        const tempPath = path.join(__dirname, '../../shared-data/uploads', file.originalname);
        const uploadDir = path.dirname(tempPath);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        fs.writeFileSync(tempPath, file.buffer);
        console.log(`📁 File saved to: ${tempPath}`);

        // 3. Process with Python
        console.log('🐍 Processing document with Python...');
        console.log('⏳ This may take a moment...');
        const result = await pythonService.processDocument(
            tempPath,
            employeeId,
            documentType
        );

        // 4. Clean up temp file
        try {
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
                console.log('🗑️ Temp file cleaned up');
            }
        } catch (e) {
            console.warn('Could not delete temp file:', e);
        }

        if (!result || !result.success) {
            return res.status(500).json({ 
                success: false, 
                error: result?.error || 'Python processing failed'
            });
        }

        // ============ STEP 5: SAVE DOCUMENT ONLY (NO SKILLS YET) ============
        console.log('💾 Saving document to Supabase (skills pending approval)...');
        
        // Insert document record - WITHOUT skills
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
                // ============ ADD THESE NEW FIELDS ============
                extracted_skills: result.nlp?.skills || [],           // Store extracted skills for review
                skills_approved: false,                               // Skills not yet approved
                feedback_pending: true,                               // Waiting for feedback
                approved_skills: [],                                  // Will be filled after feedback
                rejected_skills: []                                   // Will be filled after feedback
            })
            .select()
            .single();

        if (docError) {
            console.error('Error saving document:', docError);
        }

        // ============ STEP 6: DO NOT SAVE SKILLS - WAIT FOR FEEDBACK ============
        // Skills will be saved in the feedback controller when user approves

        console.log(`📋 Document saved with ID: ${documentData?.id}`);
        console.log(`📊 Extracted ${result.nlp?.skills?.length || 0} skills - pending approval`);

        // ============ STEP 7: Return response with skills for feedback ============
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
                // ============ ADD PENDING STATUS ============
                feedback_required: true,
                pending_skills: result.nlp?.skills || []
            },
            message: 'Document processed. Please review and approve skills.'
        });

    } catch (error) {
        console.error('Document processing error:', error);
        
        try {
            const tempPath = path.join(__dirname, '../../shared-data/uploads', req.file?.originalname);
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
        
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Internal server error'
        });
    }
};

/**
 * Get employee documents
 * GET /api/employee/documents
 */
exports.getDocuments = async (req, res) => {
    try {
        const { employeeId } = req.query;

        if (!employeeId) {
            return res.status(400).json({
                success: false,
                error: 'employeeId is required'
            });
        }

        const { data, error } = await supabase
            .from('documents')
            .select('*')
            .eq('employee_id', employeeId)
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            data: data
        });

    } catch (error) {
        console.error('Get documents error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Get employee profile by employee_id
 * GET /api/employee/profile/:employeeId
 */
exports.getProfile = async (req, res) => {
    try {
        const { employeeId } = req.params;

        if (!employeeId) {
            return res.status(400).json({
                success: false,
                error: 'employeeId is required'
            });
        }

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('employee_id', employeeId)
            .single();

        if (error) {
            console.error('Supabase error:', error);
            if (error.code === 'PGRST116') {
                return res.json({
                    success: true,
                    data: {
                        employee_id: employeeId,
                        first_name: 'Employee',
                        last_name: 'Not Found',
                        email: '',
                        department: '',
                        role: '',
                        avatar_url: '',
                        status: 'Active',
                        availability_status: 'Available'
                    }
                });
            }
            throw error;
        }

        res.json({
            success: true,
            data: data
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Update employee profile
 * PUT /api/employee/profile
 */
exports.updateProfile = async (req, res) => {
    try {
        const { 
            employeeId, 
            first_name, 
            last_name, 
            email, 
            department, 
            role, 
            avatar_url,
            contact_number,
            location,
            years_experience
        } = req.body;

        if (!employeeId) {
            return res.status(400).json({
                success: false,
                error: 'employeeId is required'
            });
        }

        const updateData = {
            updated_at: new Date().toISOString()
        };

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

        if (error) {
            console.error('Supabase update error:', error);
            throw error;
        }

        res.json({
            success: true,
            data: data,
            message: 'Profile updated successfully'
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Get employee skills
 * GET /api/employee/skills
 */
exports.getSkills = async (req, res) => {
    try {
        const { employeeId } = req.query;

        if (!employeeId) {
            return res.status(400).json({
                success: false,
                error: 'employeeId is required'
            });
        }

        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('employee_id', employeeId)
            .single();

        if (profileError) {
            console.error('Profile fetch error:', profileError);
            return res.json({
                success: true,
                data: []
            });
        }

        const { data, error } = await supabase
            .from('employee_skills')
            .select(`
                id,
                skill_id,
                skills (
                    id,
                    skill_name,
                    created_at
                )
            `)
            .eq('profile_id', profileData.id);

        if (error) {
            console.error('Skills fetch error:', error);
            throw error;
        }

        const skills = data
            .map(item => item.skills)
            .filter(skill => skill !== null);

        res.json({
            success: true,
            data: skills
        });

    } catch (error) {
        console.error('Get skills error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Get processing stats
 * GET /api/employee/stats
 */
exports.getStats = async (req, res) => {
    try {
        const stats = await pythonService.getStats();
        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Process OCR only
 * POST /api/employee/process-ocr
 */
exports.processOCR = async (req, res) => {
    try {
        const { employeeId, documentType } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ 
                success: false, 
                error: 'No file uploaded' 
            });
        }

        const uploadPath = path.join(__dirname, '../../shared-data/uploads', file.originalname);
        fs.writeFileSync(uploadPath, file.buffer);

        const result = await pythonService.processOCR(uploadPath, employeeId, documentType);

        try {
            fs.unlinkSync(uploadPath);
        } catch (e) {
            console.warn('Could not delete temp file:', e);
        }

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('OCR processing error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

/**
 * Process NLP only
 * POST /api/employee/process-nlp
 */
exports.processNLP = async (req, res) => {
    try {
        const { text, employeeId } = req.body;

        if (!text) {
            return res.status(400).json({ 
                success: false, 
                error: 'Text is required' 
            });
        }

        const result = await pythonService.processNLP(text, employeeId);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('NLP processing error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

/**
 * Validate accuracy
 * POST /api/employee/validate-accuracy
 */
exports.validateAccuracy = async (req, res) => {
    try {
        const { groundTruth, ocrOutput } = req.body;

        if (!groundTruth || !ocrOutput) {
            return res.status(400).json({ 
                success: false, 
                error: 'Ground truth and OCR output required' 
            });
        }

        const result = await pythonService.validateAccuracy(groundTruth, ocrOutput);

        res.json({
            success: true,
            metrics: result.metrics
        });

    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};