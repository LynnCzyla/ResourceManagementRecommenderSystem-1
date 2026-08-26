const express = require("express");
const router = express.Router();
const PDFDocument = require("pdfkit");
const supabase = require("../../supabase");
const { verifyToken } = require('../Middleware/auth');

// ✅ Apply auth middleware to ALL routes
router.use(verifyToken);

/**
 * ✅ NEW: Resolve branch user IDs for branch filtering
 */
async function resolveBranchUserIds(branchId) {
  if (!branchId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("branch_id", branchId);

  if (error) throw error;

  return (data || []).map((p) => p.id);
}

/**
 * Resolves a `role` query param into a list of profile ids.
 */
async function resolveRoleUserIds(role) {
  if (!role) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", role);

  if (error) throw error;

  return (data || []).map((p) => p.id);
}

/**
 * GET /api/admin/audit-logs
 * 
 * For Admin users: Only shows logs from users in their branch
 * For Super Admin: Shows all logs
 */
router.get("/audit-logs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const search = (req.query.search || "").trim();
    const category = (req.query.category || "").trim();
    const action = (req.query.action || "").trim();
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const role = (req.query.role || "").trim();

    console.log(`📊 Audit Logs requested by: ${req.user.employee_id} (${req.user.role})`);
    console.log(`🏢 Branch filter: ${req.user.is_super_admin ? 'ALL' : req.user.branch_id}`);

    // ✅ For non-super admins, get users in their branch
    let branchUserIds = null;
    if (!req.user.is_super_admin && req.user.branch_id) {
      branchUserIds = await resolveBranchUserIds(req.user.branch_id);
      console.log(`📊 Found ${branchUserIds?.length || 0} users in branch`);
      
      // If no users in branch, return empty
      if (branchUserIds !== null && branchUserIds.length === 0) {
        return res.json({
          success: true,
          data: [],
          pagination: { page, limit, total: 0, totalPages: 1 },
          meta: {
            branch_filter: req.user.branch_id,
            user_role: req.user.role,
            is_super_admin: req.user.is_super_admin,
          }
        });
      }
    }

    // ✅ Resolve role user IDs if role filter is applied
    const roleUserIds = await resolveRoleUserIds(role);

    if (roleUserIds !== null && roleUserIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: { page, limit, total: 0, totalPages: 1 },
      });
    }

    let query = supabase
      .from("audit_logs")
      .select(
        "id,user_id,action,system_category,log_description,created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    // ✅ Apply branch filter for non-super admins
    if (branchUserIds !== null) {
      query = query.in("user_id", branchUserIds);
    }

    // ✅ Apply role filter
    if (roleUserIds !== null) {
      query = query.in("user_id", roleUserIds);
    }

    if (search) {
      query = query.or(
        `action.ilike.%${search}%,system_category.ilike.%${search}%,log_description.ilike.%${search}%`
      );
    }

    if (category) {
      query = query.eq("system_category", category);
    }

    if (action) {
      query = query.eq("action", action);
    }

    if (startDate) {
      query = query.gte("created_at", startDate);
    }

    if (endDate) {
      query = query.lte("created_at", `${endDate}T23:59:59`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    const userIds = [
      ...new Set((data || []).map((x) => x.user_id).filter(Boolean)),
    ];

    let profileMap = new Map();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,first_name,middle_name,last_name,role,employee_id")
        .in("id", userIds);

      profileMap = new Map(
        (profiles || []).map((profile) => [
          profile.id,
          {
            name:
              `${profile.first_name || ""} ${profile.middle_name || ""} ${profile.last_name || ""}`
                .replace(/\s+/g, " ")
                .trim() || profile.role || "System",
            role: profile.role || "N/A",
            employee_id: profile.employee_id || "",
          },
        ])
      );
    }

    const logs = (data || []).map((log) => {
      const profile = profileMap.get(log.user_id);
      return {
        id: log.id,
        user: profile?.name || "System",
        user_role: profile?.role || "N/A",
        employee_id: profile?.employee_id || "",
        action: log.action || "",
        category: log.system_category || "",
        desc: log.log_description || "",
        text: `${log.action} - ${log.log_description}`,
        time: log.created_at,
      };
    });

    res.json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
      },
      meta: {
        branch_filter: req.user.is_super_admin ? 'all' : req.user.branch_id,
        user_role: req.user.role,
        is_super_admin: req.user.is_super_admin,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/admin/audit-logs/filters
 */
router.get("/audit-logs/filters", async (req, res) => {
  try {
    const role = (req.query.role || "").trim();
    const roleUserIds = await resolveRoleUserIds(role);

    if (roleUserIds !== null && roleUserIds.length === 0) {
      return res.json({ success: true, data: { categories: [], actions: [] } });
    }

    let query = supabase
      .from("audit_logs")
      .select("action,system_category")
      .limit(1000);

    if (roleUserIds !== null) {
      query = query.in("user_id", roleUserIds);
    }

    const { data, error } = await query;

    if (error) throw error;

    const categories = [...new Set((data || []).map(r => r.system_category).filter(Boolean))].sort();
    const actions = [...new Set((data || []).map(r => r.action).filter(Boolean))].sort();

    res.json({ success: true, data: { categories, actions } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/audit-logs/export
 */
router.get("/audit-logs/export", async (req, res) => {
  try {
    const search = (req.query.search || "").trim();
    const category = (req.query.category || "").trim();
    const action = (req.query.action || "").trim();
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const role = (req.query.role || "").trim();

    console.log(`📊 Audit Logs Export requested by: ${req.user.employee_id} (${req.user.role})`);
    console.log(`🏢 Branch filter: ${req.user.is_super_admin ? 'ALL' : req.user.branch_id}`);

    // ✅ For non-super admins, get users in their branch
    let branchUserIds = null;
    if (!req.user.is_super_admin && req.user.branch_id) {
      branchUserIds = await resolveBranchUserIds(req.user.branch_id);
      if (branchUserIds !== null && branchUserIds.length === 0) {
        // No users in branch, return empty PDF
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", 'attachment; filename="AuditLogs.pdf"');
        const doc = new PDFDocument({ size: "A4", margin: 40 });
        doc.pipe(res);
        doc.fontSize(20).text("AUDIT LOG REPORT", { align: "center" });
        doc.moveDown();
        doc.fontSize(11).text("No matching audit log entries found for your branch.");
        doc.end();
        return;
      }
    }

    const roleUserIds = await resolveRoleUserIds(role);

    if (roleUserIds !== null && roleUserIds.length === 0) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="AuditLogs.pdf"');
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      doc.pipe(res);
      doc.fontSize(20).text("AUDIT LOG REPORT", { align: "center" });
      doc.moveDown();
      doc.fontSize(11).text("No matching audit log entries found.");
      doc.end();
      return;
    }

    let query = supabase
      .from("audit_logs")
      .select(
        "id,user_id,action,system_category,log_description,created_at"
      )
      .order("created_at", { ascending: false });

    // ✅ Apply branch filter for non-super admins
    if (branchUserIds !== null) {
      query = query.in("user_id", branchUserIds);
    }

    if (roleUserIds !== null) {
      query = query.in("user_id", roleUserIds);
    }

    if (search) {
      query = query.or(
        `action.ilike.%${search}%,system_category.ilike.%${search}%,log_description.ilike.%${search}%`
      );
    }

    if (category) {
      query = query.eq("system_category", category);
    }

    if (action) {
      query = query.eq("action", action);
    }

    if (startDate) {
      query = query.gte("created_at", startDate);
    }

    if (endDate) {
      query = query.lte("created_at", `${endDate}T23:59:59`);
    }

    const { data, error } = await query;

    if (error) throw error;

    const userIds = [
      ...new Set((data || []).map((x) => x.user_id).filter(Boolean)),
    ];

    let profileMap = new Map();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,first_name,middle_name,last_name,role,employee_id")
        .in("id", userIds);

      profileMap = new Map(
        (profiles || []).map((profile) => [
          profile.id,
          `${profile.first_name || ""} ${profile.middle_name || ""} ${profile.last_name || ""}`
            .replace(/\s+/g, " ")
            .trim() || profile.role || "System",
        ])
      );
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="AuditLogs.pdf"'
    );

    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
    });

    doc.pipe(res);

    doc.fontSize(20).text(role ? `${role.toUpperCase()} AUDIT LOG REPORT` : "AUDIT LOG REPORT", {
      align: "center",
    });

    doc.moveDown();

    doc.fontSize(11);

    doc.text(`Generated: ${new Date().toLocaleString()}`);
    doc.text(`Branch: ${req.user.is_super_admin ? 'All Branches' : req.user.branch_id}`);

    if (search)
      doc.text(`Search: ${search}`);

    if (category)
      doc.text(`Category: ${category}`);

    if (action)
      doc.text(`Action: ${action}`);

    if (startDate)
      doc.text(`From: ${startDate}`);

    if (endDate)
      doc.text(`To: ${endDate}`);

    doc.moveDown();

    data.forEach((log, index) => {
      const user = profileMap.get(log.user_id) || "System";

      doc
        .fontSize(12)
        .fillColor("#000")
        .text(`${index + 1}. ${log.action}`);

      doc
        .fontSize(10)
        .text(`User: ${user}`);

      doc.text(`Category: ${log.system_category}`);

      doc.text(`Description: ${log.log_description}`);

      doc.text(
        `Date: ${new Date(log.created_at).toLocaleString()}`
      );

      doc.moveDown();

      if (doc.y > 720) {
        doc.addPage();
      }

    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;