// backend/routes/HumanResource/hiredEmployees.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');

// GET /api/hr/hired-employees — list all hires (optional ?status=, ?department_id=)
router.get('/', async (req, res) => {
  try {
    const { status, department_id } = req.query;

    let query = supabase
      .from('hired_employees')
      .select(`*, departments ( id, department_name ), positions ( id, position_name )`)
      .order('hire_date', { ascending: false });

    if (status) query = query.eq('status', status);
    if (department_id) query = query.eq('department_id', department_id);

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Error fetching hired employees:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch hired employees.' });
  }
});

// POST /api/hr/hired-employees — convert an application/interview into a hire
router.post('/', async (req, res) => {
  try {
    const {
      application_id, interview_id, name, email, phone,
      position_id, department_id, hire_date, salary,
    } = req.body;

    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({ success: false, error: 'Name and email are required.' });
    }

    const { data, error } = await supabase
      .from('hired_employees')
      .insert({
        application_id: application_id || null,
        interview_id: interview_id || null,
        name: name.trim(),
        email: email.trim(),
        phone: phone?.trim() || null,
        position_id: position_id || null,
        department_id: department_id || null,
        hire_date: hire_date || new Date().toISOString().slice(0, 10),
        salary: salary || null,
        status: 'Onboarding',
      })
      .select()
      .single();

    if (error) throw error;

    // Mark the source application/interview as Hired too
    if (application_id) {
      await supabase.from('job_applications').update({ status: 'Hired' }).eq('id', application_id);
    }
    if (interview_id) {
      await supabase.from('interviews').update({ status: 'Hired' }).eq('id', interview_id);
    }

    await logAuditEvent({
      req,
      action: 'Created',
      systemCategory: 'HR - Hired Employees',
      logDescription: `Marked ${name.trim()} as hired`,
    });

    res.status(201).json({ success: true, message: 'Employee marked as hired.', data });
  } catch (error) {
    console.error('Error creating hired employee record:', error);
    res.status(500).json({ success: false, error: 'Failed to record hire.' });
  }
});

// PUT /api/hr/hired-employees/:id/status — Onboarding / Active / Inactive
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['Onboarding', 'Active', 'Inactive'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value.' });
    }

    const { data, error } = await supabase
      .from('hired_employees')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Hired employee record not found.' });

    await logAuditEvent({
      req,
      action: 'Updated',
      systemCategory: 'HR - Hired Employees',
      logDescription: `Set hired employee ${id} status to ${status}`,
    });

    res.status(200).json({ success: true, message: 'Status updated.', data });
  } catch (error) {
    console.error('Error updating hired employee status:', error);
    res.status(500).json({ success: false, error: 'Failed to update status.' });
  }
});

module.exports = router;
