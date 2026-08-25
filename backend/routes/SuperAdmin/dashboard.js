// backend/routes/SuperAdmin/dashboard.js
//
// Provides:
//   GET /api/superadmin/dashboard/stats
//   GET /api/superadmin/dashboard/activity?limit=5
//
// Data sources (real tables only, no mock values):
//   - profiles            -> admin counts, account counts (role, status)
//   - user_login_attempts -> locked account count
//   - audit_logs          -> total logs + recent activity feed
//   - branches            -> branch counts (OPTIONAL - see note below)
//
// NOTE ON BRANCHES:
// Your Supabase schema does not currently contain a `branches` table
// (BranchManagementTab.jsx is still running on frontend-only mock data).
// This route tries to query `branches` anyway so it starts working
// automatically the moment that table exists. If the table is missing, it
// does NOT crash the dashboard — it just returns branchesTableAvailable:
// false and 0 counts, so the frontend can show an honest "not set up yet"
// state instead of a fake number.
//
// Suggested table if/when you're ready to make Branch Management real:
//
//   CREATE TABLE public.branches (
//     id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
//     name text NOT NULL,
//     location text,
//     address text,
//     contact_number text,
//     manager_name text,
//     status text NOT NULL DEFAULT 'Active',
//     created_at timestamp with time zone DEFAULT now(),
//     CONSTRAINT branches_pkey PRIMARY KEY (id)
//   );

const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

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

// GET /api/superadmin/dashboard/stats
router.get('/dashboard/stats', async (req, res) => {
  try {
    // --- Admins (profiles.role = 'Admin') ---
    const { count: totalAdmins, error: totalAdminsError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'Admin');
    if (totalAdminsError) throw totalAdminsError;

    const { count: activeAdmins, error: activeAdminsError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'Admin')
      .eq('status', 'Active');
    if (activeAdminsError) throw activeAdminsError;

    // --- Branches (optional table - handled gracefully if missing) ---
    let totalBranches = 0;
    let activeBranches = 0;
    let branchesTableAvailable = true;
    try {
      const { count: branchesCount, error: branchesError } = await supabase
        .from('branches')
        .select('*', { count: 'exact', head: true });
      if (branchesError) throw branchesError;
      totalBranches = branchesCount || 0;

      const { count: activeBranchesCount, error: activeBranchesError } = await supabase
        .from('branches')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Active');
      if (activeBranchesError) throw activeBranchesError;
      activeBranches = activeBranchesCount || 0;
    } catch (branchErr) {
      branchesTableAvailable = false;
      totalBranches = 0;
      activeBranches = 0;
    }

    // --- Accounts (all profiles, every role) ---
    const { count: totalAccounts, error: totalAccountsError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    if (totalAccountsError) throw totalAccountsError;

    const { count: activeAccounts, error: activeAccountsError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Active');
    if (activeAccountsError) throw activeAccountsError;

    const inactiveAccounts = Math.max((totalAccounts || 0) - (activeAccounts || 0), 0);

    const { count: lockedAccounts, error: lockedError } = await supabase
      .from('user_login_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('locked', true);
    if (lockedError) throw lockedError;

    // --- Audit logs ---
    const { count: totalLogs, error: logsError } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact', head: true });
    if (logsError) throw logsError;

    res.json({
      success: true,
      data: {
        totalAdmins: totalAdmins || 0,
        activeAdmins: activeAdmins || 0,
        totalBranches,
        activeBranches,
        branchesTableAvailable,
        totalAccounts: totalAccounts || 0,
        activeAccounts: activeAccounts || 0,
        inactiveAccounts,
        lockedAccounts: lockedAccounts || 0,
        totalLogs: totalLogs || 0,
      },
    });
  } catch (err) {
    console.error('Error fetching super admin dashboard stats:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/superadmin/dashboard/activity?limit=5
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
            {
              name: `${profile.first_name || ''}${profile.middle_name ? ` ${profile.middle_name}` : ''}${profile.last_name ? ` ${profile.last_name}` : ''}`.trim() || 'System',
              role: profile.role || null,
            },
          ])
        );
      }
    }

    const activities = (data || []).map((log) => {
      const actor = profileMap.get(log.user_id);
      return {
        id: log.id,
        action: log.action,
        category: log.system_category,
        actor: actor?.name || 'System',
        actorRole: actor?.role || null,
        details: log.log_description || log.system_category || '',
        timestamp: formatRelativeTime(log.created_at),
      };
    });

    res.json({ success: true, data: activities });
  } catch (err) {
    console.error('Error fetching super admin recent activity:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;