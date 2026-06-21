// backend/utils/loginAttempts.js
const supabase = require('../supabase');

/**
 * Get the max login attempts from system settings
 */
const getMaxLoginAttempts = async () => {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('max_login_attempts')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) throw error;
    
    if (data && data.length > 0) {
      return data[0].max_login_attempts;
    }
    return 5; // Default
  } catch (error) {
    console.error('Error fetching max login attempts:', error);
    return 5;
  }
};

/**
 * Get login attempts for a specific user
 */
const getUserLoginAttempts = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('user_login_attempts')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching user login attempts:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching user login attempts:', error);
    return null;
  }
};

/**
 * Check if a user's account is locked
 */
const isUserLocked = async (userId) => {
  try {
    const attempts = await getUserLoginAttempts(userId);
    
    if (!attempts) {
      return { locked: false, remainingAttempts: 0 };
    }
    
    // Check if account is locked by admin
    if (attempts.locked) {
      return { 
        locked: true, 
        message: 'Account has been locked by an administrator. Please contact support.',
        lockedBy: attempts.locked_by,
        lockedAt: attempts.locked_at,
        reason: 'admin_locked'
      };
    }
    
    const maxAttempts = await getMaxLoginAttempts();
    
    // Check if attempts exceed max (auto-lock)
    if (attempts.failed_attempts >= maxAttempts) {
      // Auto-lock the account
      await lockUserAccount(userId, null, 'auto');
      
      return { 
        locked: true, 
        message: 'Account has been locked due to too many failed login attempts. Please contact an administrator.',
        reason: 'auto_locked'
      };
    }
    
    const remainingAttempts = maxAttempts - attempts.failed_attempts;
    return { 
      locked: false, 
      remainingAttempts,
      attemptCount: attempts.failed_attempts,
      maxAttempts
    };
  } catch (error) {
    console.error('Error checking user lock status:', error);
    return { locked: false, remainingAttempts: 0 };
  }
};

/**
 * Lock a user account (by admin or auto)
 */
const lockUserAccount = async (userId, lockedBy = null, reason = 'admin') => {
  try {
    const { data, error } = await supabase
      .from('user_login_attempts')
      .update({
        locked: true,
        locked_by: lockedBy,
        locked_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    
    console.log(`🔒 Account locked for user ${userId} (Reason: ${reason})`);
    return { success: true, data };
  } catch (error) {
    console.error('Error locking account:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Unlock a user account (by admin only)
 */
const unlockUserAccount = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('user_login_attempts')
      .update({
        locked: false,
        locked_by: null,
        locked_at: null,
        failed_attempts: 0,
        last_failed_at: null
      })
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    
    console.log(`🔓 Account unlocked for user ${userId}`);
    return { success: true, data };
  } catch (error) {
    console.error('Error unlocking account:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Record a failed login attempt for a user
 */
const recordFailedAttempt = async (userId) => {
  try {
    const maxAttempts = await getMaxLoginAttempts();
    const existing = await getUserLoginAttempts(userId);
    
    if (existing) {
      const newCount = existing.failed_attempts + 1;
      
      const { data, error } = await supabase
        .from('user_login_attempts')
        .update({
          failed_attempts: newCount,
          last_failed_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) throw error;
      
      // Auto-lock if attempts exceed max
      if (newCount >= maxAttempts) {
        await lockUserAccount(userId, null, 'auto');
      }
      
      return {
        success: true,
        attemptCount: newCount,
        maxAttempts,
        locked: newCount >= maxAttempts,
        remainingAttempts: Math.max(0, maxAttempts - newCount)
      };
    } else {
      // Create new record
      const { data, error } = await supabase
        .from('user_login_attempts')
        .insert({
          user_id: userId,
          failed_attempts: 1,
          last_failed_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) throw error;
      
      return {
        success: true,
        attemptCount: 1,
        maxAttempts,
        locked: false,
        remainingAttempts: maxAttempts - 1
      };
    }
  } catch (error) {
    console.error('Error recording failed attempt:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Reset login attempts for a user (on successful login)
 */
const resetLoginAttempts = async (userId) => {
  try {
    const { error } = await supabase
      .from('user_login_attempts')
      .update({
        failed_attempts: 0,
        last_failed_at: null
      })
      .eq('user_id', userId);
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error resetting login attempts:', error);
    }
  } catch (error) {
    console.error('Error resetting login attempts:', error);
  }
};

/**
 * Get remaining attempts for a user
 */
const getRemainingAttempts = async (userId) => {
  try {
    const status = await isUserLocked(userId);
    if (status.locked) {
      return 0;
    }
    return status.remainingAttempts || 0;
  } catch (error) {
    console.error('Error getting remaining attempts:', error);
    return 0;
  }
};

/**
 * Get all locked users (for admin)
 */
const getLockedUsers = async () => {
  try {
    const { data, error } = await supabase
      .from('user_login_attempts')
      .select(`
        user_id,
        locked,
        locked_by,
        locked_at,
        failed_attempts,
        users:user_id (email, role)
      `)
      .eq('locked', true);
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting locked users:', error);
    return [];
  }
};

module.exports = {
  getMaxLoginAttempts,
  getUserLoginAttempts,
  isUserLocked,
  lockUserAccount,
  unlockUserAccount,
  recordFailedAttempt,
  resetLoginAttempts,
  getRemainingAttempts,
  getLockedUsers
};