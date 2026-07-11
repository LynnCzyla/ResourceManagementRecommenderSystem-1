// backend/routes/ProjectManager/tasks.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');

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
  id,
  project_id,
  profile_id,
  title,
  description,
  priority,
  status,
  due_date,
  progress_logs,
  created_by,
  created_at,
  projects ( id, project_name ),
  profiles!project_tasks_profile_id_fkey ( id, first_name, last_name )
`;

// Simple in-memory cache for the list endpoint — same rationale as
// ProjectManager/projects.js: this query gets hit on every tab switch
// with a deep join, so cache it briefly instead of re-querying each time.
const tasksCache = new Map();
const TASKS_CACHE_TTL_MS = 30 * 1000;

function getTasksCached(key) {
  const entry = tasksCache.get(key);
  if (entry && Date.now() - entry.time < TASKS_CACHE_TTL_MS) return entry.data;
  return null;
}
function setTasksCached(key, data) {
  tasksCache.set(key, { data, time: Date.now() });
}
function invalidateTasksCache() {
  tasksCache.clear();
}

// GET /api/pm/tasks — list tasks (optional ?projectId= / ?employeeId= filters)
router.get('/tasks', async (req, res) => {
  try {
    const { projectId, employeeId } = req.query;
    const cacheKey = `list:${projectId || ''}:${employeeId || ''}`;

    const cached = getTasksCached(cacheKey);
    if (cached) {
      return res.status(200).json({ success: true, data: cached, cached: true });
    }

    let query = supabase
      .from('project_tasks')
      .select(TASK_SELECT)
      .order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);
    if (employeeId) query = query.eq('profile_id', employeeId);

    const { data, error } = await query;
    if (error) throw error;

    const transformed = (data || []).map(transformTask);
    setTasksCached(cacheKey, transformed);

    res.status(200).json({ success: true, data: transformed });
  } catch (error) {
    console.error('Error fetching tasks:', error);
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

    await logAuditEvent({
      req,
      userId: createdBy || null,
      action: 'Assigned',
      systemCategory: 'Resource Management',
      logDescription: `Assigned task "${title}" to employee ${employeeId}`,
    });

    invalidateTasksCache();
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

    await logAuditEvent({
      req,
      action: 'Updated',
      systemCategory: 'Resource Management',
      logDescription: `Updated task ${id}`,
    });

    invalidateTasksCache();
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

    const newPercentageVal = Math.min(100, Math.max(0, parseInt(percentage, 10) || 0));
    const logs = existing.progress_logs || [];
    const currentTotal = logs.reduce((sum, log) => sum + (parseInt(log.percentage, 10) || 0), 0);

    if (currentTotal + newPercentageVal > 100) {
      return res.status(400).json({
        success: false,
        message: `Logged progress exceeds 100% total limit. Current progress logged: ${currentTotal}%. You can log up to ${100 - currentTotal}%.`
      });
    }

    const newLog = {
      date: new Date().toISOString(),
      percentage: newPercentageVal,
      note: note || '',
      loggedBy: loggedBy || null,
    };

    const updatedLogs = [...logs, newLog];
    const finalTotalPercentage = currentTotal + newPercentageVal;
    const autoStatus = finalTotalPercentage >= 100 ? 'Completed' : finalTotalPercentage > 0 ? 'In Progress' : undefined;

    const updatePayload = { progress_logs: updatedLogs, updated_at: new Date().toISOString() };
    if (autoStatus) updatePayload.status = autoStatus;

    const { data, error } = await supabase
      .from('project_tasks')
      .update(updatePayload)
      .eq('id', id)
      .select(TASK_SELECT)
      .single();

    if (error) throw error;

    await logAuditEvent({
      req,
      userId: loggedBy || null,
      action: 'Updated',
      systemCategory: 'Resource Management',
      logDescription: `Logged ${newLog.percentage}% progress for task ${id}`,
    });

    invalidateTasksCache();
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

    await logAuditEvent({
      req,
      action: 'Deleted',
      systemCategory: 'Resource Management',
      logDescription: `Deleted task ${id}`,
    });
    invalidateTasksCache();
    res.status(200).json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ success: false, message: 'Failed to delete task', error: error.message });
  }
});

module.exports = router;