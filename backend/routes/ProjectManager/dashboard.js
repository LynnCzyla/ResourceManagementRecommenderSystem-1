// backend/routes/ProjectManager/dashboard.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

router.get('/dashboard', async (req, res) => {
  try {
    const { createdBy } = req.query;

    // ✅ FIXED: Fetch projects first
    const projectsResult = await supabase
      .from('projects')
      .select('id, status')
      .eq('created_by', createdBy);

    if (projectsResult.error) throw projectsResult.error;

    const projects = projectsResult.data || [];
    const projectIds = projects.map(p => p.id);

    // ✅ FIXED: Only fetch tasks for these project IDs
    let tasks = [];
    if (projectIds.length > 0) {
      const { data, error } = await supabase
        .from('project_tasks')
        .select('id, status, project_id')
        .in('project_id', projectIds);
      
      if (error) throw error;
      tasks = data || [];
    }

    // ✅ FIXED: Get assignments for these projects
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
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch dashboard stats', 
      error: error.message 
    });
  }
});

module.exports = router;