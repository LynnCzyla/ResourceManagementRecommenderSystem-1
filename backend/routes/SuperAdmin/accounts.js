// backend/routes/SuperAdmin/accounts.js
//
// Account STATUS management for Admin accounts only.
// "Admin" now means: a profile that has a matching row in public.admins.
// Handles Active/Inactive toggling and lock/unlock via user_login_attempts.
// Does NOT create/edit/delete profiles, and does NOT grant/revoke admin
// membership itself — that's a separate concern (see note at bottom of file).

const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

// Checks whether a given profile is currently an Admin (has a row in public.admins).
async function isAdminProfile(profileId) {
  const { data, error } = await supabase
    .from('admins')
    .select('id')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

// GET /api/superadmin/accounts?search=&status=&locked=&page=&limit=
router.get('/accounts', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = (req.query.search || '').trim();
    const status = req.query.status; // 'Active' | 'Inactive'

    // Join admins -> profiles. !inner makes the profiles filter (status/search)
    // actually constrain the top-level admins query instead of just the embed.
    let query = supabase
      .from('admins')
      .select(
        `
        id,
        profile_id,
        profiles!admins_profile_id_fkey!inner (
          id,
          employee_id,
          first_name,
          middle_name,
          last_name,
          status,
          created_at
        )
      `,
        { count: 'exact' }
      );

    if (status) {
      query = query.eq('profiles.status', status);
    }
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_id.ilike.%${search}%`,
        { foreignTable: 'profiles' }
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: adminRows, error, count } = await query
      .order('created_at', { referencedTable: 'profiles', ascending: false })
      .range(from, to);
    if (error) throw error;

    const profileIds = (adminRows || []).map((a) => a.profiles.id);
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

    let accounts = (adminRows || []).map((a) => {
      const p = a.profiles;
      const lock = lockMap.get(p.id);
      return {
        id: p.id,
        employee_id: p.employee_id,
        name: `${p.first_name || ''}${p.middle_name ? ` ${p.middle_name}` : ''} ${p.last_name || ''}`.trim(),
        status: p.status,
        failedAttempts: lock?.failed_attempts || 0,
        locked: lock?.locked || false,
        lockedAt: lock?.locked_at || null,
        createdAt: p.created_at,
      };
    });

    if (req.query.locked === 'true') accounts = accounts.filter((a) => a.locked);
    else if (req.query.locked === 'false') accounts = accounts.filter((a) => !a.locked);

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
    console.error('Error fetching admin accounts:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/superadmin/accounts/:id/status   { status: 'Active' | 'Inactive' }
router.patch('/accounts/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['Active', 'Inactive'].includes(status)) {
    return res.status(400).json({ success: false, error: "status must be 'Active' or 'Inactive'." });
  }
  try {
    const isAdmin = await isAdminProfile(id);
    if (!isAdmin) {
      return res.status(404).json({ success: false, error: 'Admin account not found.' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Admin account not found.' });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error updating account status:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/superadmin/accounts/:id/unlock
router.patch('/accounts/:id/unlock', async (req, res) => {
  const { id } = req.params;
  try {
    const isAdmin = await isAdminProfile(id);
    if (!isAdmin) {
      return res.status(404).json({ success: false, error: 'Admin account not found.' });
    }

    const { data, error } = await supabase
      .from('user_login_attempts')
      .update({ locked: false, failed_attempts: 0, locked_by: null, locked_at: null })
      .eq('user_id', id)
      .select()
      .maybeSingle();
    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('Error unlocking account:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/superadmin/accounts/:id/lock   { locked_by?: uuid of the acting SuperAdmin }
router.patch('/accounts/:id/lock', async (req, res) => {
  const { id } = req.params;
  const { locked_by } = req.body;
  try {
    const isAdmin = await isAdminProfile(id);
    if (!isAdmin) {
      return res.status(404).json({ success: false, error: 'Admin account not found.' });
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
        .update({ locked: true, locked_by: locked_by || null, locked_at: new Date().toISOString() })
        .eq('user_id', id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('user_login_attempts')
        .insert({ user_id: id, locked: true, locked_by: locked_by || null, locked_at: new Date().toISOString() })
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Error locking account:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

// NOTE: This file only manages accounts that are ALREADY in public.admins.
// It has no route to add someone to admins (grant) or remove them (revoke).
// If you need that, it's a separate set of endpoints — see the question below.