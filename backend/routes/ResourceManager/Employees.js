const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { verifyToken } = require('../Middleware/auth');
const workloadService = require('../../services/workloadService');

// ✅ Apply auth middleware
router.use(verifyToken);

// ✅ Simple in-memory cache with branch-aware keys
const cache = {
  data: {},
  ttl: 60000 // 1 minute
};

const getCacheKey = (branchId) => `branch_${branchId || 'all'}`;

const clearEmployeeCache = (branchId = null) => {
  if (branchId) {
    const key = getCacheKey(branchId);
    delete cache.data[key];
    console.log(`🗑️ Employee cache cleared for branch: ${branchId}`);
  } else {
    cache.data = {};
    console.log('🗑️ All employee cache cleared');
  }
};

/**
 * GET /api/rm/employees
 * Powers RMEmployeeDirectoryTab.jsx - WITH BRANCH FILTERING - ONLY EMPLOYEE ROLE
 */
router.get('/', async (req, res) => {
  try {
    const userBranchId = req.user.branch_id;
    const isSuperAdmin = req.user.is_super_admin;
    const userRole = req.user.role;

    console.log(`👥 Employees requested by: ${req.user.employee_id} (${userRole})`);
    console.log(`🏢 Branch filter: ${isSuperAdmin ? 'ALL' : userBranchId}`);

    if (!isSuperAdmin && !userBranchId) {
      return res.status(403).json({
        success: false,
        error: 'Your account is not assigned to a branch. Please contact your administrator.'
      });
    }

    const cacheKey = getCacheKey(isSuperAdmin ? 'all' : userBranchId);
    const now = Date.now();

    if (cache.data[cacheKey] && (now - cache.data[cacheKey].timestamp) < cache.ttl) {
      console.log(`👥 Returning CACHED employees data for branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);
      return res.json(cache.data[cacheKey].data);
    }

    console.log(`👥 Fetching FRESH employees data for branch: ${isSuperAdmin ? 'ALL' : userBranchId}...`);

    let query = supabase
      .from('profiles')
      .select(`
        id,
        employee_id,
        first_name,
        last_name,
        status,
        role,
        availability_status,
        avatar_url,
        branch_id,
        positions ( position_name ),
        departments ( department_name ),
        employee_skills ( skills ( skill_name ) )
      `)
      .eq('status', 'Active')
      .in('role', ['Employee', 'Project Manager']);

    if (!isSuperAdmin && userBranchId) {
      query = query.eq('branch_id', userBranchId);
    }

    const { data: profiles, error: profErr } = await query;
    if (profErr) throw profErr;

    const employeeIds = profiles.map(p => p.employee_id);
    const profileIds = profiles.map(p => p.id);
    const pmProfileIds = profiles.filter(p => (p.role||'').toLowerCase().includes('project')).map(p => p.id);
    
    let documents = [];
    let activeAssignments = [];
    let activeTasks = [];
    let pmProjects = [];

    const asyncQueries = [];
    if (employeeIds.length > 0) {
      asyncQueries.push(
        supabase
          .from('documents')
          .select('id, employee_id, file_name, created_at')
          .eq('document_type', 'Certificate')
          .in('employee_id', employeeIds)
          .then(res => { if (!res.error && res.data) documents = res.data; })
      );
    }
    if (profileIds.length > 0) {
      asyncQueries.push(
        supabase
          .from('project_assignments')
          .select(`
            id,
            profile_id,
            project_id,
            assigned_role,
            status,
            projects:project_id ( id, project_name, status )
          `)
          .in('profile_id', profileIds)
          .eq('status', 'Assigned')
          .then(res => { if (!res.error && res.data) activeAssignments = res.data; }),
        supabase
          .from('project_tasks')
          .select('id, profile_id, project_id, priority, status')
          .in('profile_id', profileIds)
          .not('status', 'in', '("Completed","Completed-Hidden","Archived","Cancelled")')
          .then(res => { if (!res.error && res.data) activeTasks = res.data; })
      );
    }
    if (pmProfileIds.length > 0) {
      asyncQueries.push(
        supabase
          .from('projects')
          .select('id, project_name, project_code, status, created_by')
          .in('created_by', pmProfileIds)
          .eq('status', 'Active')
          .then(res => { if (!res.error && res.data) pmProjects = res.data; })
      );
    }

    if (asyncQueries.length > 0) {
      await Promise.all(asyncQueries);
    }

    const PRIORITY_WEIGHTS = { 'Low': 1, 'Medium': 2, 'High': 3 };

    const employees = (profiles || []).map((p) => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unnamed';
      const fallbackAvatar = `https://ui-avatars.com/api/?background=3b82f6&color=fff&name=${encodeURIComponent(name)}`;
      const isPM = (p.role || '').toLowerCase().includes('project');
      
      const certifications = (documents || [])
        .filter((d) => d.employee_id === p.employee_id)
        .map((d) => ({
          id: d.id,
          name: d.file_name,
          issuer: 'WEA Records',
          date: d.created_at ? d.created_at.split('T')[0] : '',
        }));

      // Active assignments for this employee (only in Active projects)
      const empAssignments = (activeAssignments || []).filter(
        a => a.profile_id === p.id && a.projects?.status === 'Active'
      );
      const assignedProjectIds = [...new Set(empAssignments.map(a => a.project_id).filter(Boolean))];
      const assignCount = empAssignments.length;
      const isAssigned = assignCount > 0;

      // For PMs: managed active projects
      const managedProjects = isPM
        ? pmProjects.filter(proj => proj.created_by === p.id)
        : [];
      const managedProjectNames = managedProjects.map(proj => proj.project_name);
      const assignedProjects = isPM ? managedProjectNames : [...new Set(empAssignments.map(a => a.projects?.project_name).filter(Boolean))];
      const managedCount = managedProjects.length;

      // Only count active tasks for projects where the employee is actually actively assigned
      const empActiveTasks = (activeTasks || []).filter(
        t => t.profile_id === p.id && assignedProjectIds.includes(t.project_id)
      );
      let score = 0;
      for (const t of empActiveTasks) {
        const weight = PRIORITY_WEIGHTS[t.priority] || 1;
        score += weight;
      }

      let workloadStatus, utilizationRate;
      if (isPM) {
        workloadStatus = 'Available';
        utilizationRate = 0;
      } else {
        workloadStatus = p.availability_status || 'Available';
        utilizationRate = workloadService.getUtilizationRate(p.id, workloadStatus, score);
      }

      const isAssignable = !isPM;

      return {
        id: p.id,
        employeeId: p.employee_id,
        name,
        avatar: p.avatar_url || fallbackAvatar,
        rawRole: p.role,
        role: isPM ? 'Project Manager' : (p.positions?.position_name || p.role || null),
        department: p.departments?.department_name || 'Unassigned',
        skills: (p.employee_skills || []).map((es) => es.skills?.skill_name).filter(Boolean),
        certifications,
        isVerified: p.is_verified || false,
        isAssignable,
        isAssigned: isPM ? managedCount > 0 : isAssigned,
        assignedProjects,
        assignedProjectIds,
        projectStatus: isPM
          ? (managedCount > 0 ? 'Assigned' : 'Unassigned')
          : (isAssigned ? 'Assigned' : 'Unassigned'),
        workloadStatus,
        utilizationRate,
        assignmentCount: isPM ? managedCount : assignCount,
        managedProjectCount: isPM ? managedCount : undefined,
        branch_id: p.branch_id,
      };
    });

    const responseData = { 
      success: true, 
      employees,
      meta: {
        total: employees.length,
        branch_filter: isSuperAdmin ? 'all' : userBranchId,
        user_role: userRole,
        is_super_admin: isSuperAdmin,
        role_filter: 'Employee',
      }
    };

    cache.data[cacheKey] = {
      data: responseData,
      timestamp: Date.now()
    };

    res.json(responseData);
  } catch (err) {
    console.error('RM employees list error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/rm/employees/:id
 * Get single employee detail with branch check
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userBranchId = req.user.branch_id;
    const isSuperAdmin = req.user.is_super_admin;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select(`
        id,
        employee_id,
        first_name,
        last_name,
        avatar_url,
        status,
        role,
        branch_id,
        positions ( position_name ),
        departments ( department_name ),
        employee_skills ( skills ( skill_name ) )
      `)
      .eq('id', id)
      .eq('role', 'Employee')
      .single();

    if (error) throw error;
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    if (!isSuperAdmin && profile.branch_id !== userBranchId) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view this employee'
      });
    }

    const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unnamed';
    const fallbackAvatar = `https://ui-avatars.com/api/?background=3b82f6&color=fff&name=${encodeURIComponent(name)}`;

    res.json({
      success: true,
      employee: {
        id: profile.id,
        employeeId: profile.employee_id,
        name,
        avatar: profile.avatar_url || fallbackAvatar,
        role: profile.positions?.position_name || profile.role || null,
        department: profile.departments?.department_name || 'Unassigned',
        skills: (profile.employee_skills || []).map((es) => es.skills?.skill_name).filter(Boolean),
        isVerified: profile.is_verified || false,
        branch_id: profile.branch_id,
      }
    });
  } catch (error) {
    console.error('Error fetching employee detail:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/rm/employees/:id/details
 * Get detailed employee information including projects and tasks
 */
router.get('/:id/details', async (req, res) => {
  try {
    const { id } = req.params;
    const userBranchId = req.user.branch_id;
    const isSuperAdmin = req.user.is_super_admin;

    console.log(`👤 Fetching details for employee: ${id}`);

    // ✅ Get employee profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(`
        id,
        employee_id,
        first_name,
        last_name,
        middle_name,
        avatar_url,
        status,
        role,
        branch_id,
        position_id,
        positions ( position_name ),
        departments ( department_name )
      `)
      .eq('id', id)
      .in('role', ['Employee', 'Project Manager'])
      .single();

    if (profileError) {
      console.error('Profile error:', profileError);
      throw profileError;
    }
    
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    // ✅ Check branch access
    if (!isSuperAdmin && profile.branch_id !== userBranchId) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view this employee'
      });
    }

    const isPM = (profile.role || '').toLowerCase().includes('project');
    const PRIORITY_WEIGHTS = { 'Low': 1, 'Medium': 2, 'High': 3 };

    // ✅ For PMs: fetch their managed projects
    let managedProjects = [];
    if (isPM) {
      const { data: pmProj } = await supabase
        .from('projects')
        .select(`
          id, project_code, project_name, status, start_date, end_date,
          project_assignments ( profile_id, status, profiles:profile_id ( first_name, last_name ) )
        `)
        .eq('created_by', profile.id)
        .order('created_at', { ascending: false });
      managedProjects = pmProj || [];
    }

    // ✅ Get tasks with project information
    const { data: tasks, error: tasksError } = await supabase
      .from('project_tasks')
      .select(`
        id,
        title,
        description,
        priority,
        status,
        due_date,
        created_at,
        project_id,
        projects:project_id (
          id,
          project_code,
          project_name,
          status
        )
      `)
      .eq('profile_id', id)
      .order('created_at', { ascending: false });

    if (tasksError) {
      console.error('Tasks error:', tasksError);
      throw tasksError;
    }

    console.log(`📊 Found ${tasks?.length || 0} tasks for employee`);

    // Separate active vs closed tasks (Eq. 2: only active tasks count toward W)
    const CLOSED_STATUSES = ['Completed', 'Completed-Hidden', 'Archived', 'Cancelled'];
    const activeTasksOnly = (tasks || []).filter(
      t => !CLOSED_STATUSES.includes(t.status) && t.projects?.status === 'Active'
    );

    // ✅ Group ALL tasks by project (for display, including history)
    const projectsMap = {};
    (tasks || []).forEach(task => {
      const project = task.projects || {};
      const projectId = task.project_id || 'no-project';
      
      if (!projectsMap[projectId]) {
        projectsMap[projectId] = {
          project_id: projectId,
          project_name: project.project_name || 'No Project',
          project_code: project.project_code || null,
          project_status: project.status || 'Active',
          tasks: []
        };
      }
      
      projectsMap[projectId].tasks.push({
        id: task.id,
        title: task.title || 'Untitled Task',
        description: task.description || '',
        priority: task.priority || 'Low',
        status: task.status || 'Pending',
        due_date: task.due_date,
        created_at: task.created_at,
        isActive: !CLOSED_STATUSES.includes(task.status) && task.projects?.status === 'Active',
      });
    });

    // Convert to array
    const projectsWithTasks = Object.values(projectsMap);

    // ✅ Calculate workload score using ACTIVE tasks only (Eq. 2)
    let workloadScore = 0;
    const taskCount = tasks?.length || 0;
    const activeTaskCount = activeTasksOnly.length;
    
    activeTasksOnly.forEach(task => {
      const weight = PRIORITY_WEIGHTS[task.priority] || 1;
      workloadScore += weight;
    });

    // ✅ Determine workload status using Eq. (3) sigmoid formula
    let workloadStatus, utilizationRate;
    if (isPM) {
      workloadScore = 0;
      workloadStatus = 'Available';
      utilizationRate = 0;
    } else if (workloadScore === 0) {
      workloadStatus = 'Available';
      utilizationRate = 0;
    } else {
      const A = 1 / (1 + Math.exp(0.4 * (workloadScore - 7)));
      workloadStatus = A >= 0.80 ? 'Available' : A >= 0.50 ? 'Limited Availability' : 'Fully Utilized';
      utilizationRate = Math.min(100, Math.max(1, Math.round((workloadScore / 7) * 100)));
    }

    const name = `${profile.first_name || ''} ${profile.middle_name || ''} ${profile.last_name || ''}`.trim() || 'Unnamed';
    const fallbackAvatar = `https://ui-avatars.com/api/?background=3b82f6&color=fff&name=${encodeURIComponent(name)}`;

    // ✅ Get skills
    const { data: skillsData, error: skillsError } = await supabase
      .from('employee_skills')
      .select(`
        skills (
          skill_name
        )
      `)
      .eq('profile_id', profile.id);

    if (skillsError) {
      console.error('Skills error:', skillsError);
    }

    const skills = (skillsData || []).map(s => s.skills?.skill_name).filter(Boolean);

    res.json({
      success: true,
      data: {
        id: profile.id,
        employeeId: profile.employee_id,
        name: name,
        avatar: profile.avatar_url || fallbackAvatar,
        rawRole: profile.role,
        role: isPM ? 'Project Manager' : (profile.positions?.position_name || profile.role || null),
        department: profile.departments?.department_name || 'Unassigned',
        skills: skills,
        isVerified: profile.is_verified || false,
        isPM,
        // For employees: tasks grouped by project
        projects: isPM ? [] : projectsWithTasks,
        tasks: isPM ? [] : (tasks || []),
        taskCount: isPM ? 0 : taskCount,
        activeTaskCount: isPM ? 0 : activeTaskCount,
        workloadScore: workloadScore,
        workloadStatus: workloadStatus,
        utilizationRate: utilizationRate,
        // For PMs: managed projects
        managedProjects: isPM ? managedProjects.map(proj => ({
          id: proj.id,
          name: proj.project_name,
          code: proj.project_code || null,
          status: proj.status,
          startDate: proj.start_date,
          endDate: proj.end_date,
          memberCount: (proj.project_assignments || []).filter(a => a.status === 'Assigned').length,
          members: (proj.project_assignments || [])
            .filter(a => a.status === 'Assigned' && a.profiles)
            .map(a => `${a.profiles.first_name || ''} ${a.profiles.last_name || ''}`.trim()),
        })) : [],
        managedProjectCount: isPM ? managedProjects.length : 0,
      }
    });
  } catch (error) {
    console.error('❌ Error fetching employee details:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error.details || null
    });
  }
});

/**
 * PATCH /api/rm/employees/:id/verify
 * Toggles verified profile flag with branch check
 */
router.patch('/:id/verify', async (req, res) => {
  const { id } = req.params;
  const userBranchId = req.user.branch_id;
  const isSuperAdmin = req.user.is_super_admin;

  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('profiles')
      .select('is_verified, branch_id, role')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    if (existing.role !== 'Employee') {
      return res.status(403).json({
        success: false,
        error: 'Only Employee accounts can be verified'
      });
    }

    if (!isSuperAdmin && existing.branch_id !== userBranchId) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to modify this employee'
      });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ is_verified: !existing.is_verified })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    clearEmployeeCache(isSuperAdmin ? null : userBranchId);

    res.json({ success: true, employee: data });
  } catch (err) {
    console.error('RM verify toggle error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/rm/employees/:id/assign
 * Assigns an employee to a project with branch check
 */
router.post('/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { projectId, startDate, role, notes, requirementId } = req.body;
  const userBranchId = req.user.branch_id;
  const isSuperAdmin = req.user.is_super_admin;

  if (!projectId || !startDate) {
    return res.status(400).json({ success: false, error: 'projectId and startDate are required' });
  }

  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('profiles')
      .select('branch_id, role, first_name, last_name')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    if (existing.role !== 'Employee') {
      return res.status(403).json({
        success: false,
        error: 'Only Employee accounts can be assigned to projects'
      });
    }

    if (!isSuperAdmin && existing.branch_id !== userBranchId) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to assign this employee'
      });
    }

    // Check if employee is already assigned to this project
    const { data: existingAssign, error: existAssignErr } = await supabase
      .from('project_assignments')
      .select('id')
      .eq('project_id', projectId)
      .eq('profile_id', id)
      .eq('status', 'Assigned');
    
    if (existAssignErr) throw existAssignErr;
    if (existingAssign && existingAssign.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Employee is already assigned to this project'
      });
    }

    // Attempt to auto-find requirement if requirementId is not provided
    let finalRequirementId = requirementId || null;
    if (!finalRequirementId && role) {
      const { data: matchedReq } = await supabase
        .from('project_resource_requirements')
        .select('id')
        .eq('project_id', projectId)
        .ilike('role_title', role.trim())
        .not('status', 'in', '("Filled","Fulfilled","Completed","Cancelled")')
        .maybeSingle();
      if (matchedReq?.id) {
        finalRequirementId = matchedReq.id;
      }
    }

    const { data, error } = await supabase
      .from('project_assignments')
      .insert({
        project_id: projectId,
        profile_id: id,
        requirement_id: finalRequirementId,
        assigned_role: role || null,
        start_date: startDate,
        status: 'Assigned',
        assigned_by: req.user?.id || null,
        assigned_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    // Check if requirement should be marked as 'Filled'
    if (finalRequirementId) {
      const { data: activeAssignments } = await supabase
        .from('project_assignments')
        .select('id')
        .eq('requirement_id', finalRequirementId)
        .eq('status', 'Assigned');

      const { data: reqData } = await supabase
        .from('project_resource_requirements')
        .select('quantity_needed')
        .eq('id', finalRequirementId)
        .single();

      const needed = reqData?.quantity_needed || 1;
      const currentCount = activeAssignments?.length || 0;

      if (currentCount >= needed) {
        await supabase
          .from('project_resource_requirements')
          .update({ status: 'Filled' })
          .eq('id', finalRequirementId);
      }
    }

    // Activate project if it was not started
    const { data: projectRow } = await supabase
      .from('projects')
      .select('status, project_name, created_by')
      .eq('id', projectId)
      .single();

    if (projectRow && ['Draft', 'Planning', 'Pending Approval', 'Pending', 'Created'].includes(projectRow.status)) {
      await supabase
        .from('projects')
        .update({ status: 'Active', updated_at: new Date().toISOString() })
        .eq('id', projectId);
    }

    // Notifications
    try {
      const notifs = [
        {
          recipient_id: id,
          type: 'assignment',
          text: `You have been assigned to project "${projectRow?.project_name || 'a project'}" as ${role || 'team member'}.`,
          read: false
        }
      ];
      if (projectRow?.created_by && projectRow.created_by !== req.user?.id) {
        const empName = `${existing.first_name || ''} ${existing.last_name || ''}`.trim();
        notifs.push({
          recipient_id: projectRow.created_by,
          type: 'assignment',
          text: `${empName || 'An employee'} has been assigned to your project "${projectRow.project_name}" as ${role || 'team member'}.`,
          read: false
        });
      }
      await supabase.from('notifications').insert(notifs);
    } catch (nErr) {
      console.warn('Non-fatal notification error on assignment:', nErr.message);
    }

    if (notes) {
      await supabase.from('audit_logs').insert({
        user_id: req.user?.id || null,
        action: 'ASSIGN_EMPLOYEE',
        system_category: 'Resource Manager',
        log_description: `Assigned profile ${id} to project ${projectId}. Notes: ${notes}`,
        branch: userBranchId,
      });
    }

    // Recalculate employee availability status
    workloadService.recalculateForEmployee(id).catch(e => console.warn('Non-fatal workload recalc error:', e.message));

    clearEmployeeCache(isSuperAdmin ? null : userBranchId);
    try {
      const { clearDashboardCache } = require('./Dashboard');
      const { clearProjectsCache } = require('./Projects');
      if (clearDashboardCache) clearDashboardCache(isSuperAdmin ? null : userBranchId);
      if (clearProjectsCache) clearProjectsCache(isSuperAdmin ? null : userBranchId);
    } catch (cErr) {
      console.warn('Non-fatal cache clearing error:', cErr.message);
    }

    res.json({ success: true, assignment: data });
  } catch (err) {
    console.error('RM assign employee error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
module.exports.clearEmployeeCache = clearEmployeeCache;