// backend/routes/Auth/login.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

// Get max login attempts from system settings
const getMaxLoginAttempts = async () => {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('max_login_attempts')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) throw error;
    return data && data.length > 0 ? data[0].max_login_attempts : 5;
  } catch (error) {
    console.error('Error fetching max login attempts:', error);
    return 5;
  }
};

// Get user ID from email
const getUserIdByEmail = async (email) => {
    try {
      const { data, error } = await supabase.auth.admin.listUsers();
  
      if (error) {
        console.error(error);
        return null;
      }
  
      const user = data.users.find(
        u => u.email?.toLowerCase() === email.toLowerCase()
      );
  
      console.log("Searching:", email);
      console.log("Found:", user?.email);
      console.log("Found ID:", user?.id);
  
      return user?.id || null;
    } catch (error) {
      console.error(error);
      return null;
    }
  };

// Check if user is Admin
const isUserAdmin = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('Error checking user role:', error);
      return false;
    }
    
    return data?.role === 'Admin';
  } catch (error) {
    console.error('Error checking user role:', error);
    return false;
  }
};

// Get user login attempts
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

// Lock user account (ONLY for non-admin)
const lockUserAccount = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('user_login_attempts')
      .update({
        locked: true,
        locked_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    console.log(`🔒 Account locked for user: ${userId}`);

    // ✅ Get the locked user's name
    const { data: lockedUser } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', userId)
      .single();

    const userName = lockedUser
      ? `${lockedUser.first_name} ${lockedUser.last_name}`
      : 'A user';

    // ✅ Notify the locked user
    await supabase.from('notifications').insert({
      recipient_id: userId,
      type: 'alert',
      text: '⚠️ Your account has been locked due to too many failed login attempts. Please contact an administrator.',
      read: false
    });

    // ✅ Notify all admins
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'Admin');

    if (admins && admins.length > 0) {
      const adminNotifications = admins.map(admin => ({
        recipient_id: admin.id,
        type: 'alert',
        text: `🔒 ${userName}'s account has been auto-locked due to 5 failed login attempts.`,
        read: false
      }));

      await supabase.from('notifications').insert(adminNotifications);
      console.log(`✅ Notified ${admins.length} admin(s) about account lock`);
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error locking account:', error);
    return { success: false, error: error.message };
  }
};

// Record failed attempt (ONLY for non-admin)
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
      
      if (newCount >= maxAttempts) {
        await lockUserAccount(userId);
      }
      
      return {
        success: true,
        attemptCount: newCount,
        maxAttempts,
        locked: newCount >= maxAttempts,
        remainingAttempts: Math.max(0, maxAttempts - newCount)
      };
    } else {
      const { data, error } = await supabase
        .from('user_login_attempts')
        .insert({
          user_id: userId,
          failed_attempts: 1,
          last_failed_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error creating login attempts record:', error);
        return { success: false, error: error.message };
      }
      
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
    return { success: false, error: error.message };
  }
};

// Reset login attempts (ONLY for non-admin)
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

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    console.log(`🔐 Login attempt for: ${email}`);

    // Step 1: Get user ID from email
    let userId = await getUserIdByEmail(email);

    console.log("================================");
    console.log("LOGIN ATTEMPT");
    console.log("Email:", email);
    console.log("User ID:", userId);

    const attempts = await getUserLoginAttempts(userId);

    console.log("Attempts Record:", attempts);
    console.log("================================");
    
    if (!userId) {
      console.log(`❌ User not found: ${email}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Step 2: Check if user is Admin
    const isAdmin = await isUserAdmin(userId);
    console.log(`👑 Is Admin: ${isAdmin} for ${email}`);

    // Step 3: ONLY check lock for NON-ADMIN users
    if (!isAdmin) {
      const attempts = await getUserLoginAttempts(userId);
      
      if (attempts && attempts.locked === true) {
        console.log(`🔒 Account locked for: ${email}`);
        return res.status(403).json({
          success: false,
          message: 'Account is locked. Please contact an administrator.',
          locked: true
        });
      }
    } else {
      console.log(`👑 Admin login - skipping lock check for: ${email}`);
    }

    // Step 4: Attempt login with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      console.log(`❌ Auth failed for ${email}:`, authError.message);
      
      // Step 5: ONLY track failed attempts for NON-ADMIN users
      if (!isAdmin) {
        await recordFailedAttempt(userId);
        const updatedAttempts = await getUserLoginAttempts(userId);
        
        if (updatedAttempts && updatedAttempts.locked === true) {
          return res.status(403).json({
            success: false,
            message: 'Account is locked. Please contact an administrator.',
            locked: true
          });
        }
      } else {
        console.log(`👑 Admin failed login - not tracking: ${email}`);
      }
      
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (!authData.user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const authUserId = authData.user.id;
    console.log(`✅ Auth successful for: ${email}, User ID: ${authUserId}`);

    // Step 6: ONLY reset attempts for NON-ADMIN users
    if (!isAdmin) {
      await resetLoginAttempts(authUserId);
    }

    // Step 7: Get user profile
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUserId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.warn('Profile fetch warning:', profileError);
    }

    const userRole = profileData?.role || 'Employee';

    // Step 8: Create user object
    const user = {
      id: authData.user.id,
      name: profileData ?
        `${profileData.first_name} ${profileData.middle_name ? profileData.middle_name + ' ' : ''}${profileData.last_name}` :
        authData.user.email,
      email: authData.user.email,
      role: userRole,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100',
      employee_id: profileData?.employee_id,
      profile: profileData || {},
      first_name: profileData?.first_name,
      last_name: profileData?.last_name,
      middle_name: profileData?.middle_name,
    };

    console.log(`🎉 Login successful for: ${email}`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user,
      session: authData.session
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during login. Please try again.'
    });
  }
});

module.exports = router;