const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { verifyToken } = require('../Middleware/auth');

router.get('/history', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch completed or cancelled tasks (either task is closed or parent project is closed)
    const { data: taskRows, error: taskError } = await supabase
      .from('project_tasks')
      .select(`*, projects ( id, project_name, status )`)
      .eq('profile_id', userId)
      .order('id', { ascending: false });

    if (taskError) throw taskError;

    const historyTasks = (taskRows || []).filter(row => {
      const isTaskClosed = ['Completed', 'Completed-Hidden', 'Cancelled', 'Canceled', 'Archived'].includes(row.status);
      const isProjClosed = row.projects && ['Completed', 'Archived', 'Cancelled', 'Cancelled-Hidden', 'Deleted'].includes(row.projects.status);
      return isTaskClosed || isProjClosed;
    }).map(row => {
      const isCancelled = row.status === 'Cancelled' || row.status === 'Canceled' || (row.projects && ['Cancelled', 'Cancelled-Hidden'].includes(row.projects.status));
      return {
        id: row.id,
        projectId: row.project_id,
        projectName: row.projects?.project_name || 'Unknown Project',
        title: row.title,
        description: row.description,
        priority: row.priority,
        status: isCancelled ? 'Cancelled' : 'Completed',
        dueDate: row.due_date,
        completedOn: row.updated_at ? row.updated_at.split('T')[0] : (row.cancelled_at ? row.cancelled_at.split('T')[0] : null),
        progressLogs: row.progress_logs || []
      };
    });

    // 2. Fetch project assignments history (both Completed and Cancelled projects/assignments)
    const { data: assignmentRows, error: assignError } = await supabase
      .from('project_assignments')
      .select(`*, projects (*, profiles!projects_created_by_fkey ( first_name, last_name ))`)
      .eq('profile_id', userId);

    if (assignError) throw assignError;

    // Deduplicate projects so each project appears uniquely in Project History
    const projectMap = new Map();

    (assignmentRows || []).forEach(row => {
      const proj = row.projects;
      if (!proj) return;
      const isAssignmentClosed = ['Completed', 'Cancelled', 'Canceled', 'Inactive'].includes(row.status);
      const isProjClosed = ['Completed', 'Archived', 'Cancelled', 'Cancelled-Hidden', 'Deleted'].includes(proj.status);
      if (!isAssignmentClosed && !isProjClosed) return;

      const pmProfile = proj.profiles || {};
      const pmName = [pmProfile.first_name, pmProfile.last_name].filter(Boolean).join(' ') || 'Unknown';
      const isCancelled = proj.status === 'Cancelled' || proj.status === 'Cancelled-Hidden' || row.status === 'Cancelled' || row.status === 'Canceled';
      const itemStatus = isCancelled ? 'Cancelled' : 'Completed';

      const existing = projectMap.get(proj.id);
      // If not yet added, or if existing was Cancelled but this assignment was Completed, use this
      if (!existing || (existing.status === 'Cancelled' && itemStatus === 'Completed')) {
        projectMap.set(proj.id, {
          id: proj.id,
          assignmentId: row.id,
          name: proj.project_name || 'Untitled Project',
          description: proj.project_description,
          startDate: proj.start_date,
          endDate: proj.end_date,
          projectManager: pmName,
          status: itemStatus
        });
      }
    });

    const historyProjects = Array.from(projectMap.values());

    res.json({
      success: true,
      data: {
        completedTasks: historyTasks,
        completedProjects: historyProjects,
        historyTasks,
        historyProjects
      }
    });
  } catch (error) {
    console.error('Error fetching employee history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;