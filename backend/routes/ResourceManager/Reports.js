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
    const { format = 'pdf', departmentFilter = null } = req.body;
    const userBranchId = req.user.branch_id;
    const isSuperAdmin = req.user.is_super_admin;

    let branchName = 'All Branches';
    if (!isSuperAdmin && userBranchId) {
      branchName = await getBranchName(userBranchId);
    }

    console.log(`📊 Generating utilization report by: ${req.user.employee_id}`);
    console.log(`📊 Format: ${format}, Branch: ${branchName}`);

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

    const assignments = (assignmentsResult.data || []).filter(a => activeProjectIds.has(a.project_id));
    const tasks = (tasksResult.data || []).filter(t => activeProjectIds.has(t.project_id));

    console.log(`📊 Employees found: ${employees.length}`);
    console.log(`📊 Active projects found: ${activeProjects.length}`);
    console.log(`📊 Active assignments found: ${assignments.length}`);
    console.log(`📊 Active tasks found: ${tasks.length}`);

    const assignmentCounts = {};
    for (const a of assignments) {
      assignmentCounts[a.profile_id] = (assignmentCounts[a.profile_id] || 0) + 1;
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
        assignmentCount,
        taskCount,
        workloadScore,
        workloadStatus,
        utilizationRate,
        status: emp.status,
        joinedDate: emp.created_at,
      };
    });

    const finalStats = { Available: 0, 'Limited Availability': 0, 'Fully Utilized': 0 };
    for (const emp of reportData) {
      finalStats[emp.workloadStatus] = (finalStats[emp.workloadStatus] || 0) + 1;
    }
    console.log('📊 Report Workload Distribution:', finalStats);

    reportData.sort((a, b) => b.workloadScore - a.workloadScore);

    // ✅ Generate report based on format
    if (format === 'pdf') {
      return await generatePDFReport(res, reportData, req.user, branchName);
    } else if (format === 'excel') {
      return await generateExcelReport(res, reportData, req.user, branchName);
    } else {
      return res.json({
        success: true,
        data: reportData,
        meta: {
          totalEmployees: reportData.length,
          generatedAt: new Date().toISOString(),
          branch: branchName,
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
// PDF GENERATION - FIXED SPACING
// ============================================
const generatePDFReport = async (res, data, user, branchName) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=Utilization_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  
  doc.pipe(res);

  // ✅ Header
  doc.fontSize(20)
     .font('Helvetica-Bold')
     .text('Employee Utilization Report', { align: 'center' });
  
  doc.moveDown();
  
  doc.fontSize(10)
     .font('Helvetica')
     .text(`Generated: ${new Date().toLocaleString()}`);
  doc.text(`Branch: ${branchName || 'All Branches'}`);
  doc.text(`Total Employees: ${data.length}`);
  
  doc.moveDown();

  // ✅ Summary Stats
  const available = data.filter(d => d.workloadStatus === 'Available').length;
  const limited = data.filter(d => d.workloadStatus === 'Limited Availability').length;
  const fullyLoaded = data.filter(d => d.workloadStatus === 'Fully Utilized').length;
  const avgUtilization = data.length > 0 ? Math.round(data.reduce((sum, d) => sum + d.utilizationRate, 0) / data.length) : 0;
  const avgWorkloadScore = data.length > 0 ? Math.round(data.reduce((sum, d) => sum + d.workloadScore, 0) / data.length) : 0;

  doc.fontSize(12)
     .font('Helvetica-Bold')
     .text('Summary', { underline: true });
  
  doc.moveDown(0.5);
  
  // ✅ Summary in two columns - wider labels
  const summaryX1 = 50;
  const summaryX2 = 220;
  let summaryY = doc.y;
  
  doc.fontSize(10)
     .font('Helvetica')
     .text('Available:', summaryX1, summaryY, { width: 120 })
     .text(`${available} employees`, summaryX2, summaryY, { width: 100, align: 'right' });
  
  summaryY += 16;
  doc.text('Limited Availability:', summaryX1, summaryY, { width: 120 })
     .text(`${limited} employees`, summaryX2, summaryY, { width: 100, align: 'right' });
  
  summaryY += 16;
  doc.text('Fully Utilized:', summaryX1, summaryY, { width: 120 })
     .text(`${fullyLoaded} employees`, summaryX2, summaryY, { width: 100, align: 'right' });
  
  summaryY += 16;
  doc.text('Average Utilization:', summaryX1, summaryY, { width: 120 })
     .text(`${avgUtilization}%`, summaryX2, summaryY, { width: 100, align: 'right' });
  
  summaryY += 16;
  doc.text('Average Workload Score:', summaryX1, summaryY, { width: 120 })
     .text(`${avgWorkloadScore}`, summaryX2, summaryY, { width: 100, align: 'right' });
  
  doc.moveDown(2);

  // ✅ Employee Table - Wide enough for all columns
  doc.fontSize(10)
     .font('Helvetica-Bold')
     .text('Employee Details', { underline: true });
  
  doc.moveDown(0.5);

  // ✅ Table with wider columns
  const col1 = 20;   // #
  const col2 = 75;   // Employee ID
  const col3 = 105;  // Name
  const col4 = 95;   // Position (wider)
  const col5 = 40;   // Score
  const col6 = 50;   // Utilization
  const col7 = 80;   // Status (wider)
  
  const yStart = doc.y;
  
  // ✅ Table Header with background
  const headerY = yStart;
  doc.rect(30, headerY - 2, 500, 16).fill('#e5e7eb');
  
  doc.fontSize(7.5)
     .font('Helvetica-Bold')
     .fillColor('#1f2937')
     .text('#', col1, headerY, { width: 18, align: 'center' })
     .text('Employee ID', col1 + 22, headerY, { width: 65, align: 'center' })
     .text('Name', col1 + 90, headerY, { width: 95, align: 'left' })
     .text('Position', col1 + 190, headerY, { width: 90, align: 'left' })
     .text('Score', col1 + 285, headerY, { width: 35, align: 'center' })
     .text('Utilization', col1 + 325, headerY, { width: 45, align: 'center' })
     .text('Status', col1 + 375, headerY, { width: 75, align: 'center' });

  let y = yStart + 20;
  
  data.forEach((emp, index) => {
    if (y > 720) {
      doc.addPage();
      y = 40;
      doc.rect(30, y - 2, 500, 16).fill('#e5e7eb');
      doc.fontSize(7.5)
         .font('Helvetica-Bold')
         .fillColor('#1f2937')
         .text('#', col1, y, { width: 18, align: 'center' })
         .text('Employee ID', col1 + 22, y, { width: 65, align: 'center' })
         .text('Name', col1 + 90, y, { width: 95, align: 'left' })
         .text('Position', col1 + 190, y, { width: 90, align: 'left' })
         .text('Score', col1 + 285, y, { width: 35, align: 'center' })
         .text('Utilization', col1 + 325, y, { width: 45, align: 'center' })
         .text('Status', col1 + 375, y, { width: 75, align: 'center' });
      y += 20;
    }
    
    if (index % 2 === 0) {
      doc.rect(30, y - 2, 500, 14).fill('#f9fafb');
    }
    
    let statusColor = '#22c55e';
    if (emp.workloadStatus === 'Limited Availability') statusColor = '#f59e0b';
    if (emp.workloadStatus === 'Fully Utilized') statusColor = '#ef4444';
    
    let scoreColor = '#22c55e';
    if (emp.workloadScore >= 2) scoreColor = '#f59e0b';
    if (emp.workloadScore >= 4) scoreColor = '#ef4444';
    
    doc.fontSize(7)
       .font('Helvetica')
       .fillColor('#111827')
       .text(String(index + 1), col1, y, { width: 18, align: 'center' })
       .text(emp.employeeId || '—', col1 + 22, y, { width: 65, align: 'center' })
       .text(emp.name, col1 + 90, y, { width: 95, align: 'left' })
       .text(emp.position, col1 + 190, y, { width: 90, align: 'left' })
       .fillColor(scoreColor)
       .text(String(emp.workloadScore), col1 + 285, y, { width: 35, align: 'center' })
       .fillColor(statusColor)
       .text(`${emp.utilizationRate}%`, col1 + 325, y, { width: 45, align: 'center' })
       .text(emp.workloadStatus, col1 + 375, y, { width: 75, align: 'center' });
    
    y += 14;
  });

  doc.moveDown();
  doc.fontSize(8)
     .fillColor('#6b7280')
     .text(`Generated by WEA Resource Management System • Page ${doc.pageNumber}`, { align: 'center' });

  doc.end();
};

// ============================================
// EXCEL GENERATION - FIXED (DATA NOW SHOWS)
// ============================================
const generateExcelReport = async (res, data, user, branchName) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Utilization Report');

    // ✅ Title Section
    worksheet.addRow(['Employee Utilization Report']);
    worksheet.mergeCells(`A${worksheet.rowCount}:L${worksheet.rowCount}`);
    worksheet.getRow(worksheet.rowCount).font = { size: 18, bold: true, color: { argb: 'FF1F2937' } };
    worksheet.getRow(worksheet.rowCount).alignment = { horizontal: 'center' };
    
    worksheet.addRow([]);
    worksheet.addRow([`Generated: ${new Date().toLocaleString()}`]);
    worksheet.addRow([`Branch: ${branchName || 'All Branches'}`]);
    worksheet.addRow([]);

    // ✅ Summary Section
    const available = data.filter(d => d.workloadStatus === 'Available').length;
    const limited = data.filter(d => d.workloadStatus === 'Limited Availability').length;
    const fullyLoaded = data.filter(d => d.workloadStatus === 'Fully Utilized').length;
    const avgUtil = data.length > 0 ? Math.round(data.reduce((sum, d) => sum + d.utilizationRate, 0) / data.length) : 0;
    const avgScore = data.length > 0 ? Math.round(data.reduce((sum, d) => sum + d.workloadScore, 0) / data.length) : 0;

    const summaryRow = worksheet.addRow(['📊 SUMMARY']);
    summaryRow.font = { bold: true, size: 12, color: { argb: 'FF1F2937' } };
    
    // ✅ Make sure all summary data is added correctly
    worksheet.addRow(['Available:', available]);
    worksheet.addRow(['Limited Availability:', limited]);
    worksheet.addRow(['Fully Utilized:', fullyLoaded]);
    worksheet.addRow(['Average Utilization:', `${avgUtil}%`]);
    worksheet.addRow(['Average Workload Score:', avgScore]);
    worksheet.addRow([]);

    // ✅ Employee Table Headers
    const headerRow = worksheet.addRow([
      '#', 
      'Employee ID', 
      'Full Name', 
      'Position', 
      'Department',
      'Assignments', 
      'Tasks', 
      'Workload Score', 
      'Utilization Rate', 
      'Workload Status',
      'Status',
      'Joined Date'
    ]);
    
    // ✅ Style headers
    headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    
    // ✅ Set column widths
    worksheet.getColumn(1).width = 5;
    worksheet.getColumn(2).width = 15;
    worksheet.getColumn(3).width = 25;
    worksheet.getColumn(4).width = 22;
    worksheet.getColumn(5).width = 22;
    worksheet.getColumn(6).width = 12;
    worksheet.getColumn(7).width = 10;
    worksheet.getColumn(8).width = 16;
    worksheet.getColumn(9).width = 16;
    worksheet.getColumn(10).width = 22;
    worksheet.getColumn(11).width = 12;
    worksheet.getColumn(12).width = 15;

    // ✅ Add data rows
    data.forEach((emp, index) => {
      const row = worksheet.addRow([
        index + 1,
        emp.employeeId || '—',
        emp.name,
        emp.position,
        emp.department,
        emp.assignmentCount || 0,
        emp.taskCount || 0,
        emp.workloadScore || 0,
        `${emp.utilizationRate}%`,
        emp.workloadStatus,
        emp.status || 'Active',
        emp.joinedDate ? new Date(emp.joinedDate).toLocaleDateString() : '—',
      ]);

      // ✅ Color-code Workload Score
      const scoreCell = row.getCell(8);
      if (emp.workloadScore >= 4) {
        scoreCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
        scoreCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      } else if (emp.workloadScore >= 2) {
        scoreCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
      } else {
        scoreCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00FF00' } };
      }

      // ✅ Color-code Workload Status
      const statusCell = row.getCell(10);
      if (emp.workloadStatus === 'Available') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22C55E' } };
        statusCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      } else if (emp.workloadStatus === 'Limited Availability') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
        statusCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      } else if (emp.workloadStatus === 'Fully Utilized') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } };
        statusCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      }

      // ✅ Color-code Utilization Rate
      const utilCell = row.getCell(9);
      if (emp.utilizationRate >= 80) {
        utilCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
        utilCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      } else if (emp.utilizationRate >= 50) {
        utilCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
      } else {
        utilCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00FF00' } };
      }
    });

    // ✅ Add alternating row colors
    for (let i = 1; i <= data.length; i++) {
      const row = worksheet.getRow(i + 12); // Starting after headers + summary
      if (i % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF9FAFB' }
          };
        });
      }
    }

    // ✅ Add borders
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
      });
    });

    // ✅ Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Utilization_Report_${new Date().toISOString().split('T')[0]}.xlsx`);

    // ✅ Write to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('❌ Error generating Excel report:', error);
    // If Excel fails, send error response
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};

module.exports = router;