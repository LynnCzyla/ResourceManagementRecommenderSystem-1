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
    employeeRole: profile.positions?.position_name || '',
    employeeAvatar: profile.avatar_url || null,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    dueDate: row.due_date,
    progressLogs: row.progress_logs || [],
  };
}

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
  profiles!project_tasks_profile_id_fkey ( id, first_name, last_name, avatar_url, positions ( position_name ) )
`;

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

// ✅ GET /api/pm/tasks — list tasks (optional ?projectId= / ?employeeId= filters)
router.get('/', async (req, res) => {
  try {
    const { projectId, employeeId } = req.query;
    const userId = req.user?.id;
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userRole = req.user?.role;

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

    // ✅ For Project Managers: Only show tasks from their projects
    if (!isSuperAdmin && userRole === 'Project Manager') {
      // Get projects created by this PM
      const { data: myProjects } = await supabase
        .from('projects')
        .select('id')
        .eq('created_by', userId);

      const projectIds = myProjects?.map(p => p.id) || [];

      if (projectIds.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }

      query = query.in('project_id', projectIds);
    }

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

// ✅ POST /api/pm/tasks — create/assign a new task
router.post('/', async (req, res) => {
  try {
    const { projectId, employeeId, title, description, priority = 'Medium', dueDate, createdBy } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!projectId || !employeeId || !title) {
      return res.status(400).json({ success: false, message: 'Project, employee, and title are required' });
    }

    // ✅ Verify the user owns the project (PM only)
    if (userRole === 'Project Manager') {
      const { data: project } = await supabase
        .from('projects')
        .select('created_by')
        .eq('id', projectId)
        .single();

      if (!project || project.created_by !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only create tasks for your own projects'
        });
      }
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
        created_by: createdBy || userId || null,
      })
      .select(TASK_SELECT)
      .single();

    if (error) throw error;

    // Notify the assigned employee
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
      userId: createdBy || userId || null,
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

// ✅ PUT /api/pm/tasks/:id — reassign / change status / due date / details
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { employeeId, status, dueDate, title, description, priority, progressLogs } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    // ✅ Verify the user owns the project (PM only)
    if (userRole === 'Project Manager') {
      const { data: task } = await supabase
        .from('project_tasks')
        .select('project_id, projects:project_id (created_by)')
        .eq('id', id)
        .single();

      if (!task || task.projects?.created_by !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only update tasks from your own projects'
        });
      }
    }

    const updateData = { updated_at: new Date().toISOString() };
    if (employeeId !== undefined) updateData.profile_id = employeeId;
    if (status !== undefined) updateData.status = status;
    if (dueDate !== undefined) updateData.due_date = dueDate;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (progressLogs !== undefined) updateData.progress_logs = progressLogs;

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

// ✅ POST /api/pm/tasks/:id/progress — append a progress log entry
router.post('/:id/progress', async (req, res) => {
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

// ✅ DELETE /api/pm/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    // ✅ Verify the user owns the project (PM only)
    if (userRole === 'Project Manager') {
      const { data: task } = await supabase
        .from('project_tasks')
        .select('project_id, projects:project_id (created_by)')
        .eq('id', id)
        .single();

      if (!task || task.projects?.created_by !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only delete tasks from your own projects'
        });
      }
    }

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