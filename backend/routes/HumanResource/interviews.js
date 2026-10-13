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

// Helper to convert time strings (e.g. "09:00", "09:00 AM", "14:30", "2:30 PM") to total minutes from midnight
const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const str = String(timeStr).trim().toUpperCase();
  const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const modifier = match[3];
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  return null;
};

// Check if two times conflict (within 30 minutes window or exact string match)
const areTimesConflicting = (time1, time2, bufferMinutes = 30) => {
  if (!time1 || !time2) return false;
  const m1 = parseTimeToMinutes(time1);
  const m2 = parseTimeToMinutes(time2);
  if (m1 === null || m2 === null) {
    return String(time1).trim().toLowerCase() === String(time2).trim().toLowerCase();
  }
  return Math.abs(m1 - m2) < bufferMinutes;
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

    // ------------------------------------------------------------
    // 🛡️ Time-Slot Collision Check: Block date/time already booked
    // ------------------------------------------------------------
    const { data: existingOnDate, error: collisionCheckError } = await supabase
      .from('interviews')
      .select(`
        id,
        interview_date,
        interview_time,
        interviewer,
        status,
        job_applications (
          id,
          first_name,
          last_name,
          branch_id
        )
      `)
      .eq('interview_date', interview_date)
      .neq('status', 'Cancelled');

    if (!collisionCheckError && existingOnDate && existingOnDate.length > 0) {
      const conflict = existingOnDate.find((item) => {
        const sameBranch = isSuperAdmin || !userBranchId || !item.job_applications?.branch_id || item.job_applications.branch_id === userBranchId;
        if (!sameBranch) return false;
        return areTimesConflicting(item.interview_time, interview_time, 30);
      });

      if (conflict) {
        const conflictName = conflict.job_applications
          ? `${conflict.job_applications.first_name || ''} ${conflict.job_applications.last_name || ''}`.trim()
          : 'another candidate';
        console.warn(`⛔ Time conflict on ${interview_date} at ${interview_time} with #${conflict.id}`);
        return res.status(409).json({
          success: false,
          error: `Time-slot collision: An interview is already scheduled on ${interview_date} at ${conflict.interview_time} (${conflictName}, Interviewer: ${conflict.interviewer || 'N/A'}). Please select a different time or date.`,
          conflictInterviewId: conflict.id,
          conflictTime: conflict.interview_time,
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

// PUT /api/hr/interviews/:id — Reschedule/Update interview details with collision check
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
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

    if (!hasHrOrAdminRole(req.user)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Human Resources, Admin, or Super Admin role required.'
      });
    }

    // Fetch existing interview
    const { data: currentInterview, error: fetchError } = await supabase
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
          branch_id
        )
      `)
      .eq('id', id)
      .single();

    if (fetchError || !currentInterview) {
      return res.status(404).json({ success: false, error: 'Interview not found.' });
    }

    // Branch check
    if (!isSuperAdmin) {
      const interviewBranchId = currentInterview.job_applications?.branch_id;
      if (!interviewBranchId || interviewBranchId !== userBranchId) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to modify this interview'
        });
      }
    }

    const newDate = interview_date || currentInterview.interview_date;
    const newTime = interview_time || currentInterview.interview_time;

    // Check collision if date or time changed
    if (newDate && newTime && (newDate !== currentInterview.interview_date || newTime !== currentInterview.interview_time)) {
      const { data: existingOnDate } = await supabase
        .from('interviews')
        .select(`
          id,
          interview_date,
          interview_time,
          interviewer,
          status,
          job_applications (
            id,
            first_name,
            last_name,
            branch_id
          )
        `)
        .eq('interview_date', newDate)
        .neq('status', 'Cancelled')
        .neq('id', id);

      if (existingOnDate && existingOnDate.length > 0) {
        const conflict = existingOnDate.find((item) => {
          const sameBranch = isSuperAdmin || !userBranchId || !item.job_applications?.branch_id || item.job_applications.branch_id === userBranchId;
          if (!sameBranch) return false;
          return areTimesConflicting(item.interview_time, newTime, 30);
        });

        if (conflict) {
          const applicantName = conflict.job_applications
            ? `${conflict.job_applications.first_name || ''} ${conflict.job_applications.last_name || ''}`.trim()
            : 'another applicant';
          return res.status(409).json({
            success: false,
            error: `Time-slot is already occupied: An interview is already scheduled on ${newDate} at ${conflict.interview_time} (${applicantName}). Please choose a different date or time.`,
            conflictInterviewId: conflict.id,
            conflictTime: conflict.interview_time,
          });
        }
      }
    }

    const updatePayload = {
      interview_date: newDate,
      interview_time: newTime,
      interviewer: interviewer ?? currentInterview.interviewer,
      interview_type: interview_type ?? currentInterview.interview_type,
      location: location ?? currentInterview.location,
      notes: notes ?? currentInterview.notes,
    };

    const { data: updatedInterview, error: updateError } = await supabase
      .from('interviews')
      .update(updatePayload)
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
          last_name
        )
      `)
      .single();

    if (updateError) throw updateError;

    // Send updated invitation if date or time changed and email is available
    const app = currentInterview.job_applications;
    if (app?.email && (newDate !== currentInterview.interview_date || newTime !== currentInterview.interview_time)) {
      try {
        await sendInterviewEmail({
          to: app.email,
          applicantName: `${app.first_name || ''} ${app.last_name || ''}`.trim(),
          position: app.position_applied || 'Position',
          date: newDate,
          time: newTime,
          interviewer: updatePayload.interviewer,
          interviewType: updatePayload.interview_type,
          location: updatePayload.location,
          notes: updatePayload.notes,
        });
      } catch (mailErr) {
        console.error('Failed to send rescheduled email:', mailErr);
      }
    }

    await logAuditEvent({
      req,
      action: 'Updated',
      systemCategory: 'HR - Interviews',
      logDescription: `Rescheduled interview ${id} to ${newDate} at ${newTime}`,
    });

    res.status(200).json({ success: true, message: 'Interview updated successfully.', data: transformInterview(updatedInterview) });
  } catch (error) {
    console.error('Error updating interview:', error);
    res.status(500).json({ success: false, error: 'Failed to update interview.' });
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

    // If hiring, check quota against the job posting
    let targetPosting = null;
    let postingQuantity = 1;
    let currentHiredCount = 0;

    if (status === 'Hired' && interviewData.job_applications?.id) {
      // Find the job_posting_id
      const { data: fullApp } = await supabase
        .from('job_applications')
        .select('id, job_posting_id')
        .eq('id', interviewData.job_applications.id)
        .single();

      if (fullApp?.job_posting_id) {
        const { data: posting } = await supabase
          .from('job_postings')
          .select('id, title, status, description, source_request_id, hr_resource_requests:source_request_id ( id, quantity_needed )')
          .eq('id', fullApp.job_posting_id)
          .single();

        if (posting) {
          targetPosting = posting;
          if (posting.source_request_id && posting.hr_resource_requests?.quantity_needed) {
            postingQuantity = Number(posting.hr_resource_requests.quantity_needed) || 1;
          }
          const match = (posting.description || '').match(/\[VACANCY:\s*(\d+)\]/i);
          if (match) {
            postingQuantity = parseInt(match[1], 10) || postingQuantity;
          }

          const { count: alreadyHiredCount } = await supabase
            .from('job_applications')
            .select('id', { count: 'exact', head: true })
            .eq('job_posting_id', posting.id)
            .eq('status', 'Hired');

          currentHiredCount = alreadyHiredCount || 0;

          if (currentHiredCount >= postingQuantity) {
            return res.status(400).json({
              success: false,
              error: `Hiring quota reached! This job posting ("${posting.title}") only needs ${postingQuantity} resource(s) and is already 100% filled (${currentHiredCount}/${postingQuantity}).`
            });
          }
        }
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

      // Auto-close job posting if quota reached
      if (targetPosting && (currentHiredCount + 1 >= postingQuantity)) {
        await supabase
          .from('job_postings')
          .update({ status: 'Closed' })
          .eq('id', targetPosting.id);
        console.log(`🔒 Job posting "${targetPosting.title}" auto-Closed as hiring quota reached (${currentHiredCount + 1}/${postingQuantity})`);
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