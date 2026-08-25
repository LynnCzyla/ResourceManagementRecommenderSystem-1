// backend/routes/SuperAdmin/admins.js
//
// Full CRUD for Admin accounts.
// An "Admin" = a profiles row that has a matching row in the `admins`
// junction table (see super_admins/admins schema). SuperAdmin manages
// Admins here — create, edit profile details, delete.
// Account status (Active/Inactive) and lock/unlock live in accounts.js,
// not here.
//
// NOTE: creating/deleting an Admin uses supabase.auth.admin.* which is
// a privileged operation — the `supabase` client in ../../supabase must
// be initialized with the SERVICE ROLE key on the backend, not the anon key.

const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

// Flatten a { id: admins.id, created_at, profile: {...} } row into a
// single object the frontend can render directly. `id` on the flattened
// object is the PROFILE id (used by PUT/DELETE below), `admin_record_id`
// is the row id in the `admins` junction table.
function flattenAdminRow(row) {
  if (!row || !row.profile) return null;
  const { profile, ...adminMeta } = row;
  return {
    admin_record_id: adminMeta.id,
    admin_created_at: adminMeta.created_at,
    ...profile,
  };
}

// GET /api/superadmin/admins/options
// Departments + positions for the create/edit form dropdowns (real data only).
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

    res.json({
      success: true,
      data: { departments: departments || [], positions: positions || [] },
    });
  } catch (err) {
    console.error('Error fetching admin form options:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/superadmin/admins?search=&department_id=&page=&limit=
router.get('/admins', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = (req.query.search || '').trim();
    const departmentId = req.query.department_id;

    // !inner is required so we can filter/search on the embedded
    // profiles columns below.
    let query = supabase
      .from('admins')
      .select(
        `id, created_at,
         profile:profiles!admins_profile_id_fkey!inner (
           id, employee_id, first_name, middle_name, last_name,
           contact_number, position_id, department_id, status, join_date,
           created_at,
           positions ( position_name ),
           departments ( department_name )
         )`,
        { count: 'exact' }
      );

    if (departmentId) query = query.eq('profile.department_id', departmentId);
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_id.ilike.%${search}%`,
        { foreignTable: 'profile' }
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw error;

    const dataWithEmails = await Promise.all(
      (data || []).map(async (row) => {
        if (!row.profile) return row;
        try {
          const { data: authUser } = await supabase.auth.admin.getUserById(row.profile.id);
          row.profile.email = authUser?.user?.email || '';
        } catch (e) {
          console.warn('Error fetching email for admin:', row.profile.id, e);
          row.profile.email = '';
        }
        return row;
      })
    );

    res.json({
      success: true,
      data: (dataWithEmails || []).map(flattenAdminRow).filter(Boolean),
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

// POST /api/superadmin/admins
router.post('/admins', async (req, res) => {
  const {
    employee_id,
    first_name,
    middle_name,
    last_name,
    email,
    contact_number,
    department_id,
    position_id,
    join_date,
  } = req.body;

  // The SuperAdmin performing this action, if you have auth middleware
  // attaching it to req (e.g. req.user.id). Left null if not present.
  const grantedBy = req.user?.id || null;

  if (!employee_id || !first_name || !last_name || !email) {
    return res.status(400).json({
      success: false,
      error: 'employee_id, first_name, last_name, and email are required.',
    });
  }

  try {
    const tempPassword = generateTempPassword();

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (authError) throw authError;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authUser.user.id,
        employee_id,
        first_name,
        middle_name: middle_name || null,
        last_name,
        contact_number: contact_number || null,
        department_id: department_id || null,
        position_id: position_id || null,
        status: 'Active',
        join_date: join_date || null,
      })
      .select()
      .single();

    if (profileError) {
      await supabase.auth.admin.deleteUser(authUser.user.id);
      throw profileError;
    }

    const { data: adminRecord, error: adminError } = await supabase
      .from('admins')
      .insert({
        profile_id: profile.id,
        created_by: grantedBy,
      })
      .select()
      .single();

    if (adminError) {
      // Roll back profile + auth user so we don't leave orphans
      await supabase.from('profiles').delete().eq('id', profile.id);
      await supabase.auth.admin.deleteUser(authUser.user.id);
      throw adminError;
    }

    // tempPassword is returned once so the SuperAdmin can hand it to the
    // new Admin — it is never stored or logged in plaintext anywhere else.
    res.status(201).json({
      success: true,
      data: { admin_record_id: adminRecord.id, ...profile, email },
      tempPassword,
    });
  } catch (err) {
    console.error('Error creating admin:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/superadmin/admins/:id  (:id = profile id)
router.put('/admins/:id', async (req, res) => {
  const { id } = req.params;
  const { first_name, middle_name, last_name, email, contact_number, department_id, position_id, join_date } =
    req.body;

  if (!first_name || !last_name) {
    return res.status(400).json({ success: false, error: 'first_name and last_name are required.' });
  }

  try {
    // Confirm this profile is actually an Admin before editing it here.
    const { data: adminLink, error: linkError } = await supabase
      .from('admins')
      .select('id')
      .eq('profile_id', id)
      .single();
    if (linkError || !adminLink) {
      return res.status(404).json({ success: false, error: 'Admin not found.' });
    }

    if (email) {
      const { error: authError } = await supabase.auth.admin.updateUserById(id, {
        email: email
      });
      if (authError) throw authError;
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
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    await supabase.from('admins').update({ updated_at: new Date().toISOString() }).eq('id', adminLink.id);

    res.json({ success: true, data: { ...data, email } });
  } catch (err) {
    console.error('Error updating admin:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/superadmin/admins/:id  (:id = profile id)
router.delete('/admins/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data: adminLink, error: linkError } = await supabase
      .from('admins')
      .select('id')
      .eq('profile_id', id)
      .single();
    if (linkError || !adminLink) {
      return res.status(404).json({ success: false, error: 'Admin not found.' });
    }

    const { error: deleteAdminLinkError } = await supabase.from('admins').delete().eq('id', adminLink.id);
    if (deleteAdminLinkError) throw deleteAdminLinkError;

    const { error: deleteProfileError } = await supabase.from('profiles').delete().eq('id', id);
    if (deleteProfileError) throw deleteProfileError;

    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(id);
    if (deleteAuthError) throw deleteAuthError;

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting admin:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;