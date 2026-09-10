// routes/Admin/userManagement.js
const express = require("express");
const router = express.Router();
const supabase = require("../../supabase");
const { logAuditEvent } = require('../../utils/auditLogger');
const { verifyToken, clearProfileCache } = require('../Middleware/auth');

// ✅ Apply verifyToken to ALL routes in this file
router.use(verifyToken);

// Get all users with email from auth.users (filtered by branch and role)
router.get("/", async (req, res) => {
  try {
    console.log(`👤 User Management request by: ${req.user.employee_id} (${req.user.role})`);
    console.log(`🏢 Branch: ${req.user.is_super_admin ? 'ALL' : req.user.branch_id}`);
    
    // ✅ Build query with branch filtering
    let query = supabase
      .from("profiles")
      .select(`
        *,
        branches:branch_id (
          name
        )
      `)
      .order("created_at", { ascending: false });
    
    // If not Super Admin, filter by branch
    if (!req.user.is_super_admin) {
      query = query.eq("branch_id", req.user.branch_id);
    }
    
    const { data: profiles, error: profileError } = await query;

    if (profileError) throw profileError;

    // ✅ Filter out admin accounts for non-super admins
    let filteredProfiles = profiles || [];
    
    if (!req.user.is_super_admin) {
      filteredProfiles = filteredProfiles.filter(profile => {
        if (profile.role === 'Super Admin') return false;
        if (profile.role === 'Admin') return false;
        return true;
      });
      
      console.log(`🔍 Filtered out admin accounts. Showing ${filteredProfiles.length} users`);
    }

    // Get emails for each user from auth
    const usersWithEmail = await Promise.all(
      filteredProfiles.map(async (profile) => {
        try {
          const { data: authData, error: authError } = await supabase.auth.admin.getUserById(profile.id);
          
          if (authError) {
            return { ...profile, email: '' };
          }
          
          return {
            ...profile,
            email: authData?.user?.email || ''
          };
        } catch (err) {
          return { ...profile, email: '' };
        }
      })
    );

    res.json({
      success: true,
      users: usersWithEmail,
      meta: {
        total: usersWithEmail.length,
        total_before_filter: profiles?.length || 0,
        branch_filter: req.user.is_super_admin ? 'all' : req.user.branch_id,
        user_role: req.user.role,
        user_branch: req.user.branch_id,
        is_super_admin: req.user.is_super_admin,
        roles_excluded: !req.user.is_super_admin ? ['Admin', 'Super Admin'] : []
      }
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single user with email (with branch check)
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (profileError) throw profileError;

    if (!req.user.is_super_admin && profile.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to view this user"
      });
    }

    if (!req.user.is_super_admin && (profile.role === 'Admin' || profile.role === 'Super Admin')) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to view admin accounts"
      });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(id);
    
    if (authError) throw authError;

    res.json({
      success: true,
      user: {
        ...profile,
        email: authData?.user?.email || ''
      }
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update user (with branch check and role restrictions)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      first_name,
      middle_name,
      last_name,
      role,
      email,
      branch_id,
      position_id
    } = req.body;

    const { data: existingProfile, error: checkError } = await supabase
      .from("profiles")
      .select("branch_id, employee_id, first_name, last_name, role")
      .eq("id", id)
      .single();

    if (checkError) throw checkError;

    if (!req.user.is_super_admin && (existingProfile.role === 'Admin' || existingProfile.role === 'Super Admin')) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to update admin accounts"
      });
    }

    if (!req.user.is_super_admin && existingProfile.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to update this user"
      });
    }

    if (!req.user.is_super_admin && role && (role === 'Admin' || role === 'Super Admin')) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to assign admin roles"
      });
    }

    if (branch_id && !req.user.is_super_admin) {
      return res.status(403).json({
        success: false,
        error: "Only Super Admin can change user's branch"
      });
    }

    const updateData = {
      first_name,
      middle_name: middle_name || null,
      last_name,
      role: role || "Employee",
      updated_at: new Date().toISOString()
    };

    if (position_id !== undefined) {
      updateData.position_id = position_id || null;
    }

    if (branch_id && req.user.is_super_admin) {
      updateData.branch_id = branch_id;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (profileError) throw profileError;

    if (email) {
      const { error: authError } = await supabase.auth.admin.updateUserById(id, {
        email: email
      });

      if (authError) throw authError;

      await logAuditEvent({
        req,
        userId: id,
        action: 'Updated',
        systemCategory: 'User Management',
        logDescription: `Updated user ${profileData.first_name} ${profileData.last_name}${email ? ` and email to ${email}` : ''}`,
        branch: req.user.branch_id,
        performed_by: req.user.employee_id
      });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(id);
    
    if (authError) throw authError;

    clearProfileCache(id);

    res.json({
      success: true,
      user: {
        ...profileData,
        email: authData?.user?.email || ''
      }
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ FIXED: Lock a user (updates BOTH profiles and user_login_attempts)
router.patch("/:id/lock", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    console.log(`🔒 Lock user request by: ${req.user.employee_id} for user: ${id}`);

    // Check if user exists
    const { data: existingProfile, error: checkError } = await supabase
      .from("profiles")
      .select("branch_id, employee_id, first_name, last_name, role, status")
      .eq("id", id)
      .single();

    if (checkError) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Non-super admins cannot lock Admin or Super Admin accounts
    if (!req.user.is_super_admin && (existingProfile.role === 'Admin' || existingProfile.role === 'Super Admin')) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to lock admin accounts"
      });
    }

    // Non-super admins can only lock users in their branch
    if (!req.user.is_super_admin && existingProfile.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to lock this user"
      });
    }

    // Prevent locking yourself
    if (id === req.user.id) {
      return res.status(400).json({
        success: false,
        error: "You cannot lock your own account"
      });
    }

    // Prevent locking if already locked
    if (existingProfile.status === 'Locked') {
      return res.status(400).json({
        success: false,
        error: "User is already locked"
      });
    }

    const now = new Date().toISOString();

    // ✅ 1. Update profiles table status to Locked
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        status: "Locked",
        updated_at: now
      })
      .eq("id", id);

    if (profileError) throw profileError;

    // ✅ 2. Update or insert into user_login_attempts
    const { error: attemptsError } = await supabase
      .from("user_login_attempts")
      .upsert({
        user_id: id,
        locked: true,
        locked_at: now,
        locked_by: req.user.id,
        failed_attempts: 0,
        last_failed_at: null
      }, {
        onConflict: 'user_id'
      });

    if (attemptsError) throw attemptsError;

    // Create notification for the locked user
    await supabase.from('notifications').insert({
      recipient_id: id,
      type: 'alert',
      text: `⚠️ Your account has been locked by ${req.user.employee_id}.${reason ? ` Reason: ${reason}` : ''} Please contact support.`,
      read: false
    });

    await logAuditEvent({
      req,
      userId: id,
      action: 'Locked',
      systemCategory: 'User Management',
      logDescription: `Locked user ${existingProfile.employee_id} (${existingProfile.first_name} ${existingProfile.last_name}) by ${req.user.employee_id}${reason ? ` - Reason: ${reason}` : ''}`,
      branch: req.user.branch_id,
      performed_by: req.user.employee_id
    });

    // Clear cached profile and invalidate Supabase session
    clearProfileCache(id);
    try {
      await supabase.auth.admin.signOut(id);
    } catch (soErr) {
      console.error('Non-fatal error signing out locked user:', soErr.message);
    }

    // Get updated user data
    const { data: updatedUser, error: fetchError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;

    res.json({
      success: true,
      message: "User locked successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error("Error locking user:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ FIXED: Unlock a user (updates BOTH profiles and user_login_attempts)
router.patch("/:id/unlock", async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🔓 Unlock user request by: ${req.user.employee_id} for user: ${id}`);

    // Check if user exists
    const { data: existingProfile, error: checkError } = await supabase
      .from("profiles")
      .select("branch_id, employee_id, first_name, last_name, role, status")
      .eq("id", id)
      .single();

    if (checkError) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Non-super admins cannot unlock Admin or Super Admin accounts
    if (!req.user.is_super_admin && (existingProfile.role === 'Admin' || existingProfile.role === 'Super Admin')) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to unlock admin accounts"
      });
    }

    // Non-super admins can only unlock users in their branch
    if (!req.user.is_super_admin && existingProfile.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to unlock this user"
      });
    }

    // Check if user is actually locked
    if (existingProfile.status !== 'Locked') {
      return res.status(400).json({
        success: false,
        error: "User is not locked"
      });
    }

    const now = new Date().toISOString();

    // ✅ 1. Update profiles table status to Active
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        status: "Active",
        updated_at: now
      })
      .eq("id", id);

    if (profileError) throw profileError;

    // ✅ 2. Update user_login_attempts - unlock
    const { error: attemptsError } = await supabase
      .from("user_login_attempts")
      .update({
        locked: false,
        locked_at: null,
        locked_by: null,
        failed_attempts: 0,
        last_failed_at: null
      })
      .eq("user_id", id);

    if (attemptsError) throw attemptsError;

    // Create notification for the unlocked user
    await supabase.from('notifications').insert({
      recipient_id: id,
      type: 'system',
      text: `✅ Your account has been unlocked by ${req.user.employee_id}. You can now log in again.`,
      read: false
    });

    await logAuditEvent({
      req,
      userId: id,
      action: 'Unlocked',
      systemCategory: 'User Management',
      logDescription: `Unlocked user ${existingProfile.employee_id} (${existingProfile.first_name} ${existingProfile.last_name}) by ${req.user.employee_id}`,
      branch: req.user.branch_id,
      performed_by: req.user.employee_id
    });

    // Clear cached profile
    clearProfileCache(id);

    // Get updated user data
    const { data: updatedUser, error: fetchError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;

    res.json({
      success: true,
      message: "User unlocked successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error("Error unlocking user:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ Keep the old status endpoint for Deactivation only (not Lock)
router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Only allow Active or Deactivated through this endpoint
    if (!status || !['Active', 'Deactivated'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status. Must be 'Active' or 'Deactivated'"
      });
    }

    const { data: existingProfile, error: checkError } = await supabase
      .from("profiles")
      .select("branch_id, employee_id, first_name, last_name, role")
      .eq("id", id)
      .single();

    if (checkError) throw checkError;

    if (!req.user.is_super_admin && (existingProfile.role === 'Admin' || existingProfile.role === 'Super Admin')) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to update admin accounts"
      });
    }

    if (!req.user.is_super_admin && existingProfile.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to update this user"
      });
    }

    // ✅ If setting to Active, also sync user_login_attempts
    if (status === 'Active') {
      await supabase
        .from("user_login_attempts")
        .update({
          locked: false,
          locked_at: null,
          locked_by: null,
          failed_attempts: 0,
          last_failed_at: null
        })
        .eq("user_id", id);
    }

    const { data, error } = await supabase
      .from("profiles")
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Clear cached profile and invalidate Supabase session if deactivated
    clearProfileCache(id);
    if (status === 'Deactivated') {
      try {
        await supabase.auth.admin.signOut(id);
      } catch (soErr) {
        console.error('Non-fatal error signing out deactivated user:', soErr.message);
      }
    }

    await logAuditEvent({
      req,
      userId: id,
      action: 'Updated',
      systemCategory: 'User Management',
      logDescription: `Updated account status for user ${existingProfile.employee_id} to ${status}`,
      branch: req.user.branch_id,
      performed_by: req.user.employee_id
    });

    res.json({
      success: true,
      user: data
    });
  } catch (error) {
    console.error("Error updating user status:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete user (with branch check and role restrictions)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { hard_delete } = req.query;

    const { data: existingProfile, error: checkError } = await supabase
      .from("profiles")
      .select("branch_id, employee_id, first_name, last_name, role")
      .eq("id", id)
      .single();

    if (checkError) throw checkError;

    if (!req.user.is_super_admin && (existingProfile.role === 'Admin' || existingProfile.role === 'Super Admin')) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to delete admin accounts"
      });
    }

    if (!req.user.is_super_admin && existingProfile.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to delete this user"
      });
    }

    if (id === req.user.id) {
      return res.status(400).json({
        success: false,
        error: "You cannot delete your own account"
      });
    }

    if (hard_delete === "true") {
      const { error: authError } = await supabase.auth.admin.deleteUser(id);
      if (authError) throw authError;
      
      await logAuditEvent({
        req,
        userId: id,
        action: 'Deleted',
        systemCategory: 'User Management',
        logDescription: `Permanently deleted user ${existingProfile.employee_id}`,
        branch: req.user.branch_id,
        performed_by: req.user.employee_id
      });

      res.json({
        success: true,
        message: "User permanently deleted"
      });
    } else {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          status: "Deactivated",
          updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      
      await logAuditEvent({
        req,
        userId: id,
        action: 'Deleted',
        systemCategory: 'User Management',
        logDescription: `Deactivated user ${existingProfile.employee_id}`,
        branch: req.user.branch_id,
        performed_by: req.user.employee_id
      });

      res.json({
        success: true,
        message: "User deactivated",
        user: data
      });
    }
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get users by branch (Super Admin only)
router.get("/by-branch/:branchId", async (req, res) => {
  try {
    const { branchId } = req.params;
    
    if (!req.user.is_super_admin) {
      return res.status(403).json({
        success: false,
        error: "Only Super Admin can view users by branch"
      });
    }

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const usersWithEmail = await Promise.all(
      (profiles || []).map(async (profile) => {
        try {
          const { data: authData } = await supabase.auth.admin.getUserById(profile.id);
          return {
            ...profile,
            email: authData?.user?.email || ''
          };
        } catch {
          return {
            ...profile,
            email: ''
          };
        }
      })
    );

    res.json({
      success: true,
      users: usersWithEmail,
      meta: {
        total: usersWithEmail.length,
        branch_id: branchId
      }
    });
  } catch (error) {
    console.error("Error fetching users by branch:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all admins (Super Admin only)
router.get("/admins/all", async (req, res) => {
  try {
    if (!req.user.is_super_admin) {
      return res.status(403).json({
        success: false,
        error: "Only Super Admin can view all admins"
      });
    }

    const { data: admins, error } = await supabase
      .from("profiles")
      .select("*")
      .in('role', ['Admin', 'Super Admin'])
      .order("created_at", { ascending: false });

    if (error) throw error;

    const adminsWithEmail = await Promise.all(
      (admins || []).map(async (admin) => {
        try {
          const { data: authData } = await supabase.auth.admin.getUserById(admin.id);
          return {
            ...admin,
            email: authData?.user?.email || ''
          };
        } catch {
          return {
            ...admin,
            email: ''
          };
        }
      })
    );

    res.json({
      success: true,
      admins: adminsWithEmail,
      meta: {
        total: adminsWithEmail.length
      }
    });
  } catch (error) {
    console.error("Error fetching admins:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;