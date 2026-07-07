const express = require("express");
const router = express.Router();
const PDFDocument = require("pdfkit");
const supabase = require("../../supabase");

/**
 * GET /api/admin/audit-logs
 *
 * Query Params:
 * limit
 * search
 * category
 * action
 * startDate
 * endDate
 */

router.get("/audit-logs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 200;

    const search = (req.query.search || "").trim();
    const category = (req.query.category || "").trim();
    const action = (req.query.action || "").trim();
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    let query = supabase
      .from("audit_logs")
      .select(
        "id,user_id,action,system_category,log_description,created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

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
        .select("id,first_name,middle_name,last_name,role")
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

    const logs = (data || []).map((log) => ({
      id: log.id,
      user: profileMap.get(log.user_id) || "System",
      action: log.action || "",
      category: log.system_category || "",
      desc: log.log_description || "",
      text: `${log.action} - ${log.log_description}`,
      time: log.created_at,
    }));

    res.json({
      success: true,
      data: logs,
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
 * GET /api/admin/audit-logs/export
 *
 * Exports filtered logs as PDF
 */

router.get("/audit-logs/export", async (req, res) => {
  try {
    const search = (req.query.search || "").trim();
    const category = (req.query.category || "").trim();
    const action = (req.query.action || "").trim();
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    let query = supabase
      .from("audit_logs")
      .select(
        "id,user_id,action,system_category,log_description,created_at"
      )
      .order("created_at", { ascending: false });

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
        .select("id,first_name,middle_name,last_name,role")
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

    doc.fontSize(20).text("AUDIT LOG REPORT", {
      align: "center",
    });

    doc.moveDown();

    doc.fontSize(11);

    doc.text(`Generated: ${new Date().toLocaleString()}`);

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