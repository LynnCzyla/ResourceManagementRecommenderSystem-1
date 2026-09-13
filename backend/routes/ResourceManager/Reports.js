// backend/routes/ResourceManager/Reports.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { verifyToken } = require('../Middleware/auth');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// ✅ Apply auth middleware
router.use(verifyToken);

// ✅ Priority weights based on your paper
const PRIORITY_WEIGHTS = {
  'Low': 1,
  'Medium': 2,
  'High': 3
};

// ✅ Helper: Get branch name from ID
const getBranchName = async (branchId) => {
  if (!branchId) return 'Unknown Branch';
  try {
    const { data, error } = await supabase
      .from('branches')
      .select('name')
      .eq('id', branchId)
      .single();
    if (error || !data) return branchId;
    return data.name;
  } catch (error) {
    return branchId;
  }
};

/**
 * POST /api/rm/reports/utilization
 * Generate employee utilization report with Workload Score
 */
router.post('/utilization', async (req, res) => {
  try {
    const { format = 'pdf', departmentFilter = null, workloadFilter = null } = req.body;
    const userBranchId = req.user.branch_id;
    const isSuperAdmin = req.user.is_super_admin;

    let branchName = 'All Branches';
    if (!isSuperAdmin && userBranchId) {
      branchName = await getBranchName(userBranchId);
    }

    console.log(`📊 Generating utilization report by: ${req.user.employee_id}`);
    console.log(`📊 Format: ${format}, Branch: ${branchName}, Workload Filter: ${workloadFilter || 'All'}`);

    let employeeQuery = supabase
      .from('profiles')
      .select(`
        id,
        employee_id,
        first_name,
        last_name,
        role,
        status,
        created_at,
        avatar_url,
        branch_id,
        position_id,
        positions ( position_name ),
        departments ( department_name, id )
      `)
      .eq('status', 'Active')
      .eq('role', 'Employee');

    if (!isSuperAdmin && userBranchId) {
      employeeQuery = employeeQuery.eq('branch_id', userBranchId);
    }

    if (departmentFilter) {
      employeeQuery = employeeQuery.eq('department_id', departmentFilter);
    }

    const { data: employees, error: empError } = await employeeQuery;

    if (empError) throw empError;

    const employeeIds = employees.map(e => e.id);

    const [projectsResult, assignmentsResult, tasksResult] = await Promise.all([
      supabase
        .from('projects')
        .select('id, project_name, status')
        .eq('status', 'Active'),
      
      supabase
        .from('project_assignments')
        .select('profile_id, project_id, status')
        .in('profile_id', employeeIds)
        .eq('status', 'Assigned'),
      
      supabase
        .from('project_tasks')
        .select('profile_id, status, project_id, priority')
        .in('profile_id', employeeIds)
        .not('status', 'in', '("Completed","Completed-Hidden","Archived")')
    ]);

    if (projectsResult.error) throw projectsResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;
    if (tasksResult.error) throw tasksResult.error;

    const activeProjects = projectsResult.data || [];
    const activeProjectIds = new Set(activeProjects.map(p => p.id));
    const projectMap = {};
    for (const p of activeProjects) {
      projectMap[p.id] = p.project_name;
    }

    const assignments = (assignmentsResult.data || []).filter(a => activeProjectIds.has(a.project_id));
    const tasks = (tasksResult.data || []).filter(t => activeProjectIds.has(t.project_id));

    console.log(`📊 Employees found: ${employees.length}`);
    console.log(`📊 Active projects found: ${activeProjects.length}`);
    console.log(`📊 Active assignments found: ${assignments.length}`);
    console.log(`📊 Active tasks found: ${tasks.length}`);

    const assignmentCounts = {};
    const employeeProjects = {};
    for (const a of assignments) {
      assignmentCounts[a.profile_id] = (assignmentCounts[a.profile_id] || 0) + 1;
      if (!employeeProjects[a.profile_id]) employeeProjects[a.profile_id] = [];
      const pName = projectMap[a.project_id];
      if (pName && !employeeProjects[a.profile_id].includes(pName)) {
        employeeProjects[a.profile_id].push(pName);
      }
    }

    const taskCounts = {};
    const workloadScores = {};
    for (const t of tasks) {
      if (t.profile_id) {
        taskCounts[t.profile_id] = (taskCounts[t.profile_id] || 0) + 1;
        const priority = t.priority || 'Low';
        const weight = PRIORITY_WEIGHTS[priority] || 1;
        workloadScores[t.profile_id] = (workloadScores[t.profile_id] || 0) + weight;
      }
    }

    const reportData = employees.map(emp => {
      const taskCount = taskCounts[emp.id] || 0;
      const assignmentCount = assignmentCounts[emp.id] || 0;
      const assignedList = employeeProjects[emp.id] || [];
      const assignedProjects = assignedList.length > 0 ? assignedList.join(', ') : 'Unassigned';
      const workloadScore = workloadScores[emp.id] || 0;
      
      let workloadStatus;
      let utilizationRate;
      
      if (workloadScore === 0) {
        workloadStatus = 'Available';
        utilizationRate = 0;
      } else if (workloadScore <= 3) {
        workloadStatus = 'Limited Availability';
        utilizationRate = Math.min(Math.round((workloadScore / 6) * 100), 100);
      } else {
        workloadStatus = 'Fully Utilized';
        utilizationRate = Math.min(Math.round((workloadScore / 6) * 100), 100);
      }

      return {
        employeeId: emp.employee_id,
        name: `${emp.first_name} ${emp.last_name}`,
        position: emp.positions?.position_name || 'Unassigned',
        department: emp.departments?.department_name || 'Unassigned',
        departmentId: emp.departments?.id || null,
        assignedProjects,
        assignmentCount,
        taskCount,
        workloadScore,
        workloadStatus,
        utilizationRate,
        status: emp.status,
        joinedDate: emp.created_at,
      };
    });

    reportData.sort((a, b) => b.workloadScore - a.workloadScore);

    const summaryStats = {
      total: reportData.length,
      available: reportData.filter(d => d.workloadStatus === 'Available').length,
      limited: reportData.filter(d => d.workloadStatus === 'Limited Availability').length,
      fullyLoaded: reportData.filter(d => d.workloadStatus === 'Fully Utilized').length,
      avgUtilization: reportData.length > 0 ? Math.round(reportData.reduce((sum, d) => sum + d.utilizationRate, 0) / reportData.length) : 0,
      avgWorkloadScore: reportData.length > 0 ? Math.round(reportData.reduce((sum, d) => sum + d.workloadScore, 0) / reportData.length) : 0,
      activeProjectsCount: activeProjects.length,
    };
    console.log('📊 Report Workload Distribution:', summaryStats);

    let filteredReportData = reportData;
    if (workloadFilter && workloadFilter !== 'All') {
      filteredReportData = reportData.filter(emp => emp.workloadStatus === workloadFilter);
    }

    // ✅ Generate report based on format
    if (format === 'pdf') {
      return await generatePDFReport(res, filteredReportData, req.user, branchName, workloadFilter, summaryStats);
    } else if (format === 'excel') {
      return await generateExcelReport(res, filteredReportData, req.user, branchName, workloadFilter, summaryStats);
    } else {
      return res.json({
        success: true,
        data: filteredReportData,
        summary: summaryStats,
        meta: {
          totalEmployees: filteredReportData.length,
          generatedAt: new Date().toISOString(),
          branch: branchName,
          filter: workloadFilter || 'All',
        }
      });
    }
  } catch (error) {
    console.error('❌ Error generating utilization report:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rm/reports/departments
 */
router.get('/departments', async (req, res) => {
  try {
    const userBranchId = req.user.branch_id;
    const isSuperAdmin = req.user.is_super_admin;

    let query = supabase
      .from('departments')
      .select('id, department_name')
      .order('department_name');

    if (!isSuperAdmin && userBranchId) {
      query = query.eq('branch_id', userBranchId);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rm/reports/summary
 */
router.get('/summary', async (req, res) => {
  try {
    const userBranchId = req.user.branch_id;
    const isSuperAdmin = req.user.is_super_admin;

    let query = supabase
      .from('profiles')
      .select('id, role, status', { count: 'exact' })
      .eq('status', 'Active')
      .eq('role', 'Employee');

    if (!isSuperAdmin && userBranchId) {
      query = query.eq('branch_id', userBranchId);
    }

    const { data, error } = await query;
    if (error) throw error;

    let deptQuery = supabase
      .from('departments')
      .select('id', { count: 'exact' });

    if (!isSuperAdmin && userBranchId) {
      deptQuery = deptQuery.eq('branch_id', userBranchId);
    }

    const { count: departmentCount } = await deptQuery;

    let projectQuery = supabase
      .from('projects')
      .select('id', { count: 'exact' })
      .eq('status', 'Active');

    const { count: projectCount } = await projectQuery;

    res.json({
      success: true,
      data: {
        totalEmployees: data?.length || 0,
        departmentCount: departmentCount || 0,
        activeProjects: projectCount || 0,
      }
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// PDF GENERATION - EXECUTIVE WEA DESIGN
// ============================================
const generatePDFReport = async (res, data, user, branchName, workloadFilter, summaryStats) => {
  try {
    const doc = new PDFDocument({ margin: 35, size: 'A4', bufferPages: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=WEA_Utilization_Report_${new Date().toISOString().split('T')[0]}.pdf`);

    doc.pipe(res);

    const drawHeaderBanner = () => {
      // Dark navy corporate banner
      doc.rect(0, 0, 595.28, 50).fill('#0b1220');
      // Gold accent bar
      doc.rect(0, 50, 595.28, 3.5).fill('#f5b700');

      doc.fillColor('#ffffff').fontSize(12.5).font('Helvetica-Bold').text('WEA  •  RESOURCE MANAGEMENT SYSTEM', 35, 14);
      doc.fillColor('#94a3b8').fontSize(8.5).font('Helvetica').text('EMPLOYEE UTILIZATION & WORKLOAD REPORT', 35, 30);
      doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text('CONFIDENTIAL  |  INTERNAL REPORT', 35, 20, { width: 525, align: 'right' });
    };

    // Draw main header banner on page 1
    drawHeaderBanner();

    // Metadata Subtitle Strip
    doc.roundedRect(35, 64, 525, 22, 3).fill('#f1f5f9');
    doc.fillColor('#475569').fontSize(8).font('Helvetica');
    const filterInfo = `Generated: ${new Date().toLocaleString()}   |   Branch: ${branchName || 'All Branches'}   |   Filter: ${workloadFilter || 'All'}   |   Employees: ${data.length}`;
    doc.text(filterInfo, 45, 70, { width: 505, align: 'left' });

    // Executive KPI Summary Cards
    const kpiY = 94;
    const kpiW = 123;
    const kpiH = 40;
    const kpiGap = 11;

    const stats = summaryStats || {
      available: data.filter(d => d.workloadStatus === 'Available').length,
      limited: data.filter(d => d.workloadStatus === 'Limited Availability').length,
      fullyLoaded: data.filter(d => d.workloadStatus === 'Fully Utilized').length,
      avgUtilization: data.length > 0 ? Math.round(data.reduce((sum, d) => sum + (d.utilizationRate || 0), 0) / data.length) : 0,
    };

    const kpiCards = [
      { label: 'AVAILABLE', val: String(stats.available), bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d' },
      { label: 'LIMITED AVAILABILITY', val: String(stats.limited), bg: '#fffbeb', border: '#fde68a', color: '#b45309' },
      { label: 'FULLY UTILIZED', val: String(stats.fullyLoaded), bg: '#fef2f2', border: '#fecaca', color: '#b91c1c' },
      { label: 'AVG UTILIZATION', val: `${stats.avgUtilization}%`, bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
    ];

    kpiCards.forEach((kpi, idx) => {
      const cardX = 35 + idx * (kpiW + kpiGap);
      doc.lineWidth(0.75).strokeColor(kpi.border).fillColor(kpi.bg).roundedRect(cardX, kpiY, kpiW, kpiH, 4).fillAndStroke();
      doc.fillColor(kpi.color).fontSize(6.5).font('Helvetica-Bold').text(kpi.label, cardX + 8, kpiY + 6, { width: kpiW - 16 });
      doc.fillColor(kpi.color).fontSize(14).font('Helvetica-Bold').text(kpi.val, cardX + 8, kpiY + 18, { width: kpiW - 16 });
    });

    // Table Column Definitions (total width = 525 pt)
    const columns = [
      { header: 'ID', x: 35, w: 60, align: 'center' },
      { header: 'Employee Name', x: 95, w: 92, align: 'left' },
      { header: 'Role / Position', x: 187, w: 92, align: 'left' },
      { header: 'Assigned Project', x: 279, w: 86, align: 'left' },
      { header: 'Tasks', x: 365, w: 26, align: 'center' },
      { header: 'Score', x: 391, w: 26, align: 'center' },
      { header: 'Utilization', x: 417, w: 42, align: 'center' },
      { header: 'Status', x: 459, w: 101, align: 'center' },
    ];

    const drawTableHeader = (yPos) => {
      doc.rect(35, yPos, 525, 20).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
      columns.forEach(col => {
        const textX = col.align === 'left' ? col.x + 4 : col.x;
        doc.text(col.header, textX, yPos + 6, { width: col.align === 'left' ? col.w - 8 : col.w, align: col.align });
      });
    };

    let tableY = 144;
    drawTableHeader(tableY);

    let y = tableY + 20;

    data.forEach((emp, index) => {
      // Check page overflow
      if (y + 22 > 785) {
        doc.addPage();
        // Mini corporate header on subsequent pages
        doc.rect(0, 0, 595.28, 30).fill('#0b1220');
        doc.rect(0, 30, 595.28, 2).fill('#f5b700');
        doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold').text('WEA  •  EMPLOYEE UTILIZATION & WORKLOAD REPORT (CONT.)', 35, 10);

        tableY = 42;
        drawTableHeader(tableY);
        y = tableY + 20;
      }

      // Zebra striping
      const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(35, y, 525, 19).fill(rowBg);

      // Hairline bottom row divider
      doc.lineWidth(0.5).strokeColor('#e2e8f0').moveTo(35, y + 19).lineTo(560, y + 19).stroke();

      // Employee ID
      doc.fillColor('#475569').fontSize(7).font('Helvetica').text(emp.employeeId || '—', 35, y + 5.5, { width: 60, align: 'center' });

      // Employee Name
      doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold').text(emp.name || '—', 95 + 4, y + 5.5, { width: 84, align: 'left', lineBreak: false, ellipsis: true });

      // Role / Position
      doc.fillColor('#475569').fontSize(7).font('Helvetica').text(emp.position || '—', 187 + 4, y + 5.5, { width: 84, align: 'left', lineBreak: false, ellipsis: true });

      // Project
      doc.fillColor('#334155').fontSize(7).font('Helvetica').text(emp.assignedProjects || 'Unassigned', 279 + 4, y + 5.5, { width: 78, align: 'left', lineBreak: false, ellipsis: true });

      // Tasks
      doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica').text(String(emp.taskCount || 0), 365, y + 5.5, { width: 26, align: 'center' });

      // Workload Score
      doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold').text(String(emp.workloadScore || 0), 391, y + 5.5, { width: 26, align: 'center' });

      // Utilization Rate with soft text coloring
      const uRate = emp.utilizationRate || 0;
      const utilColor = uRate >= 80 ? '#b91c1c' : uRate >= 60 ? '#15803d' : '#1d4ed8';
      doc.fillColor(utilColor).fontSize(7.5).font('Helvetica-Bold').text(`${uRate}%`, 417, y + 5.5, { width: 42, align: 'center' });

      // Workload Status Pill Badge
      let badgeBg = '#f1f5f9';
      let badgeText = '#475569';
      if (emp.workloadStatus === 'Available') {
        badgeBg = '#dcfce7';
        badgeText = '#15803d';
      } else if (emp.workloadStatus === 'Limited Availability') {
        badgeBg = '#fef3c7';
        badgeText = '#b45309';
      } else if (emp.workloadStatus === 'Fully Utilized') {
        badgeBg = '#fee2e2';
        badgeText = '#b91c1c';
      }

      doc.roundedRect(472, y + 2.5, 75, 14, 3).fill(badgeBg);
      doc.fillColor(badgeText).fontSize(6.5).font('Helvetica-Bold').text(emp.workloadStatus || '—', 472, y + 5.5, { width: 75, align: 'center' });

      y += 19;
    });

    // Outer table border
    doc.lineWidth(1).strokeColor('#1e3a5f').rect(35, tableY, 525, y - tableY).stroke();

    // Numbered Footer on every buffered page
    const pageRange = doc.bufferedPageRange();
    for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
      doc.switchToPage(i);
      doc.lineWidth(0.5).strokeColor('#e2e8f0').moveTo(35, 808).lineTo(560, 808).stroke();
      doc.fillColor('#94a3b8').fontSize(7).font('Helvetica')
         .text(`WEA Resource Management System  •  Generated on ${new Date().toLocaleDateString()}`, 35, 814, { align: 'left' });
      doc.fillColor('#94a3b8').fontSize(7).font('Helvetica')
         .text(`Page ${i + 1} of ${pageRange.count}`, 35, 814, { width: 525, align: 'right' });
    }

    doc.end();
  } catch (err) {
    console.error('❌ Error generating PDF report:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
};

// ============================================
// EXCEL GENERATION - CLEAN WEA PALETTE & LAYOUT
// ============================================
const generateExcelReport = async (res, data, user, branchName, workloadFilter, summaryStats) => {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = user?.name || user?.employee_id || 'WEA Resource Management System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Utilization & Workload', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    });

    // Clean Corporate Palette matching Weekly Report
    const XLSX_COLORS = {
      titleBg: 'FF0B1220',       // near-black navy
      titleAccent: 'FFF5B700',   // gold accent bar
      titleText: 'FFFFFFFF',
      subBg: 'FFF1F5F9',
      subText: 'FF475569',
      headerBg: 'FF1E3A5F',      // deep navy blue
      headerText: 'FFFFFFFF',
      rowEven: 'FFFFFFFF',
      rowOdd: 'FFF6F8FA',
      border: 'FFD9DEE4',
      outerBorder: 'FF1E3A5F',
      // Status pill colors
      availableBg: 'FFDCFCE7',
      availableText: 'FF15803D',
      limitedBg: 'FFFEF3C7',
      limitedText: 'FFB45309',
      fullyLoadedBg: 'FFFEE2E2',
      fullyLoadedText: 'FFB91C1C',
      // Util colors
      utilLowBg: 'FFDBEAFE',
      utilLowText: 'FF1D4ED8',
      utilMidBg: 'FFDCFCE7',
      utilMidText: 'FF15803D',
      utilHighBg: 'FFFEE2E2',
      utilHighText: 'FFB91C1C',
    };

    const columns = [
      { header: 'Employee ID', width: 16, key: 'id', align: 'center' },
      { header: 'Employee Name', width: 26, key: 'name', align: 'left', indent: 1 },
      { header: 'Role / Position', width: 26, key: 'position', align: 'left', indent: 1 },
      { header: 'Department', width: 22, key: 'department', align: 'left', indent: 1 },
      { header: 'Active Projects', width: 34, key: 'projects', align: 'left', indent: 1, wrap: true },
      { header: 'Tasks', width: 12, key: 'tasks', align: 'center' },
      { header: 'Workload Score', width: 16, key: 'score', align: 'center' },
      { header: 'Utilization', width: 14, key: 'util', align: 'center' },
      { header: 'Workload Status', width: 22, key: 'status', align: 'center' },
    ];

    worksheet.columns = columns.map(c => ({ width: c.width }));
    const totalCols = columns.length;

    // --- Row 1: Title band with navy background ---
    worksheet.mergeCells(1, 1, 1, totalCols);
    const titleCell = worksheet.getCell(1, 1);
    titleCell.value = 'WEA  •  EMPLOYEE UTILIZATION & WORKLOAD REPORT';
    titleCell.font = { bold: true, size: 15, color: { argb: XLSX_COLORS.titleText }, name: 'Calibri' };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    worksheet.getRow(1).height = 30;
    worksheet.getRow(1).eachCell({ includeEmpty: true }, cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.titleBg } };
    });

    // --- Row 2: Thin gold accent bar ---
    worksheet.mergeCells(2, 1, 2, totalCols);
    worksheet.getRow(2).height = 4;
    worksheet.getRow(2).eachCell({ includeEmpty: true }, cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.titleAccent } };
    });

    // --- Row 3: Subtitle metadata row ---
    const dateStr = `Generated ${new Date().toLocaleString()}`;
    const scopeStr = `Branch: ${branchName || 'All Branches'}   |   Filter: ${workloadFilter || 'All'}   |   Total Employees: ${data.length}`;
    worksheet.mergeCells(3, 1, 3, totalCols);
    const subCell = worksheet.getCell(3, 1);
    subCell.value = `${dateStr}      ${scopeStr}`;
    subCell.font = { italic: true, size: 10, color: { argb: XLSX_COLORS.subText }, name: 'Calibri' };
    subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    worksheet.getRow(3).height = 20;
    worksheet.getRow(3).eachCell({ includeEmpty: true }, cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.subBg } };
    });

    // --- Row 4: Blank spacer ---
    worksheet.getRow(4).height = 8;

    // --- Row 5: Table Header row ---
    const headerRowIdx = 5;
    const headerRow = worksheet.getRow(headerRowIdx);
    columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = { bold: true, size: 11, color: { argb: XLSX_COLORS.headerText }, name: 'Calibri' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.headerBg } };
      cell.alignment = { vertical: 'middle', horizontal: col.align, indent: col.indent || 0 };
      cell.border = {
        top: { style: 'thin', color: { argb: XLSX_COLORS.outerBorder } },
        bottom: { style: 'medium', color: { argb: XLSX_COLORS.outerBorder } },
        left: { style: 'thin', color: { argb: XLSX_COLORS.outerBorder } },
        right: { style: 'thin', color: { argb: XLSX_COLORS.outerBorder } },
      };
    });
    headerRow.height = 24;

    // --- Data rows ---
    data.forEach((emp, idx) => {
      const excelRowIdx = headerRowIdx + 1 + idx;
      const dataRow = worksheet.getRow(excelRowIdx);
      const baseFill = idx % 2 === 0 ? XLSX_COLORS.rowEven : XLSX_COLORS.rowOdd;

      const cellDefs = [
        { value: emp.employeeId || '—', align: 'center' },
        { value: emp.name || '—', align: 'left', indent: 1, bold: true },
        { value: emp.position || '—', align: 'left', indent: 1 },
        { value: emp.department || '—', align: 'left', indent: 1 },
        { value: emp.assignedProjects || 'Unassigned', align: 'left', indent: 1, wrap: true },
        { value: emp.taskCount || 0, align: 'center' },
        { value: emp.workloadScore || 0, align: 'center', bold: true },
        { value: (emp.utilizationRate || 0) / 100, align: 'center', numFmt: '0%', isUtil: true },
        { value: emp.workloadStatus || 'Available', align: 'center', isStatus: true },
      ];

      cellDefs.forEach((def, colIdx) => {
        const cell = dataRow.getCell(colIdx + 1);
        cell.value = def.value;
        cell.font = { size: 11, bold: !!def.bold, name: 'Calibri' };
        if (def.numFmt) cell.numFmt = def.numFmt;
        cell.alignment = { vertical: 'middle', horizontal: def.align, wrapText: !!def.wrap, indent: def.indent || 0 };

        cell.border = {
          top: { style: 'hair', color: { argb: XLSX_COLORS.border } },
          bottom: { style: 'hair', color: { argb: XLSX_COLORS.border } },
          left: { style: 'thin', color: { argb: XLSX_COLORS.outerBorder } },
          right: { style: 'thin', color: { argb: XLSX_COLORS.outerBorder } },
        };

        // Standard zebra striping
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseFill } };

        // Color-code Utilization Rate
        if (def.isUtil) {
          const rate = emp.utilizationRate || 0;
          let utilBg = XLSX_COLORS.utilLowBg;
          let utilText = XLSX_COLORS.utilLowText;
          if (rate >= 80) {
            utilBg = XLSX_COLORS.utilHighBg;
            utilText = XLSX_COLORS.utilHighText;
          } else if (rate >= 60) {
            utilBg = XLSX_COLORS.utilMidBg;
            utilText = XLSX_COLORS.utilMidText;
          }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: utilBg } };
          cell.font = { bold: true, size: 11, color: { argb: utilText }, name: 'Calibri' };
        }

        // Color-code Workload Status Pill Badge
        if (def.isStatus) {
          let statusBg = XLSX_COLORS.availableBg;
          let statusText = XLSX_COLORS.availableText;
          if (emp.workloadStatus === 'Limited Availability') {
            statusBg = XLSX_COLORS.limitedBg;
            statusText = XLSX_COLORS.limitedText;
          } else if (emp.workloadStatus === 'Fully Utilized') {
            statusBg = XLSX_COLORS.fullyLoadedBg;
            statusText = XLSX_COLORS.fullyLoadedText;
          }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusBg } };
          cell.font = { bold: true, size: 10, color: { argb: statusText }, name: 'Calibri' };
        }
      });

      // Dynamic row height if projects wrap
      const projectLines = emp.assignedProjects ? Math.ceil(emp.assignedProjects.length / 32) : 1;
      dataRow.height = Math.max(22, projectLines * 14 + 6);
    });

    // Solid outer border around the table
    const lastDataRow = headerRowIdx + data.length;
    for (let r = headerRowIdx; r <= lastDataRow; r++) {
      const row = worksheet.getRow(r);
      [1, totalCols].forEach(colIdx => {
        const cell = row.getCell(colIdx);
        cell.border = {
          ...cell.border,
          left: colIdx === 1 ? { style: 'medium', color: { argb: XLSX_COLORS.outerBorder } } : cell.border.left,
          right: colIdx === totalCols ? { style: 'medium', color: { argb: XLSX_COLORS.outerBorder } } : cell.border.right,
        };
      });
    }

    if (data.length > 0) {
      worksheet.getRow(lastDataRow).eachCell(cell => {
        cell.border = { ...cell.border, bottom: { style: 'medium', color: { argb: XLSX_COLORS.outerBorder } } };
      });
    }

    // AutoFilter on header row
    worksheet.autoFilter = {
      from: { row: headerRowIdx, column: 1 },
      to: { row: headerRowIdx, column: totalCols },
    };

    // --- Footer: Employee count & summary metrics ---
    const footerRowIdx = lastDataRow + 2;
    worksheet.mergeCells(footerRowIdx, 1, footerRowIdx, totalCols);
    const footerCell = worksheet.getCell(footerRowIdx, 1);
    const stats = summaryStats || {
      available: data.filter(d => d.workloadStatus === 'Available').length,
      limited: data.filter(d => d.workloadStatus === 'Limited Availability').length,
      fullyLoaded: data.filter(d => d.workloadStatus === 'Fully Utilized').length,
      avgUtilization: data.length > 0 ? Math.round(data.reduce((sum, d) => sum + (d.utilizationRate || 0), 0) / data.length) : 0,
    };
    footerCell.value = `${data.length} employee(s)   |   Available: ${stats.available}   |   Limited Availability: ${stats.limited}   |   Fully Utilized: ${stats.fullyLoaded}   |   Avg Utilization: ${stats.avgUtilization}%`;
    footerCell.font = { italic: true, size: 9, color: { argb: XLSX_COLORS.subText }, name: 'Calibri' };
    footerCell.alignment = { horizontal: 'left', indent: 1 };

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=WEA_Utilization_Report_${new Date().toISOString().split('T')[0]}.xlsx`);

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);
  } catch (error) {
    console.error('❌ Error generating Excel report:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = router;