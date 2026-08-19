// backend/routes/HumanResource/hiredEmployees.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');

// GET /api/hr/hired-employees — list all hires (optional ?status=, ?department_id=)
router.get('/', async (req, res) => {
  try {
    const { status, department_id } = req.query;

    // Auto-sync: find interviews with status 'Hired'
    const { data: hiredInterviews } = await supabase
      .from('interviews')
      .select(`id, application_id, job_applications ( first_name, last_name, email, phone, position_applied, department )`)
      .eq('status', 'Hired');

    if (hiredInterviews && hiredInterviews.length > 0) {
      for (const intv of hiredInterviews) {
        let filterStr = `interview_id.eq.${intv.id}`;
        if (intv.application_id) {
          filterStr += `,application_id.eq.${intv.application_id}`;
        }
        const { data: existing } = await supabase
          .from('hired_employees')
          .select('id, status, salary')
          .or(filterStr)
          .maybeSingle();

        const app = intv.job_applications || {};
        const fullName = `${app.first_name || ''} ${app.last_name || ''}`.trim() || 'Hired Candidate';

        if (!existing) {
          await supabase
            .from('hired_employees')
            .insert({
              application_id: intv.application_id || null,
              interview_id: intv.id,
              name: fullName,
              email: app.email || '',
              phone: app.phone || null,
              hire_date: new Date().toISOString().slice(0, 10),
              status: 'Onboarding',
              salary: null,
            });
        }
      }
    }

    let query = supabase
      .from('hired_employees')
      .select(`*, job_applications ( position_applied, department, notes ), departments ( id, department_name ), positions ( id, position_name )`)
      .order('hire_date', { ascending: false });

    if (department_id) query = query.eq('department_id', department_id);

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Error fetching hired employees:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch hired employees.' });
  }
});

// GET /api/hr/hired-employees/employees — WEA staff directory, sourced from the `profiles` table
// (this powers the "Employee" tab, which shows real system accounts rather than pipeline records)
// NOTE: adjust the selected/mapped columns below if your `profiles` schema uses different field names
router.get('/employees', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;

    res.status(200).json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Error fetching employees from profiles:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch employees.' });
  }
});

// POST /api/hr/hired-employees/:id/send-offer — send job offer email & move to Onboarding
router.post('/:id/send-offer', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      jobTitle, salary, benefits, employmentType, startDate,
      workLocation, workingHours, conditions, instructions,
      subject, customMessage
    } = req.body;

    const { data: emp, error: fetchErr } = await supabase
      .from('hired_employees')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !emp) {
      return res.status(404).json({ success: false, error: 'Employee record not found.' });
    }

    const { sendOnboardingOfferEmail } = require('../../utils/mailer');
    await sendOnboardingOfferEmail({
      to: emp.email,
      applicantName: emp.name,
      position: jobTitle || 'Position Offered',
      salary: salary || emp.salary,
      benefits,
      employmentType,
      startDate: startDate || emp.hire_date,
      workLocation,
      workingHours,
      conditions,
      instructions,
      subject,
      customMessage
    });

    // Update employee record: set salary, hire date, status to Active (Onboarding)
    const { data: updatedEmp, error: updateErr } = await supabase
      .from('hired_employees')
      .update({
        salary: salary ? parseFloat(salary) : emp.salary,
        hire_date: startDate || emp.hire_date,
        status: 'Active',
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    if (emp.application_id) {
      const { data: appData } = await supabase
        .from('job_applications')
        .select('notes')
        .eq('id', emp.application_id)
        .single();
      const existingNotes = appData?.notes || '';
      const updatedNotes = existingNotes.includes('OFFER_SENT')
        ? existingNotes
        : `${existingNotes} OFFER_SENT`.trim();
      await supabase
        .from('job_applications')
        .update({ notes: updatedNotes })
        .eq('id', emp.application_id);
    }

    // Notify all Admins so they can create a user account for the onboarding employee
    try {
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'Admin');

      if (admins && admins.length > 0) {
        const adminNotifications = admins.map(admin => ({
          recipient_id: admin.id,
          type: 'alert',
          text: `🎉 New Onboarding Employee: ${emp.name} (${emp.email}) for ${jobTitle || 'Position'}. Offer sent. Please create user account.`,
          read: false
        }));
        await supabase.from('notifications').insert(adminNotifications);
      }
    } catch (notifErr) {
      console.error('Failed to notify admins on offer send:', notifErr);
    }

    await logAuditEvent({
      req,
      action: 'Created',
      systemCategory: 'HR - Hired Employees',
      logDescription: `Sent formal job offer email to ${emp.name} (${emp.email}) and moved to Onboarding`,
    });

    res.status(200).json({ success: true, message: 'Offer email sent and employee moved to Onboarding!', data: updatedEmp });
  } catch (error) {
    console.error('Error sending offer email:', error);
    res.status(500).json({ success: false, error: 'Failed to send offer email.' });
  }
});

// PUT /api/hr/hired-employees/:id/accept-offer — HR manually confirms the applicant formally
// accepted the offer (e.g. verbally, or on their first day). This does NOT change the record's
// tab/status — the applicant keeps showing under the same tab. It only stamps a marker so the
// UI can lock the Edit/Email actions for this record. Use Archive separately if the offer was declined.
router.put('/:id/accept-offer', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: emp, error: fetchErr } = await supabase
      .from('hired_employees')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !emp) {
      return res.status(404).json({ success: false, error: 'Employee record not found.' });
    }

    if (emp.application_id) {
      const { data: appData } = await supabase
        .from('job_applications')
        .select('notes')
        .eq('id', emp.application_id)
        .single();
      const existingNotes = appData?.notes || '';
      const updatedNotes = existingNotes.includes('OFFER_ACCEPTED')
        ? existingNotes
        : `${existingNotes} OFFER_ACCEPTED`.trim();
      const { error } = await supabase
        .from('job_applications')
        .update({ notes: updatedNotes })
        .eq('id', emp.application_id);
      if (error) throw error;
    }

    await logAuditEvent({
      req,
      action: 'Updated',
      systemCategory: 'HR - Hired Employees',
      logDescription: `Marked offer as formally accepted for ${emp.name} (${emp.email})`,
    });

    res.status(200).json({ success: true, message: 'Offer acceptance recorded.', data: emp });
  } catch (error) {
    console.error('Error recording offer acceptance:', error);
    res.status(500).json({ success: false, error: 'Failed to record offer acceptance.' });
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

    let existingQuery = supabase.from('hired_employees').select('*');
    if (interview_id) {
      existingQuery = existingQuery.eq('interview_id', interview_id);
    } else if (application_id) {
      existingQuery = existingQuery.eq('application_id', application_id);
    } else {
      existingQuery = existingQuery.eq('email', email.trim());
    }
    const { data: existingEmp } = await existingQuery.maybeSingle();

    let data;
    if (existingEmp) {
      const updatePayload = {
        salary: salary !== undefined ? salary : existingEmp.salary,
        hire_date: hire_date || existingEmp.hire_date,
      };
      const { data: updated, error: updateErr } = await supabase
        .from('hired_employees')
        .update(updatePayload)
        .eq('id', existingEmp.id)
        .select()
        .single();
      if (updateErr) throw updateErr;
      data = updated;
    } else {
      const { data: inserted, error: insertErr } = await supabase
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

      if (insertErr) throw insertErr;
      data = inserted;
    }

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

    res.status(201).json({ success: true, message: 'Employee recorded as hired.', data });
  } catch (error) {
    console.error('Error creating hired employee record:', error);
    res.status(500).json({ success: false, error: 'Failed to record hire.' });
  }
});

// PUT /api/hr/hired-employees/:id — update employee info (salary, status, hire date, etc.)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { salary, hire_date, status, name, email, phone } = req.body;

    const updateData = {};
    if (salary !== undefined) updateData.salary = salary;
    if (hire_date) updateData.hire_date = hire_date;
    if (status) {
      if (status === 'Archived' || status === 'Inactive') updateData.status = 'Inactive';
      else if (status === 'Onboarding' || status === 'Active') updateData.status = 'Active';
      else updateData.status = 'Onboarding';
    }
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;

    const { data, error } = await supabase
      .from('hired_employees')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logAuditEvent({
      req,
      action: 'Updated',
      systemCategory: 'HR - Hired Employees',
      logDescription: `Updated hired employee ${id} details`,
    });

    res.status(200).json({ success: true, message: 'Employee details updated.', data });
  } catch (error) {
    console.error('Error updating hired employee:', error);
    res.status(500).json({ success: false, error: 'Failed to update employee.' });
  }
});

// PUT /api/hr/hired-employees/:id/status
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Map UI workflow status to PostgreSQL DB check constraint values ('Onboarding', 'Active', 'Inactive')
    let dbStatus = 'Onboarding';
    if (status === 'Onboarding' || status === 'Active') {
      dbStatus = 'Active';
    } else if (status === 'Archived' || status === 'Inactive') {
      dbStatus = 'Inactive';
    } else {
      dbStatus = 'Onboarding';
    }

    const { data, error } = await supabase
      .from('hired_employees')
      .update({ status: dbStatus })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Hired employee record not found.' });

    // If status is flipped to Onboarding / Active, notify all Admins to create user account
    if (dbStatus === 'Active' || status === 'Onboarding') {
      try {
        const { data: admins } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'Admin');

        if (admins && admins.length > 0) {
          const adminNotifications = admins.map(admin => ({
            recipient_id: admin.id,
            type: 'alert',
            text: `🎉 Employee Offer Accepted: ${data.name} (${data.email}). Now in Onboarding. Please create user account.`,
            read: false
          }));
          await supabase.from('notifications').insert(adminNotifications);
        }
      } catch (notifErr) {
        console.error('Failed to notify admins on onboarding transition:', notifErr);
      }
    }

    await logAuditEvent({
      req,
      action: 'Updated',
      systemCategory: 'HR - Hired Employees',
      logDescription: `Set hired employee ${id} status to ${status} (DB: ${dbStatus})`,
    });

    res.status(200).json({ success: true, message: 'Status updated.', data });
  } catch (error) {
    console.error('Error updating hired employee status:', error);
    res.status(500).json({ success: false, error: 'Failed to update status.' });
  }
});

module.exports = router;