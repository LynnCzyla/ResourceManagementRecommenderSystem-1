//backend\controllers\documentController.js
const pythonService = require('../services/pythonService');
const storageService = require('../services/storageService');
const supabase = require('../supabase');
const path = require('path');
const fs = require('fs');

// Helper: get full profile from token (includes name)
const getProfileFromToken = async (userId) => {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, employee_id, first_name, middle_name, last_name')
        .eq('id', userId)
        .single();
    return { data, error };
};

// Helper: best-effort guess at a person's name in the document, for DISPLAY only
// (e.g. "Found: 'Carlo Reyes'" in a confirmation prompt). Never used for security decisions.
const extractPossibleName = (rawText) => {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 15);

    // Prefer an explicit "Name:" style label, common on certificates/forms
    for (const line of lines) {
        const labelMatch = line.match(/^(?:NAME|FULL NAME|APPLICANT)\s*[:\-]\s*(.+)$/i);
        if (labelMatch && labelMatch[1].trim().length > 1) {
            return labelMatch[1].trim();
        }
    }

    // Otherwise guess: a short line of 2-4 Title Case words (common resume/cert header pattern)
    const namePattern = /^([A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+){1,3})$/;
    for (const line of lines) {
        if (namePattern.test(line) && line.length < 50) {
            return line;
        }
    }

    return null;
};

// Helper: check if document content contains the employee's name
const checkNameInContent = (rawText, firstName, middleName, lastName) => {
    const text = rawText.toUpperCase();
    const first = (firstName || '').toUpperCase().trim();
    const middle = (middleName || '').toUpperCase().trim();
    const last = (lastName || '').toUpperCase().trim();

    // Check combinations — at minimum first + last must appear
    const hasFirst = first && text.includes(first);
    const hasLast = last && text.includes(last);
    const hasMiddle = middle && text.includes(middle);

    // Must have at least first name AND last name in the document
    if (hasFirst && hasLast) return true;

    // Also accept: last name + middle name (some certificates use middle initial)
    if (hasLast && hasMiddle) return true;

    return false;
};

exports.processDocument = async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        const { documentType } = req.body;

        // ✅ STEP 1: Get logged-in employee from token (with full name)
        const { data: profileData, error: profileError } = await getProfileFromToken(req.user.id);
        if (profileError || !profileData) {
            return res.status(403).json({ success: false, error: 'Profile not found for logged-in user' });
        }

        const employeeId = profileData.employee_id;
        const employeeIdUpper = employeeId.toUpperCase();
        const firstName = profileData.first_name || '';
        const middleName = profileData.middle_name || '';
        const lastName = profileData.last_name || '';

        // FormData sends booleans as strings, so check for both
        const confirmMismatch = req.body.confirmMismatch === 'true' || req.body.confirmMismatch === true;

        // ✅ LAYER 1 SECURITY: Check filename for EMP-XXX pattern
        const filename = file.originalname;
        const filenameUpper = filename.toUpperCase();
        const filenameMatch = filenameUpper.match(/^(EMP-\d+)/);

        if (filenameMatch) {
            const fileEmployeeId = filenameMatch[1];
            if (fileEmployeeId !== employeeIdUpper) {
                if (!confirmMismatch) {
                    console.log(`⚠️ Filename ID mismatch — expected "${employeeIdUpper}", filename says "${fileEmployeeId}". Awaiting user confirmation.`);

                    return res.status(409).json({
                        success: false,
                        error: 'DOCUMENT_MISMATCH',
                        requiresConfirmation: true,
                        data: {
                            reason: 'filename_id',
                            expected: employeeIdUpper,
                            found: fileEmployeeId,
                            employeeId
                        },
                        message: `The file name suggests this document belongs to ${fileEmployeeId}, but you're signed in as ${employeeId}. The document doesn't appear to align with your information — are you sure you want to upload it?`
                    });
                }
                console.log(`⚠️ Filename ID mismatch overridden by user (${employeeId}) — proceeding with upload`);
            }
        }

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
        const rawTextUpper = rawText.toUpperCase();

        // ✅ LAYER 2 SECURITY: Check EMP-XXX IDs in document content
        const contentMatches = [...rawTextUpper.matchAll(/EMP-\d+/g)].map(m => m[0]);
        const uniqueIds = [...new Set(contentMatches)];

        console.log(`🔍 Employee IDs found in document: ${uniqueIds.join(', ') || 'none'}`);

        if (uniqueIds.length > 0) {
            const foreignIds = uniqueIds.filter(id => id !== employeeIdUpper);
            if (foreignIds.length > 0) {
                if (!confirmMismatch) {
                    console.log(`⚠️ Content ID mismatch — expected "${employeeIdUpper}", document mentions "${foreignIds.join(', ')}". Awaiting user confirmation.`);

                    return res.status(409).json({
                        success: false,
                        error: 'DOCUMENT_MISMATCH',
                        requiresConfirmation: true,
                        data: {
                            reason: 'content_id',
                            expected: employeeIdUpper,
                            found: foreignIds.join(', '),
                            employeeId
                        },
                        message: `This document mentions ID(s) ${foreignIds.join(', ')}, but you're signed in as ${employeeId}. The document doesn't appear to align with your information — are you sure you want to upload it?`
                    });
                }
                console.log(`⚠️ Content ID mismatch overridden by user (${employeeId}) — proceeding with upload`);
            }
        }

        // ✅ LAYER 3 SECURITY: Check employee name in document content
        // Only applies when no EMP-XXX found (e.g. certificates)
        if (uniqueIds.length === 0 && rawText.length > 50) {
            console.log(`🔍 No EMP-ID found — checking name: ${firstName} ${lastName}`);

            const nameFound = checkNameInContent(rawText, firstName, middleName, lastName);

            if (!nameFound) {
                if (!confirmMismatch) {
                    const foundName = extractPossibleName(rawText);
                    console.log(`⚠️ Name mismatch — expected "${firstName} ${lastName}", best guess "${foundName || 'none'}". Awaiting user confirmation.`);

                    return res.status(409).json({
                        success: false,
                        error: 'DOCUMENT_MISMATCH',
                        requiresConfirmation: true,
                        data: {
                            reason: 'name',
                            expected: `${firstName} ${lastName}`.trim(),
                            found: foundName || null,
                            employeeId
                        },
                        message: foundName
                            ? `This document appears to belong to "${foundName}", but your profile name is "${firstName} ${lastName}". The document doesn't appear to align with your information — are you sure you want to upload it?`
                            : `This document doesn't appear to mention your name (${firstName} ${lastName}). The document doesn't appear to align with your information — are you sure you want to upload it?`
                    });
                }

                console.log(`⚠️ Name mismatch overridden by user (${employeeId}) — proceeding with upload`);
            } else {
                console.log(`✅ Name check passed — "${firstName} ${lastName}" found in document`);
            }
        }

        // ============ NORMALIZE + SEPARATE AUTO-APPROVED VS NEEDS-REVIEW ============
        const normalizeSkill = (skill) => {
            if (typeof skill === 'string') return skill.trim();
            if (typeof skill === 'object' && skill !== null) {
                return (skill.skill_name || skill.skill_tag || skill.skill || String(skill)).trim();
            }
            return String(skill).trim();
        };

        const autoApprovedNormalized = (result.nlp?.auto_approved || []).map(normalizeSkill);
        const needsReviewNormalized = (result.nlp?.needs_review || []).map(normalizeSkill);
        const autoApprovedSet = new Set(autoApprovedNormalized.map(s => s.toLowerCase()));

        let finalNeedsReview = needsReviewNormalized.filter(skill =>
            !autoApprovedSet.has(skill.toLowerCase()) && skill.length > 0
        );

        // ============ CHECK FOR EXISTING DOCUMENT (SAME FILE RESCANNED) ============
        const documentHash = result.ocr?.document_hash || '';
        let existingDoc = null;

        if (documentHash) {
            const { data: foundDoc } = await supabase
                .from('documents')
                .select('id, approved_skills, rejected_skills, file_name')
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
        let previouslyApproved = [];
        let previouslyRejected = [];

        if (existingDoc) {
            documentId = existingDoc.id;
            previouslyApproved = (existingDoc.approved_skills || []).map(normalizeSkill);
            previouslyRejected = (existingDoc.rejected_skills || []).map(normalizeSkill);

            // ============ METHOD 2: FALLBACK - Check feedback_training table directly ============
            // This is the ACTUAL source of truth for what user approved/rejected
            console.log(`🔍 [METHOD 2] FALLBACK - Loading from feedback_training table...`);
            console.log(`   Looking for employee_id: ${employeeId}`);
            
            // Get ALL feedback records (both approved and rejected)
            const { data: feedbackRecords, error: feedbackError } = await supabase
                .from('feedback_training')
                .select('phrase, label')
                .eq('employee_id', employeeId);

            if (feedbackError) {
                console.error(`   ❌ ERROR querying feedback_training:`, feedbackError);
            } else if (feedbackRecords && feedbackRecords.length > 0) {
                // Separate into approved and rejected
                const feedbackApproved = feedbackRecords
                    .filter(r => r.label === 'Skill')
                    .map(r => normalizeSkill(r.phrase));
                
                const feedbackRejected = feedbackRecords
                    .filter(r => r.label === 'Not Skill')
                    .map(r => normalizeSkill(r.phrase));

                previouslyApproved.push(...feedbackApproved);
                previouslyRejected.push(...feedbackRejected);
                
                console.log(`   ✅ From feedback_training: ${feedbackApproved.length} approved, ${feedbackRejected.length} rejected`);
                if (feedbackApproved.length > 0) console.log(`   Approved samples: ${feedbackApproved.slice(0, 3).join(', ')}`);
                if (feedbackRejected.length > 0) console.log(`   Rejected samples: ${feedbackRejected.slice(0, 3).join(', ')}`);
            } else {
                console.log(`   ℹ️  No feedback records found in feedback_training`);
            }

            // Deduplicate
            if (previouslyApproved.length > 0 || previouslyRejected.length > 0) {
                previouslyApproved = [...new Set(previouslyApproved.map(s => s.toLowerCase()))];
                previouslyRejected = [...new Set(previouslyRejected.map(s => s.toLowerCase()))];
                
                console.log(`📊 FINAL REJECTION HISTORY:`);
                console.log(`   ✅ Approved (total unique): ${previouslyApproved.length}`);
                console.log(`   ❌ Rejected (total unique): ${previouslyRejected.length}`);
            }

            const approvedSet = new Set(previouslyApproved.map(s => s.toLowerCase()));
            const rejectedSet = new Set(previouslyRejected.map(s => s.toLowerCase()));

            finalNeedsReview = finalNeedsReview.filter(skill => {
                const skillLower = skill.toLowerCase();
                if (approvedSet.has(skillLower) || rejectedSet.has(skillLower)) {
                    console.log(`   ⏭️  Skipping "${skill}" (already reviewed)`);
                    return false;
                }
                return true;
            });

            console.log(`📊 Rescan: ${previouslyApproved.length} previously approved, ${previouslyRejected.length} previously rejected, ${finalNeedsReview.length} left to review`);
        } else {
            // ✅ Brand new document — FIRST apply rejection filtering ============
            console.log(`🔍 [NEW DOCUMENT] Applying rejection filtering...`);
            
            let previouslyApprovedNew = [];
            let previouslyRejectedNew = [];

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
                        previouslyApprovedNew.push(...doc.approved_skills.map(normalizeSkill));
                    }
                    if (doc.rejected_skills && Array.isArray(doc.rejected_skills)) {
                        previouslyRejectedNew.push(...doc.rejected_skills.map(normalizeSkill));
                    }
                });
                console.log(`   📝 Found ${allPreviousDocs.length} documents`);
                console.log(`   ✅ From documents table: ${previouslyApprovedNew.length} approved, ${previouslyRejectedNew.length} rejected`);
            } else {
                console.log(`   ℹ️  No previous documents found`);
            }

            // ============ METHOD 2: FALLBACK - Check feedback_training table directly ============
            console.log(`🔍 [METHOD 2] FALLBACK - Loading from feedback_training table...`);
            const { data: feedbackRecords, error: feedbackError } = await supabase
                .from('feedback_training')
                .select('phrase, label')
                .eq('employee_id', employeeId);

            if (!feedbackError && feedbackRecords && feedbackRecords.length > 0) {
                const feedbackApproved = feedbackRecords
                    .filter(r => r.label === 'Skill')
                    .map(r => normalizeSkill(r.phrase));
                
                const feedbackRejected = feedbackRecords
                    .filter(r => r.label === 'Not Skill')
                    .map(r => normalizeSkill(r.phrase));

                previouslyApprovedNew.push(...feedbackApproved);
                previouslyRejectedNew.push(...feedbackRejected);
                
                console.log(`   ✅ From feedback_training: ${feedbackApproved.length} approved, ${feedbackRejected.length} rejected`);
                if (feedbackApproved.length > 0) console.log(`   Approved samples: ${feedbackApproved.slice(0, 3).join(', ')}`);
                if (feedbackRejected.length > 0) console.log(`   Rejected samples: ${feedbackRejected.slice(0, 3).join(', ')}`);
            } else {
                console.log(`   ℹ️  No feedback records found in feedback_training`);
            }

            // ============ Deduplicate ============
            if (previouslyApprovedNew.length > 0 || previouslyRejectedNew.length > 0) {
                previouslyApprovedNew = [...new Set(previouslyApprovedNew.map(s => s.toLowerCase()))];
                previouslyRejectedNew = [...new Set(previouslyRejectedNew.map(s => s.toLowerCase()))];
                
                console.log(`📊 FINAL REJECTION HISTORY:`);
                console.log(`   ✅ Approved (total unique): ${previouslyApprovedNew.length}`);
                console.log(`   ❌ Rejected (total unique): ${previouslyRejectedNew.length}`);
            }

            // ============ Filter out rejected, approved, name, and ID ============
            const approvedSetNew = new Set(previouslyApprovedNew.map(s => s.toLowerCase()));
            const rejectedSetNew = new Set(previouslyRejectedNew.map(s => s.toLowerCase()));
            
            // Also create a set of name/ID variations to exclude
            const nameIdExclude = new Set([
                employeeId.toLowerCase(),
                firstName.toLowerCase(),
                lastName.toLowerCase(),
                `${firstName} ${lastName}`.toLowerCase(),
                'emp-009 full name',
                'full name',
                'employee id',
                'name'
            ]);

            finalNeedsReview = finalNeedsReview.filter(skill => {
                const skillLower = skill.toLowerCase();
                
                // Skip if it's the employee ID or name
                if (nameIdExclude.has(skillLower)) {
                    console.log(`   ⏭️  Skipping "${skill}" (employee name/ID)`);
                    return false;
                }
                
                // Skip if already approved
                if (approvedSetNew.has(skillLower)) {
                    console.log(`   ⏭️  Skipping "${skill}" (already approved)`);
                    return false;
                }
                
                // Skip if already rejected
                if (rejectedSetNew.has(skillLower)) {
                    console.log(`   ⏭️  Skipping "${skill}" (already REJECTED) ❌`);
                    return false;
                }
                
                return true;
            });

            console.log(`📊 After filtering: ${finalNeedsReview.length} skills left to review`);

            // ✅ Upload to storage and insert a fresh row
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

        return res.json({
            success: true,
            data: {
                documentId,
                ocr: result.ocr,
                nlp: {
                    skills: result.nlp?.skills || [],
                    categorized_skills: result.nlp?.categorized_skills || [],
                    auto_approved: autoApprovedNormalized,
                    needs_review: finalNeedsReview,
                    prc_license: result.nlp?.prc_license || null,
                    prc_verified: result.nlp?.prc_verified || false
                },
                summary: result.summary,
                feedback_required: finalNeedsReview.length > 0,
                pending_skills: finalNeedsReview
            },
            message: finalNeedsReview.length > 0
                ? `Document processed. Please review ${finalNeedsReview.length} skill(s).`
                : `Document processed. All skills already reviewed or auto-approved!`
        });

    } catch (error) {
        console.error('Document processing error:', error);
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
            .select('*')
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