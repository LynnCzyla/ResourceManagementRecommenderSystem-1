// backend/routes/SuperAdmin/accounts.js
// Manages ALL user accounts (not just admins)

const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

// GET /api/superadmin/accounts
// Now shows ALL user accounts, not just admins
router.get('/accounts', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = (req.query.search || '').trim();
    const role = req.query.role;
    const status = req.query.status;
    const branchId = req.query.branch_id;
    const showLocked = req.query.locked;

    let query = supabase
      .from('profiles')
      .select(`
        *,
        branches:profiles_branch_id_fkey (
          id,
          name,
          location,
          status
        )
      `, { count: 'exact' });

    // Apply filters
    if (status) query = query.eq('status', status);
    if (role) query = query.eq('role', role);
    if (branchId) query = query.eq('branch_id', branchId);
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_id.ilike.%${search}%`
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: profiles, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);
    
    if (error) throw error;

    // ← NEW: Get emails from auth.users for all profiles
    const profileIds = (profiles || []).map((p) => p.id);
    let emailMap = new Map();
    
    if (profileIds.length > 0) {
      // Get auth users with their emails
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      
      if (!authError && authUsers) {
        // Create a map of user_id -> email
        authUsers.users.forEach(user => {
          emailMap.set(user.id, user.email);
        });
      }
    }

    // Get login attempt data for lock status
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

    // Format response with emails
    let accounts = (profiles || []).map((p) => {
      const lock = lockMap.get(p.id);
      return {
        id: p.id,
        employee_id: p.employee_id,
        name: `${p.first_name || ''}${p.middle_name ? ` ${p.middle_name}` : ''} ${p.last_name || ''}`.trim(),
        email: emailMap.get(p.id) || '', // ← Get email from auth
        role: p.role || 'employee',
        status: p.status || 'Active',
        branch: p.branches || null,
        branch_id: p.branch_id,
        failedAttempts: lock?.failed_attempts || 0,
        locked: lock?.locked || false,
        locked_at: lock?.locked_at || null,
        created_at: p.created_at,
      };
    });

    // Filter by locked status if requested
    if (showLocked === 'true') accounts = accounts.filter((a) => a.locked);
    else if (showLocked === 'false') accounts = accounts.filter((a) => !a.locked);

    res.json({
      success: true,
      data: accounts,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
      },
    });
  } catch (err) {
    console.error('Error fetching accounts:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/superadmin/accounts/:id/status
router.patch('/accounts/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['Active', 'Inactive'].includes(status)) {
    return res.status(400).json({
      success: false,
      error: "status must be 'Active' or 'Inactive'."
    });
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, employee_id, first_name, last_name')
      .eq('id', id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({
        success: false,
        error: 'User not found.'
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
        action: 'UPDATE_USER_STATUS',
        system_category: 'Account Management',
        log_description: `Changed ${profile.first_name} ${profile.last_name} (${profile.employee_id}) status to ${status}`,
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

// PATCH /api/superadmin/accounts/:id/unlock
router.patch('/accounts/:id/unlock', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, employee_id, first_name, last_name')
      .eq('id', id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({
        success: false,
        error: 'User not found.'
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
        action: 'UNLOCK_USER_ACCOUNT',
        system_category: 'Account Management',
        log_description: `Unlocked ${profile.first_name} ${profile.last_name} (${profile.employee_id}) account`,
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

// PATCH /api/superadmin/accounts/:id/lock
router.patch('/accounts/:id/lock', async (req, res) => {
  const { id } = req.params;
  const { locked_by } = req.body;

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, employee_id, first_name, last_name')
      .eq('id', id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({
        success: false,
        error: 'User not found.'
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
        action: 'LOCK_USER_ACCOUNT',
        system_category: 'Account Management',
        log_description: `Locked ${profile.first_name} ${profile.last_name} (${profile.employee_id}) account`,
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

module.exports = router;