const express = require("express");
const router = express.Router();
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
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
 * GET /api/admin/audit-logs/export?format=pdf|excel
 * Dual-format export: WEA-branded PDF or styled Excel
 */
router.get("/audit-logs/export", async (req, res) => {
  try {
    const format = (req.query.format || 'pdf').toLowerCase();
    const search = (req.query.search || "").trim();
    const category = (req.query.category || "").trim();
    const action = (req.query.action || "").trim();
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const role = (req.query.role || "").trim();

    console.log(`📊 Audit Logs Export (${format}) requested by: ${req.user.employee_id} (${req.user.role})`);

    // ✅ For non-super admins, get users in their branch
    let branchUserIds = null;
    if (!req.user.is_super_admin && req.user.branch_id) {
      branchUserIds = await resolveBranchUserIds(req.user.branch_id);
      if (branchUserIds !== null && branchUserIds.length === 0) {
        branchUserIds = [];
      }
    }

    const roleUserIds = await resolveRoleUserIds(role);
    if (roleUserIds !== null && roleUserIds.length === 0) {
      branchUserIds = [];
    }

    let query = supabase
      .from("audit_logs")
      .select("id,user_id,action,system_category,log_description,created_at")
      .order("created_at", { ascending: false });

    if (branchUserIds !== null) query = query.in("user_id", branchUserIds);
    if (roleUserIds !== null) query = query.in("user_id", roleUserIds);
    if (search) query = query.or(`action.ilike.%${search}%,system_category.ilike.%${search}%,log_description.ilike.%${search}%`);
    if (category) query = query.eq("system_category", category);
    if (action) query = query.eq("action", action);
    if (startDate) query = query.gte("created_at", startDate);
    if (endDate) query = query.lte("created_at", `${endDate}T23:59:59`);

    const { data, error } = await query;
    if (error) throw error;

    const userIds = [...new Set((data || []).map((x) => x.user_id).filter(Boolean))];
    let profileMap = new Map();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,first_name,middle_name,last_name,role,employee_id")
        .in("id", userIds);

      (profiles || []).forEach((p) => {
        const name = `${p.first_name || ""} ${p.middle_name || ""} ${p.last_name || ""}`.replace(/\s+/g, " ").trim() || p.employee_id || "System";
        profileMap.set(p.id, { name, role: p.role || "—", employeeId: p.employee_id || "—" });
      });
    }

    const rows = (data || []).map(log => {
      const profile = profileMap.get(log.user_id) || { name: 'System', role: '—', employeeId: '—' };
      return {
        timestamp: new Date(log.created_at).toLocaleString(),
        actor: profile.name,
        role: profile.role,
        action: log.action || '—',
        category: log.system_category || '—',
        desc: log.log_description || '—',
      };
    });

    const dateStr = new Date().toISOString().split('T')[0];
    const branchLabel = req.user.is_super_admin ? 'All Branches' : `Branch: ${req.user.branch_id}`;

    // ── EXCEL ────────────────────────────────────────────────────────────────
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'WEA Resource Management System';
      workbook.created = new Date();

      const ws = workbook.addWorksheet('Audit Trail', {
        views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
      });

      const C = {
        titleBg: 'FF0B1220', titleText: 'FFFFFFFF', accent: 'FFF5B700',
        subBg: 'FFF1F5F9', subText: 'FF475569',
        headerBg: 'FF1E3A5F', headerText: 'FFFFFFFF',
        rowEven: 'FFFFFFFF', rowOdd: 'FFF6F8FA',
        border: 'FFD9DEE4', outer: 'FF1E3A5F',
      };

      const cols = [
        { header: 'Timestamp',   width: 22, align: 'left'   },
        { header: 'Actor',       width: 24, align: 'left'   },
        { header: 'Role',        width: 20, align: 'left'   },
        { header: 'Action',      width: 22, align: 'left'   },
        { header: 'Category',    width: 20, align: 'center' },
        { header: 'Description', width: 46, align: 'left', wrap: true },
      ];

      ws.columns = cols.map(c => ({ width: c.width }));
      const tc = cols.length;

      // Row 1 – Title
      ws.mergeCells(1, 1, 1, tc);
      const t = ws.getCell(1, 1);
      t.value = 'WEA  •  ACTIVITY & AUDIT TRAIL REPORT';
      t.font = { bold: true, size: 15, color: { argb: C.titleText }, name: 'Calibri' };
      t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(1).height = 30;
      ws.getRow(1).eachCell({ includeEmpty: true }, c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.titleBg } }; });

      // Row 2 – Accent
      ws.mergeCells(2, 1, 2, tc);
      ws.getRow(2).height = 4;
      ws.getRow(2).eachCell({ includeEmpty: true }, c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.accent } }; });

      // Row 3 – Subtitle
      ws.mergeCells(3, 1, 3, tc);
      const sub = ws.getCell(3, 1);
      sub.value = `Generated ${new Date().toLocaleString()}      ${branchLabel}   |   Total Records: ${rows.length}`;
      sub.font = { italic: true, size: 10, color: { argb: C.subText }, name: 'Calibri' };
      sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(3).height = 20;
      ws.getRow(3).eachCell({ includeEmpty: true }, c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.subBg } }; });

      ws.getRow(4).height = 8;

      // Row 5 – Header
      const hr = ws.getRow(5);
      cols.forEach((col, i) => {
        const cell = hr.getCell(i + 1);
        cell.value = col.header;
        cell.font = { bold: true, size: 11, color: { argb: C.headerText }, name: 'Calibri' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } };
        cell.alignment = { vertical: 'middle', horizontal: col.align, indent: 1 };
        cell.border = { top: { style: 'thin', color: { argb: C.outer } }, bottom: { style: 'medium', color: { argb: C.outer } }, left: { style: 'thin', color: { argb: C.outer } }, right: { style: 'thin', color: { argb: C.outer } } };
      });
      hr.height = 24;

      rows.forEach((row, idx) => {
        const dr = ws.getRow(6 + idx);
        const baseFill = idx % 2 === 0 ? C.rowEven : C.rowOdd;
        const values = [row.timestamp, row.actor, row.role, row.action, row.category, row.desc];
        values.forEach((val, ci) => {
          const cell = dr.getCell(ci + 1);
          cell.value = val;
          cell.font = { size: 10, name: 'Calibri' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseFill } };
          cell.alignment = { vertical: 'middle', horizontal: cols[ci].align, wrapText: !!cols[ci].wrap, indent: 1 };
          cell.border = { top: { style: 'hair', color: { argb: C.border } }, bottom: { style: 'hair', color: { argb: C.border } }, left: { style: 'thin', color: { argb: C.outer } }, right: { style: 'thin', color: { argb: C.outer } } };
        });
        dr.height = 18;
      });

      ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: tc } };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=WEA_AuditTrail_${dateStr}.xlsx`);
      const buffer = await workbook.xlsx.writeBuffer();
      return res.send(buffer);
    }

    // ── PDF ──────────────────────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 35, size: 'A4', bufferPages: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=WEA_AuditTrail_${dateStr}.pdf`);
    doc.pipe(res);

    const drawHdr = (first) => {
      doc.rect(0, 0, 595.28, first ? 50 : 30).fill('#0b1220');
      doc.rect(0, first ? 50 : 30, 595.28, 3).fill('#f5b700');
      doc.fillColor('#ffffff').fontSize(first ? 12.5 : 9).font('Helvetica-Bold')
         .text(first ? 'WEA  •  RESOURCE MANAGEMENT SYSTEM' : 'WEA  •  ACTIVITY & AUDIT TRAIL REPORT (CONT.)', 35, first ? 14 : 9);
      if (first) {
        doc.fillColor('#94a3b8').fontSize(8.5).font('Helvetica').text('ACTIVITY & AUDIT TRAIL REPORT', 35, 30);
        doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text('CONFIDENTIAL  |  INTERNAL REPORT', 35, 20, { width: 525, align: 'right' });
      }
    };

    drawHdr(true);
    doc.roundedRect(35, 64, 525, 22, 3).fill('#f1f5f9');
    doc.fillColor('#475569').fontSize(8).font('Helvetica');
    doc.text(`Generated: ${new Date().toLocaleString()}   |   ${branchLabel}   |   Records: ${rows.length}`, 45, 70, { width: 505, align: 'left' });

    const tableCols = [
      { header: 'Timestamp',   x: 35,  w: 95, align: 'left'   },
      { header: 'Actor',       x: 130, w: 85, align: 'left'   },
      { header: 'Role',        x: 215, w: 70, align: 'left'   },
      { header: 'Action',      x: 285, w: 75, align: 'left'   },
      { header: 'Category',    x: 360, w: 60, align: 'center' },
      { header: 'Description', x: 420, w: 140, align: 'left'  },
    ];

    const drawTblHdr = (y) => {
      doc.rect(35, y, 525, 18).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold');
      tableCols.forEach(col => doc.text(col.header, col.x + 2, y + 5, { width: col.w - 4, align: col.align }));
    };

    let tableY = 96;
    drawTblHdr(tableY);
    let y = tableY + 18;

    rows.forEach((row, i) => {
      const vals = [row.timestamp, row.actor, row.role, row.action, row.category, row.desc];
      if (y + 17 > 800) {
        doc.addPage();
        drawHdr(false);
        tableY = 42;
        drawTblHdr(tableY);
        y = tableY + 18;
      }
      doc.rect(35, y, 525, 17).fill(i % 2 === 0 ? '#ffffff' : '#f8fafc');
      doc.lineWidth(0.4).strokeColor('#e2e8f0').moveTo(35, y + 17).lineTo(560, y + 17).stroke();
      doc.fillColor('#334155').fontSize(6.5).font('Helvetica');
      tableCols.forEach((col, ci) => {
        doc.text(String(vals[ci] || '—'), col.x + 2, y + 4, { width: col.w - 4, align: col.align, lineBreak: false, ellipsis: true });
      });
      y += 17;
    });

    doc.lineWidth(1).strokeColor('#1e3a5f').rect(35, tableY, 525, y - tableY).stroke();

    const pr = doc.bufferedPageRange();
    for (let p = pr.start; p < pr.start + pr.count; p++) {
      doc.switchToPage(p);
      doc.lineWidth(0.5).strokeColor('#e2e8f0').moveTo(35, 808).lineTo(560, 808).stroke();
      doc.fillColor('#94a3b8').fontSize(7).font('Helvetica')
         .text(`WEA Resource Management System  •  Generated ${new Date().toLocaleDateString()}`, 35, 814, { align: 'left' });
      doc.fillColor('#94a3b8').fontSize(7).font('Helvetica')
         .text(`Page ${p + 1} of ${pr.count}`, 35, 814, { width: 525, align: 'right' });
    }

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

module.exports = router;
