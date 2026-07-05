const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { verifyToken } = require('../Middleware/auth');

router.get('/assignments', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('project_assignments')
      .select(`
        *,
        projects (
          *,
          profiles!projects_created_by_fkey ( first_name, last_name )
        )
      `)
      .eq('profile_id', userId);

    if (error) throw error;

    const formattedAssignments = (data || []).map(row => {
      const proj = row.projects || {};
      const pmProfile = proj.profiles || {};
      const pmName = [pmProfile.first_name, pmProfile.last_name].filter(Boolean).join(' ') || 'Lynn Czyla M. Alpuerto';

      return {
        id: proj.id,
        name: proj.project_name,
        description: proj.project_description,
        startDate: proj.start_date,
        endDate: proj.end_date,
        projectManager: pmName,
        allocatedHours: row.allocated_hours,
        status: row.status
      };
    });

    res.json({ success: true, data: formattedAssignments });
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/tasks', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('project_tasks')
      .select(`
        *,
        projects ( id, project_name )
      `)
      .eq('profile_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formattedTasks = (data || []).map(row => ({
      id: row.id,
      projectId: row.project_id,
      projectName: row.projects?.project_name || 'Unknown Project',
      employeeId: row.profile_id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
      dueDate: row.due_date,
      progressLogs: row.progress_logs || []
    }));

    res.json({ success: true, data: formattedTasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/tasks/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const { data, error } = await supabase
      .from('project_tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, message: 'Task status updated successfully', data });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/tasks/:id/progress', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { week, percentage, description } = req.body;

    if (percentage === undefined || percentage === null) {
      return res.status(400).json({ success: false, error: 'Percentage is required' });
    }

    const { data: existing, error: fetchError } = await supabase
      .from('project_tasks')
      .select('progress_logs')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    if (!existing) return res.status(404).json({ success: false, error: 'Task not found' });

    const newLog = {
      id: Date.now(),
      week: week || null,
      percentage: Math.min(100, Math.max(0, parseInt(percentage, 10) || 0)),
      description: description || '',
      date: new Date().toISOString().split('T')[0]
    };

    const updatedLogs = [...(existing.progress_logs || []), newLog];
    const autoStatus = newLog.percentage >= 100 ? 'Completed' : newLog.percentage > 0 ? 'In Progress' : undefined;

    const updatePayload = {
      progress_logs: updatedLogs,
      updated_at: new Date().toISOString()
    };
    if (autoStatus) updatePayload.status = autoStatus;

    const { data, error: updateError } = await supabase
      .from('project_tasks')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Progress logged successfully', data });
  } catch (error) {
    console.error('Error logging task progress:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
