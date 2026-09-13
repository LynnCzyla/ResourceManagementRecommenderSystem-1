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
      const pmName = [pmProfile.first_name, pmProfile.last_name].filter(Boolean).join(' ') || 'Project Manager';

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

    // Check if the selected date range overlaps with any existing log
    if (startDate && endDate) {
      const newStart = new Date(startDate + 'T00:00:00');
      const newEnd = new Date(endDate + 'T00:00:00');

      for (const log of logs) {
        const prevStartStr = log.startDate || log.date;
        const prevEndStr = log.endDate || log.date;
        if (prevStartStr && prevEndStr) {
          const pStart = new Date(prevStartStr + 'T00:00:00');
          const pEnd = new Date(prevEndStr + 'T00:00:00');
          if (newStart <= pEnd && newEnd >= pStart) {
            return res.status(400).json({
              success: false,
              error: `The selected dates (${startDate} to ${endDate}) overlap with an already reported week (${prevStartStr} to ${prevEndStr}). Please select a subsequent week.`
            });
          }
        }
      }
    }

    const weekNumber = logs.length + 1;
    const logDate = endDate || startDate || new Date().toISOString().split('T')[0];
    const logWeek = week || (startDate && endDate ? `Week ${weekNumber} (${startDate} to ${endDate})` : `Week ${weekNumber}`);

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
      .select('*, projects(project_name, created_by), profiles:profiles!project_tasks_profile_id_fkey(first_name, last_name)')
      .single();

    if (updateError) throw updateError;

    // ✅ Also insert into public.project_report table
    try {
      let employeeName = [data.profiles?.first_name, data.profiles?.last_name].filter(Boolean).join(' ').trim();
      let projectName = data.projects?.project_name;
      const empId = data.profile_id || req.user?.id || null;

      // Fallback: if employeeName is empty, fetch directly from profiles
      if (!employeeName && empId) {
        const { data: prof } = await supabase.from('profiles').select('first_name, last_name').eq('id', empId).maybeSingle();
        if (prof) {
          employeeName = [prof.first_name, prof.last_name].filter(Boolean).join(' ').trim();
        }
      }
      if (!employeeName) employeeName = 'Employee';

      // Fallback: if projectName is empty, fetch directly from projects
      if (!projectName && data.project_id) {
        const { data: proj } = await supabase.from('projects').select('project_name').eq('id', data.project_id).maybeSingle();
        if (proj) {
          projectName = proj.project_name;
        }
      }
      if (!projectName) projectName = 'Unnamed Project';

      const reportDesc = (description || '').trim() || data.description || '';

      const { data: insertedReport, error: reportInsertErr } = await supabase.from('project_report').insert({
        task_id: data.id,
        project_id: data.project_id,
        employee_id: empId,
        task_title: data.title,
        task_description: reportDesc,
        employee_name: employeeName,
        project_name: projectName,
        percentage: finalTotalPercentage,
        log_date: logDate,
      }).select().single();

      if (reportInsertErr) {
        console.error('❌ Error inserting into project_report from employee:', JSON.stringify(reportInsertErr, null, 2));
      } else {
        console.log('✅ Successfully inserted weekly report into project_report. ID:', insertedReport?.id);
      }
    } catch (reportInsertErr) {
      console.error('❌ Exception inserting into project_report from employee:', reportInsertErr);
    }

    // Cross-role notification: notify PM
    try {
      const pmId = data.projects?.created_by;
      if (pmId && pmId !== req.user?.id) {
        const empName = data.profiles
          ? [data.profiles.first_name, data.profiles.last_name].filter(Boolean).join(' ').trim()
          : 'An employee';
        const projName = data.projects?.project_name || 'a project';
        await supabase.from('notifications').insert({
          recipient_id: pmId,
          type: 'task_progress',
          text: `${empName} logged ${newPercentageVal}% progress on task "${data.title}" in project "${projName}" (Total: ${finalTotalPercentage}%).`,
          read: false
        });
      }
    } catch (notifErr) {
      console.error('Non-fatal error creating progress notification:', notifErr.message);
    }

    res.json({ success: true, message: 'Progress logged successfully', data });
  } catch (error) {
    console.error('Error logging task progress:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
