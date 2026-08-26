// routes/Admin/userManagement.js
const express = require("express");
const router = express.Router();
const supabase = require("../../supabase");
const { logAuditEvent } = require('../../utils/auditLogger');
const { verifyToken } = require('../Middleware/auth');

// ✅ Apply verifyToken to ALL routes in this file
router.use(verifyToken);

// Get all users with email from auth.users (filtered by branch)
router.get("/", async (req, res) => {
  try {
    console.log(`👤 User Management request by: ${req.user.employee_id} (${req.user.role})`);
    console.log(`🏢 Branch: ${req.user.is_super_admin ? 'ALL' : req.user.branch_id}`);
    
    // ✅ Apply branch filtering based on user role
    let query = supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    
    // If not Super Admin, filter by branch
    if (!req.user.is_super_admin) {
      query = query.eq("branch_id", req.user.branch_id);
    }
    
    const { data: profiles, error: profileError } = await query;

    if (profileError) throw profileError;

    // Get emails for each user from auth
    const usersWithEmail = await Promise.all(
      (profiles || []).map(async (profile) => {
        try {
          const { data: authData, error: authError } = await supabase.auth.admin.getUserById(profile.id);
          
          if (authError) {
            console.warn(`Could not fetch email for user ${profile.id}:`, authError.message);
            return {
              ...profile,
              email: ''
            };
          }
          
          return {
            ...profile,
            email: authData?.user?.email || ''
          };
        } catch (err) {
          console.warn(`Error fetching auth data for user ${profile.id}:`, err.message);
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
        branch_filter: req.user.is_super_admin ? 'all' : req.user.branch_id,
        user_role: req.user.role,
        user_branch: req.user.branch_id
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
    
    // Get profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (profileError) throw profileError;

    // ✅ Check if user has access to this profile's branch
    if (!req.user.is_super_admin && profile.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to view this user"
      });
    }

    // Get email from auth
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

// Update user (with branch check)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      first_name,
      middle_name,
      last_name,
      role,
      email,
      branch_id
    } = req.body;

    // ✅ Check if user has permission to update this profile
    const { data: existingProfile, error: checkError } = await supabase
      .from("profiles")
      .select("branch_id, employee_id, first_name, last_name")
      .eq("id", id)
      .single();

    if (checkError) throw checkError;

    // Non-super admins can only update users in their branch
    if (!req.user.is_super_admin && existingProfile.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to update this user"
      });
    }

    // Only Super Admin can change branch
    if (branch_id && !req.user.is_super_admin) {
      return res.status(403).json({
        success: false,
        error: "Only Super Admin can change user's branch"
      });
    }

    // Update profile
    const updateData = {
      first_name,
      middle_name: middle_name || null,
      last_name,
      role: role || "Employee",
      updated_at: new Date().toISOString()
    };

    // Only Super Admin can change branch
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

    // Get updated user with email
    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(id);
    
    if (authError) throw authError;

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

// Update user status only (with branch check)
router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['Active', 'Deactivated'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status. Must be 'Active' or 'Deactivated'"
      });
    }

    // ✅ Check if user has permission to update this profile
    const { data: existingProfile, error: checkError } = await supabase
      .from("profiles")
      .select("branch_id, employee_id, first_name, last_name")
      .eq("id", id)
      .single();

    if (checkError) throw checkError;

    // Non-super admins can only update users in their branch
    if (!req.user.is_super_admin && existingProfile.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to update this user"
      });
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

// Delete user (with branch check)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { hard_delete } = req.query;

    // ✅ Check if user has permission to delete this profile
    const { data: existingProfile, error: checkError } = await supabase
      .from("profiles")
      .select("branch_id, employee_id, first_name, last_name")
      .eq("id", id)
      .single();

    if (checkError) throw checkError;

    // Non-super admins can only delete users in their branch
    if (!req.user.is_super_admin && existingProfile.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to delete this user"
      });
    }

    // Prevent deleting yourself
    if (id === req.user.id) {
      return res.status(400).json({
        success: false,
        error: "You cannot delete your own account"
      });
    }

    if (hard_delete === "true") {
      // Hard delete - remove from auth and profiles
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
      // Soft delete - just update status
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
    
    // Only Super Admin can view users by branch
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

    // Get emails for each user
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

module.exports = router;