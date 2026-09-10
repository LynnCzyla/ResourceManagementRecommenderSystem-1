// backend/routes/Applicant/applicantRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const supabase = require('../../supabase');

// ------------------------------------------------------------
// Helper: Get system settings
// ------------------------------------------------------------
async function getSystemSettings() {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('max_file_upload_size')
      .order('id', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.warn('⚠️ Could not fetch system settings, using default 5MB:', error.message);
      return { max_file_upload_size: 5 };
    }

    return data || { max_file_upload_size: 5 };
  } catch (err) {
    console.warn('⚠️ Error fetching system settings, using default 5MB:', err.message);
    return { max_file_upload_size: 5 };
  }
}

// ------------------------------------------------------------
// Multer storage configuration with dynamic file size
// ------------------------------------------------------------
const storage = multer.memoryStorage();

// We'll create the multer instance dynamically in the route
// since we need to get settings from the database first

// ------------------------------------------------------------
// GET /api/applicant/job-postings
// Public list of Active job postings
// ------------------------------------------------------------
router.get('/job-postings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('job_postings')
      .select(`
        *,
        departments:department_id (
          id,
          department_name
        ),
        positions:position_id (
          id,
          position_name
        ),
        hr_resource_requests:source_request_id (
          id,
          quantity_needed
        ),
        job_applications (
          id,
          status
        ),
        profiles!created_by (
          id,
          first_name,
          last_name,
          branch_id,
          branches:branch_id (
            id,
            name,
            location
          )
        )
      `)
      .eq('status', 'Active')
      .order('posted_date', { ascending: false });

    if (error) throw error;

    const transformedData = await Promise.all((data || []).map(async (item) => {
      let quantity = 1;
      if (item.source_request_id && item.hr_resource_requests?.quantity_needed) {
        quantity = Number(item.hr_resource_requests.quantity_needed) || 1;
      }
      let desc = item.description || '';
      const match = desc.match(/\[VACANCY:\s*(\d+)\]/i) || (item.requirements || '').match(/\[VACANCY:\s*(\d+)\]/i);
      if (match) {
        quantity = parseInt(match[1], 10) || quantity;
      }
      const cleanDescription = desc.replace(/\[VACANCY:\s*\d+\]/gi, '').trim();

      const hiredCount = (item.job_applications || []).filter(a => a.status === 'Hired').length;
      const isFilled = hiredCount >= quantity;

      // Auto-close in database if 100% quota is reached
      if (isFilled && item.status === 'Active') {
        await supabase.from('job_postings').update({ status: 'Closed' }).eq('id', item.id);
      }

      return {
        ...item,
        description: cleanDescription,
        quantity,
        hired_count: hiredCount,
        is_filled: isFilled,
        created_by_name: item.profiles ? `${item.profiles.first_name || ''} ${item.profiles.last_name || ''}`.trim() : 'Unknown',
        branch_id: item.profiles?.branch_id || null,
        branch_name: item.profiles?.branches?.name || 'N/A',
        branch_location: item.profiles?.branches?.location || 'N/A',
        department_name: item.departments?.department_name || 'N/A',
        position_name: item.positions?.position_name || 'N/A'
      };
    }));

    // ✅ Exclude postings that are already 100% filled (1/1, etc.) or Closed
    const availablePostings = transformedData.filter(p => !p.is_filled && p.status === 'Active');

    res.json({ success: true, data: availablePostings });
  } catch (err) {
    console.error('Error fetching job postings:', err);
    res.status(500).json({ success: false, error: 'Failed to load job postings' });
  }
});

// ------------------------------------------------------------
// GET /api/applicant/branches
// Public list of Active branches for job filtering
// ------------------------------------------------------------
router.get('/branches', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, location, status')
      .order('name', { ascending: true });

    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('Error fetching public branches:', err);
    res.status(500).json({ success: false, error: 'Failed to load branches' });
  }
});

// ------------------------------------------------------------
// GET /api/applicant/job-postings/:id
// Single posting detail
// ------------------------------------------------------------
router.get('/job-postings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('job_postings')
      .select(`
        *,
        departments:department_id (
          id,
          department_name
        ),
        positions:position_id (
          id,
          position_name
        ),
        hr_resource_requests:source_request_id (
          id,
          quantity_needed
        ),
        profiles!created_by (
          id,
          first_name,
          last_name,
          branch_id,
          branches:branch_id (
            id,
            name,
            location
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Job posting not found' });

    let quantity = 1;
    if (data.source_request_id && data.hr_resource_requests?.quantity_needed) {
      quantity = Number(data.hr_resource_requests.quantity_needed) || 1;
    }
    let desc = data.description || '';
    const match = desc.match(/\[VACANCY:\s*(\d+)\]/i) || (data.requirements || '').match(/\[VACANCY:\s*(\d+)\]/i);
    if (match) {
      quantity = parseInt(match[1], 10) || quantity;
    }
    const cleanDescription = desc.replace(/\[VACANCY:\s*\d+\]/gi, '').trim();

    const transformedData = {
      ...data,
      description: cleanDescription,
      quantity,
      created_by_name: data.profiles ? `${data.profiles.first_name || ''} ${data.profiles.last_name || ''}`.trim() : 'Unknown',
      branch_id: data.profiles?.branch_id || null,
      branch_name: data.profiles?.branches?.name || 'N/A',
      branch_location: data.profiles?.branches?.location || 'N/A',
      department_name: data.departments?.department_name || 'N/A',
      position_name: data.positions?.position_name || 'N/A'
    };

    res.json({ success: true, data: transformedData });
  } catch (err) {
    console.error('Error fetching job posting:', err);
    res.status(500).json({ success: false, error: 'Failed to load job posting' });
  }
});

// ------------------------------------------------------------
// POST /api/applicant/applications
// Submit a new application - WITH DYNAMIC FILE SIZE
// ------------------------------------------------------------
router.post('/applications', async (req, res, next) => {
  try {
    // ✅ Get system settings for file size limit
    const settings = await getSystemSettings();
    const maxFileSizeMB = settings.max_file_upload_size || 5;
    const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;

    console.log(`📋 File upload limit: ${maxFileSizeMB}MB`);

    // ✅ Create multer instance with dynamic file size
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: maxFileSizeBytes },
      fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.pdf') {
          cb(null, true);
        } else {
          cb(new Error('Only PDF files are allowed'));
        }
      },
    });

    // ✅ Use the dynamic multer instance
    upload.single('resume')(req, res, async (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: `File size exceeds the ${maxFileSizeMB}MB limit. Please upload a smaller file.`
          });
        }
        if (err.message === 'Only PDF files are allowed') {
          return res.status(400).json({
            success: false,
            error: 'Only PDF files are accepted.'
          });
        }
        console.error('Multer error:', err);
        return res.status(500).json({
          success: false,
          error: 'File upload failed: ' + err.message
        });
      }

      // ✅ Process the application
      await processApplication(req, res);
    });
  } catch (err) {
    console.error('Error in application upload:', err);
    res.status(500).json({ success: false, error: 'Failed to process application' });
  }
});

// ------------------------------------------------------------
// Helper: Process application after file upload
// ------------------------------------------------------------
async function processApplication(req, res) {
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
      location,
    } = req.body;

    if (!first_name || !last_name || !email || !position_applied) {
      return res.status(400).json({
        success: false,
        error: 'First name, last name, email, and position are required.',
      });
    }

    // ✅ FETCH BRANCH_ID FROM JOB POSTING
    let branch_id = null;
    let jobPostingTitle = null;
    let jobPostingDepartment = null;
    let created_by = null;

    if (job_posting_id) {
      console.log(`🔍 Fetching job posting ${job_posting_id} for branch info...`);
      
      const { data: jobPosting, error: jobError } = await supabase
        .from('job_postings')
        .select(`
          id, 
          title, 
          status,
          department_id,
          created_by,
          description,
          source_request_id,
          hr_resource_requests:source_request_id (
            quantity_needed
          ),
          departments:department_id (
            department_name
          )
        `)
        .eq('id', job_posting_id)
        .single();

      if (jobError) {
        console.error('❌ Error fetching job posting:', jobError);
      } else if (jobPosting) {
        if (jobPosting.status === 'Closed') {
          return res.status(400).json({
            success: false,
            error: 'This job posting is already closed and no longer accepting applications.'
          });
        }
        console.log(`📋 Found job posting: ${jobPosting.title}`);
        created_by = jobPosting.created_by;
        jobPostingTitle = jobPosting.title;
        jobPostingDepartment = jobPosting.departments?.department_name || null;
        
        if (created_by) {
          console.log(`🔍 Fetching profile for created_by: ${created_by}`);
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('branch_id, first_name, last_name, role')
            .eq('id', created_by)
            .single();
          
          if (profileError) {
            console.error('❌ Error fetching profile:', profileError);
          } else if (profile) {
            branch_id = profile.branch_id;
            console.log(`✅ Found branch_id: ${branch_id} for user ${profile.first_name} ${profile.last_name}`);
          }
        }
      }
    }

    if (!branch_id && department) {
      console.log(`🔍 Looking for branch via department: ${department}`);
      const { data: deptData, error: deptError } = await supabase
        .from('departments')
        .select('branch_id')
        .eq('department_name', department)
        .single();
      
      if (!deptError && deptData) {
        branch_id = deptData.branch_id;
        console.log(`✅ Found branch_id ${branch_id} from department`);
      }
    }

    if (!branch_id && job_posting_id) {
      console.log(`🔍 Trying to get branch from job posting's department_id...`);
      const { data: jobPosting, error: jobError } = await supabase
        .from('job_postings')
        .select(`
          department_id,
          departments:department_id (
            branch_id
          )
        `)
        .eq('id', job_posting_id)
        .single();
      
      if (!jobError && jobPosting?.departments?.branch_id) {
        branch_id = jobPosting.departments.branch_id;
        console.log(`✅ Found branch_id ${branch_id} from job posting's department`);
      }
    }

    if (!branch_id) {
      console.log('⚠️ No branch_id found, using default WEA-PHIL');
      branch_id = '08ba1bf3-c17a-4927-ad5a-44a87fecd413';
    }

    let resume_path = null;
    if (req.file) {
      const file = req.file;
      const fileExt = path.extname(file.originalname).toLowerCase();
      const uniqueFileName = `resume-${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`;

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

      const { data: urlData } = supabase.storage
        .from('resumes')
        .getPublicUrl(uniqueFileName);

      resume_path = urlData.publicUrl;
    }

    const applicationData = {
      job_posting_id: job_posting_id || null,
      first_name,
      middle_name: middle_name || null,
      last_name,
      email,
      phone: phone || null,
      position_applied,
      department: department || jobPostingDepartment || null,
      experience: experience || null,
      education: education || null,
      skills: skills || null,
      cover_letter: cover_letter || null,
      location: location || null,
      resume_path,
      status: 'Pending',
      branch_id: branch_id,
    };

    console.log('📝 Final application data:', {
      job_posting_id: applicationData.job_posting_id,
      position_applied: applicationData.position_applied,
      email: applicationData.email,
      branch_id: branch_id,
      department: applicationData.department,
      has_resume: !!resume_path
    });

    const { data, error } = await supabase
      .from('job_applications')
      .insert(applicationData)
      .select()
      .single();

    if (error) {
      console.error('❌ Error inserting application:', error);
      throw error;
    }

    console.log(`✅ Application submitted successfully with branch_id: ${branch_id}`);

    // Notify HR team members about new applicant
    try {
      let hrQuery = supabase.from('profiles').select('id').eq('role', 'Human Resources').eq('status', 'Active');
      if (branch_id) {
        hrQuery = hrQuery.eq('branch_id', branch_id);
      }
      const { data: hrUsers } = await hrQuery;
      if (hrUsers && hrUsers.length > 0) {
        const applicantFullName = `${first_name} ${last_name}`.trim();
        const hrNotifs = hrUsers.map(u => ({
          recipient_id: u.id,
          type: 'alert',
          text: `📄 New application received from ${applicantFullName} for position "${position_applied}".`,
          read: false
        }));
        await supabase.from('notifications').insert(hrNotifs);
      }
    } catch (hrNotifErr) {
      console.error('Non-fatal error notifying HR of application:', hrNotifErr);
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('Error creating application:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to submit application' });
  }
}

// ------------------------------------------------------------
// GET /api/applicant/my-applications?email=...
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
        job_postings (
          id, 
          title, 
          department_id, 
          departments:department_id (
            department_name,
            branch_id,
            branches:branch_id (
              id,
              name,
              location
            )
          ),
          profiles!created_by (
            id,
            first_name,
            last_name,
            branch_id,
            branches:branch_id (
              id,
              name,
              location
            )
          )
        )
      `)
      .eq('email', email)
      .order('applied_date', { ascending: false });

    if (error) throw error;

    const transformedData = (data || []).map(item => ({
      ...item,
      branch_id: item.branch_id || item.job_postings?.departments?.branch_id || item.job_postings?.profiles?.branch_id || null,
      branch_name: item.job_postings?.departments?.branches?.name || 
                   item.job_postings?.profiles?.branches?.name || 
                   'N/A',
      posted_by: item.job_postings?.profiles ? 
        `${item.job_postings.profiles.first_name || ''} ${item.job_postings.profiles.last_name || ''}`.trim() : 
        'Unknown',
      department_name: item.job_postings?.departments?.department_name || 'N/A'
    }));

    res.json({ success: true, data: transformedData });
  } catch (err) {
    console.error('Error fetching applications:', err);
    res.status(500).json({ success: false, error: 'Failed to load your applications' });
  }
});

// ------------------------------------------------------------
// GET /api/applicant/system-settings
// Get system settings for file upload limits
// ------------------------------------------------------------
router.get('/system-settings', async (req, res) => {
  try {
    const settings = await getSystemSettings();
    res.json({ 
      success: true, 
      data: {
        max_file_upload_size: settings.max_file_upload_size
      }
    });
  } catch (err) {
    console.error('Error fetching system settings:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load system settings' 
    });
  }
});

// ------------------------------------------------------------
// GET /api/applicant/branches
// Public list of active branches for job filter
// ------------------------------------------------------------
router.get('/branches', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, location')
      .order('name', { ascending: true });

    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('Error fetching public branches:', err);
    res.status(500).json({ success: false, error: 'Failed to load branches' });
  }
});

module.exports = router;