// backend/routes/Auth/login.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');
const jwt = require('jsonwebtoken');

const { getMaxLoginAttempts } = require('../../utils/loginAttempts');

// Get user ID from email — paginates through ALL users instead of only the
// first 50. supabase.auth.admin.listUsers() with no page/perPage params
// defaults to page 1 / 50 per page, so any user created after the first 50
// would silently fail to be found, causing a false "Invalid credentials".
const getUserIdByEmail = async (email) => {
  try {
    const perPage = 1000; // Supabase admin API max page size
    let page = 1;

    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });

      if (error) {
        console.error(error);
        return null;
      }

      const user = data.users.find(
        u => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (user) {
        console.log("Searching:", email);
        console.log("Found:", user.email);
        console.log("Found ID:", user.id);
        return user.id;
      }

      if (data.users.length < perPage) {
        console.log("Searching:", email);
        console.log("Found: (no match across all pages)");
        return null;
      }

      page++;
    }
  } catch (error) {
    console.error(error);
    return null;
  }
};

const getUserProfile = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, status, first_name, middle_name, last_name, employee_id')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
};

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

    return data?.role === 'Admin' || data?.role === 'Super Admin';
  } catch (error) {
    console.error('Error checking user role:', error);
    return false;
  }
};

const getUserLoginAttempts = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('user_login_attempts')
      .select('failed_attempts, locked')
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

    const { data: lockedUser } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', userId)
      .single();

    const userName = lockedUser
      ? `${lockedUser.first_name} ${lockedUser.last_name}`
      : 'A user';

    await supabase.from('notifications').insert({
      recipient_id: userId,
      type: 'alert',
      text: '⚠️ Your account has been locked due to too many failed login attempts. Please contact an administrator.',
      read: false
    });

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

    await logAuditEvent({
      userId,
      action: 'Account Locked',
      systemCategory: 'Auth',
      logDescription: `Account auto-locked after repeated failed login attempts for user ${userId}`,
    });

    return { success: true, data };
  } catch (error) {
    console.error('Error locking account:', error);
    return { success: false, error: error.message };
  }
};

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

    await logAuditEvent({
      userId,
      action: 'Updated',
      systemCategory: 'Auth',
      logDescription: `Reset failed login attempts for ${userId}`,
    });
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

    let userId = await getUserIdByEmail(email);

    console.log("================================");
    console.log("LOGIN ATTEMPT");
    console.log("Email:", email);
    console.log("User ID:", userId);

    if (!userId) {
      console.log(`❌ User not found: ${email}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // ✅ CHECK: Get user profile to check status
    const profile = await getUserProfile(userId);
    console.log("📋 Profile:", profile);

    // ✅ CHECK: If account is Inactive, deny login
    if (profile && (profile.status === 'Inactive' || profile.status === 'Deactivated')) {
      console.log(`❌ Account is Inactive/Deactivated for: ${email}`);
      
      await logAuditEvent({
        userId,
        action: 'Failed Login',
        systemCategory: 'Auth',
        logDescription: `Login attempt on INACTIVE account for ${email}`,
      });

      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
        inactive: true
      });
    }

    const attempts = await getUserLoginAttempts(userId);
    console.log("Attempts Record:", attempts);
    console.log("================================");

    const isAdmin = await isUserAdmin(userId);
    console.log(`👑 Is Admin: ${isAdmin} for ${email}`);

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

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      console.log(`❌ Auth failed for ${email}:`, authError.message);

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

      await logAuditEvent({
        userId: userId || null,
        action: 'Failed Login',
        systemCategory: 'Auth',
        logDescription: `Failed login attempt for ${email}`,
      });

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

    if (!isAdmin) {
      await resetLoginAttempts(authUserId);
    }

    // ✅ Get fresh profile data
    const profileData = await getUserProfile(authUserId);

    const userRole = profileData?.role || 'Employee';
    const userStatus = profileData?.status || 'Active';

    // ✅ Double-check status again after auth (safety check)
    if (userStatus === 'Inactive') {
      console.log(`❌ Account is Inactive/Deactivated for: ${email} (post-auth check)`);
      
      await logAuditEvent({
        userId: authUserId,
        action: 'Failed Login',
        systemCategory: 'Auth',
        logDescription: `Login attempt on INACTIVE account for ${email} (post-auth)`,
      });

      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
        inactive: true
      });
    }

    const user = {
      id: authData.user.id,
      name: profileData ?
        `${profileData.first_name} ${profileData.middle_name ? profileData.middle_name + ' ' : ''}${profileData.last_name}` :
        authData.user.email,
      email: authData.user.email,
      role: userRole,
      status: userStatus,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100',
      employee_id: profileData?.employee_id,
      profile: profileData || {},
      first_name: profileData?.first_name,
      last_name: profileData?.last_name,
      middle_name: profileData?.middle_name,
    };

    console.log(`🎉 Login successful for: ${email}`);

    await logAuditEvent({
      userId: authUserId,
      action: 'Login',
      systemCategory: 'Auth',
      logDescription: `User signed in successfully: ${email}`,
    });

    // Custom JWT with role embedded
    const token = jwt.sign(
      {
        sub: authData.user.id,
        email: authData.user.email,
        role: userRole,
        status: userStatus
      },
      process.env.SUPABASE_JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user,
      token: token,
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