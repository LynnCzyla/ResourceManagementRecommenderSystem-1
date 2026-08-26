// backend/routes/SuperAdmin/branches.js
// Full CRUD for branches - FIXED VERSION

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

// GET /api/superadmin/branches
router.get('/branches', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = (req.query.search || '').trim();
    const status = req.query.status;

    // STEP 1: Get branches with manager info only
    let query = supabase
      .from('branches')
      .select(`
        *,
        manager:branches_manager_id_fkey (
          id,
          employee_id,
          first_name,
          middle_name,
          last_name
        )
      `, { count: 'exact' });

    if (status && status !== 'All') query = query.eq('status', status);
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,location.ilike.%${search}%,address.ilike.%${search}%`
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: branches, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    // STEP 2: Get admin info separately
    const branchIds = (branches || []).map(b => b.id);
    let adminMap = new Map();

    if (branchIds.length > 0) {
      // Get admins for these branches
      const { data: admins, error: adminError } = await supabase
        .from('admins')
        .select(`
          branch_id,
          profile_id,
          created_at,
          profiles!admins_profile_id_fkey (
            id,
            first_name,
            last_name,
            employee_id
          )
        `)
        .in('branch_id', branchIds);

      if (!adminError && admins) {
        admins.forEach(admin => {
          adminMap.set(admin.branch_id, {
            id: admin.profile_id,
            name: `${admin.profiles?.first_name || ''} ${admin.profiles?.last_name || ''}`.trim(),
            employee_id: admin.profiles?.employee_id || '',
            assigned_at: admin.created_at
          });
        });
      }
    }

    // STEP 3: Combine the data
    const dataWithAdmin = (branches || []).map(branch => ({
      ...branch,
      admin_info: adminMap.get(branch.id) || null
    }));

    // STEP 4: Get emails for managers (from auth)
    const dataWithEmails = await Promise.all(
      dataWithAdmin.map(async (branch) => {
        if (branch.manager) {
          try {
            const { data: authUser } = await supabase.auth.admin.getUserById(branch.manager.id);
            branch.manager.email = authUser?.user?.email || '';
          } catch (e) {
            branch.manager.email = '';
          }
        }
        return branch;
      })
    );

    res.json({
      success: true,
      data: dataWithEmails || [],
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

// GET /api/superadmin/branches/:id
router.get('/branches/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // STEP 1: Get branch with manager
    const { data: branch, error } = await supabase
      .from('branches')
      .select(`
        *,
        manager:branches_manager_id_fkey (
          id,
          employee_id,
          first_name,
          middle_name,
          last_name
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!branch) {
      return res.status(404).json({
        success: false,
        error: 'Branch not found.'
      });
    }

    // STEP 2: Get admin info separately
    const { data: admin, error: adminError } = await supabase
      .from('admins')
      .select(`
        profile_id,
        created_at,
        profiles!admins_profile_id_fkey (
          id,
          employee_id,
          first_name,
          middle_name,
          last_name,
          contact_number,
          status
        )
      `)
      .eq('branch_id', id)
      .maybeSingle();

    if (!adminError && admin) {
      branch.admin_info = {
        id: admin.profile_id,
        name: `${admin.profiles?.first_name || ''} ${admin.profiles?.last_name || ''}`.trim(),
        employee_id: admin.profiles?.employee_id || '',
        contact_number: admin.profiles?.contact_number || '',
        status: admin.profiles?.status || '',
        assigned_at: admin.created_at
      };
    } else {
      branch.admin_info = null;
    }

    // STEP 3: Get manager email
    if (branch.manager) {
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(branch.manager.id);
        branch.manager.email = authUser?.user?.email || '';
      } catch (e) {
        branch.manager.email = '';
      }
    }

    res.json({
      success: true,
      data: branch
    });
  } catch (err) {
    console.error('Error fetching branch:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/superadmin/branches
router.post('/branches', async (req, res) => {
  const {
    name,
    location,
    address,
    contact_number,
    manager_name,
    status
  } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      error: 'name is required.'
    });
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

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        user_id: req.user?.id || null,
        action: 'CREATE_BRANCH',
        system_category: 'Branch Management',
        log_description: `Created branch: ${name}`,
      });

    res.status(201).json({
      success: true,
      message: 'Branch created successfully',
      data
    });
  } catch (err) {
    console.error('Error creating branch:', err);
    if (isTableNotFoundError(err)) {
      return res.status(400).json({
        success: false,
        error: 'Branches database table has not been created yet.',
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/superadmin/branches/:id
router.put('/branches/:id', async (req, res) => {
  const { id } = req.params;
  const {
    name,
    location,
    address,
    contact_number,
    manager_name,
    status
  } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      error: 'name is required.'
    });
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
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Branch not found.'
      });
    }

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        user_id: req.user?.id || null,
        action: 'UPDATE_BRANCH',
        system_category: 'Branch Management',
        log_description: `Updated branch: ${name}`,
      });

    res.json({
      success: true,
      message: 'Branch updated successfully',
      data
    });
  } catch (err) {
    console.error('Error updating branch:', err);
    if (isTableNotFoundError(err)) {
      return res.status(400).json({
        success: false,
        error: 'Branches database table has not been created yet.',
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/superadmin/branches/:id
router.delete('/branches/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Check if branch has any users
    const { count: userCount, error: userError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('branch_id', id);

    if (userError) throw userError;

    if (userCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete branch. It has ${userCount} users assigned.`
      });
    }

    // Get branch info for logging
    const { data: branch } = await supabase
      .from('branches')
      .select('name')
      .eq('id', id)
      .single();

    // Delete the branch
    const { error } = await supabase
      .from('branches')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        user_id: req.user?.id || null,
        action: 'DELETE_BRANCH',
        system_category: 'Branch Management',
        log_description: `Deleted branch: ${branch?.name || id}`,
      });

    res.json({
      success: true,
      message: 'Branch deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting branch:', err);
    if (isTableNotFoundError(err)) {
      return res.status(400).json({
        success: false,
        error: 'Branches database table has not been created yet.',
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/superadmin/branches/:id/assign-manager
router.post('/branches/:id/assign-manager', async (req, res) => {
  const { id } = req.params;
  const { profile_id } = req.body;

  if (!profile_id) {
    return res.status(400).json({
      success: false,
      error: 'profile_id is required.'
    });
  }

  try {
    // Check if branch exists
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('id, name')
      .eq('id', id)
      .single();

    if (branchError || !branch) {
      return res.status(404).json({
        success: false,
        error: 'Branch not found.'
      });
    }

    // Check if user exists
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('id', profile_id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({
        success: false,
        error: 'User not found.'
      });
    }

    // Assign as manager
    const managerName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();

    const { data, error } = await supabase
      .from('branches')
      .update({
        manager_id: profile_id,
        manager_name: managerName,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        user_id: req.user?.id || null,
        action: 'ASSIGN_MANAGER',
        system_category: 'Branch Management',
        log_description: `Assigned ${managerName} as manager of branch ${branch.name}`,
      });

    res.json({
      success: true,
      message: 'Manager assigned successfully',
      data
    });
  } catch (err) {
    console.error('Error assigning manager:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/superadmin/branches/:id/remove-manager
router.delete('/branches/:id/remove-manager', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('id, name, manager_id')
      .eq('id', id)
      .single();

    if (branchError || !branch) {
      return res.status(404).json({
        success: false,
        error: 'Branch not found.'
      });
    }

    if (!branch.manager_id) {
      return res.status(400).json({
        success: false,
        error: 'Branch does not have a manager assigned.'
      });
    }

    // Remove manager
    const { data, error } = await supabase
      .from('branches')
      .update({
        manager_id: null,
        manager_name: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        user_id: req.user?.id || null,
        action: 'REMOVE_MANAGER',
        system_category: 'Branch Management',
        log_description: `Removed manager from branch ${branch.name}`,
      });

    res.json({
      success: true,
      message: 'Manager removed successfully',
      data
    });
  } catch (err) {
    console.error('Error removing manager:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;