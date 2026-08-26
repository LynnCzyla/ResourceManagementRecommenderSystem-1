// backend/routes/SuperAdmin/audit-logs.js
// Super Admin Audit Logs - Full system audit trail

const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

// Helper to get role display name
const getRoleDisplayName = (role) => {
  if (!role) return 'Unknown';
  const roleMap = {
    'Super Admin': 'Super Admin',
    'Admin': 'Admin',
    'Human Resources': 'Human Resources',
    'Project Manager': 'Project Manager',
    'Resource Manager': 'Resource Manager',
    'Employee': 'Employee',
  };
  return roleMap[role] || role;
};

// GET /api/superadmin/audit-logs
router.get('/audit-logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = (req.query.search || '').trim();
    const action = req.query.action;
    const role = req.query.role;
    const branchId = req.query.branch_id;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    console.log('📊 Fetching audit logs with filters:', { action, role, branchId, startDate, endDate });

    // STEP 1: Get user IDs for role and branch filters
    let filteredUserIds = null;
    
    // If role filter is applied, get user IDs with that role
    if (role && role !== 'All' && role !== 'undefined') {
      const { data: roleProfiles, error: roleError } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', role);

      if (roleError) {
        console.error('❌ Error fetching role profiles:', roleError);
      } else if (roleProfiles) {
        filteredUserIds = roleProfiles.map(p => p.id);
        console.log(`✅ Found ${filteredUserIds.length} users with role "${role}"`);
        
        // If no users with this role, return empty
        if (filteredUserIds.length === 0) {
          return res.json({
            success: true,
            data: [],
            pagination: { page, limit, total: 0, totalPages: 1 },
          });
        }
      }
    }

    // If branch filter is applied, filter the user IDs further
    if (branchId && branchId !== 'All' && branchId !== 'undefined') {
      let branchQuery = supabase
        .from('profiles')
        .select('id')
        .eq('branch_id', branchId);

      // If we already have filtered user IDs from role filter, apply both
      if (filteredUserIds && filteredUserIds.length > 0) {
        branchQuery = branchQuery.in('id', filteredUserIds);
      }

      const { data: branchProfiles, error: branchError } = await branchQuery;

      if (branchError) {
        console.error('❌ Error fetching branch profiles:', branchError);
      } else if (branchProfiles) {
        filteredUserIds = branchProfiles.map(p => p.id);
        console.log(`✅ Found ${filteredUserIds.length} users with branch filter`);
        
        if (filteredUserIds.length === 0) {
          return res.json({
            success: true,
            data: [],
            pagination: { page, limit, total: 0, totalPages: 1 },
          });
        }
      }
    }

    // STEP 2: Build the logs query with user ID filter
    let logsQuery = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' });

    // Apply user ID filter (role + branch combined)
    if (filteredUserIds && filteredUserIds.length > 0) {
      logsQuery = logsQuery.in('user_id', filteredUserIds);
    }

    // Apply other filters
    if (action && action !== 'All' && action !== 'undefined') {
      logsQuery = logsQuery.eq('action', action);
    }

    if (startDate) {
      logsQuery = logsQuery.gte('created_at', `${startDate}T00:00:00Z`);
    }
    if (endDate) {
      logsQuery = logsQuery.lte('created_at', `${endDate}T23:59:59Z`);
    }

    if (search) {
      logsQuery = logsQuery.or(
        `log_description.ilike.%${search}%,action.ilike.%${search}%`
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // STEP 3: Get total count first (for pagination)
    const { count: totalCount, error: countError } = await logsQuery;

    if (countError) {
      console.error('❌ Error getting count:', countError);
      throw countError;
    }

    console.log(`✅ Total filtered logs: ${totalCount}`);

    // STEP 4: Get paginated logs
    const { data: logs, error: logsError } = await logsQuery
      .order('created_at', { ascending: false })
      .range(from, to);

    if (logsError) {
      console.error('❌ Error fetching logs:', logsError);
      throw logsError;
    }

    console.log(`✅ Found ${logs?.length || 0} logs for this page`);

    if (!logs || logs.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          page,
          limit,
          total: totalCount || 0,
          totalPages: Math.max(1, Math.ceil((totalCount || 0) / limit)),
        },
      });
    }

    // STEP 5: Get user details for each log
    const userIds = [...new Set(logs.map(log => log.user_id).filter(Boolean))];
    let profileMap = new Map();

    if (userIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select(`
          id,
          employee_id,
          first_name,
          middle_name,
          last_name,
          role,
          branch_id,
          branches:profiles_branch_id_fkey (
            id,
            name,
            location
          )
        `)
        .in('id', userIds);

      if (profileError) {
        console.error('❌ Error fetching profiles:', profileError);
      } else if (profiles) {
        profiles.forEach(profile => {
          profileMap.set(profile.id, profile);
        });
        console.log(`✅ Found ${profiles.length} profiles`);
      }
    }

    // STEP 6: Combine logs with profiles
    const formattedLogs = logs.map(log => {
      const profile = profileMap.get(log.user_id) || {};
      const branch = profile.branches || {};
      
      const firstName = profile.first_name || '';
      const middleName = profile.middle_name ? ` ${profile.middle_name}` : '';
      const lastName = profile.last_name || '';
      const fullName = `${firstName}${middleName} ${lastName}`.trim() || 'System';

      return {
        id: log.id,
        user_id: log.user_id,
        user: fullName,
        user_role: getRoleDisplayName(profile.role),
        user_employee_id: profile.employee_id || '',
        branch_id: profile.branch_id,
        branch_name: branch.name || '',
        action: log.action || 'Unknown',
        category: log.system_category || 'General',
        desc: log.log_description || '',
        time: log.created_at,
      };
    });

    // STEP 7: Send response with correct pagination
    res.json({
      success: true,
      data: formattedLogs,
      pagination: {
        page,
        limit,
        total: totalCount || 0,
        totalPages: Math.max(1, Math.ceil((totalCount || 0) / limit)),
      },
    });
  } catch (err) {
    console.error('❌ Error fetching super admin audit logs:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch audit logs',
    });
  }
});

// GET /api/superadmin/audit-logs/filters
router.get('/audit-logs/filters', async (req, res) => {
  try {
    console.log('📊 Fetching audit log filters...');

    // Get distinct actions
    let actions = [];
    try {
      const { data: actionsData, error: actionsError } = await supabase
        .from('audit_logs')
        .select('action')
        .order('action');

      if (!actionsError && actionsData) {
        actions = [...new Set(actionsData.map(a => a.action).filter(Boolean))];
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch actions:', err.message);
    }
    console.log(`✅ Found ${actions.length} actions`);

    // Get distinct roles from profiles
    let roles = [];
    try {
      const { data: rolesData, error: rolesError } = await supabase
        .from('profiles')
        .select('role')
        .order('role');

      if (!rolesError && rolesData) {
        roles = [...new Set(rolesData.map(r => r.role).filter(Boolean))];
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch roles:', err.message);
    }
    console.log(`✅ Found ${roles.length} roles`);

    // Get branches
    let branches = [];
    try {
      const { data: branchesData, error: branchesError } = await supabase
        .from('branches')
        .select('id, name')
        .eq('status', 'Active')
        .order('name');

      if (!branchesError && branchesData) {
        branches = branchesData;
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch branches:', err.message);
    }
    console.log(`✅ Found ${branches.length} branches`);

    res.json({
      success: true,
      data: {
        actions: actions,
        roles: roles,
        branches: branches || [],
      },
    });
  } catch (err) {
    console.error('❌ Error fetching audit log filters:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch filter options',
    });
  }
});

// GET /api/superadmin/audit-logs/export
router.get('/audit-logs/export', async (req, res) => {
  try {
    console.log('📊 Exporting audit logs...');
    
    const search = (req.query.search || '').trim();
    const action = req.query.action;
    const role = req.query.role;
    const branchId = req.query.branch_id;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    // Get user IDs for role/branch filters
    let filteredUserIds = null;

    if (role && role !== 'All' && role !== 'undefined') {
      const { data: roleProfiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', role);
      
      if (roleProfiles) {
        filteredUserIds = roleProfiles.map(p => p.id);
      }
    }

    if (branchId && branchId !== 'All' && branchId !== 'undefined') {
      let branchQuery = supabase
        .from('profiles')
        .select('id')
        .eq('branch_id', branchId);

      if (filteredUserIds && filteredUserIds.length > 0) {
        branchQuery = branchQuery.in('id', filteredUserIds);
      }

      const { data: branchProfiles } = await branchQuery;
      if (branchProfiles) {
        filteredUserIds = branchProfiles.map(p => p.id);
      }
    }

    // Get all logs
    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (filteredUserIds && filteredUserIds.length > 0) {
      query = query.in('user_id', filteredUserIds);
    }

    if (action && action !== 'All' && action !== 'undefined') {
      query = query.eq('action', action);
    }
    if (startDate) {
      query = query.gte('created_at', `${startDate}T00:00:00Z`);
    }
    if (endDate) {
      query = query.lte('created_at', `${endDate}T23:59:59Z`);
    }
    if (search) {
      query = query.or(
        `log_description.ilike.%${search}%,action.ilike.%${search}%`
      );
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error('❌ Error exporting audit logs:', error);
      throw error;
    }

    // Get all unique user IDs
    const userIds = [...new Set((logs || []).map(log => log.user_id).filter(Boolean))];
    let profileMap = new Map();

    if (userIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select(`
          id,
          first_name,
          middle_name,
          last_name,
          role,
          branch_id,
          branches:profiles_branch_id_fkey (
            name
          )
        `)
        .in('id', userIds);

      if (!profileError && profiles) {
        profiles.forEach(profile => {
          profileMap.set(profile.id, profile);
        });
      }
    }

    // Format for CSV
    const csvData = (logs || []).map(log => {
      const profile = profileMap.get(log.user_id) || {};
      const branch = profile.branches || {};
      
      const firstName = profile.first_name || '';
      const middleName = profile.middle_name ? ` ${profile.middle_name}` : '';
      const lastName = profile.last_name || '';
      const fullName = `${firstName}${middleName} ${lastName}`.trim() || 'System';

      return {
        'Timestamp': new Date(log.created_at).toLocaleString(),
        'Actor': fullName,
        'Role': getRoleDisplayName(profile.role),
        'Branch': branch.name || '',
        'Action': log.action || '',
        'Category': log.system_category || 'General',
        'Description': log.log_description || '',
      };
    });

    // Generate CSV
    const headers = ['Timestamp', 'Actor', 'Role', 'Branch', 'Action', 'Category', 'Description'];
    let csvContent = headers.join(',') + '\n';
    
    if (csvData.length === 0) {
      csvContent += '"No audit logs found for the selected filters",,,,,';
    } else {
      csvData.forEach(row => {
        const rowData = headers.map(header => {
          const value = row[header] || '';
          const escaped = value.toString().replace(/"/g, '""');
          return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') 
            ? `"${escaped}"` 
            : escaped;
        });
        csvContent += rowData.join(',') + '\n';
      });
    }

    // Send as CSV
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvContent);

  } catch (err) {
    console.error('❌ Error exporting audit logs:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to export audit logs',
    });
  }
});

module.exports = router;