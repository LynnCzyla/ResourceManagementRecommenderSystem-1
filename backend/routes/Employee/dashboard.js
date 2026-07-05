const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { verifyToken } = require('../Middleware/auth');

router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get employee profile with department name
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*, departments(department_name)')
      .eq('id', userId)
      .single();

    if (profileError) throw profileError;

    const employeeId = profile.employee_id;
    const departmentName = profile.departments?.department_name || '';

    // Fetch assigned projects count
    const { count: assignedProjectsCount } = await supabase
      .from('project_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', userId);

    // Fetch tasks count & status breakdown
    const { data: tasks, error: tasksError } = await supabase
      .from('project_tasks')
      .select('status')
      .eq('profile_id', userId);

    if (tasksError) throw tasksError;

    const activeTasksCount = (tasks || []).filter(t => t.status === 'In Progress' || t.status === 'Pending').length;
    const completedTasksCount = (tasks || []).filter(t => t.status === 'Completed').length;

    // Fetch certifications count
    const { count: certificationsCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('employee_id', employeeId)
      .eq('document_type', 'Certificate');

    const employeeInfo = {
      id: employeeId,
      name: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Unnamed',
      role: profile.role || 'Employee',
      email: req.user.email || '',
      avatar: profile.avatar_url || `https://ui-avatars.com/api/?background=3b82f6&color=fff&name=${encodeURIComponent([profile.first_name, profile.last_name].filter(Boolean).join(' '))}`,
      department: departmentName,
      certifications: []
    };

    res.json({
      success: true,
      data: {
        employeeInfo,
        assignedProjectsCount: assignedProjectsCount || 0,
        activeTasksCount,
        completedTasksCount,
        certificationsCount: certificationsCount || 0
      }
    });
  } catch (error) {
    console.error('Error fetching employee dashboard stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
