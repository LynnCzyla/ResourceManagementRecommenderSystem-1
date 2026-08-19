// ============================================================
// Applicant Routes
// Path (assumed): backend/routes/Applicant/applicantRoutes.js
//
// ASSUMPTIONS — please confirm/adjust against your actual project:
// 1. A Supabase client is exported from '../../config/supabaseClient'
//    (mirrors the pattern implied by your Admin/HR routes). If your
//    project initializes it elsewhere (e.g. '../../db/supabase',
//    '../../supabaseClient'), just fix the import path below.
// 2. Your main server file mounts routers like:
//      app.use('/api/hr', hrRoutes);
//      app.use('/api/admin', adminRoutes);
//    so this file should be mounted the same way:
//      const applicantRoutes = require('./routes/Applicant/applicantRoutes');
//      app.use('/api/applicant', applicantRoutes);
// 3. Resume uploads are stored locally on disk under
//    backend/uploads/resumes and the relative path is saved to
//    job_applications.resume_path. If you already have an upload
//    pattern elsewhere (e.g. Supabase Storage), tell me and I'll
//    swap multer's disk storage for a Supabase Storage upload.
// 4. There is no login/auth requirement to browse or apply — if your
//    app requires a signed-in applicant account, tell me and I'll
//    pull applicant_user_id from the authenticated session instead
//    of trusting the client-submitted email for "my applications".
// ============================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const supabase = require('../../supabase');

// ------------------------------------------------------------
// Resume upload storage (Supabase memory storage)
// ------------------------------------------------------------
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

// ------------------------------------------------------------
// GET /api/applicant/job-postings
// Public list of Active job postings, with department/position names
// joined for display.
// ------------------------------------------------------------
router.get('/job-postings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('job_postings')
      .select(`
        *,
        departments ( id, department_name ),
        positions ( id, position_name )
      `)
      .eq('status', 'Active')
      .order('posted_date', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('Error fetching job postings:', err);
    res.status(500).json({ success: false, error: 'Failed to load job postings' });
  }
});

// ------------------------------------------------------------
// GET /api/applicant/job-postings/:id
// Single posting detail (used for the "View Details" modal).
// ------------------------------------------------------------
router.get('/job-postings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('job_postings')
      .select(`
        *,
        departments ( id, department_name ),
        positions ( id, position_name )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Job posting not found' });

    res.json({ success: true, data });
  } catch (err) {
    console.error('Error fetching job posting:', err);
    res.status(500).json({ success: false, error: 'Failed to load job posting' });
  }
});

// ------------------------------------------------------------
// POST /api/applicant/applications
// Submit a new application. Expects multipart/form-data because of
// the resume file. Text fields arrive in req.body, file in req.file.
// ------------------------------------------------------------
router.post('/applications', upload.single('resume'), async (req, res) => {
  try {
    const {
      job_posting_id,
      first_name,
      middle_name,
      last_name,
      email,
      phone,
      position_applied,
      department,
      experience,
      education,
      skills,
      cover_letter,
    } = req.body;

    if (!first_name || !last_name || !email || !position_applied) {
      return res.status(400).json({
        success: false,
        error: 'First name, last name, email, and position are required.',
      });
    }

    let resume_path = null;
    if (req.file) {
      const file = req.file;
      const fileExt = path.extname(file.originalname).toLowerCase();
      const uniqueFileName = `resume-${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`;

      // Automatically check/create the 'resumes' bucket to prevent failure
      try {
        const { data: buckets, error: listError } = await supabase.storage.listBuckets();
        if (!listError) {
          const bucketExists = buckets.find(b => b.name === 'resumes');
          if (!bucketExists) {
            await supabase.storage.createBucket('resumes', { public: true });
          }
        }
      } catch (bucketErr) {
        console.warn('Bucket verification warning:', bucketErr);
      }

      // Upload file buffer to Supabase Storage bucket 'resumes'
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(uniqueFileName, file.buffer, {
          contentType: file.mimetype,
          dupe: false
        });

      if (uploadError) {
        console.error('Supabase Storage upload error:', uploadError);
        return res.status(500).json({
          success: false,
          error: 'Failed to upload resume to storage: ' + uploadError.message
        });
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('resumes')
        .getPublicUrl(uniqueFileName);

      resume_path = urlData.publicUrl;
    }

    const { data, error } = await supabase
      .from('job_applications')
      .insert({
        job_posting_id: job_posting_id || null,
        first_name,
        middle_name: middle_name || null,
        last_name,
        email,
        phone: phone || null,
        position_applied,
        department: department || null,
        experience: experience || null,
        education: education || null,
        skills: skills || null,
        cover_letter: cover_letter || null,
        resume_path,
        status: 'Pending',
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('Error creating application:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to submit application' });
  }
});

// ------------------------------------------------------------
// GET /api/applicant/my-applications?email=...
// Looks up applications by the email the applicant submitted with.
// If your app has real applicant auth, swap this for
// applicant_user_id pulled from the authenticated session instead.
// ------------------------------------------------------------
router.get('/my-applications', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }

    const { data, error } = await supabase
      .from('job_applications')
      .select(`
        *,
        job_postings ( id, title, department_id, departments ( department_name ) )
      `)
      .eq('email', email)
      .order('applied_date', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('Error fetching applications:', err);
    res.status(500).json({ success: false, error: 'Failed to load your applications' });
  }
});

module.exports = router;