// backend/routes/HumanResource/applications.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');

// GET /api/hr/applications — list all applications (filtered by branch)
router.get('/', async (req, res) => {
  try {
    const { status, job_posting_id } = req.query;
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    console.log(`📋 Fetching applications for HR: ${userId}`);
    console.log(`👤 Role: ${userRole}`);
    console.log(`🏢 Branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);

    // ✅ Check if user has HR role (optional - depends on your setup)
    if (userRole !== 'Human Resources' && !isSuperAdmin && userRole !== 'Admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Human Resources role required.'
      });
    }

    // ✅ For Super Admin: Get all applications
    if (isSuperAdmin) {
      let query = supabase
        .from('job_applications')
        .select(`
          *,
          job_postings (
            id, 
            title, 
            department_id,
            departments:department_id (
              id,
              department_name,
              branch_id,
              branches:branch_id (
                id,
                name,
                location
              )
            ),
            profiles:created_by (
              id,
              first_name,
              last_name,
              branch_id
            )
          )
        `)
        .order('applied_date', { ascending: false });

      if (status) query = query.eq('status', status);
      if (job_posting_id) query = query.eq('job_posting_id', job_posting_id);

      const { data, error } = await query;
      if (error) throw error;

      // Transform data
      const transformedData = (data || []).map(item => ({
        ...item,
        department_name: item.job_postings?.departments?.department_name || item.department || 'N/A',
        branch_name: item.job_postings?.departments?.branches?.name || 'N/A',
        branch_id: item.branch_id || item.job_postings?.departments?.branch_id || null,
        job_title: item.job_postings?.title || 'N/A',
        posted_by: item.job_postings?.profiles ? 
          `${item.job_postings.profiles.first_name || ''} ${item.job_postings.profiles.last_name || ''}`.trim() : 
          'Unknown'
      }));

      return res.status(200).json({ success: true, data: transformedData || [] });
    }

    // ✅ For non-super admins: Filter by branch
    if (!userBranchId) {
      return res.status(403).json({
        success: false,
        error: 'Your account is not assigned to a branch'
      });
    }

    // Filter by branch_id
    let query = supabase
      .from('job_applications')
      .select(`
        *,
        job_postings (
          id, 
          title, 
          department_id,
          departments:department_id (
            id,
            department_name,
            branch_id,
            branches:branch_id (
              id,
              name,
              location
            )
          ),
          profiles:created_by (
            id,
            first_name,
            last_name,
            branch_id
          )
        )
      `)
      .eq('branch_id', userBranchId)
      .order('applied_date', { ascending: false });

    if (status) query = query.eq('status', status);
    if (job_posting_id) query = query.eq('job_posting_id', job_posting_id);

    const { data, error } = await query;
    if (error) throw error;

    // Transform data
    const transformedData = (data || []).map(item => ({
      ...item,
      department_name: item.job_postings?.departments?.department_name || item.department || 'N/A',
      branch_name: item.job_postings?.departments?.branches?.name || 'N/A',
      branch_id: item.branch_id || item.job_postings?.departments?.branch_id || null,
      job_title: item.job_postings?.title || 'N/A',
      posted_by: item.job_postings?.profiles ? 
        `${item.job_postings.profiles.first_name || ''} ${item.job_postings.profiles.last_name || ''}`.trim() : 
        'Unknown'
    }));

    console.log(`✅ Found ${transformedData?.length || 0} applications in branch`);

    res.status(200).json({ success: true, data: transformedData || [] });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch applications.' });
  }
});

// GET /api/hr/applications/:id — Get single application (with branch check)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userRole = req.user?.role;

    const { data, error } = await supabase
      .from('job_applications')
      .select(`
        *,
        job_postings (
          id, 
          title, 
          department_id,
          departments:department_id (
            id,
            department_name,
            branch_id,
            branches:branch_id (
              id,
              name,
              location
            )
          ),
          profiles:created_by (
            id,
            first_name,
            last_name,
            branch_id
          )
        ),
        interviews (
          id,
          interview_date,
          interview_time,
          interviewer,
          interview_type,
          location,
          status,
          notes,
          created_at,
          created_by,
          profiles:created_by (
            id,
            first_name,
            last_name
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Application not found.' });

    // ✅ Check if user has access to this application
    if (!isSuperAdmin) {
      const applicationBranchId = data.branch_id || data.job_postings?.departments?.branch_id;
      if (!applicationBranchId || applicationBranchId !== userBranchId) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to view this application'
        });
      }
    }

    // Transform data
    const transformedData = {
      ...data,
      department_name: data.job_postings?.departments?.department_name || data.department || 'N/A',
      branch_name: data.job_postings?.departments?.branches?.name || 'N/A',
      branch_id: data.branch_id || data.job_postings?.departments?.branch_id || null,
      job_title: data.job_postings?.title || 'N/A',
      posted_by: data.job_postings?.profiles ? 
        `${data.job_postings.profiles.first_name || ''} ${data.job_postings.profiles.last_name || ''}`.trim() : 
        'Unknown'
    };

    res.status(200).json({ success: true, data: transformedData });
  } catch (error) {
    console.error('Error fetching application:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch application.' });
  }
});

// POST /api/hr/applications — submit a new application (with branch_id)
router.post('/', async (req, res) => {
  try {
    const {
      job_posting_id, applicant_user_id, first_name, middle_name, last_name,
      email, phone, position_applied, department, experience, education,
      skills, cover_letter, resume_path, location,
    } = req.body;

    const userId = req.user?.id;
    const userBranchId = req.user?.branch_id;
    const userRole = req.user?.role;

    console.log(`📋 Creating application for: ${first_name} ${last_name}`);
    console.log(`🏢 Branch: ${userBranchId}`);

    if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || !position_applied?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'First name, last name, email, and position are required.',
      });
    }

    // ✅ Check if user belongs to a branch (for HR users)
    if (userRole === 'Human Resources' && !userBranchId) {
      return res.status(403).json({
        success: false,
        error: 'Your account is not assigned to a branch'
      });
    }

    const { data, error } = await supabase
      .from('job_applications')
      .insert({
        job_posting_id: job_posting_id || null,
        applicant_user_id: applicant_user_id || null,
        first_name: first_name.trim(),
        middle_name: middle_name?.trim() || null,
        last_name: last_name.trim(),
        email: email.trim(),
        phone: phone?.trim() || null,
        position_applied: position_applied.trim(),
        department: department?.trim() || null,
        experience: experience?.trim() || null,
        education: education?.trim() || null,
        skills: skills?.trim() || null,
        cover_letter: cover_letter?.trim() || null,
        location: location?.trim() || null,
        resume_path: resume_path || null,
        status: 'Pending',
        created_by: userId || null,
        branch_id: userBranchId || null,  // ✅ Set branch_id
      })
      .select()
      .single();

    if (error) throw error;

    await logAuditEvent({
      req,
      action: 'Created',
      systemCategory: 'HR - Applications',
      logDescription: `New application from ${first_name.trim()} ${last_name.trim()} for ${position_applied.trim()}`,
    });

    res.status(201).json({ success: true, message: 'Application submitted successfully.', data });
  } catch (error) {
    console.error('Error creating application:', error);
    res.status(500).json({ success: false, error: 'Failed to submit application.' });
  }
});

// PUT /api/hr/applications/:id/status — update review status (with branch check)
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userRole = req.user?.role;

    console.log(`📋 Updating application ${id} status to: ${status}`);

    const validStatuses = ['Pending', 'Under Review', 'Recommended', 'Interview Scheduled', 'Hired', 'Rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value.' });
    }

    // ✅ Check if user has access to this application
    const { data: existing, error: findError } = await supabase
      .from('job_applications')
      .select('branch_id, email, first_name, last_name, position_applied')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    if (!isSuperAdmin) {
      if (!existing.branch_id || existing.branch_id !== userBranchId) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to update this application'
        });
      }
    }

    // ✅ Prepare update data - ONLY use columns that exist
    const updateData = {
      status: status,
      notes: notes ?? existing.notes,
      reviewed_by: req.user?.id || null
    };

    // ✅ DO NOT include updated_at - it doesn't exist in your table

    console.log('📝 Updating with data:', updateData);

    const { data, error } = await supabase
      .from('job_applications')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating application:', error);
      throw error;
    }

    if (!data) return res.status(404).json({ success: false, error: 'Application not found.' });

    if (status === 'Rejected' && existing.email) {
      const { sendRejectionEmail } = require('../../utils/mailer');
      try {
        await sendRejectionEmail({
          to: existing.email,
          applicantName: `${existing.first_name || ''} ${existing.last_name || ''}`.trim(),
          position: existing.position_applied || 'the position',
          reason: notes
        });
      } catch (mailErr) {
        console.error('Failed to send rejection email:', mailErr);
      }
    }

    await logAuditEvent({
      req,
      action: 'Updated',
      systemCategory: 'HR - Applications',
      logDescription: `Set application ${id} status to ${status}`,
    });

    console.log(`✅ Application ${id} updated to ${status}`);

    res.status(200).json({ success: true, message: 'Application status updated.', data });
  } catch (error) {
    console.error('Error updating application status:', error);
    res.status(500).json({ success: false, error: 'Failed to update application status.' });
  }
});

// DELETE /api/hr/applications/:id — with branch check
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;

    // ✅ Check if user has access to delete this application
    const { data: existing, error: findError } = await supabase
      .from('job_applications')
      .select('branch_id')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    if (!isSuperAdmin) {
      if (!existing.branch_id || existing.branch_id !== userBranchId) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to delete this application'
        });
      }
    }

    const { error } = await supabase.from('job_applications').delete().eq('id', id);
    if (error) throw error;

    await logAuditEvent({
      req,
      action: 'Deleted',
      systemCategory: 'HR - Applications',
      logDescription: `Deleted application ${id}`,
    });

    res.status(200).json({ success: true, message: 'Application deleted successfully.' });
  } catch (error) {
    console.error('Error deleting application:', error);
    res.status(500).json({ success: false, error: 'Failed to delete application.' });
  }
});

module.exports = router;