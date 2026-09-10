const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { verifyToken } = require('../Middleware/auth');

router.get('/history', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch completed tasks (either marked Completed or belonging to Completed/Archived projects)
    const { data: taskRows, error: taskError } = await supabase
      .from('project_tasks')
      .select(`*, projects ( id, project_name, status )`)
      .eq('profile_id', userId)
      .order('updated_at', { ascending: false });

    if (taskError) throw taskError;

    const completedTasks = (taskRows || []).filter(row => {
      const isTaskDone = row.status === 'Completed' || row.status === 'Completed-Hidden';
      const isProjDone = row.projects && (row.projects.status === 'Completed' || row.projects.status === 'Archived');
      return isTaskDone || isProjDone;
    }).map(row => ({
      id: row.id,
      projectId: row.project_id,
      projectName: row.projects?.project_name || 'Unknown Project',
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: 'Completed',
      dueDate: row.due_date,
      completedOn: row.updated_at ? row.updated_at.split('T')[0] : null,
      progressLogs: row.progress_logs || []
    }));

    // 2. Fetch completed project assignments (either assignment Completed or project Completed/Archived)
    const { data: assignmentRows, error: assignError } = await supabase
      .from('project_assignments')
      .select(`*, projects (*, profiles!projects_created_by_fkey ( first_name, last_name ))`)
      .eq('profile_id', userId);

    if (assignError) throw assignError;

    const completedProjects = (assignmentRows || []).filter(row => {
      const isAssignmentDone = row.status === 'Completed';
      const isProjDone = row.projects && (row.projects.status === 'Completed' || row.projects.status === 'Archived');
      return isAssignmentDone || isProjDone;
    }).map(row => {
      const proj = row.projects || {};
      const pmProfile = proj.profiles || {};
      const pmName = [pmProfile.first_name, pmProfile.last_name].filter(Boolean).join(' ') || 'Unknown';
      return {
        id: proj.id,
        name: proj.project_name,
        description: proj.project_description,
        startDate: proj.start_date,
        endDate: proj.end_date,
        projectManager: pmName
      };
    });

    res.json({ success: true, data: { completedTasks, completedProjects } });
  } catch (error) {
    console.error('Error fetching employee history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;