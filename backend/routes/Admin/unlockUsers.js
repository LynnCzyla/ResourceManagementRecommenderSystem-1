// backend/routes/Admin/unlockUsers.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');
const {
  unlockUserAccount,
  lockUserAccount,
  getLockedUsers,
  getUserLoginAttempts
} = require('../../utils/loginAttempts');

// Add a test route
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Unlock routes are working!'
  });
});

// Get all locked users
router.get('/locked-users', async (req, res) => {
  console.log('🔍 GET /locked-users endpoint called');
  
  try {
    console.log('📊 Calling getLockedUsers()...');
    const lockedUsers = await getLockedUsers();
    console.log(`📊 Found ${lockedUsers.length} locked users`);
    
    // Transform the data for the frontend
    const usersWithDetails = lockedUsers.map(item => {
      const user = item.user || {};
      return {
        userId: item.user_id,
        user: {
          id: user.id,
          first_name: user.first_name || 'Unknown',
          last_name: user.last_name || 'User',
          email: user.email || 'N/A',
          role: user.role || 'Employee'
        },
        lockedAt: item.locked_at,
        lockedBy: item.locked_by,
        failedAttempts: item.failed_attempts || 0
      };
    });
    
    console.log('✅ Sending response with', usersWithDetails.length, 'users');
    
    res.status(200).json({
      success: true,
      data: usersWithDetails
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

// Unlock a user account
router.post('/unlock/unlock-user', async (req, res) => {
  console.log('🔓 POST /unlock/unlock-user endpoint called');
  try {
    const { userId } = req.body;
    console.log('📝 Unlocking user:', userId);
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    const result = await unlockUserAccount(userId);
    console.log('✅ Unlock result:', result);
    
    if (result.success) {
      // Create notification for the unlocked user
      await supabase.from('notifications').insert({
        recipient_id: userId,
        type: 'alert',
        text: 'Your account has been unlocked by an administrator.',
        read: false 
      });

      await logAuditEvent({
        req,
        userId,
        action: 'Account Unlocked',
        systemCategory: 'Auth',
        logDescription: `Unlocked account for ${userId}`,
      });

      res.status(200).json({
        success: true,
        message: 'User account unlocked successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || 'Failed to unlock user account'
      });
    }
  } catch (error) {
    console.error('Error unlocking user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unlock user account',
      error: error.message
    });
  }
});

// Lock a user account
  router.post('/lock-user', async (req, res) => {
    console.log('🔒 POST /lock-user endpoint called');
    try {
      const { userId, adminId } = req.body;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }
      
      const result = await lockUserAccount(userId, adminId, 'admin');
      
      if (result.success) {
        // ✅ ADD THIS — notify the locked user
        await supabase.from('notifications').insert({
          recipient_id: userId,
          type: 'alert',
          text: '⚠️ Your account has been locked by an administrator. Please contact support.'
        });

        await logAuditEvent({
          req,
          userId,
          action: 'Account Locked',
          systemCategory: 'Auth',
          logDescription: `Locked account for ${userId}`,
        });

        res.status(200).json({
          success: true,
          message: 'User account locked successfully'
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.error || 'Failed to lock user account'
        });
      }
    } catch (error) {
      console.error('Error locking user:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to lock user account',
        error: error.message
      });
    }
  });

// Reset failed attempts
router.post('/reset-attempts', async (req, res) => {
  console.log('🔄 POST /reset-attempts endpoint called');
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
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
      logDescription: `Reset failed login attempts for ${userId}`,
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

module.exports = router;