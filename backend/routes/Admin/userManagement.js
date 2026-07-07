// routes/Admin/userManagement.js
const express = require("express");
const router = express.Router();
const supabase = require("../../supabase");
const { logAuditEvent } = require('../../utils/auditLogger');

// Get all users with email from auth.users
router.get("/", async (req, res) => {
  try {
    // First get all profiles
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (profileError) throw profileError;

    // Then get emails for each user from auth
    const usersWithEmail = await Promise.all(
      profiles.map(async (profile) => {
        const { data: authData, error: authError } = await supabase.auth.admin.getUserById(profile.id);
        
        return {
          ...profile,
          email: authData?.user?.email || ''
        };
      })
    );

    res.json({
      success: true,
      users: usersWithEmail
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single user with email
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

// Update user (email update requires special handling)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      first_name,
      middle_name,
      last_name,
      role,
      email // email might be included
    } = req.body;

    // Update profile
    const updateData = {
      first_name,
      middle_name: middle_name || null,
      last_name,
      role: role || "Employee",
      updated_at: new Date().toISOString()
    };

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

// Update user status only
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
      logDescription: `Updated account status for user ${id} to ${status}`,
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

// Delete user
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { hard_delete } = req.query;

    if (hard_delete === "true") {
      // Hard delete - remove from auth and profiles
      const { error: authError } = await supabase.auth.admin.deleteUser(id);
      if (authError) throw authError;
      
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
        logDescription: `Deleted user account for ${id}${hard_delete === 'true' ? ' (permanent)' : ' (deactivated)'}`,
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

module.exports = router;