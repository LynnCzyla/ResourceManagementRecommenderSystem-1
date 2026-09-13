const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

async function testExports() {
  console.log('Testing User Accounts Excel & PDF generation...');

  const mockRows = [
    {
      employee_id: 'WEA-PHIL-001',
      name: 'John Doe',
      email: 'john@wea.com',
      role: 'Admin',
      department: 'Management',
      position: 'Branch Administrator',
      branch_name: 'WEA Manila',
      status: 'Active',
      created: '2026-01-15'
    },
    {
      employee_id: 'WEA-PHIL-002',
      name: 'Jane Smith',
      email: 'jane@wea.com',
      role: 'Resource Manager',
      department: 'Operations',
      position: 'Lead Resource Manager',
      branch_name: 'WEA Manila',
      status: 'Locked',
      created: '2026-02-10'
    }
  ];

  // Test Excel
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('User Accounts');
  ws.columns = [
    { header: 'Employee ID', width: 18 },
    { header: 'Full Name', width: 26 },
    { header: 'Email Address', width: 30 },
    { header: 'System Role', width: 20 },
    { header: 'Department', width: 22 },
    { header: 'Position', width: 24 },
    { header: 'Branch', width: 20 },
    { header: 'Status', width: 16 },
    { header: 'Created Date', width: 16 }
  ];
  mockRows.forEach(row => {
    ws.addRow([
      row.employee_id, row.name, row.email, row.role,
      row.department, row.position, row.branch_name, row.status, row.created
    ]);
  });
  const excelBuffer = await workbook.xlsx.writeBuffer();
  console.log('✅ Excel buffer generated successfully, bytes:', excelBuffer.length);

  // Test PDF
  const doc = new PDFDocument({ margin: 35, size: 'A4' });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  doc.on('end', () => {
    const pdfBuffer = Buffer.concat(chunks);
    console.log('✅ PDF buffer generated successfully, bytes:', pdfBuffer.length);
  });
  doc.fontSize(12).text('WEA User Accounts Directory');
  doc.end();
}

testExports().catch(console.error);
