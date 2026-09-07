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

    // Filter to only active assignments on active projects
    const activeAssignments = (data || []).filter(row => {
      const proj = row.projects;
      if (!proj) return false;
      const isProjectActive = proj.status === 'Active';
      const isAssignmentActive = row.status !== 'Completed' && row.status !== 'Inactive';
      return isProjectActive && isAssignmentActive;
    });

    const formattedAssignments = activeAssignments.map(row => {
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
        projects ( id, project_name, status ),
        profiles!project_tasks_profile_id_fkey ( id, first_name, last_name )
      `)
      .eq('profile_id', userId)
      .order('id', { ascending: false });

    if (error) {
      console.error('SUPABASE TASKS ERROR:', JSON.stringify(error, null, 2));
      throw error;
    }

    // Only active/in-progress tasks on active projects belong in the active list
    const activeTasks = (data || []).filter(row => {
      const isTaskActive = row.status !== 'Completed' && row.status !== 'Completed-Hidden';
      const isProjectActive = !row.projects || row.projects.status === 'Active';
      return isTaskActive && isProjectActive;
    });

    const formattedTasks = activeTasks.map(row => {
      const profile = row.profiles || {};
      return {
        id: row.id,
        projectId: row.project_id,
        projectName: row.projects?.project_name || 'Unknown Project',
        employeeId: row.profile_id,
        employeeName: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'You',
        title: row.title,
        description: row.description,
        priority: row.priority,
        status: row.status,
        dueDate: row.due_date,
        progressLogs: row.progress_logs || []
      };
    });

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
    const { week, percentage, description, startDate, endDate } = req.body;

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

    const newPercentageVal = Math.min(100, Math.max(0, parseInt(percentage, 10) || 0));
    const logs = existing.progress_logs || [];
    const currentTotal = logs.reduce((sum, log) => sum + (parseInt(log.percentage, 10) || 0), 0);

    if (currentTotal + newPercentageVal > 100) {
      return res.status(400).json({
        success: false,
        error: `Logged progress exceeds 100% total limit. Current progress logged: ${currentTotal}%. You can log up to ${100 - currentTotal}%.`
      });
    }

    const logDate = endDate || startDate || new Date().toISOString().split('T')[0];
    const logWeek = week || (startDate && endDate ? `${startDate} to ${endDate}` : null);

    const newLog = {
      id: Date.now(),
      week: logWeek,
      startDate: startDate || null,
      endDate: endDate || null,
      percentage: newPercentageVal,
      description: description || '',
      date: logDate
    };

    const updatedLogs = [...logs, newLog];
    const finalTotalPercentage = currentTotal + newPercentageVal;
    const autoStatus = finalTotalPercentage >= 100 ? 'Completed' : finalTotalPercentage > 0 ? 'In Progress' : undefined;

    const updatePayload = {
      progress_logs: updatedLogs,
      updated_at: new Date().toISOString()
    };
    if (autoStatus) updatePayload.status = autoStatus;

    const { data, error: updateError } = await supabase
      .from('project_tasks')
      .update(updatePayload)
      .eq('id', id)
      .select('*, projects(project_name), profiles:profiles!project_tasks_profile_id_fkey(first_name, last_name)')
      .single();

    if (updateError) throw updateError;

    // ✅ Also insert into public.project_report table
    try {
      const profile = data.profiles;
      const employeeName = profile
        ? [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
        : 'Unassigned';

      const reportDesc = (description || '').trim() || data.description || '';

      const { error: reportInsertErr } = await supabase.from('project_report').insert({
        task_id: data.id,
        project_id: data.project_id,
        employee_id: data.profile_id || req.user?.id || null,
        task_title: data.title,
        task_description: reportDesc,
        employee_name: employeeName,
        project_name: data.projects?.project_name || 'Unnamed Project',
        percentage: finalTotalPercentage,
        log_date: logDate,
      });

      if (reportInsertErr) {
        console.error('Non-fatal error inserting into project_report from employee:', reportInsertErr);
      }
    } catch (reportInsertErr) {
      console.error('Non-fatal error inserting into project_report from employee:', reportInsertErr);
    }

    res.json({ success: true, message: 'Progress logged successfully', data });
  } catch (error) {
    console.error('Error logging task progress:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
