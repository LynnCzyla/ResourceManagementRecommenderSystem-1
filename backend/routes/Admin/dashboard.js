// routes/Admin/dashboard.js
//
// Provides:
//   GET /api/admin/dashboard/stats
//   GET /api/admin/dashboard/activity?limit=5
//
// Assumes tables: profiles (with a role column), departments, audit_logs
// (with user_id, action, system_category, log_description, created_at).

const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

const ROLE_COLORS = {
  Admin: '#10b981',
  Employee: '#0284c7',
  'Project Manager': '#8b5cf6',
  'Resource Manager': '#0ea5e9',
  HR: '#f59e0b',
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

// GET /api/admin/dashboard/stats
router.get('/dashboard/stats', async (req, res) => {
  try {
    const { count: totalUsers, error: usersError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    if (usersError) throw usersError;

    const { count: totalDepartments, error: deptError } = await supabase
      .from('departments')
      .select('*', { count: 'exact', head: true });
    if (deptError) throw deptError;

    const { data: roleRows, error: roleError } = await supabase
      .from('profiles')
      .select('role');
    if (roleError) throw roleError;

    const roleCounts = {};
    roleRows.forEach((r) => {
      const role = r.role || 'Unknown';
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    });

    const total = roleRows.length || 0;
    const userRolesData = Object.entries(roleCounts).map(([label, count]) => ({
      label,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      color: ROLE_COLORS[label] || '#64748b',
    }));

    res.json({
      success: true,
      data: {
        status: 'Online',
        totalUsers,
        totalDepartments,
        userRolesData,
      },
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/dashboard/activity?limit=5
router.get('/dashboard/activity', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 5;

    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, user_id, action, system_category, log_description, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const userIds = [...new Set((data || []).map((log) => log.user_id).filter(Boolean))];
    let profileMap = new Map();

    if (userIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, first_name, middle_name, last_name, role')
        .in('id', userIds);

      if (!profileError && profiles) {
        profileMap = new Map(
          profiles.map((profile) => [
            profile.id,
            `${profile.first_name || ''}${profile.middle_name ? ` ${profile.middle_name}` : ''}${profile.last_name ? ` ${profile.last_name}` : ''}`.trim() || profile.role || 'System'
          ])
        );
      }
    }

    const activities = data.map((log) => ({
      id: log.id,
      user: profileMap.get(log.user_id) || 'System',
      text: [log.action, log.log_description || log.system_category].filter(Boolean).join(' - '),
      time: formatRelativeTime(log.created_at),
    }));

    res.json({ success: true, data: activities });
  } catch (err) {
    console.error('Error fetching recent activity:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

/*
  In server.js, add:

  const dashboardRoutes = require('./routes/Admin/dashboard');
  const auditLogsRoutes = require('./routes/Admin/auditLogs');

  app.use('/api/admin', dashboardRoutes);
  app.use('/api/admin', auditLogsRoutes);

  Place these next to your other app.use('/api/admin', ...) lines.
*/