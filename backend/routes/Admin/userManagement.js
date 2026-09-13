// routes/Admin/userManagement.js
const express = require("express");
const router = express.Router();
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
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

/**
 * GET /api/users/export?format=pdf|excel&status=...&search=...
 * Dual-format export: WEA-branded PDF or styled Excel for Admin User Accounts
 */
router.get("/export", async (req, res) => {
  try {
    const format = (req.query.format || 'pdf').toLowerCase();
    const status = (req.query.status || 'all').trim();
    const search = (req.query.search || '').trim();

    console.log(`📊 Admin User Accounts Export (${format}) requested by: ${req.user.employee_id} (${req.user.role})`);

    let query = supabase
      .from("profiles")
      .select(`
        *,
        branches:branch_id (
          name
        ),
        departments (
          department_name
        ),
        positions (
          position_name
        )
      `)
      .order("created_at", { ascending: false });

    if (!req.user.is_super_admin && req.user.branch_id) {
      query = query.eq("branch_id", req.user.branch_id);
    }

    const { data: profiles, error: profileError } = await query;
    if (profileError) throw profileError;

    let filteredProfiles = profiles || [];
    if (!req.user.is_super_admin) {
      filteredProfiles = filteredProfiles.filter(p => p.role !== 'Super Admin' && p.role !== 'Admin');
    }

    // Auth emails
    let emailMap = new Map();
    try {
      const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      if (authData?.users) {
        authData.users.forEach(u => emailMap.set(u.id, u.email || ''));
      }
    } catch (e) {
      console.warn("Could not batch-fetch auth emails for export:", e.message);
    }

    const allUsers = filteredProfiles.map(p => {
      const fullName = `${p.first_name || ''} ${p.middle_name ? p.middle_name + ' ' : ''}${p.last_name || ''}`.trim() || 'N/A';
      const email = emailMap.get(p.id) || p.email || '—';
      const branchName = p.branches?.name || '—';
      const departmentName = p.departments?.department_name || '—';
      const positionName = p.positions?.position_name || '—';
      const createdDate = p.created_at ? new Date(p.created_at).toISOString().split('T')[0] : '—';
      return {
        id: p.id,
        employee_id: p.employee_id || '—',
        name: fullName,
        email,
        role: p.role || 'Employee',
        department: departmentName,
        position: positionName,
        branch_name: branchName,
        status: p.status || 'Active',
        created: createdDate,
      };
    });

    // Apply filter and search
    let rows = allUsers;
    if (status !== 'all') {
      rows = rows.filter(u => u.status.toLowerCase() === status.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        u.employee_id.toLowerCase().includes(q) ||
        u.branch_name.toLowerCase().includes(q)
      );
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const branchLabel = req.user.is_super_admin ? 'All Branches' : `Branch: ${req.user.branch_id}`;

    // ── EXCEL ──────────────────────────────────────────────────────────────────
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'WEA Resource Management System';
      workbook.created = new Date();

      const ws = workbook.addWorksheet('User Accounts', {
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
        { header: 'Employee ID',   width: 18, align: 'center' },
        { header: 'Full Name',     width: 26, align: 'left'   },
        { header: 'Email Address', width: 30, align: 'left'   },
        { header: 'System Role',   width: 20, align: 'left'   },
        { header: 'Department',    width: 22, align: 'left'   },
        { header: 'Position',      width: 24, align: 'left'   },
        { header: 'Branch',        width: 20, align: 'left'   },
        { header: 'Status',        width: 16, align: 'center' },
        { header: 'Created Date',  width: 16, align: 'center' },
      ];

      ws.columns = cols.map(c => ({ width: c.width }));
      const tc = cols.length;

      // Row 1 – Title
      ws.mergeCells(1, 1, 1, tc);
      const t = ws.getCell(1, 1);
      t.value = 'WEA  •  USER ACCOUNTS DIRECTORY';
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
      sub.value = `Generated ${new Date().toLocaleString()}      ${branchLabel}   |   Filter: ${status === 'all' ? 'All Status' : status}   |   Total Accounts: ${rows.length}`;
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
        const values = [
          row.employee_id,
          row.name,
          row.email,
          row.role,
          row.department,
          row.position,
          row.branch_name,
          row.status,
          row.created,
        ];
        values.forEach((val, ci) => {
          const cell = dr.getCell(ci + 1);
          cell.value = val;
          cell.font = { size: 10, name: 'Calibri' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseFill } };
          cell.alignment = { vertical: 'middle', horizontal: cols[ci].align, indent: 1 };
          cell.border = { top: { style: 'hair', color: { argb: C.border } }, bottom: { style: 'hair', color: { argb: C.border } }, left: { style: 'thin', color: { argb: C.outer } }, right: { style: 'thin', color: { argb: C.outer } } };

          // Status column styling
          if (ci === 7) {
            cell.font = { bold: true, size: 10, name: 'Calibri' };
            if (val === 'Active') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
              cell.font = { bold: true, size: 10, color: { argb: 'FF166534' }, name: 'Calibri' };
            } else if (val === 'Locked') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
              cell.font = { bold: true, size: 10, color: { argb: 'FF991B1B' }, name: 'Calibri' };
            } else if (val === 'Deactivated') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
              cell.font = { bold: true, size: 10, color: { argb: 'FF92400E' }, name: 'Calibri' };
            }
          }
        });
        dr.height = 19;
      });

      ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: tc } };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=WEA_UserAccounts_${dateStr}.xlsx`);
      const buffer = await workbook.xlsx.writeBuffer();
      return res.send(buffer);
    }

    // ── PDF ──────────────────────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 35, size: 'A4', bufferPages: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=WEA_UserAccounts_${dateStr}.pdf`);
    doc.pipe(res);

    const drawHdr = (first) => {
      doc.rect(0, 0, 595.28, first ? 50 : 30).fill('#0b1220');
      doc.rect(0, first ? 50 : 30, 595.28, 3).fill('#f5b700');
      doc.fillColor('#ffffff').fontSize(first ? 12.5 : 9).font('Helvetica-Bold')
         .text(first ? 'WEA  •  RESOURCE MANAGEMENT SYSTEM' : 'WEA  •  USER ACCOUNTS DIRECTORY (CONT.)', 35, first ? 14 : 9);
      if (first) {
        doc.fillColor('#94a3b8').fontSize(8.5).font('Helvetica').text('USER ACCOUNTS DIRECTORY', 35, 30);
        doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text('CONFIDENTIAL  |  INTERNAL REPORT', 35, 20, { width: 525, align: 'right' });
      }
    };

    drawHdr(true);
    doc.roundedRect(35, 64, 525, 22, 3).fill('#f1f5f9');
    doc.fillColor('#475569').fontSize(8).font('Helvetica');
    doc.text(`Generated: ${new Date().toLocaleString()}   |   ${branchLabel}   |   Filter: ${status === 'all' ? 'All Status' : status}   |   Total: ${rows.length}`, 45, 70, { width: 505, align: 'left' });

    const tableCols = [
      { header: 'Employee ID',   x: 35,  w: 75,  align: 'left'   },
      { header: 'Full Name',     x: 110, w: 95,  align: 'left'   },
      { header: 'Email Address', x: 205, w: 120, align: 'left'   },
      { header: 'Role',          x: 325, w: 75,  align: 'left'   },
      { header: 'Branch',        x: 400, w: 65,  align: 'left'   },
      { header: 'Status',        x: 465, w: 60,  align: 'center' },
    ];

    const drawTblHdr = (y) => {
      doc.rect(35, y, 525, 18).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold');
      tableCols.forEach(col => doc.text(col.header, col.x + 2, y + 5, { width: col.w - 4, align: col.align }));
    };

    let tableY = 96;
    drawTblHdr(tableY);
    let y = tableY + 18;

    rows.forEach((row, idx) => {
      if (y > 780) {
        doc.addPage();
        drawHdr(false);
        drawTblHdr(42);
        y = 60;
      }
      if (idx % 2 === 1) doc.rect(35, y, 525, 16).fill('#f8fafc');
      doc.rect(35, y, 525, 16).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

      doc.fillColor('#1e293b').fontSize(6.8).font('Helvetica');
      doc.text(row.employee_id, 37, y + 4, { width: 71, align: 'left' });
      doc.font('Helvetica-Bold').text(row.name, 112, y + 4, { width: 91, align: 'left', lineBreak: false });
      doc.font('Helvetica').text(row.email, 207, y + 4, { width: 116, align: 'left', lineBreak: false });
      doc.text(row.role, 327, y + 4, { width: 71, align: 'left', lineBreak: false });
      doc.text(row.branch_name, 402, y + 4, { width: 61, align: 'left', lineBreak: false });

      // Status pill
      const stColor = row.status === 'Active' ? '#166534' : row.status === 'Locked' ? '#991b1b' : '#92400e';
      const stBg = row.status === 'Active' ? '#dcfce7' : row.status === 'Locked' ? '#fee2e2' : '#fef3c7';
      doc.roundedRect(470, y + 2, 50, 12, 2).fill(stBg);
      doc.fillColor(stColor).fontSize(6.5).font('Helvetica-Bold').text(row.status, 470, y + 4, { width: 50, align: 'center' });

      y += 16;
    });

    // Page numbering
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.rect(35, 815, 525, 0.5).fill('#cbd5e1');
      doc.fillColor('#94a3b8').fontSize(7).font('Helvetica')
         .text(`WEA Resource Management System  •  Generated on ${new Date().toLocaleDateString()}`, 35, 822);
      doc.text(`Page ${i + 1} of ${range.count}`, 35, 822, { width: 525, align: 'right' });
    }

    doc.end();
  } catch (err) {
    console.error("❌ Error exporting user accounts:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single user with email (with branch check)
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (id === 'export') return next();
    
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