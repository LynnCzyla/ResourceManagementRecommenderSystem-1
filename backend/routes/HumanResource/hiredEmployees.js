// backend/routes/HumanResource/hiredEmployees.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');

// ✅ Helper to check if user has HR or Admin role
const hasHrOrAdminRole = (user) => {
  const role = user?.role;
  const isSuperAdmin = user?.is_super_admin || false;
  
  if (isSuperAdmin) return true;
  if (role === 'Human Resources') return true;
  if (role === 'Admin') return true;
  return false;
};

// GET /api/hr/hired-employees — list all hires with branch filtering
router.get('/', async (req, res) => {
  try {
    const { status, department_id } = req.query;
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    console.log(`📋 Fetching hired employees for: ${userId}`);
    console.log(`👤 Role: ${userRole}`);
    console.log(`🏢 User Branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);

    // ✅ Allow Super Admin, Admin, and Human Resources
    if (!hasHrOrAdminRole(req.user)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Human Resources, Admin, or Super Admin role required.'
      });
    }

    // ✅ For Super Admin: Get all hired employees
    if (isSuperAdmin) {
      let query = supabase
        .from('hired_employees')
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
          job_applications:application_id (
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
          interviews:interview_id (
            id,
            interview_date,
            interview_time,
            status,
            created_by,
            profiles:created_by (
              id,
              first_name,
              last_name,
              branch_id,
              role
            )
          )
        `)
        .order('hire_date', { ascending: false });

      if (department_id) query = query.eq('department_id', department_id);
      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw error;

      const transformedData = transformHiredEmployees(data || []);
      console.log(`✅ Super Admin found ${transformedData.length} hired employees`);
      return res.status(200).json({ success: true, data: transformedData });
    }

    // ✅ For non-super admins: Filter by branch
    if (!userBranchId) {
      return res.status(403).json({
        success: false,
        error: 'Your account is not assigned to a branch'
      });
    }

    // ✅ Step 1: Get all application IDs for this branch
    const { data: branchApplications, error: appError } = await supabase
      .from('job_applications')
      .select('id')
      .eq('branch_id', userBranchId);

    if (appError) {
      console.error('❌ Error fetching branch applications:', appError);
      throw appError;
    }

    const applicationIds = branchApplications?.map(app => app.id) || [];
    console.log(`📋 Found ${applicationIds.length} applications in branch ${userBranchId}`);

    // ✅ Step 2: Get hired employees that belong to these applications
    let query = supabase
      .from('hired_employees')
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
        job_applications:application_id (
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
        interviews:interview_id (
          id,
          interview_date,
          interview_time,
          status,
          created_by,
          profiles:created_by (
            id,
            first_name,
            last_name,
            branch_id,
            role
          )
        )
      `)
      .order('hire_date', { ascending: false });

    // ✅ Filter by application IDs (only show hires from this branch's applications)
    if (applicationIds.length > 0) {
      query = query.in('application_id', applicationIds);
    } else {
      // No applications in this branch, return empty
      console.log('⚠️ No applications found in this branch');
      return res.status(200).json({ success: true, data: [] });
    }

    if (department_id) query = query.eq('department_id', department_id);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      console.error('❌ Error fetching hired employees:', error);
      throw error;
    }

    const transformedData = transformHiredEmployees(data || []);
    console.log(`✅ Found ${transformedData.length} hired employees in branch`);

    res.status(200).json({ success: true, data: transformedData });
  } catch (error) {
    console.error('Error fetching hired employees:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch hired employees.' });
  }
});

// Helper function to transform hired employee data
const transformHiredEmployees = (data) => {
  return (data || []).map(item => {
    // Get branch info from application or interview
    let branchId = null;
    let branchName = 'N/A';
    
    if (item.job_applications?.branch_id) {
      branchId = item.job_applications.branch_id;
      branchName = item.job_applications.branches?.name || 'N/A';
    } else if (item.interviews?.profiles?.branch_id) {
      branchId = item.interviews.profiles.branch_id;
    }

    return {
      ...item,
      department_name: item.departments?.department_name || 'N/A',
      position_name: item.positions?.position_name || 'N/A',
      applicant_name: item.job_applications ? 
        `${item.job_applications.first_name || ''} ${item.job_applications.last_name || ''}`.trim() : 
        item.name || 'Unknown',
      applicant_email: item.job_applications?.email || item.email || 'N/A',
      applicant_phone: item.job_applications?.phone || item.phone || 'N/A',
      position_applied: item.job_applications?.position_applied || item.position_name || 'N/A',
      branch_id: branchId,
      branch_name: branchName,
      interview_status: item.interviews?.status || 'N/A',
      interview_date: item.interviews?.interview_date || 'N/A',
    };
  });
};

// GET /api/hr/hired-employees/employees — Staff directory (with department AND position join)
router.get('/employees', async (req, res) => {
  try {
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    console.log(`📋 Fetching employees directory for: ${userId}`);
    console.log(`👤 Role: ${userRole}`);
    console.log(`🏢 Branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);

    // ✅ Allow Super Admin, Admin, and Human Resources
    if (!hasHrOrAdminRole(req.user)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Human Resources, Admin, or Super Admin role required.'
      });
    }

    // ✅ Join with departments AND positions to get names
    let query = supabase
      .from('profiles')
      .select(`
        *,
        departments:department_id (
          id,
          department_name
        ),
        positions:position_id (
          id,
          position_name,
          description
        ),
        branches:branch_id (
          id,
          name,
          location
        )
      `)
      .eq('status', 'Active')
      .order('first_name', { ascending: true });

    // ✅ Filter by branch for non-super admins
    if (!isSuperAdmin && userBranchId) {
      query = query.eq('branch_id', userBranchId);
    }

    const { data, error } = await query;
    if (error) throw error;

    // ✅ Transform data with department name and position name from joined tables
    const filteredData = (data || [])
      .filter(profile => 
        profile.role !== 'Admin' && 
        profile.role !== 'Super Admin' && 
        profile.role !== 'Human Resources' &&
        profile.role !== 'admin' &&
        profile.role !== 'super_admin'
      )
      .map(profile => ({
        id: profile.id,
        employee_id: profile.employee_id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unnamed',
        email: profile.email || '',
        phone: profile.contact_number || 'N/A',
        role: profile.role || 'N/A',
        position: profile.positions?.position_name || 'N/A',
        position_id: profile.position_id,
        department: profile.departments?.department_name || 'N/A',
        department_id: profile.department_id,
        branch_id: profile.branch_id,
        branch_name: profile.branches?.name || 'N/A',
        status: profile.status,
        avatar_url: profile.avatar_url,
        join_date: profile.join_date,
        created_at: profile.created_at,
        hireDate: profile.join_date || (profile.created_at ? String(profile.created_at).slice(0, 10) : 'N/A'),
        salary: null,
        statusLabel: 'Employee',
      }));

    console.log(`✅ Found ${filteredData.length} employees (${(data?.length || 0) - filteredData.length} admin/HR excluded)`);

    res.status(200).json({ success: true, data: filteredData });
  } catch (error) {
    console.error('Error fetching employees from profiles:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch employees.' });
  }
});

// POST /api/hr/hired-employees — Convert an application/interview into a hire
router.post('/', async (req, res) => {
  try {
    const {
      application_id, interview_id, name, email, phone,
      position_id, department_id, hire_date, salary,
    } = req.body;

    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userId = req.user?.id;

    console.log(`📋 Creating hired employee: ${name}`);
    console.log(`📋 Application ID: ${application_id}, Interview ID: ${interview_id}`);

    // ✅ Allow Super Admin, Admin, and Human Resources
    if (!hasHrOrAdminRole(req.user)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Human Resources, Admin, or Super Admin role required.'
      });
    }

    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({ success: false, error: 'Name and email are required.' });
    }

    // ✅ Verify branch access through application
    if (application_id && !isSuperAdmin) {
      const { data: application } = await supabase
        .from('job_applications')
        .select('branch_id')
        .eq('id', application_id)
        .single();
      
      if (application && application.branch_id !== userBranchId) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to hire for this branch'
        });
      }
    }

    // Check if employee already exists
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
      console.log(`📋 Employee already exists: ${existingEmp.id}`);
      const updatePayload = {
        salary: salary !== undefined ? salary : existingEmp.salary,
        hire_date: hire_date || existingEmp.hire_date,
        name: name.trim(),
        email: email.trim(),
        phone: phone?.trim() || null,
        position_id: position_id || existingEmp.position_id,
        department_id: department_id || existingEmp.department_id,
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
      console.log('📋 Creating new hired employee');
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

      if (insertErr) {
        console.error('❌ Error inserting hired employee:', insertErr);
        throw insertErr;
      }
      data = inserted;
      console.log(`✅ Created hired employee with ID: ${data.id}`);
    }

    // Update application and interview statuses
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

// PUT /api/hr/hired-employees/:id/status — Update status
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userRole = req.user?.role;

    // ✅ Allow Super Admin, Admin, and Human Resources
    if (!hasHrOrAdminRole(req.user)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Human Resources, Admin, or Super Admin role required.'
      });
    }

    // ✅ Check branch access
    if (!isSuperAdmin) {
      const { data: employee } = await supabase
        .from('hired_employees')
        .select(`
          application_id,
          job_applications:application_id (
            branch_id
          )
        `)
        .eq('id', id)
        .single();
      
      if (employee?.job_applications?.branch_id && 
          employee.job_applications.branch_id !== userBranchId) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to update this employee'
        });
      }
    }

    // Map UI workflow status to PostgreSQL DB check constraint values
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

// PUT /api/hr/hired-employees/:id — Update employee info
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { salary, hire_date, status, name, email, phone } = req.body;

    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userRole = req.user?.role;

    // ✅ Allow Super Admin, Admin, and Human Resources
    if (!hasHrOrAdminRole(req.user)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Human Resources, Admin, or Super Admin role required.'
      });
    }

    // ✅ Check branch access
    if (!isSuperAdmin) {
      const { data: employee } = await supabase
        .from('hired_employees')
        .select(`
          application_id,
          job_applications:application_id (
            branch_id
          )
        `)
        .eq('id', id)
        .single();
      
      if (employee?.job_applications?.branch_id && 
          employee.job_applications.branch_id !== userBranchId) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to update this employee'
        });
      }
    }

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

// PUT /api/hr/hired-employees/:id/accept-offer — Accept offer
router.put('/:id/accept-offer', async (req, res) => {
  try {
    const { id } = req.params;

    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userRole = req.user?.role;

    // ✅ Allow Super Admin, Admin, and Human Resources
    if (!hasHrOrAdminRole(req.user)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Human Resources, Admin, or Super Admin role required.'
      });
    }

    // ✅ Check branch access
    if (!isSuperAdmin) {
      const { data: employee } = await supabase
        .from('hired_employees')
        .select(`
          application_id,
          job_applications:application_id (
            branch_id
          )
        `)
        .eq('id', id)
        .single();
      
      if (employee?.job_applications?.branch_id && 
          employee.job_applications.branch_id !== userBranchId) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to accept offer for this employee'
        });
      }
    }

    const { data: emp, error: fetchErr } = await supabase
      .from('hired_employees')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !emp) {
      return res.status(404).json({ success: false, error: 'Employee record not found.' });
    }

    // Update application notes
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

// POST /api/hr/hired-employees/:id/send-offer — Send job offer email
router.post('/:id/send-offer', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      jobTitle, salary, benefits, employmentType, startDate,
      workLocation, workingHours, conditions, instructions,
      subject, customMessage
    } = req.body;

    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userRole = req.user?.role;

    // ✅ Allow Super Admin, Admin, and Human Resources
    if (!hasHrOrAdminRole(req.user)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Human Resources, Admin, or Super Admin role required.'
      });
    }

    // ✅ Check branch access
    if (!isSuperAdmin) {
      const { data: employee } = await supabase
        .from('hired_employees')
        .select(`
          application_id,
          job_applications:application_id (
            branch_id
          )
        `)
        .eq('id', id)
        .single();
      
      if (employee?.job_applications?.branch_id && 
          employee.job_applications.branch_id !== userBranchId) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to send offer for this employee'
        });
      }
    }

    // Get employee record
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

    // Update employee record
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

    // Update application notes
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

module.exports = router;