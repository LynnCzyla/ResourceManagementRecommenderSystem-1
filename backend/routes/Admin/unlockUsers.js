// backend/routes/Admin/unlockUsers.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const {
  unlockUserAccount,
  lockUserAccount,
  getLockedUsers,
  getUserLoginAttempts
} = require('../../utils/loginAttempts');

// Get all locked users
router.get('/locked-users', async (req, res) => {
  try {
    const lockedUsers = await getLockedUsers();
    
    // Get user details for each locked user
    const usersWithDetails = await Promise.all(
      lockedUsers.map(async (item) => {
        const { data: userData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, role')
          .eq('id', item.user_id)
          .single();
        
        return {
          userId: item.user_id,
          user: userData,
          lockedAt: item.locked_at,
          lockedBy: item.locked_by,
          failedAttempts: item.failed_attempts
        };
      })
    );
    
    res.status(200).json({
      success: true,
      data: usersWithDetails
    });
  } catch (error) {
    console.error('Error getting locked users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get locked users'
    });
  }
});

// Unlock a user account
router.post('/unlock-user', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    const result = await unlockUserAccount(userId);
    
    if (result.success) {
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
      message: 'Failed to unlock user account'
    });
  }
});

// Lock a user account (admin manual lock)
router.post('/lock-user', async (req, res) => {
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
      message: 'Failed to lock user account'
    });
  }
});

// Reset failed attempts for a user (without unlocking if locked)
router.post('/reset-attempts', async (req, res) => {
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
    
    res.status(200).json({
      success: true,
      message: 'Failed attempts reset successfully'
    });
  } catch (error) {
    console.error('Error resetting attempts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset attempts'
    });
  }
});

module.exports = router;