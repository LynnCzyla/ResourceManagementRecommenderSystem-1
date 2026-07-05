// backend/routes/ProjectManager/employees.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

// Transform a profiles row (joined with positions/departments) into the
// shape the PM tabs expect (PMDashboardTab, PMProjectTrackingTab).
function transformEmployee(row) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unnamed';
  return {
    id: row.id,
    employeeId: row.employee_id,
    name,
    role: row.positions?.position_name || 'Unassigned',
    department: row.departments?.department_name || '',
    avatar: row.avatar_url || `https://ui-avatars.com/api/?background=3b82f6&color=fff&name=${encodeURIComponent(name)}`,
    availability: row.availability_status,
    totalAvailableHours: row.total_available_hours,
  };
}

const EMPLOYEE_SELECT = `
  id,
  employee_id,
  first_name,
  last_name,
  avatar_url,
  availability_status,
  total_available_hours,
  status,
  positions ( position_name ),
  departments ( department_name )
`;

// GET /api/pm/employees — list active employees (optional ?departmentId=)
router.get('/employees', async (req, res) => {
  try {
    const { departmentId } = req.query;

    let query = supabase
      .from('profiles')
      .select(EMPLOYEE_SELECT)
      .eq('status', 'Active')
      .order('first_name', { ascending: true });

    if (departmentId) query = query.eq('department_id', departmentId);

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json({ success: true, data: (data || []).map(transformEmployee) });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch employees', error: error.message });
  }
});

module.exports = router;