// backend/routes/Admin/unlockUsers.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');
const { verifyToken } = require('../Middleware/auth');

// ✅ Apply auth middleware to ALL routes
router.use(verifyToken);

// Add a test route
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Unlock routes are working!',
    user: {
      id: req.user.id,
      employee_id: req.user.employee_id,
      role: req.user.role,
      branch_id: req.user.branch_id
    }
  });
});

// ✅ Get all locked users (filtered by branch)
router.get('/locked-users', async (req, res) => {
  console.log(`🔍 GET /locked-users called by: ${req.user.employee_id} (${req.user.role})`);
  console.log(`🏢 Branch filter: ${req.user.is_super_admin ? 'ALL' : req.user.branch_id}`);
  
  try {
    // ✅ First get all locked users from user_login_attempts
    const { data: lockedAttempts, error: attemptsError } = await supabase
      .from('user_login_attempts')
      .select(`
        user_id,
        failed_attempts,
        locked,
        locked_by,
        locked_at,
        created_at
      `)
      .eq('locked', true);

    if (attemptsError) throw attemptsError;

    if (!lockedAttempts || lockedAttempts.length === 0) {
      console.log('📊 No locked users found');
      return res.status(200).json({
        success: true,
        data: [],
        meta: {
          total: 0,
          branch_filter: req.user.is_super_admin ? 'all' : req.user.branch_id
        }
      });
    }

    // ✅ Get user IDs from locked attempts
    const userIds = lockedAttempts.map(attempt => attempt.user_id);

    // ✅ Get profiles for these users with branch filtering
    let query = supabase
      .from('profiles')
      .select(`
        id,
        employee_id,
        first_name,
        middle_name,
        last_name,
        role,
        status,
        branch_id,
        created_at,
        updated_at
      `)
      .in('id', userIds);

    // ✅ Filter by branch for non-super admins
    if (!req.user.is_super_admin) {
      query = query.eq('branch_id', req.user.branch_id);
    }

    const { data: profiles, error: profilesError } = await query;

    if (profilesError) throw profilesError;

    // ✅ Filter out admin accounts for non-super admins
    let filteredProfiles = profiles || [];
    
    if (!req.user.is_super_admin) {
      filteredProfiles = filteredProfiles.filter(profile => {
        if (profile.role === 'Admin' || profile.role === 'Super Admin') {
          return false;
        }
        return true;
      });
    }

    // ✅ Combine profile data with login attempt data
    const usersWithDetails = await Promise.all(
      filteredProfiles.map(async (profile) => {
        const attempt = lockedAttempts.find(a => a.user_id === profile.id);
        
        // Get email from auth.users
        let email = 'N/A';
        try {
          const { data: authData } = await supabase.auth.admin.getUserById(profile.id);
          if (authData?.user?.email) {
            email = authData.user.email;
          }
        } catch (authErr) {
          console.warn(`Could not fetch email for user ${profile.id}:`, authErr.message);
        }

        // Get locked_by user info if exists
        let lockedByName = 'System';
        if (attempt?.locked_by) {
          try {
            const { data: lockedByUser } = await supabase
              .from('profiles')
              .select('employee_id, first_name, last_name')
              .eq('id', attempt.locked_by)
              .single();
            
            if (lockedByUser) {
              lockedByName = `${lockedByUser.first_name} ${lockedByUser.last_name} (${lockedByUser.employee_id})`;
            }
          } catch (err) {
            console.warn(`Could not fetch locked_by info:`, err.message);
          }
        }

        return {
          userId: profile.id,
          user: {
            id: profile.id,
            employee_id: profile.employee_id,
            first_name: profile.first_name || 'Unknown',
            middle_name: profile.middle_name || '',
            last_name: profile.last_name || 'User',
            email: email,
            role: profile.role || 'Employee',
            branch_id: profile.branch_id,
            status: profile.status
          },
          lockedAt: attempt?.locked_at || null,
          lockedBy: attempt?.locked_by || null,
          lockedByName: lockedByName,
          failedAttempts: attempt?.failed_attempts || 0,
          isLocked: attempt?.locked || false
        };
      })
    );

    res.status(200).json({
      success: true,
      data: usersWithDetails,
      meta: {
        total: usersWithDetails.length,
        branch_filter: req.user.is_super_admin ? 'all' : req.user.branch_id,
        user_role: req.user.role,
        is_super_admin: req.user.is_super_admin
      }
    });
  } catch (error) {
    console.error('❌ Error getting locked users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get locked users',
      error: error.message
    });
  }
});

// ✅ Unlock a user account (with branch check)
router.post('/unlock/unlock-user', async (req, res) => {
  console.log(`🔓 POST /unlock/unlock-user called by: ${req.user.employee_id}`);
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // ✅ Check if user exists and get their branch/role
    const { data: targetUser, error: userError } = await supabase
      .from('profiles')
      .select('branch_id, role, employee_id, status, first_name, last_name')
      .eq('id', userId)
      .single();

    if (userError || !targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // ✅ Non-super admins cannot unlock admin accounts
    if (!req.user.is_super_admin && (targetUser.role === 'Admin' || targetUser.role === 'Super Admin')) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to unlock admin accounts'
      });
    }

    // ✅ Non-super admins can only unlock users in their branch
    if (!req.user.is_super_admin && targetUser.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to unlock users from other branches'
      });
    }

    // ✅ Check if user is actually locked in login_attempts
    const { data: attemptData, error: attemptError } = await supabase
      .from('user_login_attempts')
      .select('locked')
      .eq('user_id', userId)
      .single();

    if (attemptError) {
      // If no record exists, create one
      await supabase
        .from('user_login_attempts')
        .insert({
          user_id: userId,
          failed_attempts: 0,
          locked: false,
          locked_at: null,
          locked_by: null
        });
    } else if (!attemptData.locked) {
      return res.status(400).json({
        success: false,
        message: 'User is not locked'
      });
    }

    // ✅ Update user_login_attempts - unlock
    const { error: updateAttemptError } = await supabase
      .from('user_login_attempts')
      .update({
        locked: false,
        locked_at: null,
        locked_by: null,
        failed_attempts: 0,
        last_failed_at: null
      })
      .eq('user_id', userId);

    if (updateAttemptError) throw updateAttemptError;

    // ✅ Update profiles table status to Active
    const { error: updateProfileError } = await supabase
      .from('profiles')
      .update({
        status: 'Active',
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateProfileError) throw updateProfileError;

    // Create notification for the unlocked user
    await supabase.from('notifications').insert({
      recipient_id: userId,
      type: 'system',
      text: `✅ Your account has been unlocked by ${req.user.employee_id}. You can now log in again.`,
      read: false
    });

    await logAuditEvent({
      req,
      userId,
      action: 'Account Unlocked',
      systemCategory: 'Auth',
      logDescription: `Unlocked account for ${targetUser.employee_id} (${targetUser.first_name} ${targetUser.last_name}) by ${req.user.employee_id}`,
      branch: req.user.branch_id,
      performed_by: req.user.employee_id
    });

    res.status(200).json({
      success: true,
      message: 'User account unlocked successfully'
    });
  } catch (error) {
    console.error('❌ Error unlocking user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unlock user account',
      error: error.message
    });
  }
});

// ✅ Lock a user account (with branch check)
router.post('/lock-user', async (req, res) => {
  console.log(`🔒 POST /lock-user called by: ${req.user.employee_id}`);
  try {
    const { userId, reason } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // ✅ Check if user exists and get their branch/role
    const { data: targetUser, error: userError } = await supabase
      .from('profiles')
      .select('branch_id, role, employee_id, status, first_name, last_name')
      .eq('id', userId)
      .single();

    if (userError || !targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // ✅ Non-super admins cannot lock admin accounts
    if (!req.user.is_super_admin && (targetUser.role === 'Admin' || targetUser.role === 'Super Admin')) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to lock admin accounts'
      });
    }

    // ✅ Non-super admins can only lock users in their branch
    if (!req.user.is_super_admin && targetUser.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to lock users from other branches'
      });
    }

    // ✅ Prevent locking yourself
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot lock your own account'
      });
    }

    // ✅ Check if user is already locked
    const { data: attemptData } = await supabase
      .from('user_login_attempts')
      .select('locked')
      .eq('user_id', userId)
      .single();

    if (attemptData?.locked) {
      return res.status(400).json({
        success: false,
        message: 'User is already locked'
      });
    }

    // ✅ Update or insert user_login_attempts - lock
    const now = new Date().toISOString();
    
    const { error: upsertError } = await supabase
      .from('user_login_attempts')
      .upsert({
        user_id: userId,
        locked: true,
        locked_at: now,
        locked_by: req.user.id,
        failed_attempts: 0,
        last_failed_at: null
      }, {
        onConflict: 'user_id'
      });

    if (upsertError) throw upsertError;

    // ✅ Update profiles table status to Locked
    const { error: updateProfileError } = await supabase
      .from('profiles')
      .update({
        status: 'Locked',
        updated_at: now
      })
      .eq('id', userId);

    if (updateProfileError) throw updateProfileError;

    // Create notification for the locked user
    await supabase.from('notifications').insert({
      recipient_id: userId,
      type: 'alert',
      text: `⚠️ Your account has been locked by ${req.user.employee_id}.${reason ? ` Reason: ${reason}` : ''} Please contact support.`,
      read: false
    });

    await logAuditEvent({
      req,
      userId,
      action: 'Account Locked',
      systemCategory: 'Auth',
      logDescription: `Locked account for ${targetUser.employee_id} (${targetUser.first_name} ${targetUser.last_name}) by ${req.user.employee_id}${reason ? ` - Reason: ${reason}` : ''}`,
      branch: req.user.branch_id,
      performed_by: req.user.employee_id
    });

    res.status(200).json({
      success: true,
      message: 'User account locked successfully'
    });
  } catch (error) {
    console.error('❌ Error locking user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to lock user account',
      error: error.message
    });
  }
});

// Reset failed attempts
router.post('/reset-attempts', async (req, res) => {
  console.log(`🔄 POST /reset-attempts called by: ${req.user.employee_id}`);
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // ✅ Check if user has permission
    const { data: targetUser, error: userError } = await supabase
      .from('profiles')
      .select('branch_id, role')
      .eq('id', userId)
      .single();

    if (userError || !targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!req.user.is_super_admin && targetUser.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to reset attempts for this user'
      });
    }
    
    const { data, error } = await supabase
      .from('user_login_attempts')
      .update({
        failed_attempts: 0,
        last_failed_at: null
      })
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;

    await logAuditEvent({
      req,
      userId,
      action: 'Updated',
      systemCategory: 'Auth',
      logDescription: `Reset failed login attempts for ${userId} by ${req.user.employee_id}`,
      branch: req.user.branch_id,
      performed_by: req.user.employee_id
    });
    
    res.status(200).json({
      success: true,
      message: 'Failed attempts reset successfully'
    });
  } catch (error) {
    console.error('Error resetting attempts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset attempts',
      error: error.message
    });
  }
});

// ✅ Get locked users count (for dashboard)
router.get('/locked-count', async (req, res) => {
  try {
    // ✅ Get locked users from user_login_attempts
    let query = supabase
      .from('user_login_attempts')
      .select('user_id, locked, profiles!inner(branch_id, role)')
      .eq('locked', true);

    const { data: lockedAttempts, error } = await query;

    if (error) throw error;

    let count = lockedAttempts?.length || 0;

    // ✅ Filter by branch for non-super admins
    if (!req.user.is_super_admin && lockedAttempts) {
      const filtered = lockedAttempts.filter(attempt => {
        const profile = attempt.profiles;
        if (!profile) return false;
        if (profile.role === 'Admin' || profile.role === 'Super Admin') return false;
        return profile.branch_id === req.user.branch_id;
      });
      count = filtered.length;
    }

    res.json({
      success: true,
      count: count,
      meta: {
        branch_filter: req.user.is_super_admin ? 'all' : req.user.branch_id
      }
    });
  } catch (error) {
    console.error("Error counting locked users:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;