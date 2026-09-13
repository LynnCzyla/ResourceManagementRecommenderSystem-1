// backend/routes/SuperAdmin/audit-logs.js
// Super Admin Audit Logs - Full system audit trail

const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// Helper to get role display name
const getRoleDisplayName = (role) => {
  if (!role) return 'Unknown';
  const roleMap = {
    'Super Admin': 'Super Admin',
    'Admin': 'Admin',
    'Human Resources': 'Human Resources',
    'Project Manager': 'Project Manager',
    'Resource Manager': 'Resource Manager',
    'Employee': 'Employee',
  };
  return roleMap[role] || role;
};

// GET /api/superadmin/audit-logs
router.get('/audit-logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = (req.query.search || '').trim();
    const action = req.query.action;
    const role = req.query.role;
    const branchId = req.query.branch_id;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    console.log('📊 Fetching audit logs with filters:', { action, role, branchId, startDate, endDate });

    // STEP 1: Get user IDs for role and branch filters
    let filteredUserIds = null;
    
    // If role filter is applied, get user IDs with that role
    if (role && role !== 'All' && role !== 'undefined') {
      const { data: roleProfiles, error: roleError } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', role);

      if (roleError) {
        console.error('❌ Error fetching role profiles:', roleError);
      } else if (roleProfiles) {
        filteredUserIds = roleProfiles.map(p => p.id);
        console.log(`✅ Found ${filteredUserIds.length} users with role "${role}"`);
        
        // If no users with this role, return empty
        if (filteredUserIds.length === 0) {
          return res.json({
            success: true,
            data: [],
            pagination: { page, limit, total: 0, totalPages: 1 },
          });
        }
      }
    }

    // If branch filter is applied, filter the user IDs further
    if (branchId && branchId !== 'All' && branchId !== 'undefined') {
      let branchQuery = supabase
        .from('profiles')
        .select('id')
        .eq('branch_id', branchId);

      // If we already have filtered user IDs from role filter, apply both
      if (filteredUserIds && filteredUserIds.length > 0) {
        branchQuery = branchQuery.in('id', filteredUserIds);
      }

      const { data: branchProfiles, error: branchError } = await branchQuery;

      if (branchError) {
        console.error('❌ Error fetching branch profiles:', branchError);
      } else if (branchProfiles) {
        filteredUserIds = branchProfiles.map(p => p.id);
        console.log(`✅ Found ${filteredUserIds.length} users with branch filter`);
        
        if (filteredUserIds.length === 0) {
          return res.json({
            success: true,
            data: [],
            pagination: { page, limit, total: 0, totalPages: 1 },
          });
        }
      }
    }

    // STEP 2: Build the logs query with user ID filter
    let logsQuery = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' });

    // Apply user ID filter (role + branch combined)
    if (filteredUserIds && filteredUserIds.length > 0) {
      logsQuery = logsQuery.in('user_id', filteredUserIds);
    }

    // Apply other filters
    if (action && action !== 'All' && action !== 'undefined') {
      logsQuery = logsQuery.eq('action', action);
    }

    if (startDate) {
      logsQuery = logsQuery.gte('created_at', `${startDate}T00:00:00Z`);
    }
    if (endDate) {
      logsQuery = logsQuery.lte('created_at', `${endDate}T23:59:59Z`);
    }

    if (search) {
      logsQuery = logsQuery.or(
        `log_description.ilike.%${search}%,action.ilike.%${search}%`
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // STEP 3: Get total count first (for pagination)
    const { count: totalCount, error: countError } = await logsQuery;

    if (countError) {
      console.error('❌ Error getting count:', countError);
      throw countError;
    }

    console.log(`✅ Total filtered logs: ${totalCount}`);

    // STEP 4: Get paginated logs
    const { data: logs, error: logsError } = await logsQuery
      .order('created_at', { ascending: false })
      .range(from, to);

    if (logsError) {
      console.error('❌ Error fetching logs:', logsError);
      throw logsError;
    }

    console.log(`✅ Found ${logs?.length || 0} logs for this page`);

    if (!logs || logs.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          page,
          limit,
          total: totalCount || 0,
          totalPages: Math.max(1, Math.ceil((totalCount || 0) / limit)),
        },
      });
    }

    // STEP 5: Get user details for each log
    const userIds = [...new Set(logs.map(log => log.user_id).filter(Boolean))];
    let profileMap = new Map();

    if (userIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select(`
          id,
          employee_id,
          first_name,
          middle_name,
          last_name,
          role,
          branch_id,
          branches:profiles_branch_id_fkey (
            id,
            name,
            location
          )
        `)
        .in('id', userIds);

      if (profileError) {
        console.error('❌ Error fetching profiles:', profileError);
      } else if (profiles) {
        profiles.forEach(profile => {
          profileMap.set(profile.id, profile);
        });
        console.log(`✅ Found ${profiles.length} profiles`);
      }
    }

    // STEP 6: Combine logs with profiles
    const formattedLogs = logs.map(log => {
      const profile = profileMap.get(log.user_id) || {};
      const branch = profile.branches || {};
      
      const firstName = profile.first_name || '';
      const middleName = profile.middle_name ? ` ${profile.middle_name}` : '';
      const lastName = profile.last_name || '';
      const fullName = `${firstName}${middleName} ${lastName}`.trim() || 'System';

      return {
        id: log.id,
        user_id: log.user_id,
        user: fullName,
        user_role: getRoleDisplayName(profile.role),
        user_employee_id: profile.employee_id || '',
        branch_id: profile.branch_id,
        branch_name: branch.name || '',
        action: log.action || 'Unknown',
        category: log.system_category || 'General',
        desc: log.log_description || '',
        time: log.created_at,
      };
    });

    // STEP 7: Send response with correct pagination
    res.json({
      success: true,
      data: formattedLogs,
      pagination: {
        page,
        limit,
        total: totalCount || 0,
        totalPages: Math.max(1, Math.ceil((totalCount || 0) / limit)),
      },
    });
  } catch (err) {
    console.error('❌ Error fetching super admin audit logs:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch audit logs',
    });
  }
});

// GET /api/superadmin/audit-logs/filters
router.get('/audit-logs/filters', async (req, res) => {
  try {
    console.log('📊 Fetching audit log filters...');

    // Get distinct actions
    let actions = [];
    try {
      const { data: actionsData, error: actionsError } = await supabase
        .from('audit_logs')
        .select('action')
        .order('action');

      if (!actionsError && actionsData) {
        actions = [...new Set(actionsData.map(a => a.action).filter(Boolean))];
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch actions:', err.message);
    }
    console.log(`✅ Found ${actions.length} actions`);

    // Get distinct roles from profiles
    let roles = [];
    try {
      const { data: rolesData, error: rolesError } = await supabase
        .from('profiles')
        .select('role')
        .order('role');

      if (!rolesError && rolesData) {
        roles = [...new Set(rolesData.map(r => r.role).filter(Boolean))];
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch roles:', err.message);
    }
    console.log(`✅ Found ${roles.length} roles`);

    // Get branches
    let branches = [];
    try {
      const { data: branchesData, error: branchesError } = await supabase
        .from('branches')
        .select('id, name')
        .eq('status', 'Active')
        .order('name');

      if (!branchesError && branchesData) {
        branches = branchesData;
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch branches:', err.message);
    }
    console.log(`✅ Found ${branches.length} branches`);

    res.json({
      success: true,
      data: {
        actions: actions,
        roles: roles,
        branches: branches || [],
      },
    });
  } catch (err) {
    console.error('❌ Error fetching audit log filters:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch filter options',
    });
  }
});

// GET /api/superadmin/audit-logs/export?format=pdf|excel
router.get('/audit-logs/export', async (req, res) => {
  try {
    console.log('📊 Exporting audit logs...');
    
    const format = (req.query.format || 'pdf').toLowerCase();
    const search = (req.query.search || '').trim();
    const action = req.query.action;
    const role = req.query.role;
    const branchId = req.query.branch_id;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    // Get user IDs for role/branch filters
    let filteredUserIds = null;

    if (role && role !== 'All' && role !== 'undefined') {
      const { data: roleProfiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', role);
      
      if (roleProfiles) {
        filteredUserIds = roleProfiles.map(p => p.id);
      }
    }

    if (branchId && branchId !== 'All' && branchId !== 'undefined') {
      let branchQuery = supabase
        .from('profiles')
        .select('id')
        .eq('branch_id', branchId);

      if (filteredUserIds && filteredUserIds.length > 0) {
        branchQuery = branchQuery.in('id', filteredUserIds);
      }

      const { data: branchProfiles } = await branchQuery;
      if (branchProfiles) {
        filteredUserIds = branchProfiles.map(p => p.id);
      }
    }

    // Get all logs
    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (filteredUserIds && filteredUserIds.length > 0) {
      query = query.in('user_id', filteredUserIds);
    }

    if (action && action !== 'All' && action !== 'undefined') {
      query = query.eq('action', action);
    }
    if (startDate) {
      query = query.gte('created_at', `${startDate}T00:00:00Z`);
    }
    if (endDate) {
      query = query.lte('created_at', `${endDate}T23:59:59Z`);
    }
    if (search) {
      query = query.or(
        `log_description.ilike.%${search}%,action.ilike.%${search}%`
      );
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error('❌ Error exporting audit logs:', error);
      throw error;
    }

    // Get all unique user IDs and build profile map
    const userIds = [...new Set((logs || []).map(log => log.user_id).filter(Boolean))];
    let profileMap = new Map();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select(`id, first_name, middle_name, last_name, role, branch_id, branches:profiles_branch_id_fkey (name)`)
        .in('id', userIds);

      if (profiles) {
        profiles.forEach(profile => profileMap.set(profile.id, profile));
      }
    }

    const rows = (logs || []).map(log => {
      const profile = profileMap.get(log.user_id) || {};
      const branch = profile.branches || {};
      const firstName = profile.first_name || '';
      const middleName = profile.middle_name ? ` ${profile.middle_name}` : '';
      const lastName = profile.last_name || '';
      const fullName = `${firstName}${middleName} ${lastName}`.trim() || 'System';
      return {
        timestamp: new Date(log.created_at).toLocaleString(),
        actor: fullName,
        role: getRoleDisplayName(profile.role),
        branch: branch.name || '—',
        action: log.action || '—',
        category: log.system_category || 'General',
        desc: log.log_description || '—',
      };
    });

    const dateStr = new Date().toISOString().split('T')[0];

    // ── EXCEL ────────────────────────────────────────────────────────────────
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'WEA Resource Management System';
      workbook.created = new Date();

      const ws = workbook.addWorksheet('Audit Trail', {
        views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
      });

      const COLORS = {
        titleBg:    'FF0B1220', titleText:  'FFFFFFFF',
        accent:     'FFF5B700',
        subBg:      'FFF1F5F9', subText:    'FF475569',
        headerBg:   'FF1E3A5F', headerText: 'FFFFFFFF',
        rowEven:    'FFFFFFFF', rowOdd:     'FFF6F8FA',
        border:     'FFD9DEE4', outerBorder:'FF1E3A5F',
      };

      const cols = [
        { header: 'Timestamp',   width: 22, align: 'left'   },
        { header: 'Actor',       width: 24, align: 'left'   },
        { header: 'Role',        width: 20, align: 'left'   },
        { header: 'Branch',      width: 18, align: 'left'   },
        { header: 'Action',      width: 22, align: 'left'   },
        { header: 'Category',    width: 20, align: 'center' },
        { header: 'Description', width: 44, align: 'left', wrap: true },
      ];

      ws.columns = cols.map(c => ({ width: c.width }));
      const totalCols = cols.length;

      // Row 1 – Title band
      ws.mergeCells(1, 1, 1, totalCols);
      const titleCell = ws.getCell(1, 1);
      titleCell.value = 'WEA  •  SYSTEM AUDIT TRAIL REPORT';
      titleCell.font = { bold: true, size: 15, color: { argb: COLORS.titleText }, name: 'Calibri' };
      titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(1).height = 30;
      ws.getRow(1).eachCell({ includeEmpty: true }, c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
      });

      // Row 2 – Gold accent bar
      ws.mergeCells(2, 1, 2, totalCols);
      ws.getRow(2).height = 4;
      ws.getRow(2).eachCell({ includeEmpty: true }, c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.accent } };
      });

      // Row 3 – Subtitle metadata
      ws.mergeCells(3, 1, 3, totalCols);
      const subCell = ws.getCell(3, 1);
      const scopeParts = [];
      if (role && role !== 'All') scopeParts.push(`Role: ${role}`);
      if (branchId && branchId !== 'All') scopeParts.push(`Branch filtered`);
      if (action && action !== 'All') scopeParts.push(`Action: ${action}`);
      subCell.value = `Generated ${new Date().toLocaleString()}      Total Records: ${rows.length}${scopeParts.length ? '   |   ' + scopeParts.join('   |   ') : ''}`;
      subCell.font = { italic: true, size: 10, color: { argb: COLORS.subText }, name: 'Calibri' };
      subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(3).height = 20;
      ws.getRow(3).eachCell({ includeEmpty: true }, c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subBg } };
      });

      // Row 4 – Spacer
      ws.getRow(4).height = 8;

      // Row 5 – Header
      const headerRow = ws.getRow(5);
      cols.forEach((col, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = col.header;
        cell.font = { bold: true, size: 11, color: { argb: COLORS.headerText }, name: 'Calibri' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
        cell.alignment = { vertical: 'middle', horizontal: col.align, indent: 1 };
        cell.border = {
          top:    { style: 'thin', color: { argb: COLORS.outerBorder } },
          bottom: { style: 'medium', color: { argb: COLORS.outerBorder } },
          left:   { style: 'thin', color: { argb: COLORS.outerBorder } },
          right:  { style: 'thin', color: { argb: COLORS.outerBorder } },
        };
      });
      headerRow.height = 24;

      // Data rows
      rows.forEach((row, idx) => {
        const rowIdx = 6 + idx;
        const dataRow = ws.getRow(rowIdx);
        const baseFill = idx % 2 === 0 ? COLORS.rowEven : COLORS.rowOdd;
        const values = [row.timestamp, row.actor, row.role, row.branch, row.action, row.category, row.desc];

        values.forEach((val, colIdx) => {
          const cell = dataRow.getCell(colIdx + 1);
          cell.value = val;
          cell.font = { size: 10, name: 'Calibri' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseFill } };
          cell.alignment = { vertical: 'middle', horizontal: cols[colIdx].align, wrapText: !!cols[colIdx].wrap, indent: 1 };
          cell.border = {
            top:    { style: 'hair', color: { argb: COLORS.border } },
            bottom: { style: 'hair', color: { argb: COLORS.border } },
            left:   { style: 'thin', color: { argb: COLORS.outerBorder } },
            right:  { style: 'thin', color: { argb: COLORS.outerBorder } },
          };
        });
        dataRow.height = 18;
      });

      // AutoFilter
      ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: totalCols } };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=WEA_AuditTrail_${dateStr}.xlsx`);
      const buffer = await workbook.xlsx.writeBuffer();
      return res.send(buffer);
    }

    // ── PDF ──────────────────────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 35, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=WEA_AuditTrail_${dateStr}.pdf`);
    doc.pipe(res);

    const drawPageHeader = (isFirstPage) => {
      doc.rect(0, 0, 595.28, isFirstPage ? 50 : 30).fill('#0b1220');
      doc.rect(0, isFirstPage ? 50 : 30, 595.28, 3).fill('#f5b700');
      doc.fillColor('#ffffff').fontSize(isFirstPage ? 12.5 : 9)
        .font('Helvetica-Bold')
        .text(isFirstPage ? 'WEA  •  RESOURCE MANAGEMENT SYSTEM' : 'WEA  •  SYSTEM AUDIT TRAIL REPORT (CONT.)', 35, isFirstPage ? 14 : 9);
      if (isFirstPage) {
        doc.fillColor('#94a3b8').fontSize(8.5).font('Helvetica').text('SYSTEM AUDIT TRAIL REPORT', 35, 30);
        doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text('CONFIDENTIAL  |  INTERNAL REPORT', 35, 20, { width: 525, align: 'right' });
      }
    };

    drawPageHeader(true);

    // Subtitle strip
    doc.roundedRect(35, 64, 525, 22, 3).fill('#f1f5f9');
    doc.fillColor('#475569').fontSize(8).font('Helvetica');
    const filterLabel = [
      `Generated: ${new Date().toLocaleString()}`,
      `Records: ${rows.length}`,
      role && role !== 'All' ? `Role: ${role}` : null,
      action && action !== 'All' ? `Action: ${action}` : null,
    ].filter(Boolean).join('   |   ');
    doc.text(filterLabel, 45, 70, { width: 505, align: 'left' });

    // Table columns
    const columns = [
      { header: 'Timestamp',  x: 35,  w: 88, align: 'left'   },
      { header: 'Actor',      x: 123, w: 80, align: 'left'   },
      { header: 'Role',       x: 203, w: 70, align: 'left'   },
      { header: 'Branch',     x: 273, w: 58, align: 'left'   },
      { header: 'Action',     x: 331, w: 64, align: 'left'   },
      { header: 'Category',   x: 395, w: 54, align: 'center' },
      { header: 'Description',x: 449, w: 111, align: 'left'  },
    ];

    const drawTableHeader = (y) => {
      doc.rect(35, y, 525, 18).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold');
      columns.forEach(col => {
        doc.text(col.header, col.x + 2, y + 5, { width: col.w - 4, align: col.align });
      });
    };

    let tableY = 96;
    drawTableHeader(tableY);
    let y = tableY + 18;

    rows.forEach((row, i) => {
      const rowValues = [row.timestamp, row.actor, row.role, row.branch, row.action, row.category, row.desc];
      const rowH = 17;
      if (y + rowH > 800) {
        doc.addPage();
        drawPageHeader(false);
        tableY = 42;
        drawTableHeader(tableY);
        y = tableY + 18;
      }
      const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(35, y, 525, rowH).fill(bg);
      doc.lineWidth(0.4).strokeColor('#e2e8f0').moveTo(35, y + rowH).lineTo(560, y + rowH).stroke();
      doc.fillColor('#334155').fontSize(6.5).font('Helvetica');
      columns.forEach((col, ci) => {
        const val = String(rowValues[ci] || '—');
        doc.text(val, col.x + 2, y + 4, { width: col.w - 4, align: col.align, lineBreak: false, ellipsis: true });
      });
      y += rowH;
    });

    doc.lineWidth(1).strokeColor('#1e3a5f').rect(35, tableY, 525, y - tableY).stroke();

    // Footer on all pages
    const pageRange = doc.bufferedPageRange();
    for (let p = pageRange.start; p < pageRange.start + pageRange.count; p++) {
      doc.switchToPage(p);
      doc.lineWidth(0.5).strokeColor('#e2e8f0').moveTo(35, 808).lineTo(560, 808).stroke();
      doc.fillColor('#94a3b8').fontSize(7).font('Helvetica')
         .text(`WEA Resource Management System  •  Generated ${new Date().toLocaleDateString()}`, 35, 814, { align: 'left' });
      doc.fillColor('#94a3b8').fontSize(7).font('Helvetica')
         .text(`Page ${p + 1} of ${pageRange.count}`, 35, 814, { width: 525, align: 'right' });
    }

    doc.end();

  } catch (err) {
    console.error('❌ Error exporting audit logs:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message || 'Failed to export audit logs' });
    }
  }
});

module.exports = router;
