// backend/routes/SuperAdmin/admins.js
// COMPLETE Admin Management System
// Includes: CRUD + Status Management + Lock/Unlock + Email

const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { sendAdminWelcomeEmail } = require('../../utils/mailer');

// ============================================
// HELPER FUNCTIONS
// ============================================

// Generate random password
function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

// Generate sequential employee ID with WEA-Location format
const generateEmployeeId = async (branchName) => {
  try {
    // Extract location from branch name
    let location = 'BRANCH';
    
    if (branchName) {
      // Handle branch names like "WEA-PHIL" or "WEA-Singapore" or "WEA-IDN"
      let cleanName = branchName;
      if (branchName.toUpperCase().startsWith('WEA-')) {
        cleanName = branchName.substring(4); // Remove "WEA-"
      }
      
      // Remove any special characters and convert to uppercase
      location = cleanName.replace(/[^a-zA-Z]/g, '').toUpperCase();
      
      // If location is empty, use the original name
      if (!location) {
        location = branchName.replace(/[^a-zA-Z]/g, '').toUpperCase();
      }
    }
    
    // If still empty, use a default
    if (!location) {
      location = 'BRANCH';
    }

    console.log(`🔍 Generating ID for branch: ${branchName}, extracted location: ${location}`);

    // Get ALL profiles with employee_id
    const { data: allProfiles, error: allError } = await supabase
      .from("profiles")
      .select("employee_id")
      .not('employee_id', 'is', null);

    if (allError) {
      console.error("❌ Error fetching profiles:", allError);
      const timestamp = Date.now().toString().slice(-6);
      return `WEA-${location}-${timestamp}`;
    }

    console.log(`📦 Total profiles with employee_id: ${allProfiles?.length || 0}`);
    
    // Filter for this specific location (e.g., WEA-PHIL-XXX)
    const filtered = allProfiles.filter(d => {
      if (!d.employee_id) return false;
      return d.employee_id.startsWith(`WEA-${location}-`);
    });
    
    console.log(`📦 Found ${filtered.length} IDs for location ${location}`);
    if (filtered.length > 0) {
      console.log('📋 Existing IDs for this location:', filtered.map(d => d.employee_id));
    }

    let lastNumber = 0;
    if (filtered.length > 0) {
      filtered.forEach(d => {
        // Extract the number from WEA-{LOCATION}-{NUMBER}
        const match = d.employee_id.match(/WEA-[A-Z]+-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > lastNumber) lastNumber = num;
        }
      });
    }
    
    console.log(`🔢 Highest number found for ${location}: ${lastNumber}`);

    const nextNumber = lastNumber + 1;
    const paddedNumber = String(nextNumber).padStart(3, '0');
    const newId = `WEA-${location}-${paddedNumber}`;
    
    console.log(`✅ Generated new ID: ${newId}`);
    console.log(`📊 Next number: ${nextNumber}, Padded: ${paddedNumber}`);
    
    return newId;
  } catch (error) {
    console.error("❌ Error generating employee ID:", error);
    const timestamp = Date.now().toString().slice(-6);
    const cleanName = (branchName || 'BRANCH').replace(/[^a-zA-Z]/g, '').toUpperCase();
    return `WEA-${cleanName || 'BRANCH'}-${timestamp}`;
  }
};

// Check if profile is an Admin
async function isAdminProfile(profileId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, branch_id')
    .eq('id', profileId)
    .eq('role', 'Admin')
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ============================================
// FORM OPTIONS
// ============================================

// GET /api/superadmin/admins/options
router.get('/admins/options', async (req, res) => {
  try {
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('id, department_name')
      .order('department_name', { ascending: true });
    if (deptError) throw deptError;

    const { data: positions, error: posError } = await supabase
      .from('positions')
      .select('id, position_name, department_id')
      .order('position_name', { ascending: true });
    if (posError) throw posError;

    const { data: branches, error: branchError } = await supabase
      .from('branches')
      .select('id, name, location, status')
      .eq('status', 'Active')
      .order('name', { ascending: true });
    if (branchError) throw branchError;

    res.json({
      success: true,
      data: {
        departments: departments || [],
        positions: positions || [],
        branches: branches || []
      },
    });
  } catch (err) {
    console.error('Error fetching admin form options:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// LIST ADMIN ACCOUNTS
// ============================================

// GET /api/superadmin/admins
router.get('/admins', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = (req.query.search || '').trim();
    const departmentId = req.query.department_id;
    const branchId = req.query.branch_id;
    const status = req.query.status;
    const showLocked = req.query.locked;

    let query = supabase
      .from('profiles')
      .select(`
        id,
        employee_id,
        first_name,
        middle_name,
        last_name,
        contact_number,
        position_id,
        department_id,
        role,
        status,
        join_date,
        created_at,
        updated_at,
        branch_id,
        created_by,
        departments (
          department_name
        ),
        positions (
          position_name
        ),
        branches:profiles_branch_id_fkey (
          id, name, location, status
        )
      `, { count: 'exact' })
      .eq('role', 'Admin');

    if (departmentId) query = query.eq('department_id', departmentId);
    if (branchId) query = query.eq('branch_id', branchId);
    if (status) query = query.eq('status', status);
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_id.ilike.%${search}%`
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const profileIds = (data || []).map((a) => a.id);
    let lockMap = new Map();
    if (profileIds.length > 0) {
      const { data: loginAttempts, error: loginError } = await supabase
        .from('user_login_attempts')
        .select('user_id, failed_attempts, locked, locked_at')
        .in('user_id', profileIds);
      if (!loginError && loginAttempts) {
        lockMap = new Map(loginAttempts.map((l) => [l.user_id, l]));
      }
    }

    const dataWithDetails = await Promise.all(
      (data || []).map(async (profile) => {
        try {
          const { data: authUser } = await supabase.auth.admin.getUserById(profile.id);
          profile.email = authUser?.user?.email || '';
        } catch (e) {
          profile.email = '';
        }
        
        const lock = lockMap.get(profile.id);
        profile.failed_attempts = lock?.failed_attempts || 0;
        profile.locked = lock?.locked || false;
        profile.locked_at = lock?.locked_at || null;
        
        return profile;
      })
    );

    let admins = (dataWithDetails || []).map(profile => ({
      id: profile.id,
      employee_id: profile.employee_id,
      first_name: profile.first_name,
      middle_name: profile.middle_name,
      last_name: profile.last_name,
      email: profile.email || '',
      contact_number: profile.contact_number,
      department_id: profile.department_id,
      position_id: profile.position_id,
      role: profile.role,
      status: profile.status,
      join_date: profile.join_date,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      branch_id: profile.branch_id,
      branch: profile.branches || null,
      created_by: profile.created_by,
      departments: profile.departments || null,
      positions: profile.positions || null,
      failed_attempts: profile.failed_attempts || 0,
      locked: profile.locked || false,
      locked_at: profile.locked_at || null,
    }));

    if (showLocked === 'true') admins = admins.filter((a) => a.locked);
    else if (showLocked === 'false') admins = admins.filter((a) => !a.locked);

    res.json({
      success: true,
      data: admins,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
      },
    });
  } catch (err) {
    console.error('Error fetching admins:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// GET SINGLE ADMIN
// ============================================

router.get('/admins/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select(`
        id,
        employee_id,
        first_name,
        middle_name,
        last_name,
        contact_number,
        position_id,
        department_id,
        role,
        status,
        join_date,
        created_at,
        updated_at,
        branch_id,
        created_by,
        departments (
          department_name
        ),
        positions (
          position_name
        ),
        branches:profiles_branch_id_fkey (
          id, name, location, status
        )
      `)
      .eq('id', id)
      .eq('role', 'Admin')
      .single();

    if (error || !profile) {
      return res.status(404).json({
        success: false,
        error: 'Admin not found'
      });
    }

    let email = '';
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(id);
      email = authUser?.user?.email || '';
    } catch (e) {
      console.warn('Error fetching email:', id);
    }

    const { data: loginData } = await supabase
      .from('user_login_attempts')
      .select('failed_attempts, locked, locked_at')
      .eq('user_id', id)
      .maybeSingle();

    const adminData = {
      id: profile.id,
      employee_id: profile.employee_id,
      first_name: profile.first_name,
      middle_name: profile.middle_name,
      last_name: profile.last_name,
      email: email,
      contact_number: profile.contact_number,
      department_id: profile.department_id,
      position_id: profile.position_id,
      role: profile.role,
      status: profile.status,
      join_date: profile.join_date,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      branch_id: profile.branch_id,
      branch: profile.branches || null,
      created_by: profile.created_by,
      departments: profile.departments || null,
      positions: profile.positions || null,
      failed_attempts: loginData?.failed_attempts || 0,
      locked: loginData?.locked || false,
      locked_at: loginData?.locked_at || null,
    };

    res.json({
      success: true,
      data: adminData
    });
  } catch (err) {
    console.error('Error fetching admin:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// CREATE ADMIN WITH EMAIL
// ============================================

// POST /api/superadmin/admins
router.post('/admins', async (req, res) => {
  const {
    first_name,
    middle_name,
    last_name,
    email,
    contact_number,
    department_id,
    position_id,
    join_date,
    branch_id,
  } = req.body;

  const grantedBy = req.user?.id || null;

  if (!first_name || !last_name || !email) {
    return res.status(400).json({
      success: false,
      error: 'first_name, last_name, and email are required.',
    });
  }

  if (!branch_id) {
    return res.status(400).json({
      success: false,
      error: 'branch_id is required. Admin must be assigned to a branch.',
    });
  }

  try {
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('id, name')
      .eq('id', branch_id)
      .single();

    if (branchError || !branch) {
      return res.status(404).json({
        success: false,
        error: 'Branch not found.'
      });
    }

    // Get Super Admin name for the email
    let createdByName = 'Super Admin';
    if (grantedBy) {
      const { data: creatorProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', grantedBy)
        .single();
      
      if (creatorProfile) {
        createdByName = `${creatorProfile.first_name} ${creatorProfile.last_name}`.trim();
      }
    }

    // ✅ Generate employee ID based on existing IDs in the database
    const employeeId = await generateEmployeeId(branch.name);
    const tempPassword = generateTempPassword();

    // Create auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        first_name,
        middle_name,
        last_name,
        role: 'Admin'
      }
    });
    if (authError) throw authError;

    // Create profile with role = 'Admin'
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authUser.user.id,
        employee_id: employeeId,
        first_name,
        middle_name: middle_name || null,
        last_name,
        contact_number: contact_number || null,
        department_id: department_id || null,
        position_id: position_id || null,
        role: 'Admin',
        branch_id: branch_id,
        created_by: grantedBy,
        status: 'Active',
        join_date: join_date || null,
      })
      .select()
      .single();

    if (profileError) {
      await supabase.auth.admin.deleteUser(authUser.user.id);
      throw profileError;
    }

    // Insert into admins table for tracking
    const { data: adminRecord, error: adminError } = await supabase
      .from('admins')
      .insert({
        profile_id: profile.id,
        branch_id: branch_id,
        created_by: grantedBy,
      })
      .select()
      .single();

    if (adminError) {
      await supabase.from('profiles').delete().eq('id', profile.id);
      await supabase.auth.admin.deleteUser(authUser.user.id);
      throw adminError;
    }

    // Update branch with manager
    await supabase
      .from('branches')
      .update({
        manager_id: profile.id,
        manager_name: `${first_name} ${last_name}`.trim()
      })
      .eq('id', branch_id);

    // ✅ SEND WELCOME EMAIL using the shared mailer
    let emailSent = false;
    try {
      const emailResult = await sendAdminWelcomeEmail({
        to: email,
        firstName: first_name,
        lastName: last_name,
        employeeId: employeeId,
        temporaryPassword: tempPassword,
        branchName: branch.name,
        createdBy: createdByName,
      });
      emailSent = emailResult.success;
      
      if (emailSent) {
        console.log(`✅ Welcome email sent to ${email}`);
      } else {
        console.warn(`⚠️ Failed to send welcome email to ${email}:`, emailResult.error);
      }
    } catch (emailError) {
      console.error('❌ Email error:', emailError);
    }

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        user_id: grantedBy,
        action: 'CREATE_ADMIN',
        system_category: 'Admin Management',
        log_description: `Created admin ${first_name} ${last_name} for branch ${branch.name}`,
      });

    res.status(201).json({
      success: true,
      message: emailSent 
        ? 'Admin created successfully! Welcome email sent.'
        : 'Admin created successfully! (Email could not be sent)',
      data: {
        admin_record_id: adminRecord.id,
        ...profile,
        email,
        branch: branch.name
      },
      tempPassword,
      email_sent: emailSent,
    });
  } catch (err) {
    console.error('Error creating admin:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// UPDATE ADMIN
// ============================================

router.put('/admins/:id', async (req, res) => {
  const { id } = req.params;
  const {
    first_name,
    middle_name,
    last_name,
    email,
    contact_number,
    department_id,
    position_id,
    join_date,
    branch_id,
    status
  } = req.body;

  if (!first_name || !last_name) {
    return res.status(400).json({
      success: false,
      error: 'first_name and last_name are required.'
    });
  }

  try {
    const adminData = await isAdminProfile(id);
    if (!adminData) {
      return res.status(404).json({
        success: false,
        error: 'Admin not found.'
      });
    }

    if (email) {
      await supabase.auth.admin.updateUserById(id, { email });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        first_name,
        middle_name: middle_name || null,
        last_name,
        contact_number: contact_number || null,
        department_id: department_id || null,
        position_id: position_id || null,
        join_date: join_date || null,
        status: status || 'Active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from('branches')
      .update({ manager_name: `${first_name} ${last_name}`.trim() })
      .eq('manager_id', id);

    await supabase
      .from('audit_logs')
      .insert({
        user_id: req.user?.id || null,
        action: 'UPDATE_ADMIN',
        system_category: 'Admin Management',
        log_description: `Updated admin ${first_name} ${last_name}`,
      });

    res.json({
      success: true,
      message: 'Admin updated successfully',
      data: { ...data, email }
    });
  } catch (err) {
    console.error('Error updating admin:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// DELETE ADMIN
// ============================================

router.delete('/admins/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const adminData = await isAdminProfile(id);
    if (!adminData) {
      return res.status(404).json({
        success: false,
        error: 'Admin not found.'
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name, employee_id')
      .eq('id', id)
      .single();

    await supabase.from('admins').delete().eq('profile_id', id);
    
    await supabase
      .from('branches')
      .update({ manager_id: null, manager_name: null })
      .eq('manager_id', id);
    
    await supabase.from('profiles').delete().eq('id', id);
    await supabase.auth.admin.deleteUser(id);

    await supabase
      .from('audit_logs')
      .insert({
        user_id: req.user?.id || null,
        action: 'DELETE_ADMIN',
        system_category: 'Admin Management',
        log_description: `Deleted admin ${profile?.first_name} ${profile?.last_name}`,
      });

    res.json({
      success: true,
      message: 'Admin deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting admin:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// ACCOUNT STATUS MANAGEMENT
// ============================================

router.patch('/admins/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['Active', 'Inactive', 'Deactivated'].includes(status)) {
    return res.status(400).json({
      success: false,
      error: "status must be 'Active' or 'Inactive'."
    });
  }

  try {
    const adminData = await isAdminProfile(id);
    if (!adminData) {
      return res.status(404).json({
        success: false,
        error: 'Admin account not found.'
      });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from('audit_logs')
      .insert({
        user_id: req.user?.id || null,
        action: 'UPDATE_ADMIN_STATUS',
        system_category: 'Account Management',
        log_description: `Changed admin ${data.employee_id} status to ${status}`,
      });

    res.json({
      success: true,
      message: `Account status updated to ${status}`,
      data: {
        id: data.id,
        status: data.status,
        updated_at: data.updated_at
      }
    });
  } catch (err) {
    console.error('Error updating account status:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/admins/:id/lock', async (req, res) => {
  const { id } = req.params;
  const { locked_by } = req.body;

  try {
    const adminData = await isAdminProfile(id);
    if (!adminData) {
      return res.status(404).json({
        success: false,
        error: 'Admin account not found.'
      });
    }

    const { data: existing } = await supabase
      .from('user_login_attempts')
      .select('id')
      .eq('user_id', id)
      .maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from('user_login_attempts')
        .update({
          locked: true,
          locked_by: locked_by || req.user?.id || null,
          locked_at: new Date().toISOString()
        })
        .eq('user_id', id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('user_login_attempts')
        .insert({
          user_id: id,
          locked: true,
          locked_by: locked_by || req.user?.id || null,
          locked_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    await supabase
      .from('audit_logs')
      .insert({
        user_id: req.user?.id || null,
        action: 'LOCK_ADMIN_ACCOUNT',
        system_category: 'Account Management',
        log_description: `Locked admin account ${id}`,
      });

    res.json({
      success: true,
      message: 'Account locked successfully',
      data: result
    });
  } catch (err) {
    console.error('Error locking account:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/admins/:id/unlock', async (req, res) => {
  const { id } = req.params;

  try {
    const adminData = await isAdminProfile(id);
    if (!adminData) {
      return res.status(404).json({
        success: false,
        error: 'Admin account not found.'
      });
    }

    const { data, error } = await supabase
      .from('user_login_attempts')
      .update({
        locked: false,
        failed_attempts: 0,
        locked_by: null,
        locked_at: null
      })
      .eq('user_id', id)
      .select()
      .maybeSingle();

    if (error) throw error;

    await supabase
      .from('audit_logs')
      .insert({
        user_id: req.user?.id || null,
        action: 'UNLOCK_ADMIN_ACCOUNT',
        system_category: 'Account Management',
        log_description: `Unlocked admin account ${id}`,
      });

    res.json({
      success: true,
      message: 'Account unlocked successfully',
      data
    });
  } catch (err) {
    console.error('Error unlocking account:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;