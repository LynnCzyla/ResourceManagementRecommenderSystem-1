// backend/utils/loginAttempts.js
const supabase = require('../supabase');

// ✅ FIXED: Cache with pending promise lock to prevent stampede
let cachedMaxAttempts = 5;
let lastFetchTime = 0;
let pendingAttemptsPromise = null;

/**
 * Get the max login attempts from system settings (with caching)
 * ✅ FIXED: No more cache stampede
 */
const getMaxLoginAttempts = async () => {
  const now = Date.now();
  const isStale = now - lastFetchTime > 5 * 60 * 1000;
  
  // If there's already a pending fetch, wait for it
  if (pendingAttemptsPromise) {
    console.log('⏳ Waiting for pending max attempts fetch...');
    return pendingAttemptsPromise;
  }
  
  // If cache is fresh, return cached value
  if (!isStale) {
    return cachedMaxAttempts;
  }
  
  // Set lastFetchTime BEFORE the query starts to prevent stampede
  lastFetchTime = now;
  
  // Create the pending promise
  pendingAttemptsPromise = (async () => {
    try {
      console.log('🔄 Fetching max login attempts from database...');
      
      const { data, error } = await supabase
        .from('system_settings')
        .select('max_login_attempts')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (!error && data && data.length > 0) {
        cachedMaxAttempts = data[0].max_login_attempts;
        console.log(`✅ Max login attempts cached: ${cachedMaxAttempts}`);
      } else {
        // If error or no data, keep existing cached value
        console.warn('⚠️ No max login attempts found, using cached value:', cachedMaxAttempts);
      }
      
      return cachedMaxAttempts;
    } catch (error) {
      console.error('❌ Error fetching max login attempts:', error);
      // Roll back lastFetchTime so next request retries
      lastFetchTime = 0;
      return cachedMaxAttempts;
    } finally {
      pendingAttemptsPromise = null;
    }
  })();
  
  return pendingAttemptsPromise;
};

/**
 * ✅ NEW: Clear the cache (for admin use)
 */
const clearMaxAttemptsCache = () => {
  lastFetchTime = 0;
  pendingAttemptsPromise = null;
  console.log('🧹 Max login attempts cache cleared');
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
    
    const maxAttempts = await getMaxLoginAttempts(); // ✅ Now cached
    
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
    const maxAttempts = await getMaxLoginAttempts(); // ✅ Now cached
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
    console.log('🔍 getLockedUsers() called');
    
    // First, get all locked user IDs from user_login_attempts
    const { data: lockedUsers, error } = await supabase
      .from('user_login_attempts')
      .select('user_id, locked_by, locked_at, failed_attempts')
      .eq('locked', true);
    
    if (error) {
      console.error('❌ Error in getLockedUsers:', error);
      return [];
    }
    
    if (!lockedUsers || lockedUsers.length === 0) {
      console.log('ℹ️ No locked users found');
      return [];
    }
    
    console.log(`📊 Found ${lockedUsers.length} locked users`);
    
    // Get user IDs
    const userIds = lockedUsers.map(item => item.user_id);
    console.log('📊 User IDs:', userIds);
    
    // First, try to fetch from profiles table
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, first_name, middle_name, last_name, email, role')
      .in('id', userIds);
    
    if (profileError) {
      console.error('❌ Error fetching profiles:', profileError);
    }
    
    // Create a map of user_id to profile
    const profileMap = {};
    if (profiles) {
      profiles.forEach(profile => {
        profileMap[profile.id] = profile;
      });
    }
    
    // For users without profiles, try to get from auth.users
    const usersWithoutProfiles = userIds.filter(id => !profileMap[id]);
    
    if (usersWithoutProfiles.length > 0) {
      console.log(`📊 ${usersWithoutProfiles.length} users don't have profiles, fetching from auth.users`);
      
      // Get from auth.users using the admin API
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      
      if (!authError && authUsers) {
        authUsers.users.forEach(authUser => {
          // Check if this user ID is in our list of users without profiles
          if (usersWithoutProfiles.includes(authUser.id)) {
            // Create a profile-like object from auth user data
            const userMetadata = authUser.user_metadata || {};
            profileMap[authUser.id] = {
              id: authUser.id,
              first_name: userMetadata.first_name || userMetadata.full_name?.split(' ')[0] || 'Unknown',
              middle_name: userMetadata.middle_name || '',
              last_name: userMetadata.last_name || userMetadata.full_name?.split(' ').slice(1).join(' ') || 'User',
              email: authUser.email || 'N/A',
              role: userMetadata.role || 'Employee'
            };
          }
        });
      }
    }
    
    // Combine the data
    const result = lockedUsers.map(item => {
      const profile = profileMap[item.user_id];
      return {
        user_id: item.user_id,
        locked_by: item.locked_by,
        locked_at: item.locked_at,
        failed_attempts: item.failed_attempts,
        user: profile || null
      };
    });
    
    console.log(`✅ Returning ${result.length} users with profiles`);
    return result;
    
  } catch (error) {
    console.error('❌ Error getting locked users:', error);
    return [];
  }
};

module.exports = {
  getMaxLoginAttempts,
  clearMaxAttemptsCache, // ✅ NEW: Export cache clear function
  getUserLoginAttempts,
  isUserLocked,
  lockUserAccount,
  unlockUserAccount,
  recordFailedAttempt,
  resetLoginAttempts,
  getRemainingAttempts,
  getLockedUsers
};