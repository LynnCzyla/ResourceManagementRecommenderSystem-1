// backend/routes/HumanResource/interviews.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');
const { sendInterviewEmail } = require('../../utils/mailer');

// GET /api/hr/interviews — list all scheduled interviews, with the
// applicant's name/email/position joined in via job_applications so the
// table doesn't need a second round-trip per row.
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;

    let query = supabase
      .from('interviews')
      .select(`
        *,
        job_applications (
          id,
          first_name,
          last_name,
          email,
          position_applied,
          department
        )
      `)
      .order('interview_date', { ascending: true });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Error fetching interviews:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch interviews.' });
  }
});

// GET /api/hr/interviews/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('interviews')
      .select(`*, job_applications ( id, first_name, last_name, email, position_applied, department )`)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Interview not found.' });

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching interview:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch interview.' });
  }
});

// POST /api/hr/interviews
// Creates the interview row, flips the linked application's status to
// "Interview Scheduled", and sends the invitation email automatically —
// no manual "open Gmail and click send" step.
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

    if (!application_id || !interview_date || !interview_time || !interviewer || !location) {
      return res.status(400).json({
        success: false,
        error: 'application_id, interview_date, interview_time, interviewer, and location are required.',
      });
    }

    // Look up the application so we know who to email and what position.
    const { data: application, error: appError } = await supabase
      .from('job_applications')
      .select('*')
      .eq('id', application_id)
      .single();

    if (appError) throw appError;
    if (!application) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
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
        created_by: req.user?.id || null,
      })
      .select()
      .single();

    if (interviewError) throw interviewError;

    const { error: statusError } = await supabase
      .from('job_applications')
      .update({ status: 'Interview Scheduled' })
      .eq('id', application_id);

    if (statusError) throw statusError;

    // Send the invitation email now — this replaces the old frontend
    // window.open(gmailUrl) approach, which required a manual click.
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
      // The interview is already scheduled at this point — don't fail the
      // whole request over an email problem, but do surface it so HR knows
      // to follow up manually.
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

// PUT /api/hr/interviews/:id/status — mark Completed / Hired / Rejected / Cancelled
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['Scheduled', 'Completed', 'Hired', 'Rejected', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value.' });
    }

    const { data, error } = await supabase
      .from('interviews')
      .update({ status, notes: notes ?? undefined })
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
          department
        )
      `)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Interview not found.' });

    // When marked as Hired, update job_applications and sync with hired_employees table
    if (status === 'Hired') {
      if (data.application_id) {
        await supabase
          .from('job_applications')
          .update({ status: 'Hired' })
          .eq('id', data.application_id);
      }

      // Check if employee is already inserted into hired_employees
      let filterStr = `interview_id.eq.${id}`;
      if (data.application_id) {
        filterStr += `,application_id.eq.${data.application_id}`;
      }
      const { data: existingHire } = await supabase
        .from('hired_employees')
        .select('id')
        .or(filterStr)
        .maybeSingle();

      if (!existingHire) {
        const app = data.job_applications || {};
        const fullName = `${app.first_name || ''} ${app.last_name || ''}`.trim() || 'Hired Candidate';
        await supabase
          .from('hired_employees')
          .insert({
            application_id: data.application_id || null,
            interview_id: data.id,
            name: fullName,
            email: app.email || '',
            phone: app.phone || null,
            hire_date: new Date().toISOString().slice(0, 10),
            status: 'Onboarding',
          });
      }
    } else if (status === 'Rejected') {
      if (data.application_id) {
        await supabase
          .from('job_applications')
          .update({ status: 'Rejected', notes: notes ?? null })
          .eq('id', data.application_id);
      }

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
    }

    await logAuditEvent({
      req,
      action: 'Updated',
      systemCategory: 'HR - Interviews',
      logDescription: `Set interview ${id} status to ${status}`,
    });

    res.status(200).json({ success: true, message: 'Interview status updated.', data });
  } catch (error) {
    console.error('Error updating interview status:', error);
    res.status(500).json({ success: false, error: 'Failed to update interview status.' });
  }
});

module.exports = router;