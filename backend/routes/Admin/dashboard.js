// routes/Admin/dashboard.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { verifyToken } = require('../Middleware/auth');

// ✅ Apply auth middleware to ALL routes
router.use(verifyToken);

const ROLE_COLORS = {
  Admin: '#10b981',
  Employee: '#0284c7',
  'Project Manager': '#8b5cf6',
  'Resource Manager': '#0ea5e9',
  HR: '#f59e0b',
  'Super Admin': '#ef4444',
};

function formatRelativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

// GET /api/admin/dashboard/stats - FIXED with branch filtering
router.get('/dashboard/stats', async (req, res) => {
  try {
    console.log(`📊 Dashboard stats requested by: ${req.user.employee_id} (${req.user.role})`);
    console.log(`🏢 Branch filter: ${req.user.is_super_admin ? 'ALL' : req.user.branch_id}`);

    // ✅ Build queries with branch filtering
    let usersQuery = supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    let deptQuery = supabase
      .from('departments')
      .select('*', { count: 'exact', head: true });

    let roleQuery = supabase
      .from('profiles')
      .select('role');

    // ✅ Filter by branch for non-super admins
    if (!req.user.is_super_admin) {
      usersQuery = usersQuery.eq('branch_id', req.user.branch_id);
      roleQuery = roleQuery.eq('branch_id', req.user.branch_id);
    }

    const [usersResult, deptResult, roleResult] = await Promise.all([
      usersQuery,
      deptQuery,
      roleQuery
    ]);

    if (usersResult.error) throw usersResult.error;
    if (deptResult.error) throw deptResult.error;
    if (roleResult.error) throw roleResult.error;

    const totalUsers = usersResult.count || 0;
    const totalDepartments = deptResult.count || 0;

    // Calculate role breakdown
    const roleCounts = {};
    (roleResult.data || []).forEach((r) => {
      const role = r.role || 'Unknown';
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    });

    const total = roleResult.data?.length || 0;
    const userRolesData = Object.entries(roleCounts).map(([label, count]) => ({
      label,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      color: ROLE_COLORS[label] || '#64748b',
    }));

    // ✅ Get branch info for the response
    let branchInfo = null;
    if (!req.user.is_super_admin && req.user.branch_id) {
      const { data: branch, error: branchError } = await supabase
        .from('branches')
        .select('name')
        .eq('id', req.user.branch_id)
        .single();
      
      if (!branchError && branch) {
        branchInfo = branch;
      }
    }

    res.json({
      success: true,
      data: {
        status: 'Online',
        totalUsers,
        totalDepartments,
        userRolesData,
        branch: branchInfo,
        user_role: req.user.role,
        is_super_admin: req.user.is_super_admin,
        branch_filter: req.user.is_super_admin ? 'all' : req.user.branch_id,
      },
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ FIXED: GET /api/admin/dashboard/activity - Using profiles join for branch filtering
router.get('/dashboard/activity', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 5;

    console.log(`📊 Activity requested by: ${req.user.employee_id} (${req.user.role})`);
    console.log(`🏢 Branch filter: ${req.user.is_super_admin ? 'ALL' : req.user.branch_id}`);

    // ✅ If Super Admin - show all activity
    if (req.user.is_super_admin) {
      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          id,
          user_id,
          action,
          system_category,
          log_description,
          created_at,
          profiles:user_id (
            id,
            employee_id,
            first_name,
            last_name,
            role,
            branch_id
          )
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      const activities = (data || []).map((log) => {
        const profile = log.profiles || {};
        const userName = profile.first_name && profile.last_name
          ? `${profile.first_name} ${profile.last_name}`
          : profile.employee_id || 'System';

        return {
          id: log.id,
          user: userName,
          user_id: log.user_id,
          employee_id: profile.employee_id || '',
          text: [log.action, log.log_description || log.system_category].filter(Boolean).join(' - '),
          time: formatRelativeTime(log.created_at),
          created_at: log.created_at,
        };
      });

      return res.json({ success: true, data: activities });
    }

    // ✅ For regular admins: First get users in their branch
    const { data: usersInBranch, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('branch_id', req.user.branch_id);

    if (userError) {
      console.error('Error fetching users in branch:', userError);
      return res.status(500).json({ success: false, error: userError.message });
    }

    const userIds = usersInBranch?.map(u => u.id) || [];
    
    if (userIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // ✅ Get audit logs only for users in this branch
    const { data, error } = await supabase
      .from('audit_logs')
      .select(`
        id,
        user_id,
        action,
        system_category,
        log_description,
        created_at,
        profiles:user_id (
          id,
          employee_id,
          first_name,
          last_name,
          role,
          branch_id
        )
      `)
      .in('user_id', userIds)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Format the activities
    const activities = (data || []).map((log) => {
      const profile = log.profiles || {};
      const userName = profile.first_name && profile.last_name
        ? `${profile.first_name} ${profile.last_name}`
        : profile.employee_id || 'System';

      return {
        id: log.id,
        user: userName,
        user_id: log.user_id,
        employee_id: profile.employee_id || '',
        text: [log.action, log.log_description || log.system_category].filter(Boolean).join(' - '),
        time: formatRelativeTime(log.created_at),
        created_at: log.created_at,
      };
    });

    res.json({ success: true, data: activities });
  } catch (err) {
    console.error('Error fetching recent activity:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ NEW: GET /api/admin/dashboard/user-activity?days=30
// Returns a day-by-day activity count (from audit_logs) for the last N days,
// respecting the same branch filtering as /dashboard/activity. Used by the
// dashboard chart. Every day in the range is included (with count: 0 for
// days with no activity) so the chart doesn't have gaps.
router.get('/dashboard/user-activity', async (req, res) => {
  try {
    // Clamp to a sane range — the frontend only offers 7/14/30/60/90.
    let days = parseInt(req.query.days, 10) || 30;
    days = Math.min(Math.max(days, 1), 365);

    console.log(`📈 User activity requested by: ${req.user.employee_id} (${req.user.role}) for ${days} days`);
    console.log(`🏢 Branch filter: ${req.user.is_super_admin ? 'ALL' : req.user.branch_id}`);

    // Start of the range: `days` days ago, at 00:00:00 local-to-UTC.
    const startDate = new Date();
    startDate.setUTCHours(0, 0, 0, 0);
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1));

    let logsQuery = supabase
      .from('audit_logs')
      .select('id, user_id, created_at')
      .gte('created_at', startDate.toISOString());

    if (!req.user.is_super_admin) {
      // Regular admins only see activity from users in their own branch.
      const { data: usersInBranch, error: userError } = await supabase
        .from('profiles')
        .select('id')
        .eq('branch_id', req.user.branch_id);

      if (userError) {
        console.error('Error fetching users in branch:', userError);
        return res.status(500).json({ success: false, error: userError.message });
      }

      const userIds = usersInBranch?.map(u => u.id) || [];

      if (userIds.length === 0) {
        // No users in this branch — return a zero-filled series instead of
        // erroring, so the chart still renders an empty-but-valid range.
        const emptySeries = [];
        for (let i = 0; i < days; i++) {
          const d = new Date(startDate);
          d.setUTCDate(startDate.getUTCDate() + i);
          emptySeries.push({ date: d.toISOString().split('T')[0], count: 0 });
        }
        return res.json({ success: true, data: emptySeries });
      }

      logsQuery = logsQuery.in('user_id', userIds);
    }

    const { data, error } = await logsQuery;
    if (error) throw error;

    // Bucket logs by day (UTC date), pre-seeding every day in the range
    // with 0 so the chart has a continuous series even on quiet days.
    const countsByDate = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setUTCDate(startDate.getUTCDate() + i);
      countsByDate[d.toISOString().split('T')[0]] = 0;
    }

    (data || []).forEach((log) => {
      const dateKey = new Date(log.created_at).toISOString().split('T')[0];
      if (dateKey in countsByDate) {
        countsByDate[dateKey] += 1;
      }
    });

    const series = Object.entries(countsByDate)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, count]) => ({ date, count }));

    res.json({ success: true, data: series });
  } catch (err) {
    console.error('Error fetching user activity:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ NEW: Get branch-specific stats for Super Admin
router.get('/dashboard/branch-stats', async (req, res) => {
  try {
    // Only Super Admin can access this
    if (!req.user.is_super_admin) {
      return res.status(403).json({
        success: false,
        error: 'Only Super Admin can view branch stats'
      });
    }

    // Get all branches with user counts
    const { data: branches, error: branchError } = await supabase
      .from('branches')
      .select('id, name');

    if (branchError) throw branchError;

    const branchStats = await Promise.all(
      (branches || []).map(async (branch) => {
        const { count, error } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('branch_id', branch.id);

        return {
          ...branch,
          userCount: count || 0,
        };
      })
    );

    res.json({
      success: true,
      data: branchStats,
    });
  } catch (err) {
    console.error('Error fetching branch stats:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ GET /api/admin/dashboard/user-activity?days=30 - User activity timeline from audit_logs
router.get('/dashboard/user-activity', async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    let query = supabase
      .from('audit_logs')
      .select('created_at, user_id, profiles:user_id(branch_id)')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    const { data: logs, error } = await query;
    if (error) {
      console.warn('⚠️ Could not fetch audit_logs for user activity:', error.message);
    }

    // Filter by branch for non-super admins
    const filteredLogs = (logs || []).filter(log => {
      if (req.user?.is_super_admin) return true;
      return !log.profiles?.branch_id || log.profiles?.branch_id === req.user?.branch_id;
    });

    // Group by date (YYYY-MM-DD)
    const countsByDate = {};
    filteredLogs.forEach(log => {
      if (log.created_at) {
        const dateKey = log.created_at.slice(0, 10);
        countsByDate[dateKey] = (countsByDate[dateKey] || 0) + 1;
      }
    });

    // Generate complete timeline for every day in the requested window
    const result = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      result.push({
        date: dateKey,
        count: countsByDate[dateKey] || 0,
      });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Error fetching user activity stats:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;