// backend/routes/HumanResource/applications.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');

// GET /api/hr/applications — list all applications (optional ?status=, ?job_posting_id=)
router.get('/', async (req, res) => {
  try {
    const { status, job_posting_id } = req.query;

    let query = supabase
      .from('job_applications')
      .select(`*, job_postings ( id, title, department_id )`)
      .order('applied_date', { ascending: false });

    if (status) query = query.eq('status', status);
    if (job_posting_id) query = query.eq('job_posting_id', job_posting_id);

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch applications.' });
  }
});

// GET /api/hr/applications/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('job_applications')
      .select(`*, job_postings ( id, title, department_id )`)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Application not found.' });

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching application:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch application.' });
  }
});

// POST /api/hr/applications — submit a new application (used by Applicant Portal too)
router.post('/', async (req, res) => {
  try {
    const {
      job_posting_id, applicant_user_id, first_name, middle_name, last_name,
      email, phone, position_applied, department, experience, education,
      skills, cover_letter, resume_path,
    } = req.body;

    if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || !position_applied?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'First name, last name, email, and position are required.',
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
        resume_path: resume_path || null,
        status: 'Pending',
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

// PUT /api/hr/applications/:id/status — update review status (Pending/Under Review/Recommended/Rejected/etc.)
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['Pending', 'Under Review', 'Recommended', 'Interview Scheduled', 'Hired', 'Rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value.' });
    }

    const { data, error } = await supabase
      .from('job_applications')
      .update({ status, notes: notes ?? undefined, reviewed_by: req.user?.id || null })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Application not found.' });

    if (status === 'Rejected' && data.email) {
      const { sendRejectionEmail } = require('../../utils/mailer');
      try {
        await sendRejectionEmail({
          to: data.email,
          applicantName: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
          position: data.position_applied || 'the position',
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

    res.status(200).json({ success: true, message: 'Application status updated.', data });
  } catch (error) {
    console.error('Error updating application status:', error);
    res.status(500).json({ success: false, error: 'Failed to update application status.' });
  }
});

// DELETE /api/hr/applications/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
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
