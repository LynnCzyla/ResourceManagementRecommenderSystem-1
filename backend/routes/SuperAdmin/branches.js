// backend/routes/SuperAdmin/branches.js
//
// Full CRUD for the `branches` table.
// Run supabase_branches_migration.sql first — these routes assume the
// table exists (unlike dashboard.js's stats route, which tolerates its
// absence).

const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

function isTableNotFoundError(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const code = (err.code || '').toLowerCase();
  return (
    code === 'pgrst116' ||
    code === 'pgrst204' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('not found')
  );
}

// GET /api/superadmin/branches?search=&status=&page=&limit=
router.get('/branches', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = (req.query.search || '').trim();
    const status = req.query.status;

    let query = supabase.from('branches').select('*', { count: 'exact' });

    if (status && status !== 'All') query = query.eq('status', status);
    if (search) {
      query = query.or(`name.ilike.%${search}%,location.ilike.%${search}%,manager_name.ilike.%${search}%`);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
      },
    });
  } catch (err) {
    console.error('Error fetching branches:', err);
    if (isTableNotFoundError(err)) {
      return res.json({
        success: true,
        data: [],
        table_not_found: true,
        message: 'Branches table is not configured in Supabase.',
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 1,
        },
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/superadmin/branches
router.post('/branches', async (req, res) => {
  const { name, location, address, contact_number, manager_name, status } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, error: 'name is required.' });
  }
  try {
    const { data, error } = await supabase
      .from('branches')
      .insert({
        name,
        location: location || null,
        address: address || null,
        contact_number: contact_number || null,
        manager_name: manager_name || null,
        status: status || 'Active',
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('Error creating branch:', err);
    if (isTableNotFoundError(err)) {
      return res.status(400).json({
        success: false,
        error: 'Branches database table has not been created yet in Supabase. Please configure it to enable Branch Management.',
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/superadmin/branches/:id
router.put('/branches/:id', async (req, res) => {
  const { id } = req.params;
  const { name, location, address, contact_number, manager_name, status } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, error: 'name is required.' });
  }
  try {
    const { data, error } = await supabase
      .from('branches')
      .update({
        name,
        location: location || null,
        address: address || null,
        contact_number: contact_number || null,
        manager_name: manager_name || null,
        status: status || 'Active',
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Branch not found.' });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error updating branch:', err);
    if (isTableNotFoundError(err)) {
      return res.status(400).json({
        success: false,
        error: 'Branches database table has not been created yet in Supabase. Please configure it to enable Branch Management.',
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/superadmin/branches/:id
router.delete('/branches/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase.from('branches').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting branch:', err);
    if (isTableNotFoundError(err)) {
      return res.status(400).json({
        success: false,
        error: 'Branches database table has not been created yet in Supabase. Please configure it to enable Branch Management.',
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;