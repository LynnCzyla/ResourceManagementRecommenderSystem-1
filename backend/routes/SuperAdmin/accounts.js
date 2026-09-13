// backend/routes/SuperAdmin/accounts.js
// Manages ALL user accounts (not just admins)

const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const supabase = require('../../supabase');
const { clearProfileCache } = require('../Middleware/auth');

// GET /api/superadmin/accounts
// Now shows ALL user accounts, not just admins
router.get('/accounts', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = (req.query.search || '').trim();
    const role = req.query.role;
    const status = req.query.status;
    const branchId = req.query.branch_id;
    const showLocked = req.query.locked;

    let query = supabase
      .from('profiles')
      .select(`
        *,
        branches:profiles_branch_id_fkey (
          id,
          name,
          location,
          status
        )
      `, { count: 'exact' });

    // Apply filters
    if (status) query = query.eq('status', status);
    if (role) query = query.eq('role', role);
    if (branchId) query = query.eq('branch_id', branchId);
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_id.ilike.%${search}%`
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: profiles, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);
    
    if (error) throw error;

    // Get emails from auth.users for all profiles
    const profileIds = (profiles || []).map((p) => p.id);
    let emailMap = new Map();
    
    if (profileIds.length > 0) {
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      
      if (!authError && authUsers) {
        authUsers.users.forEach(user => {
          emailMap.set(user.id, user.email);
        });
      }
    }

    // Get login attempt data for lock status
    let lockMap = new Map();
    if (profileIds.length > 0) {
      const { data: loginAttempts, error: loginError } = await supabase
        .from('user_login_attempts')
        .select('user_id, failed_attempts, locked, locked_at')
        .in('user_id', profileIds);
      if (!loginError && loginAttempts) {
        lockMap = new Map(loginAttempts.map((l) => [l.user_id, l]));
      }
    }

    // ✅ FIX: Format response with individual name fields
    let accounts = (profiles || []).map((p) => {
      const lock = lockMap.get(p.id);
      return {
        id: p.id,
        employee_id: p.employee_id,
        // ✅ Return individual name fields
        first_name: p.first_name || '',
        middle_name: p.middle_name || '',
        last_name: p.last_name || '',
        // Keep combined name for display
        name: `${p.first_name || ''}${p.middle_name ? ` ${p.middle_name}` : ''} ${p.last_name || ''}`.trim(),
        email: emailMap.get(p.id) || '',
        role: p.role || 'Employee',
        status: p.status || 'Active',
        branch: p.branches || null,
        branch_id: p.branch_id,
        failedAttempts: lock?.failed_attempts || 0,
        locked: lock?.locked || false,
        locked_at: lock?.locked_at || null,
        created_at: p.created_at,
      };
    });

    // Filter by locked status if requested
    if (showLocked === 'true') accounts = accounts.filter((a) => a.locked);
    else if (showLocked === 'false') accounts = accounts.filter((a) => !a.locked);

    res.json({
      success: true,
      data: accounts,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
      },
    });
  } catch (err) {
    console.error('Error fetching accounts:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ NEW: PUT /api/superadmin/accounts/:id - Update account
router.put('/accounts/:id', async (req, res) => {
  const { id } = req.params;
  const {
    first_name,
    middle_name,
    last_name,
    email,
    role,
    branch_id,
    status,
  } = req.body;

  // Validate required fields
  if (!first_name || !last_name) {
    return res.status(400).json({
      success: false,
      error: 'first_name and last_name are required.'
    });
  }

  if (!email) {
    return res.status(400).json({
      success: false,
      error: 'email is required.'
    });
  }

  if (!branch_id) {
    return res.status(400).json({
      success: false,
      error: 'branch_id is required. User must be assigned to a branch.'
    });
  }

  try {
    // Check if user exists
    const { data: existingProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, employee_id')
      .eq('id', id)
      .single();

    if (profileError || !existingProfile) {
      return res.status(404).json({
        success: false,
        error: 'User not found.'
      });
    }

    // Update email in auth
    if (email) {
      try {
        await supabase.auth.admin.updateUserById(id, { email });
      } catch (authErr) {
        console.error('Error updating auth email:', authErr);
        // Continue even if auth update fails
      }
    }

    // Update profile
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({
        first_name,
        middle_name: middle_name || null,
        last_name,
        role: role || 'Employee',
        branch_id,
        status: status || 'Active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Invalidate profile cache and terminate sessions if deactivated or locked
    clearProfileCache(id);
    if (status === 'Inactive' || status === 'Deactivated' || status === 'Locked') {
      try {
        await supabase.auth.admin.signOut(id);
      } catch (soErr) {
        console.error('Non-fatal error signing out user:', soErr.message);
      }
    }

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        user_id: req.user?.id || null,
        action: 'UPDATE_ACCOUNT',
        system_category: 'Account Management',
        log_description: `Updated account for ${first_name} ${last_name} (${existingProfile.employee_id})`,
      });

    res.json({
      success: true,
      message: 'Account updated successfully',
      data: {
        ...updatedProfile,
        email,
      }
    });
  } catch (err) {
    console.error('Error updating account:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/superadmin/accounts/:id/status
router.patch('/accounts/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['Active', 'Inactive', 'Deactivated'].includes(status)) {
    return res.status(400).json({
      success: false,
      error: "Status must be 'Active', 'Inactive', or 'Deactivated'."
    });
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, employee_id, first_name, last_name')
      .eq('id', id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({
        success: false,
        error: 'User not found.'
      });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Invalidate profile cache and terminate session if deactivated or inactive
    clearProfileCache(id);
    if (status === 'Inactive' || status === 'Deactivated') {
      try {
        await supabase.auth.admin.signOut(id);
      } catch (soErr) {
        console.error('Non-fatal error signing out user:', soErr.message);
      }
    }

    await supabase
      .from('audit_logs')
      .insert({
        user_id: req.user?.id || null,
        action: 'UPDATE_USER_STATUS',
        system_category: 'Account Management',
        log_description: `Changed ${profile.first_name} ${profile.last_name} (${profile.employee_id}) status to ${status}`,
      });

    res.json({
      success: true,
      message: `Account status updated to ${status}`,
      data: {
        id: data.id,
        status: data.status,
        updated_at: data.updated_at
      }
    });
  } catch (err) {
    console.error('Error updating account status:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/superadmin/accounts/:id/unlock
router.patch('/accounts/:id/unlock', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, employee_id, first_name, last_name')
      .eq('id', id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({
        success: false,
        error: 'User not found.'
      });
    }

    const { data, error } = await supabase
      .from('user_login_attempts')
      .update({
        locked: false,
        failed_attempts: 0,
        locked_by: null,
        locked_at: null
      })
      .eq('user_id', id)
      .select()
      .maybeSingle();

    if (error) throw error;

    // Also ensure profiles status is Active
    await supabase
      .from('profiles')
      .update({ status: 'Active', updated_at: new Date().toISOString() })
      .eq('id', id);

    clearProfileCache(id);

    await supabase
      .from('audit_logs')
      .insert({
        user_id: req.user?.id || null,
        action: 'UNLOCK_USER_ACCOUNT',
        system_category: 'Account Management',
        log_description: `Unlocked ${profile.first_name} ${profile.last_name} (${profile.employee_id}) account`,
      });

    res.json({
      success: true,
      message: 'Account unlocked successfully',
      data
    });
  } catch (err) {
    console.error('Error unlocking account:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/superadmin/accounts/:id/lock
router.patch('/accounts/:id/lock', async (req, res) => {
  const { id } = req.params;
  const { locked_by } = req.body;

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, employee_id, first_name, last_name')
      .eq('id', id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({
        success: false,
        error: 'User not found.'
      });
    }

    const { data: existing } = await supabase
      .from('user_login_attempts')
      .select('id')
      .eq('user_id', id)
      .maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from('user_login_attempts')
        .update({
          locked: true,
          locked_by: locked_by || req.user?.id || null,
          locked_at: new Date().toISOString()
        })
        .eq('user_id', id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('user_login_attempts')
        .insert({
          user_id: id,
          locked: true,
          locked_by: locked_by || req.user?.id || null,
          locked_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    // Also update profiles table status to Locked
    await supabase
      .from('profiles')
      .update({ status: 'Locked', updated_at: new Date().toISOString() })
      .eq('id', id);

    clearProfileCache(id);
    try {
      await supabase.auth.admin.signOut(id);
    } catch (soErr) {
      console.error('Non-fatal error signing out locked user:', soErr.message);
    }

    await supabase
      .from('audit_logs')
      .insert({
        user_id: req.user?.id || null,
        action: 'LOCK_USER_ACCOUNT',
        system_category: 'Account Management',
        log_description: `Locked ${profile.first_name} ${profile.last_name} (${profile.employee_id}) account`,
      });

    res.json({
      success: true,
      message: 'Account locked successfully',
      data: result
    });
  } catch (err) {
    console.error('Error locking account:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/superadmin/accounts/export?format=pdf|excel&role=...&status=...&locked=...&branch_id=...&search=...
 * Dual-format export: WEA-branded PDF or styled Excel for SuperAdmin Account Directory
 */
router.get('/accounts/export', async (req, res) => {
  try {
    const format = (req.query.format || 'pdf').toLowerCase();
    const role = (req.query.role || 'All').trim();
    const status = (req.query.status || 'All').trim();
    const locked = (req.query.locked || 'All').trim();
    const branchId = (req.query.branch_id || 'All').trim();
    const search = (req.query.search || '').trim();

    console.log(`📊 SuperAdmin Accounts Export (${format}) requested by: ${req.user?.employee_id || 'SuperAdmin'}`);

    let query = supabase
      .from('profiles')
      .select(`
        *,
        branches:profiles_branch_id_fkey (
          id,
          name,
          location,
          status
        )
      `)
      .order('created_at', { ascending: false });

    if (status && status !== 'All') query = query.eq('status', status);
    if (role && role !== 'All') query = query.eq('role', role);
    if (branchId && branchId !== 'All') query = query.eq('branch_id', branchId);
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_id.ilike.%${search}%`
      );
    }

    const { data: profiles, error } = await query;
    if (error) throw error;

    // Get emails from auth.users
    const profileIds = (profiles || []).map((p) => p.id);
    let emailMap = new Map();
    if (profileIds.length > 0) {
      try {
        const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        if (authUsers?.users) {
          authUsers.users.forEach(u => emailMap.set(u.id, u.email));
        }
      } catch (authErr) {
        console.warn('⚠️ Could not fetch auth emails for export:', authErr.message);
      }
    }

    // Get locked accounts
    let lockedMap = new Map();
    if (profileIds.length > 0) {
      try {
        const { data: loginAttempts } = await supabase
          .from('user_login_attempts')
          .select('user_id, locked')
          .in('user_id', profileIds);
        if (loginAttempts) {
          loginAttempts.forEach(att => lockedMap.set(att.user_id, att.locked));
        }
      } catch (lockErr) {
        console.warn('⚠️ Could not fetch lock status for export:', lockErr.message);
      }
    }

    let rows = (profiles || []).map(p => {
      const isLocked = lockedMap.get(p.id) || false;
      const fullName = `${p.first_name || ''} ${p.middle_name ? p.middle_name + ' ' : ''}${p.last_name || ''}`.trim() || 'N/A';
      return {
        id: p.id,
        employee_id: p.employee_id || '—',
        name: fullName,
        email: emailMap.get(p.id) || p.email || '—',
        role: p.role || 'Unknown',
        branch_name: p.branches?.name || '—',
        status: p.status || 'Active',
        locked: isLocked,
        locked_label: isLocked ? 'Locked' : 'Unlocked',
        created: p.created_at ? new Date(p.created_at).toISOString().split('T')[0] : '—',
      };
    });

    if (locked === 'Locked') {
      rows = rows.filter(r => r.locked === true);
    } else if (locked === 'Unlocked') {
      rows = rows.filter(r => r.locked === false);
    }

    const dateStr = new Date().toISOString().split('T')[0];

    // ── EXCEL ──────────────────────────────────────────────────────────────────
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'WEA Resource Management System';
      workbook.created = new Date();

      const ws = workbook.addWorksheet('Enterprise Accounts', {
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
        { header: 'Branch',        width: 22, align: 'left'   },
        { header: 'Account Status', width: 16, align: 'center' },
        { header: 'Security Lock', width: 16, align: 'center' },
        { header: 'Created Date',  width: 16, align: 'center' },
      ];

      ws.columns = cols.map(c => ({ width: c.width }));
      const tc = cols.length;

      // Row 1 – Title
      ws.mergeCells(1, 1, 1, tc);
      const t = ws.getCell(1, 1);
      t.value = 'WEA  •  ENTERPRISE ACCOUNT DIRECTORY';
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
      sub.value = `Generated ${new Date().toLocaleString()}   |   Super Admin Portal   |   Role: ${role}   |   Status: ${status}   |   Total Accounts: ${rows.length}`;
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
          row.branch_name,
          row.status,
          row.locked_label,
          row.created,
        ];
        values.forEach((val, ci) => {
          const cell = dr.getCell(ci + 1);
          cell.value = val;
          cell.font = { size: 10, name: 'Calibri' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseFill } };
          cell.alignment = { vertical: 'middle', horizontal: cols[ci].align, indent: 1 };
          cell.border = { top: { style: 'hair', color: { argb: C.border } }, bottom: { style: 'hair', color: { argb: C.border } }, left: { style: 'thin', color: { argb: C.outer } }, right: { style: 'thin', color: { argb: C.outer } } };

          // Account status styling
          if (ci === 5) {
            cell.font = { bold: true, size: 10, name: 'Calibri' };
            if (val === 'Active') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
              cell.font = { bold: true, size: 10, color: { argb: 'FF166534' }, name: 'Calibri' };
            } else if (val === 'Deactivated') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
              cell.font = { bold: true, size: 10, color: { argb: 'FF92400E' }, name: 'Calibri' };
            }
          }
          // Security lock styling
          if (ci === 6) {
            cell.font = { bold: true, size: 10, name: 'Calibri' };
            if (val === 'Locked') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
              cell.font = { bold: true, size: 10, color: { argb: 'FF991B1B' }, name: 'Calibri' };
            } else {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
              cell.font = { bold: true, size: 10, color: { argb: 'FF166534' }, name: 'Calibri' };
            }
          }
        });
        dr.height = 19;
      });

      ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: tc } };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=WEA_EnterpriseAccounts_${dateStr}.xlsx`);
      const buffer = await workbook.xlsx.writeBuffer();
      return res.send(buffer);
    }

    // ── PDF ──────────────────────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 35, size: 'A4', bufferPages: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=WEA_EnterpriseAccounts_${dateStr}.pdf`);
    doc.pipe(res);

    const drawHdr = (first) => {
      doc.rect(0, 0, 595.28, first ? 50 : 30).fill('#0b1220');
      doc.rect(0, first ? 50 : 30, 595.28, 3).fill('#f5b700');
      doc.fillColor('#ffffff').fontSize(first ? 12.5 : 9).font('Helvetica-Bold')
         .text(first ? 'WEA  •  SUPER ADMIN PORTAL' : 'WEA  •  ENTERPRISE ACCOUNT DIRECTORY (CONT.)', 35, first ? 14 : 9);
      if (first) {
        doc.fillColor('#94a3b8').fontSize(8.5).font('Helvetica').text('ENTERPRISE ACCOUNT DIRECTORY', 35, 30);
        doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text('CONFIDENTIAL  |  SUPER ADMIN AUDIT', 35, 20, { width: 525, align: 'right' });
      }
    };

    drawHdr(true);
    doc.roundedRect(35, 64, 525, 22, 3).fill('#f1f5f9');
    doc.fillColor('#475569').fontSize(8).font('Helvetica');
    doc.text(`Generated: ${new Date().toLocaleString()}   |   Role: ${role}   |   Status: ${status}   |   Total: ${rows.length}`, 45, 70, { width: 505, align: 'left' });

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
      const stColor = row.status === 'Active' ? '#166534' : '#92400e';
      const stBg = row.status === 'Active' ? '#dcfce7' : '#fef3c7';
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
         .text(`WEA Super Admin System  •  Generated on ${new Date().toLocaleDateString()}`, 35, 822);
      doc.text(`Page ${i + 1} of ${range.count}`, 35, 822, { width: 525, align: 'right' });
    }

    doc.end();
  } catch (err) {
    console.error('❌ Error exporting accounts:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;