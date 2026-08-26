// backend/routes/SuperAdmin/dashboard.js
// Dashboard statistics and activity feed

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
    console.log('📊 Fetching dashboard stats...');

    // --- Admins (from profiles table with role = 'Admin') ---
    // Get total admins from profiles table
    const { count: totalAdmins, error: totalAdminsError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'Admin');

    if (totalAdminsError) {
      console.error('❌ Error fetching total admins:', totalAdminsError);
      throw new Error(`Total admins error: ${totalAdminsError.message}`);
    }
    console.log(`✅ Total admins: ${totalAdmins || 0}`);

    // Get active admins from profiles table
    const { count: activeAdmins, error: activeAdminsError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'Admin')
      .eq('status', 'Active');

    if (activeAdminsError) {
      console.error('❌ Error fetching active admins:', activeAdminsError);
      throw new Error(`Active admins error: ${activeAdminsError.message}`);
    }
    console.log(`✅ Active admins: ${activeAdmins || 0}`);

    // --- Branches ---
    let totalBranches = 0;
    let activeBranches = 0;
    let branchesTableAvailable = true;
    try {
      const { count: branchesCount, error: branchesError } = await supabase
        .from('branches')
        .select('*', { count: 'exact', head: true });
      
      if (branchesError) {
        console.warn('⚠️ Branches table error:', branchesError.message);
        branchesTableAvailable = false;
      } else {
        totalBranches = branchesCount || 0;
        console.log(`✅ Total branches: ${totalBranches}`);

        const { count: activeBranchesCount, error: activeBranchesError } = await supabase
          .from('branches')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'Active');
        
        if (!activeBranchesError) {
          activeBranches = activeBranchesCount || 0;
        }
      }
    } catch (branchErr) {
      branchesTableAvailable = false;
      console.warn('⚠️ Branches table not available:', branchErr.message);
    }

    // --- Total Accounts (all profiles) ---
    const { count: totalAccounts, error: totalAccountsError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    
    if (totalAccountsError) {
      console.error('❌ Error fetching total accounts:', totalAccountsError);
      throw new Error(`Total accounts error: ${totalAccountsError.message}`);
    }
    console.log(`✅ Total accounts: ${totalAccounts || 0}`);

    // --- Active Accounts ---
    const { count: activeAccounts, error: activeAccountsError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Active');
    
    if (activeAccountsError) {
      console.error('❌ Error fetching active accounts:', activeAccountsError);
      throw new Error(`Active accounts error: ${activeAccountsError.message}`);
    }
    console.log(`✅ Active accounts: ${activeAccounts || 0}`);

    const inactiveAccounts = Math.max((totalAccounts || 0) - (activeAccounts || 0), 0);

    // --- Locked accounts ---
    let lockedAccounts = 0;
    try {
      const { count: lockedCount, error: lockedError } = await supabase
        .from('user_login_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('locked', true);
      
      if (!lockedError) {
        lockedAccounts = lockedCount || 0;
      } else {
        console.warn('⚠️ user_login_attempts table error:', lockedError.message);
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch locked accounts:', err.message);
    }
    console.log(`✅ Locked accounts: ${lockedAccounts}`);

    // --- Audit logs ---
    let totalLogs = 0;
    try {
      const { count: logsCount, error: logsError } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true });
      
      if (!logsError) {
        totalLogs = logsCount || 0;
      } else {
        console.warn('⚠️ audit_logs table error:', logsError.message);
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch audit logs:', err.message);
    }
    console.log(`✅ Total logs: ${totalLogs}`);

    // --- Users by role ---
    const { data: allProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('role');

    if (profilesError) {
      console.error('❌ Error fetching roles:', profilesError);
      throw new Error(`Roles error: ${profilesError.message}`);
    }

    // Count roles
    const roleStats = {};
    (allProfiles || []).forEach(profile => {
      const role = profile.role || 'Unknown';
      roleStats[role] = (roleStats[role] || 0) + 1;
    });
    console.log('✅ Role counts:', roleStats);

    // Format role stats for frontend
    const formattedRoleStats = {
      'Super Admin': roleStats['Super Admin'] || 0,
      'Admin': roleStats['Admin'] || 0,
      'Human Resources': roleStats['Human Resources'] || 0,
      'Project Manager': roleStats['Project Manager'] || 0,
      'Resource Manager': roleStats['Resource Manager'] || 0,
      'Employee': roleStats['Employee'] || 0,
      'Unknown': roleStats['Unknown'] || 0,
    };

    const responseData = {
      totalAdmins: totalAdmins || 0,
      activeAdmins: activeAdmins || 0,
      totalBranches,
      activeBranches,
      branchesTableAvailable,
      totalAccounts: totalAccounts || 0,
      activeAccounts: activeAccounts || 0,
      inactiveAccounts,
      lockedAccounts,
      totalLogs,
      roleStats: formattedRoleStats,
    };

    console.log('📊 Dashboard stats fetched successfully!');
    res.json({
      success: true,
      data: responseData,
    });
  } catch (err) {
    console.error('❌ Error fetching super admin dashboard stats:', err);
    console.error('❌ Error stack:', err.stack);
    
    res.status(500).json({ 
      success: false, 
      error: err.message || 'Failed to fetch dashboard stats',
    });
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
    
    if (error) {
      // If table doesn't exist, return empty array
      if (error.code === '42P01') {
        console.warn('⚠️ audit_logs table does not exist yet');
        return res.json({ success: true, data: [] });
      }
      throw error;
    }

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
        createdAt: log.created_at,
      };
    });

    res.json({ success: true, data: activities });
  } catch (err) {
    console.error('Error fetching super admin recent activity:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;