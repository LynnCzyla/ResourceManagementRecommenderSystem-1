// backend/routes/ProjectManager/dashboard.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

// GET /api/pm/dashboard — aggregate stats for the PM dashboard (optional ?createdBy=<profileId>)
// Note: there's no attendance table in the current schema, so daily
// attendance is left out here — PMDashboardTab's attendance panel will
// need either a new table or to keep using its own mock data for that part.
router.get('/dashboard', async (req, res) => {
  try {
    const { createdBy } = req.query;

    let projectQuery = supabase.from('projects').select('id, status');
    if (createdBy) projectQuery = projectQuery.eq('created_by', createdBy);
    const { data: projects, error: projectError } = await projectQuery;
    if (projectError) throw projectError;

    const projectIds = (projects || []).map(p => p.id);
    const activeProjectsCount = (projects || []).filter(p => p.status === 'Active').length;

    let assignments = [];
    if (projectIds.length > 0) {
      const { data, error } = await supabase
        .from('project_assignments')
        .select('profile_id, allocated_hours, status')
        .in('project_id', projectIds);
      if (error) throw error;
      assignments = data || [];
    }

    const uniqueTeamMemberIds = [...new Set(assignments.map(a => a.profile_id))];
    const totalHoursThisWeek = assignments.reduce((sum, a) => sum + (a.allocated_hours || 0), 0);

    let tasks = [];
    if (projectIds.length > 0) {
      const { data, error } = await supabase
        .from('project_tasks')
        .select('id, status, profile_id')
        .in('project_id', projectIds);
      if (error) throw error;
      tasks = data || [];
    }

    res.status(200).json({
      success: true,
      data: {
        activeProjectsCount,
        totalProjectsCount: (projects || []).length,
        totalTeamMembers: uniqueTeamMemberIds.length,
        totalHoursThisWeek,
        totalTasksCount: tasks.length,
        tasksByStatus: {
          Pending: tasks.filter(t => t.status === 'Pending').length,
          'In Progress': tasks.filter(t => t.status === 'In Progress').length,
          Completed: tasks.filter(t => t.status === 'Completed').length,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching PM dashboard stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats', error: error.message });
  }
});

module.exports = router;