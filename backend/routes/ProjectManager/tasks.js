// backend/routes/ProjectManager/tasks.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

function transformTask(row) {
  const profile = row.profiles || {};
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.projects?.project_name || '',
    employeeId: row.profile_id,
    employeeName: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Unassigned',
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    dueDate: row.due_date,
    progressLogs: row.progress_logs || [],
  };
}

// project_tasks has TWO foreign keys to profiles (profile_id = assignee,
// created_by = creator), so the embed must specify which FK to follow —
// otherwise PostgREST throws an ambiguous-relationship error (PGRST201).
const TASK_SELECT = `
  *,
  projects ( id, project_name ),
  profiles!project_tasks_profile_id_fkey ( id, first_name, last_name )
`;

// GET /api/pm/tasks — list tasks (optional ?projectId= / ?employeeId= filters)
router.get('/tasks', async (req, res) => {
  try {
    const { projectId, employeeId } = req.query;
    console.log('📋 PM Tasks endpoint called:', { projectId, employeeId });

    let query = supabase
      .from('project_tasks')
      .select(TASK_SELECT)
      .order('created_at', { ascending: false });

    if (projectId) {
      console.log('  → Filtering by projectId:', projectId);
      query = query.eq('project_id', projectId);
    }
    if (employeeId) {
      console.log('  → Filtering by employeeId:', employeeId);
      query = query.eq('profile_id', employeeId);
    }

    const { data, error } = await query;
    console.log('  → Query result:', { count: data?.length, hasError: !!error });
    if (error) {
      console.error('  ✗ Supabase error:', JSON.stringify(error, null, 2));
      throw error;
    }

    console.log('  ✓ Returning', data.length, 'tasks');
    res.status(200).json({ success: true, data: (data || []).map(transformTask) });
  } catch (error) {
    console.error('❌ Error fetching tasks:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tasks', error: error.message });
  }
});

// POST /api/pm/tasks — create/assign a new task
router.post('/tasks', async (req, res) => {
  try {
    const { projectId, employeeId, title, description, priority = 'Medium', dueDate, createdBy } = req.body;

    if (!projectId || !employeeId || !title) {
      return res.status(400).json({ success: false, message: 'Project, employee, and title are required' });
    }

    const { data, error } = await supabase
      .from('project_tasks')
      .insert({
        project_id: projectId,
        profile_id: employeeId,
        title,
        description: description || null,
        priority,
        status: 'Pending',
        due_date: dueDate || null,
        progress_logs: [],
        created_by: createdBy || null,
      })
      .select(TASK_SELECT)
      .single();

    if (error) throw error;

    // Notify the assigned employee. This is best-effort — a failure here
    // (e.g. an RLS policy blocking inserts on `notifications`) must not
    // block the response, since the task row itself was already committed
    // successfully above.
    const { error: notifyError } = await supabase.from('notifications').insert({
      recipient_id: employeeId,
      type: 'alert',
      text: `📋 You've been assigned a new task: "${title}"`,
      read: false,
    });
    if (notifyError) {
      console.error('Task created, but failed to send notification:', notifyError);
    }

    res.status(201).json({ success: true, message: 'Task created successfully', data: transformTask(data) });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ success: false, message: 'Failed to create task', error: error.message });
  }
});

// PUT /api/pm/tasks/:id — reassign / change status / due date / details
router.put('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { employeeId, status, dueDate, title, description, priority } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (employeeId !== undefined) updateData.profile_id = employeeId;
    if (status !== undefined) updateData.status = status;
    if (dueDate !== undefined) updateData.due_date = dueDate;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;

    const { data, error } = await supabase
      .from('project_tasks')
      .update(updateData)
      .eq('id', id)
      .select(TASK_SELECT)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Task not found' });

    res.status(200).json({ success: true, message: 'Task updated successfully', data: transformTask(data) });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ success: false, message: 'Failed to update task', error: error.message });
  }
});

// POST /api/pm/tasks/:id/progress — append a progress log entry
// (also auto-advances status: 0% stays Pending, >0% -> In Progress, 100% -> Completed)
router.post('/tasks/:id/progress', async (req, res) => {
  try {
    const { id } = req.params;
    const { percentage, note, loggedBy } = req.body;

    if (percentage === undefined || percentage === null) {
      return res.status(400).json({ success: false, message: 'Percentage is required' });
    }

    const { data: existing, error: fetchError } = await supabase
      .from('project_tasks')
      .select('progress_logs')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    if (!existing) return res.status(404).json({ success: false, message: 'Task not found' });

    const newLog = {
      date: new Date().toISOString(),
      percentage: Math.min(100, Math.max(0, parseInt(percentage, 10) || 0)),
      note: note || '',
      loggedBy: loggedBy || null,
    };

    const updatedLogs = [...(existing.progress_logs || []), newLog];
    const autoStatus = newLog.percentage >= 100 ? 'Completed' : newLog.percentage > 0 ? 'In Progress' : undefined;

    const updatePayload = { progress_logs: updatedLogs, updated_at: new Date().toISOString() };
    if (autoStatus) updatePayload.status = autoStatus;

    const { data, error } = await supabase
      .from('project_tasks')
      .update(updatePayload)
      .eq('id', id)
      .select(TASK_SELECT)
      .single();

    if (error) throw error;

    res.status(200).json({ success: true, message: 'Progress logged successfully', data: transformTask(data) });
  } catch (error) {
    console.error('Error logging task progress:', error);
    res.status(500).json({ success: false, message: 'Failed to log task progress', error: error.message });
  }
});

// DELETE /api/pm/tasks/:id
router.delete('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('project_tasks').delete().eq('id', id);
    if (error) throw error;
    res.status(200).json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ success: false, message: 'Failed to delete task', error: error.message });
  }
});

module.exports = router;