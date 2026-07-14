// backend/routes/ProjectManager/dashboard.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

// GET /api/pm/dashboard — aggregate stats for the PM dashboard
// REMOVED: totalHoursThisWeek since it's fetched by employees endpoint
router.get('/dashboard', async (req, res) => {
  try {
    const { createdBy } = req.query;

    // Use Promise.all for parallel queries
    const [projectsResult, tasksResult] = await Promise.all([
      // Fetch projects
      supabase
        .from('projects')
        .select('id, status')
        .eq('created_by', createdBy),
      
      // Fetch tasks - separate query to avoid complex joins
      supabase
        .from('project_tasks')
        .select('id, status, project_id')
    ]);

    if (projectsResult.error) throw projectsResult.error;
    if (tasksResult.error) throw tasksResult.error;

    const projects = projectsResult.data || [];
    const allTasks = tasksResult.data || [];

    const projectIds = projects.map(p => p.id);
    
    // Filter tasks for these projects
    const projectTasks = allTasks.filter(t => projectIds.includes(t.project_id));

    // Get assignments in parallel
    let assignments = [];
    if (projectIds.length > 0) {
      const { data, error } = await supabase
        .from('project_assignments')
        .select('profile_id')
        .in('project_id', projectIds);
      
      if (error) throw error;
      assignments = data || [];
    }

    const uniqueTeamMemberIds = [...new Set(assignments.map(a => a.profile_id))];

    res.status(200).json({
      success: true,
      data: {
        activeProjectsCount: projects.filter(p => p.status === 'Active').length,
        totalProjectsCount: projects.length,
        totalTeamMembers: uniqueTeamMemberIds.length,
        // REMOVED: totalHoursThisWeek - fetched by employees endpoint
        totalTasksCount: projectTasks.length,
        tasksByStatus: {
          Pending: projectTasks.filter(t => t.status === 'Pending').length,
          'In Progress': projectTasks.filter(t => t.status === 'In Progress').length,
          Completed: projectTasks.filter(t => t.status === 'Completed').length,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching PM dashboard stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch dashboard stats', 
      error: error.message 
    });
  }
});

module.exports = router;