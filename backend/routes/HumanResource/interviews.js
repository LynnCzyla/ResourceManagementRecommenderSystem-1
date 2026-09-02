// backend/routes/HumanResource/interviews.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');
const { sendInterviewEmail } = require('../../utils/mailer');

// Helper to check if user has HR or Admin role
const hasHrOrAdminRole = (user) => {
  const role = user?.role;
  const isSuperAdmin = user?.is_super_admin || false;
  
  if (isSuperAdmin) return true;
  if (role === 'Human Resources') return true;
  if (role === 'Admin') return true;
  return false;
};

// Transform interview data helper
const transformInterview = (item) => {
  if (!item) return null;
  return {
    ...item,
    applicant_name: item.job_applications ? 
      `${item.job_applications.first_name || ''} ${item.job_applications.last_name || ''}`.trim() : 
      'Unknown',
    applicant_email: item.job_applications?.email || 'N/A',
    applicant_phone: item.job_applications?.phone || 'N/A',
    position: item.job_applications?.position_applied || 'N/A',
    department: item.job_applications?.department || 'N/A',
    branch_id: item.job_applications?.branch_id || null,
    branch_name: item.job_applications?.branches?.name || 'N/A',
    created_by_name: item.profiles ? 
      `${item.profiles.first_name || ''} ${item.profiles.last_name || ''}`.trim() : 
      'Unknown'
  };
};

// GET /api/hr/interviews — list all interviews with branch filtering
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    console.log(`📋 Fetching interviews for: ${userId}`);
    console.log(`👤 Role: ${userRole}`);
    console.log(`🏢 User Branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);

    // Check if user has permission
    if (!hasHrOrAdminRole(req.user)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Human Resources, Admin, or Super Admin role required.'
      });
    }

    // ✅ Build query with joins
    let query = supabase
      .from('interviews')
      .select(`
        *,
        job_applications!inner (
          id,
          first_name,
          last_name,
          email,
          phone,
          position_applied,
          department,
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
      `)
      .order('interview_date', { ascending: false });

    // ✅ Filter by branch for non-super admins using the inner join
    if (!isSuperAdmin && userBranchId) {
      query = query.eq('job_applications.branch_id', userBranchId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      console.error('❌ Error fetching interviews:', error);
      throw error;
    }

    // Transform data
    const transformedData = (data || []).map(transformInterview);
    console.log(`✅ Found ${transformedData.length} interviews`);

    res.status(200).json({ success: true, data: transformedData || [] });
  } catch (error) {
    console.error('Error fetching interviews:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch interviews.' });
  }
});

// GET /api/hr/interviews/:id — Get single interview with branch check
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;

    if (!hasHrOrAdminRole(req.user)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Human Resources, Admin, or Super Admin role required.'
      });
    }

    const { data, error } = await supabase
      .from('interviews')
      .select(`
        *,
        job_applications (
          id,
          first_name,
          last_name,
          email,
          phone,
          position_applied,
          department,
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
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Interview not found.' });

    // Check branch access
    if (!isSuperAdmin) {
      const interviewBranchId = data.job_applications?.branch_id;
      if (!interviewBranchId || interviewBranchId !== userBranchId) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to view this interview'
        });
      }
    }

    const transformedData = transformInterview(data);
    res.status(200).json({ success: true, data: transformedData });
  } catch (error) {
    console.error('Error fetching interview:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch interview.' });
  }
});

// POST /api/hr/interviews — Create interview with branch check
router.post('/', async (req, res) => {
  try {
    const {
      application_id,
      interview_date,
      interview_time,
      interviewer,
      interview_type,
      location,
      notes,
    } = req.body;

    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userId = req.user?.id;

    console.log(`📋 Creating interview for application: ${application_id}`);
    console.log(`👤 User Branch: ${userBranchId}`);

    if (!hasHrOrAdminRole(req.user)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Human Resources, Admin, or Super Admin role required.'
      });
    }

    if (!application_id || !interview_date || !interview_time || !interviewer || !location) {
      return res.status(400).json({
        success: false,
        error: 'application_id, interview_date, interview_time, interviewer, and location are required.',
      });
    }

    // Look up the application to verify branch access
    const { data: application, error: appError } = await supabase
      .from('job_applications')
      .select('*, branches:branch_id (id, name, location)')
      .eq('id', application_id)
      .single();

    if (appError) throw appError;
    if (!application) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    console.log(`📋 Application branch_id: ${application.branch_id}`);

    // Check branch access
    if (!isSuperAdmin) {
      const appBranchId = application.branch_id;
      if (!appBranchId || appBranchId !== userBranchId) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to schedule interviews for this application'
        });
      }
    }

    const { data: interview, error: interviewError } = await supabase
      .from('interviews')
      .insert({
        application_id,
        interview_date,
        interview_time,
        interviewer,
        interview_type: interview_type || 'Initial Screening',
        location,
        notes: notes || null,
        created_by: userId || null,
      })
      .select()
      .single();

    if (interviewError) throw interviewError;

    // Update application status
    const { error: statusError } = await supabase
      .from('job_applications')
      .update({ 
        status: 'Interview Scheduled',
        notes: notes || application.notes
      })
      .eq('id', application_id);

    if (statusError) throw statusError;

    // Send invitation email
    try {
      await sendInterviewEmail({
        to: application.email,
        applicantName: `${application.first_name} ${application.last_name}`.trim(),
        position: application.position_applied,
        date: interview_date,
        time: interview_time,
        interviewer,
        interviewType: interview_type || 'Initial Screening',
        location,
        notes,
      });
    } catch (emailErr) {
      console.error('Failed to send interview invitation email:', emailErr);
      await logAuditEvent({
        req,
        action: 'Created',
        systemCategory: 'HR - Interviews',
        logDescription: `Interview ${interview.id} scheduled for application ${application_id}, but invitation email failed to send`,
      });
      return res.status(201).json({
        success: true,
        data: interview,
        emailSent: false,
        warning: 'Interview scheduled, but the invitation email failed to send.',
      });
    }

    await logAuditEvent({
      req,
      action: 'Created',
      systemCategory: 'HR - Interviews',
      logDescription: `Interview scheduled for application ${application_id} on ${interview_date} ${interview_time}, invitation emailed to ${application.email}`,
    });

    res.status(201).json({ success: true, data: interview, emailSent: true });
  } catch (error) {
    console.error('Error scheduling interview:', error);
    res.status(500).json({ success: false, error: 'Failed to schedule interview.' });
  }
});

// PUT /api/hr/interviews/:id/status — mark Completed / Hired / Rejected / Cancelled with branch check
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userId = req.user?.id;

    console.log(`📋 Updating interview ${id} status to: ${status}`);

    if (!hasHrOrAdminRole(req.user)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Human Resources, Admin, or Super Admin role required.'
      });
    }

    const validStatuses = ['Scheduled', 'Completed', 'Hired', 'Rejected', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value.' });
    }

    // Get interview with application info for branch check
    const { data: interviewData, error: fetchError } = await supabase
      .from('interviews')
      .select(`
        *,
        job_applications (
          id,
          first_name,
          last_name,
          email,
          phone,
          position_applied,
          department,
          branch_id
        )
      `)
      .eq('id', id)
      .single();

    if (fetchError || !interviewData) {
      return res.status(404).json({ success: false, error: 'Interview not found.' });
    }

    // Check branch access
    if (!isSuperAdmin) {
      const interviewBranchId = interviewData.job_applications?.branch_id;
      if (!interviewBranchId || interviewBranchId !== userBranchId) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to update this interview'
        });
      }
    }

    // Update interview status
    const { data, error } = await supabase
      .from('interviews')
      .update({ 
        status, 
        notes: notes || interviewData.notes 
      })
      .eq('id', id)
      .select(`
        *,
        job_applications (
          id,
          first_name,
          last_name,
          email,
          phone,
          position_applied,
          department,
          branch_id
        )
      `)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Interview not found.' });

    // Handle status changes
    if (status === 'Hired') {
      // Update application status
      if (data.application_id) {
        await supabase
          .from('job_applications')
          .update({ 
            status: 'Hired',
            reviewed_by: userId
          })
          .eq('id', data.application_id);
      }

      // Check if employee is already in hired_employees
      const app = data.job_applications || {};
      const { data: existingHire } = await supabase
        .from('hired_employees')
        .select('id')
        .eq('interview_id', id)
        .maybeSingle();

      if (!existingHire) {
        const fullName = `${app.first_name || ''} ${app.last_name || ''}`.trim() || 'Hired Candidate';
        await supabase
          .from('hired_employees')
          .insert({
            application_id: data.application_id || null,
            interview_id: data.id,
            name: fullName,
            email: app.email || '',
            phone: app.phone || null,
            position_id: null,
            department_id: null,
            hire_date: new Date().toISOString().slice(0, 10),
            status: 'Onboarding',
          });
        console.log(`✅ Created hired_employee record for ${fullName}`);
      }
    } else if (status === 'Rejected') {
      // Update application status
      if (data.application_id) {
        await supabase
          .from('job_applications')
          .update({ 
            status: 'Rejected',
            notes: notes || null,
            reviewed_by: userId
          })
          .eq('id', data.application_id);
      }

      // Send rejection email
      const app = data.job_applications || {};
      if (app.email) {
        const { sendRejectionEmail } = require('../../utils/mailer');
        try {
          await sendRejectionEmail({
            to: app.email,
            applicantName: `${app.first_name || ''} ${app.last_name || ''}`.trim(),
            position: app.position_applied || 'the position',
            reason: notes
          });
        } catch (mailErr) {
          console.error('Failed to send interview rejection email:', mailErr);
        }
      }
    } else if (status === 'Completed') {
      // Just update application notes
      if (data.application_id) {
        await supabase
          .from('job_applications')
          .update({ 
            notes: notes || null,
            reviewed_by: userId
          })
          .eq('id', data.application_id);
      }
    }

    await logAuditEvent({
      req,
      action: 'Updated',
      systemCategory: 'HR - Interviews',
      logDescription: `Set interview ${id} status to ${status}`,
    });

    console.log(`✅ Interview ${id} updated to ${status}`);

    res.status(200).json({ success: true, message: 'Interview status updated.', data });
  } catch (error) {
    console.error('Error updating interview status:', error);
    res.status(500).json({ success: false, error: 'Failed to update interview status.' });
  }
});

module.exports = router;