// routes/Admin/contactAdmin.js
const express = require("express");
const router = express.Router();
const supabase = require("../../supabase");
const { logAuditEvent } = require('../../utils/auditLogger');
const { verifyToken } = require('../Middleware/auth');

// ============================================
// ✅ PROTECTED ROUTES (Auth required)
// ============================================

// Apply verifyToken to all routes in this router
router.use(verifyToken);

// GET /api/admin/contact-requests — fetch all contact requests (filtered by branch)
router.get("/contact-requests", async (req, res) => {
  try {
    console.log(`📊 Contact requests requested by: ${req.user.employee_id} (${req.user.role})`);
    console.log(`🏢 Branch filter: ${req.user.is_super_admin ? 'ALL' : req.user.branch_id}`);

    let query = supabase
      .from("contact_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (!req.user.is_super_admin && req.user.branch_id) {
      query = query.eq("branch_id", req.user.branch_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ 
      success: true, 
      requests: data || [],
      meta: {
        branch_filter: req.user.is_super_admin ? 'all' : req.user.branch_id,
        user_role: req.user.role,
        is_super_admin: req.user.is_super_admin,
      }
    });
  } catch (error) {
    console.error("Error fetching contact requests:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/contact-requests/:id — get single request
router.get("/contact-requests/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("contact_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    if (!req.user.is_super_admin && data.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to view this request"
      });
    }

    res.json({ success: true, request: data });
  } catch (error) {
    console.error("Error fetching contact request:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/admin/contact-requests/:id/status — update status
router.patch("/contact-requests/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const { data: existingRequest, error: checkError } = await supabase
      .from("contact_requests")
      .select("branch_id")
      .eq("id", id)
      .single();

    if (checkError) throw checkError;

    if (!req.user.is_super_admin && existingRequest.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to update this request"
      });
    }

    const { data, error } = await supabase
      .from("contact_requests")
      .update({
        status: status || "Pending",
        processed_by: req.user.id,
        processed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await logAuditEvent({
      req,
      userId: req.user.id,
      action: 'Updated',
      systemCategory: 'Contact Requests',
      logDescription: `Updated contact request ${id} to ${status}`,
      branch: req.user.branch_id,
      performed_by: req.user.employee_id
    });

    res.json({ success: true, request: data });
  } catch (error) {
    console.error("Error updating contact request status:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/admin/contact-requests/:id — delete a request
router.delete("/contact-requests/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existingRequest, error: checkError } = await supabase
      .from("contact_requests")
      .select("branch_id")
      .eq("id", id)
      .single();

    if (checkError) throw checkError;

    if (!req.user.is_super_admin && existingRequest.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to delete this request"
      });
    }

    const { error } = await supabase
      .from("contact_requests")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await logAuditEvent({
      req,
      userId: req.user.id,
      action: 'Deleted',
      systemCategory: 'Contact Requests',
      logDescription: `Deleted contact request ${id}`,
      branch: req.user.branch_id,
      performed_by: req.user.employee_id
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting contact request:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/contact-requests/count — get count by status (filtered by branch)
router.get("/contact-requests/count", async (req, res) => {
  try {
    let query = supabase
      .from("contact_requests")
      .select("status", { count: 'exact', head: true });

    if (!req.user.is_super_admin && req.user.branch_id) {
      query = query.eq("branch_id", req.user.branch_id);
    }

    const { count, error } = await query;

    if (error) throw error;

    let pendingQuery = supabase
      .from("contact_requests")
      .select("status", { count: 'exact', head: true })
      .eq("status", "Pending");

    if (!req.user.is_super_admin && req.user.branch_id) {
      pendingQuery = pendingQuery.eq("branch_id", req.user.branch_id);
    }

    const { count: pendingCount } = await pendingQuery;

    res.json({
      success: true,
      data: {
        total: count || 0,
        pending: pendingCount || 0,
      }
    });
  } catch (error) {
    console.error("Error counting contact requests:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;