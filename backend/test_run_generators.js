const fs = require('fs');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const mockData = [
  {
    employeeId: 'WEA-PHIL-005',
    name: 'Carlo Miguel Reyes',
    position: 'Senior Design Engineer',
    department: 'Engineering',
    assignedProjects: 'Medium Voltage Switchgear Bid Proposal',
    taskCount: 3,
    workloadScore: 3,
    utilizationRate: 50,
    workloadStatus: 'Limited Availability',
  },
  {
    employeeId: 'WEA-PHIL-006',
    name: 'Patrick Lawrence Cruz',
    position: 'Proposal Engineer',
    department: 'Engineering',
    assignedProjects: 'Industrial Warehouse Lighting Design',
    taskCount: 2,
    workloadScore: 2,
    utilizationRate: 33,
    workloadStatus: 'Limited Availability',
  },
  {
    employeeId: 'WEA-PHIL-008',
    name: 'Aaron Joseph Garcia',
    position: 'Inside Sales Engineer',
    department: 'Sales',
    assignedProjects: 'Unassigned',
    taskCount: 0,
    workloadScore: 0,
    utilizationRate: 0,
    workloadStatus: 'Available',
  },
  {
    employeeId: 'WEA-PHIL-007',
    name: 'Christian Paolo Mendoza',
    position: 'Sales Engineer',
    department: 'Sales',
    assignedProjects: 'UPS Installation & Commissioning – Data Center',
    taskCount: 5,
    workloadScore: 6,
    utilizationRate: 100,
    workloadStatus: 'Fully Utilized',
  }
];

async function testGenerators() {
  // Test PDF
  const pdfDoc = new PDFDocument({ margin: 35, size: 'A4', bufferPages: true });
  const pdfChunks = [];
  pdfDoc.on('data', c => pdfChunks.push(c));

  // Corporate banner
  pdfDoc.rect(0, 0, 595.28, 50).fill('#0b1220');
  pdfDoc.rect(0, 50, 595.28, 3.5).fill('#f5b700');
  pdfDoc.fillColor('#ffffff').fontSize(12.5).font('Helvetica-Bold').text('WEA  •  RESOURCE MANAGEMENT SYSTEM', 35, 14);
  pdfDoc.fillColor('#94a3b8').fontSize(8.5).font('Helvetica').text('EMPLOYEE UTILIZATION & WORKLOAD REPORT', 35, 30);
  pdfDoc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text('CONFIDENTIAL  |  INTERNAL REPORT', 35, 20, { width: 525, align: 'right' });

  // Subtitle
  pdfDoc.roundedRect(35, 64, 525, 22, 3).fill('#f1f5f9');
  pdfDoc.fillColor('#475569').fontSize(8).font('Helvetica');
  pdfDoc.text('Generated: 9/13/2026, 1:00:00 PM   |   Branch: All Branches   |   Filter: All   |   Employees: 4', 45, 70, { width: 505 });

  // KPI cards
  const kpiCards = [
    { label: 'AVAILABLE', val: '1', bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d' },
    { label: 'LIMITED AVAILABILITY', val: '2', bg: '#fffbeb', border: '#fde68a', color: '#b45309' },
    { label: 'FULLY UTILIZED', val: '1', bg: '#fef2f2', border: '#fecaca', color: '#b91c1c' },
    { label: 'AVG UTILIZATION', val: '46%', bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
  ];
  kpiCards.forEach((kpi, idx) => {
    const cardX = 35 + idx * (123 + 11);
    pdfDoc.lineWidth(0.75).strokeColor(kpi.border).fillColor(kpi.bg).roundedRect(cardX, 94, 123, 40, 4).fillAndStroke();
    pdfDoc.fillColor(kpi.color).fontSize(6.5).font('Helvetica-Bold').text(kpi.label, cardX + 8, 94 + 6, { width: 123 - 16 });
    pdfDoc.fillColor(kpi.color).fontSize(14).font('Helvetica-Bold').text(kpi.val, cardX + 8, 94 + 18, { width: 123 - 16 });
  });

  // Table header
  pdfDoc.rect(35, 144, 525, 20).fill('#1e3a5f');
  pdfDoc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
  pdfDoc.text('ID', 35, 150, { width: 60, align: 'center' });
  pdfDoc.text('Employee Name', 99, 150, { width: 88, align: 'left' });
  pdfDoc.text('Role / Position', 191, 150, { width: 88, align: 'left' });
  pdfDoc.text('Assigned Project', 283, 150, { width: 82, align: 'left' });
  pdfDoc.text('Tasks', 365, 150, { width: 26, align: 'center' });
  pdfDoc.text('Score', 391, 150, { width: 26, align: 'center' });
  pdfDoc.text('Utilization', 417, 150, { width: 42, align: 'center' });
  pdfDoc.text('Status', 459, 150, { width: 101, align: 'center' });

  let y = 164;
  mockData.forEach((emp, index) => {
    const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
    pdfDoc.rect(35, y, 525, 19).fill(rowBg);
    pdfDoc.lineWidth(0.5).strokeColor('#e2e8f0').moveTo(35, y + 19).lineTo(560, y + 19).stroke();

    pdfDoc.fillColor('#475569').fontSize(7).font('Helvetica').text(emp.employeeId, 35, y + 5.5, { width: 60, align: 'center' });
    pdfDoc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold').text(emp.name, 99, y + 5.5, { width: 88, align: 'left' });
    pdfDoc.fillColor('#475569').fontSize(7).font('Helvetica').text(emp.position, 191, y + 5.5, { width: 88, align: 'left' });
    pdfDoc.fillColor('#334155').fontSize(7).font('Helvetica').text(emp.assignedProjects, 283, y + 5.5, { width: 82, align: 'left' });
    pdfDoc.fillColor('#0f172a').fontSize(7.5).font('Helvetica').text(String(emp.taskCount), 365, y + 5.5, { width: 26, align: 'center' });
    pdfDoc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold').text(String(emp.workloadScore), 391, y + 5.5, { width: 26, align: 'center' });

    const uRate = emp.utilizationRate;
    const utilColor = uRate >= 80 ? '#b91c1c' : uRate >= 60 ? '#15803d' : '#1d4ed8';
    pdfDoc.fillColor(utilColor).fontSize(7.5).font('Helvetica-Bold').text(`${uRate}%`, 417, y + 5.5, { width: 42, align: 'center' });

    let badgeBg = emp.workloadStatus === 'Available' ? '#dcfce7' : emp.workloadStatus === 'Limited Availability' ? '#fef3c7' : '#fee2e2';
    let badgeText = emp.workloadStatus === 'Available' ? '#15803d' : emp.workloadStatus === 'Limited Availability' ? '#b45309' : '#b91c1c';
    pdfDoc.roundedRect(472, y + 2.5, 75, 14, 3).fill(badgeBg);
    pdfDoc.fillColor(badgeText).fontSize(6.5).font('Helvetica-Bold').text(emp.workloadStatus, 472, y + 5.5, { width: 75, align: 'center' });
    y += 19;
  });

  pdfDoc.lineWidth(1).strokeColor('#1e3a5f').rect(35, 144, 525, y - 144).stroke();

  const pageRange = pdfDoc.bufferedPageRange();
  for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
    pdfDoc.switchToPage(i);
    pdfDoc.lineWidth(0.5).strokeColor('#e2e8f0').moveTo(35, 808).lineTo(560, 808).stroke();
    pdfDoc.fillColor('#94a3b8').fontSize(7).font('Helvetica')
       .text(`WEA Resource Management System  •  Generated on 9/13/2026`, 35, 814, { align: 'left' });
    pdfDoc.fillColor('#94a3b8').fontSize(7).font('Helvetica')
       .text(`Page ${i + 1} of ${pageRange.count}`, 35, 814, { width: 525, align: 'right' });
  }

  await new Promise(resolve => {
    pdfDoc.on('end', resolve);
    pdfDoc.end();
  });

  const pdfBuffer = Buffer.concat(pdfChunks);
  console.log('✅ PDF generated successfully! Size:', pdfBuffer.length, 'bytes');

  // Test Excel
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Utilization & Workload', {
    views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
  });

  const XLSX_COLORS = {
    titleBg: 'FF0B1220',
    titleAccent: 'FFF5B700',
    titleText: 'FFFFFFFF',
    subBg: 'FFF1F5F9',
    subText: 'FF475569',
    headerBg: 'FF1E3A5F',
    headerText: 'FFFFFFFF',
    rowEven: 'FFFFFFFF',
    rowOdd: 'FFF6F8FA',
    border: 'FFD9DEE4',
    outerBorder: 'FF1E3A5F',
    availableBg: 'FFDCFCE7',
    availableText: 'FF15803D',
    limitedBg: 'FFFEF3C7',
    limitedText: 'FFB45309',
    fullyLoadedBg: 'FFFEE2E2',
    fullyLoadedText: 'FFB91C1C',
    utilLowBg: 'FFDBEAFE',
    utilLowText: 'FF1D4ED8',
    utilMidBg: 'FFDCFCE7',
    utilMidText: 'FF15803D',
    utilHighBg: 'FFFEE2E2',
    utilHighText: 'FFB91C1C',
  };

  const columns = [
    { header: 'Employee ID', width: 16 },
    { header: 'Employee Name', width: 26 },
    { header: 'Role / Position', width: 26 },
    { header: 'Department', width: 22 },
    { header: 'Active Projects', width: 34 },
    { header: 'Tasks', width: 12 },
    { header: 'Workload Score', width: 16 },
    { header: 'Utilization', width: 14 },
    { header: 'Workload Status', width: 22 },
  ];
  sheet.columns = columns.map(c => ({ width: c.width }));
  const totalCols = columns.length;

  sheet.mergeCells(1, 1, 1, totalCols);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = 'WEA  •  EMPLOYEE UTILIZATION & WORKLOAD REPORT';
  titleCell.font = { bold: true, size: 15, color: { argb: XLSX_COLORS.titleText }, name: 'Calibri' };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell({ includeEmpty: true }, c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.titleBg } });

  sheet.mergeCells(2, 1, 2, totalCols);
  sheet.getRow(2).height = 4;
  sheet.getRow(2).eachCell({ includeEmpty: true }, c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.titleAccent } });

  sheet.mergeCells(3, 1, 3, totalCols);
  const subCell = sheet.getCell(3, 1);
  subCell.value = 'Generated 9/13/2026, 1:00:00 PM      Branch: All Branches   |   Filter: All   |   Total Employees: 4';
  subCell.font = { italic: true, size: 10, color: { argb: XLSX_COLORS.subText }, name: 'Calibri' };
  subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(3).height = 20;
  sheet.getRow(3).eachCell({ includeEmpty: true }, c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.subBg } });

  sheet.getRow(4).height = 8;

  const headerRow = sheet.getRow(5);
  columns.forEach((col, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = col.header;
    c.font = { bold: true, size: 11, color: { argb: XLSX_COLORS.headerText }, name: 'Calibri' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.headerBg } };
    c.alignment = { vertical: 'middle', horizontal: i === 0 || i >= 5 ? 'center' : 'left', indent: (i > 0 && i < 5) ? 1 : 0 };
    c.border = {
      top: { style: 'thin', color: { argb: XLSX_COLORS.outerBorder } },
      bottom: { style: 'medium', color: { argb: XLSX_COLORS.outerBorder } },
      left: { style: 'thin', color: { argb: XLSX_COLORS.outerBorder } },
      right: { style: 'thin', color: { argb: XLSX_COLORS.outerBorder } },
    };
  });
  headerRow.height = 24;

  mockData.forEach((emp, idx) => {
    const row = sheet.getRow(6 + idx);
    const baseFill = idx % 2 === 0 ? XLSX_COLORS.rowEven : XLSX_COLORS.rowOdd;
    const values = [
      emp.employeeId, emp.name, emp.position, emp.department, emp.assignedProjects,
      emp.taskCount, emp.workloadScore, emp.utilizationRate / 100, emp.workloadStatus
    ];
    values.forEach((v, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.value = v;
      cell.font = { size: 11, name: 'Calibri', bold: colIdx === 1 || colIdx === 6 || colIdx === 7 || colIdx === 8 };
      if (colIdx === 7) cell.numFmt = '0%';
      cell.alignment = { vertical: 'middle', horizontal: colIdx === 0 || colIdx >= 5 ? 'center' : 'left', indent: (colIdx > 0 && colIdx < 5) ? 1 : 0 };
      cell.border = {
        top: { style: 'hair', color: { argb: XLSX_COLORS.border } },
        bottom: { style: 'hair', color: { argb: XLSX_COLORS.border } },
        left: { style: 'thin', color: { argb: XLSX_COLORS.outerBorder } },
        right: { style: 'thin', color: { argb: XLSX_COLORS.outerBorder } },
      };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseFill } };

      if (colIdx === 7) {
        const uBg = emp.utilizationRate >= 80 ? XLSX_COLORS.utilHighBg : emp.utilizationRate >= 60 ? XLSX_COLORS.utilMidBg : XLSX_COLORS.utilLowBg;
        const uTxt = emp.utilizationRate >= 80 ? XLSX_COLORS.utilHighText : emp.utilizationRate >= 60 ? XLSX_COLORS.utilMidText : XLSX_COLORS.utilLowText;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: uBg } };
        cell.font = { bold: true, size: 11, color: { argb: uTxt }, name: 'Calibri' };
      }
      if (colIdx === 8) {
        const sBg = emp.workloadStatus === 'Available' ? XLSX_COLORS.availableBg : emp.workloadStatus === 'Limited Availability' ? XLSX_COLORS.limitedBg : XLSX_COLORS.fullyLoadedBg;
        const sTxt = emp.workloadStatus === 'Available' ? XLSX_COLORS.availableText : emp.workloadStatus === 'Limited Availability' ? XLSX_COLORS.limitedText : XLSX_COLORS.fullyLoadedText;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sBg } };
        cell.font = { bold: true, size: 10, color: { argb: sTxt }, name: 'Calibri' };
      }
    });
    row.height = 22;
  });

  const lastRow = 5 + mockData.length;
  for (let r = 5; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    [1, totalCols].forEach(colIdx => {
      const cell = row.getCell(colIdx);
      cell.border = {
        ...cell.border,
        left: colIdx === 1 ? { style: 'medium', color: { argb: XLSX_COLORS.outerBorder } } : cell.border.left,
        right: colIdx === totalCols ? { style: 'medium', color: { argb: XLSX_COLORS.outerBorder } } : cell.border.right,
      };
    });
  }
  sheet.getRow(lastRow).eachCell(c => c.border = { ...c.border, bottom: { style: 'medium', color: { argb: XLSX_COLORS.outerBorder } } });

  const footerRow = sheet.getRow(lastRow + 2);
  sheet.mergeCells(lastRow + 2, 1, lastRow + 2, totalCols);
  footerRow.getCell(1).value = '4 employee(s)   |   Available: 1   |   Limited Availability: 2   |   Fully Utilized: 1   |   Avg Utilization: 46%';
  footerRow.getCell(1).font = { italic: true, size: 9, color: { argb: XLSX_COLORS.subText }, name: 'Calibri' };
  footerRow.getCell(1).alignment = { horizontal: 'left', indent: 1 };

  const excelBuffer = await workbook.xlsx.writeBuffer();
  console.log('✅ Excel generated successfully! Size:', excelBuffer.length, 'bytes');
}

testGenerators().catch(console.error);
