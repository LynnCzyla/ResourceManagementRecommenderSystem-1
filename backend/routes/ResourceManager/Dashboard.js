// backend/routes/ResourceManager/Dashboard.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { verifyToken } = require('../Middleware/auth');

// ✅ Apply auth middleware
router.use(verifyToken);

// ✅ Priority weights based on your paper
const PRIORITY_WEIGHTS = {
  'Low': 1,
  'Medium': 2,
  'High': 3
};

// ✅ Simple in-memory cache with branch-aware keys
const cache = {
  data: {},
  ttl: 60000 // Cache for 1 minute
};

const toTitleCase = (str) =>
  (str || '')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

const getCacheKey = (branchId) => `branch_${branchId || 'all'}`;

const clearDashboardCache = (branchId = null) => {
  if (branchId) {
    const key = getCacheKey(branchId);
    delete cache.data[key];
    console.log(`🗑️ Dashboard cache cleared for branch: ${branchId}`);
  } else {
    cache.data = {};
    console.log('🗑️ All dashboard cache cleared');
  }
};

/**
 * GET /api/rm/dashboard
 * Powers RMDashboardTab.jsx - WITH BRANCH FILTERING & WORKLOAD SCORE
 */
router.get('/', async (req, res) => {
  try {
    const userBranchId = req.user.branch_id;
    const isSuperAdmin = req.user.is_super_admin;
    const userRole = req.user.role;

    console.log(`📊 RM Dashboard requested by: ${req.user.employee_id} (${userRole})`);
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
      console.log(`📊 Returning CACHED dashboard data for branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);
      return res.json(cache.data[cacheKey].data);
    }

    console.log(`📊 Fetching FRESH dashboard data for branch: ${isSuperAdmin ? 'ALL' : userBranchId}...`);
    const startTime = Date.now();

    // ✅ Build employee query with branch filtering
    let employeeQuery = supabase
      .from('profiles')
      .select(`
        id,
        employee_id,
        first_name,
        last_name,
        status,
        role,
        created_at,
        avatar_url,
        branch_id,
        position_id,
        positions ( position_name ),
        departments ( department_name )
      `)
      .eq('status', 'Active');

    if (!isSuperAdmin && userBranchId) {
      employeeQuery = employeeQuery.eq('branch_id', userBranchId);
    }

    // ✅ Get all projects
    const projectsQuery = supabase
      .from('projects')
      .select('id, status, project_code, project_name');

    // ✅ Run queries in PARALLEL
    const [employeesResult, assignmentsResult, projectsResult, tasksResult] = await Promise.all([
      employeeQuery,
      supabase
        .from('project_assignments')
        .select('profile_id, project_id, status')
        .eq('status', 'Assigned'),
      projectsQuery,
      supabase
        .from('project_tasks')
        .select('profile_id, status, project_id, priority') // ✅ Removed task_name and weight
    ]);

    if (employeesResult.error) throw employeesResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;
    if (projectsResult.error) throw projectsResult.error;
    if (tasksResult.error) throw tasksResult.error;

    // ✅ ONLY show users with role = 'Employee'
    const employees = (employeesResult.data || []).filter(
      (emp) => {
        const role = (emp.role || '').trim().toLowerCase();
        return role === 'employee';
      }
    );

    const allAssignments = assignmentsResult.data || [];
    const allProjects = projectsResult.data || [];
    const allTasks = tasksResult.data || [];

    // ✅ Get employee IDs for this branch
    const employeeIds = employees.map(e => e.id);

    // ✅ Filter active projects map
    const activeProjectMap = new Map();
    for (const p of allProjects) {
      if (p.status === 'Active') {
        activeProjectMap.set(p.id, p);
      }
    }
    const activeProjectIds = new Set(activeProjectMap.keys());

    // ✅ Filter assignments to active projects for this branch's employees
    const assignments = allAssignments.filter(a => 
      employeeIds.includes(a.profile_id) && 
      activeProjectIds.has(a.project_id) && 
      a.status === 'Assigned'
    );

    // ✅ Map employee to their active project name(s)
    const employeeProjectMap = new Map();
    for (const a of assignments) {
      const proj = activeProjectMap.get(a.project_id);
      if (proj) {
        if (!employeeProjectMap.has(a.profile_id)) {
          employeeProjectMap.set(a.profile_id, []);
        }
        if (!employeeProjectMap.get(a.profile_id).includes(proj.project_name)) {
          employeeProjectMap.get(a.profile_id).push(proj.project_name);
        }
      }
    }

    // ✅ Filter projects to active projects with assignments from this branch
    const projectIdsFromAssignments = [...new Set(assignments.map(a => a.project_id))];
    let projects = allProjects.filter(p => projectIdsFromAssignments.includes(p.id) && p.status === 'Active');

    // ✅ Filter active tasks for employees in this branch (only active projects and non-completed tasks)
    const activeTasks = allTasks.filter(t => 
      employeeIds.includes(t.profile_id) && 
      activeProjectIds.has(t.project_id) && 
      !['Completed', 'Completed-Hidden', 'Archived'].includes(t.status)
    );

    // Also include active projects from active tasks if employee has active tasks
    for (const t of activeTasks) {
      if (t.profile_id && activeProjectIds.has(t.project_id)) {
        const proj = activeProjectMap.get(t.project_id);
        if (proj) {
          if (!employeeProjectMap.has(t.profile_id)) {
            employeeProjectMap.set(t.profile_id, []);
          }
          if (!employeeProjectMap.get(t.profile_id).includes(proj.project_name)) {
            employeeProjectMap.get(t.profile_id).push(proj.project_name);
          }
        }
      }
    }

    console.log(`📊 Data: ${employees.length} employees, ${assignments.length} active assignments, ${projects.length} active projects, ${activeTasks.length} active tasks`);

    // ✅ Count assignments
    const assignmentCounts = {};
    for (const a of assignments) {
      assignmentCounts[a.profile_id] = (assignmentCounts[a.profile_id] || 0) + 1;
    }

    // ✅ Count active tasks per employee
    const taskCounts = {};
    for (const t of activeTasks) {
      if (t.profile_id) {
        taskCounts[t.profile_id] = (taskCounts[t.profile_id] || 0) + 1;
      }
    }

    // ✅ Calculate Workload Score per employee (weighted by priority from active tasks)
    const workloadScores = {};
    for (const t of activeTasks) {
      if (t.profile_id) {
        const priority = t.priority || 'Low';
        const weight = PRIORITY_WEIGHTS[priority] || 1;
        workloadScores[t.profile_id] = (workloadScores[t.profile_id] || 0) + weight;
      }
    }

    // ✅ Count active projects
    const activeProjectsCount = projects.length;

    // ✅ Process employees with Workload Score
    const employeeRows = [];
    let availableCount = 0;
    let limitedCount = 0;
    let fullyLoadedCount = 0;

    for (const emp of employees) {
      const taskCount = taskCounts[emp.id] || 0;
      const workloadScore = workloadScores[emp.id] || 0;
      
      let workloadStatus;
      let utilizationRate;
      
      // ✅ Workload status based on Workload Score (weighted)
      if (workloadScore === 0) {
        workloadStatus = 'Available';
        utilizationRate = 0;
        availableCount++;
      } else if (workloadScore <= 3) {
        workloadStatus = 'Limited Availability';
        utilizationRate = Math.min(Math.round((workloadScore / 6) * 100), 100);
        limitedCount++;
      } else {
        workloadStatus = 'Fully Utilized';
        utilizationRate = Math.min(Math.round((workloadScore / 6) * 100), 100);
        fullyLoadedCount++;
      }

      // ✅ Get position name
      const positionName = emp.positions?.position_name || null;
      const rawPosition = positionName?.trim();
      const rawRole = (emp.role || '').trim();
      const roleLower = rawRole.toLowerCase();

      let displayRole;
      if (rawPosition && rawPosition.toLowerCase() !== 'employee') {
        displayRole = toTitleCase(rawPosition);
      } else if (roleLower === 'project manager') {
        displayRole = 'Project Manager';
      } else if (roleLower === 'resource manager') {
        displayRole = 'Resource Manager';
      } else if (rawRole && roleLower !== 'employee') {
        displayRole = toTitleCase(rawRole);
      } else {
        displayRole = 'Employee';
      }

      const assignedProjects = employeeProjectMap.get(emp.id) || [];
      const hasProject = assignedProjects.length > 0;
      const projectName = hasProject ? assignedProjects.join(', ') : 'Unassigned';

      employeeRows.push({
        id: emp.id,
        employeeId: emp.employee_id,
        name: `${emp.first_name} ${emp.last_name}`,
        avatar: emp.avatar_url || null,
        role: displayRole,
        position: positionName || 'Unassigned',
        positionId: emp.position_id || null,
        rawRole: emp.role,
        department: emp.departments?.department_name || 'Unassigned',
        workloadStatus,
        utilizationRate,
        taskCount: taskCount,
        workloadScore: workloadScore,
        assignmentCount: assignedProjects.length,
        projectName: projectName,
        projectStatus: hasProject ? 'Assigned' : 'Unassigned',
        taskStatus: hasProject ? 'Assigned' : 'Unassigned',
        createdAt: emp.created_at || null,
      });
    }

    // ✅ Log workload distribution
    console.log(`📊 Workload Distribution: Available: ${availableCount}, Limited: ${limitedCount}, Fully Loaded: ${fullyLoadedCount}`);

    // ✅ Resource Utilization by Department
    const deptStats = {};
    for (const row of employeeRows) {
      const dept = row.department;
      if (!deptStats[dept]) deptStats[dept] = { total: 0, count: 0 };
      deptStats[dept].total += row.utilizationRate;
      deptStats[dept].count += 1;
    }
    const departmentUtilization = Object.entries(deptStats)
      .map(([department, stat]) => ({
        department,
        utilization: Math.round(stat.total / stat.count),
        employeeCount: stat.count,
      }))
      .sort((a, b) => b.utilization - a.utilization);

    // ✅ Workload Distribution based on Workload Score
    const totalForPct = employeeRows.length || 1;
    const workloadDistributionPct = {
      available: Math.round((availableCount / totalForPct) * 100),
      limited: Math.round((limitedCount / totalForPct) * 100),
      fullyLoaded: Math.round((fullyLoadedCount / totalForPct) * 100),
    };

    // ✅ Build the last 6 calendar months
    const monthMeta = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      monthMeta.push({ key, label: d.toLocaleString('en-US', { month: 'short' }), endOfMonth });
    }
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    // ✅ Monthly Resource Requests Trend
    let monthlyTrend = [];
    try {
      let reqQuery = supabase
        .from('project_resource_requirements')
        .select('created_at, quantity_needed, role_title, project_id')
        .gte('created_at', sixMonthsAgo.toISOString());

      if (!isSuperAdmin && userBranchId) {
        if (projectIdsFromAssignments.length > 0) {
          reqQuery = reqQuery.in('project_id', projectIdsFromAssignments);
        } else {
          reqQuery = reqQuery.eq('project_id', 0);
        }
      }

      const { data: requestsData, error: requestsError } = await reqQuery;

      if (requestsError) throw requestsError;

      const excludedKeywords = ['project manager', 'resource manager', 'admin', 'human resources', 'hr'];
      const filteredReqs = (requestsData || []).filter((r) => {
        const title = (r.role_title || '').trim().toLowerCase();
        return !excludedKeywords.some((kw) => title.includes(kw));
      });

      const requestMonthBuckets = monthMeta.reduce((acc, m) => ({ ...acc, [m.key]: 0 }), {});
      for (const r of filteredReqs) {
        const d = new Date(r.created_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (key in requestMonthBuckets) {
          requestMonthBuckets[key] += r.quantity_needed || r.quantity || 1;
        }
      }

      monthlyTrend = monthMeta.map(({ key, label }) => ({
        month: label,
        count: requestMonthBuckets[key],
      }));
    } catch (trendErr) {
      console.warn('⚠️ Monthly resource request trend error:', trendErr.message);
      monthlyTrend = [];
    }

    // ✅ Demand vs. Available Capacity
    let demandVsAvailableCapacity = [];
    try {
      let pendingQuery = supabase
        .from('project_resource_requirements')
        .select('created_at, quantity_needed, role_title, project_id')
        .eq('status', 'Pending')
        .gte('created_at', sixMonthsAgo.toISOString());

      if (!isSuperAdmin && userBranchId) {
        if (projectIdsFromAssignments.length > 0) {
          pendingQuery = pendingQuery.in('project_id', projectIdsFromAssignments);
        } else {
          pendingQuery = pendingQuery.eq('project_id', 0);
        }
      }

      const { data: pendingReqs, error: reqsError } = await pendingQuery;

      if (reqsError) throw reqsError;

      const excludedKeywords = ['project manager', 'resource manager', 'admin', 'human resources', 'hr'];
      const filteredPending = (pendingReqs || []).filter((r) => {
        const title = (r.role_title || '').trim().toLowerCase();
        return !excludedKeywords.some((kw) => title.includes(kw));
      });

      const availableCapacityEmployees = employeeRows.filter((e) => {
        const roleMatch = (e.rawRole || '').trim().toLowerCase() === 'employee';
        const isAvailable = e.workloadStatus === 'Available' || e.workloadStatus === 'Limited Availability';
        return roleMatch && isAvailable;
      });

      demandVsAvailableCapacity = monthMeta.map(({ key, label, endOfMonth }) => {
        const openDemand = filteredPending
          .filter((r) => new Date(r.created_at) <= endOfMonth)
          .reduce((sum, r) => sum + (r.quantity_needed || r.quantity || 1), 0);

        const availableCapacity = availableCapacityEmployees
          .filter((e) => e.createdAt ? new Date(e.createdAt) <= endOfMonth : true)
          .length;

        return {
          month: label,
          openDemand,
          availableCapacity
        };
      });
    } catch (growthErr) {
      console.warn('⚠️ Demand vs capacity error:', growthErr.message);
      demandVsAvailableCapacity = [];
    }

    // ✅ Hiring Outlook
    const overallUtilizationRate = employeeRows.length
      ? Math.round(employeeRows.reduce((sum, e) => sum + e.utilizationRate, 0) / employeeRows.length)
      : 0;

    const overloadedDepartments = departmentUtilization.filter((d) => d.utilization >= 85);

    let recommendation;
    let level;
    if (overallUtilizationRate >= 80 || overloadedDepartments.length >= 2) {
      recommendation = 'Hiring Recommended';
      level = 'high';
    } else if (overallUtilizationRate >= 60 || overloadedDepartments.length >= 1) {
      recommendation = 'Monitor Closely';
      level = 'medium';
    } else {
      recommendation = 'Adequately Staffed';
      level = 'low';
    }

    const hiringNeed = {
      overallUtilizationRate,
      recommendation,
      level,
      overloadedDepartments: overloadedDepartments.map((d) => d.department),
      availableCount,
      fullyLoadedCount,
    };

    // ✅ Get branch info
    let branchInfo = null;
    if (!isSuperAdmin && userBranchId) {
      const { data: branch, error: branchError } = await supabase
        .from('branches')
        .select('id, name, location')
        .eq('id', userBranchId)
        .single();
      
      if (!branchError && branch) {
        branchInfo = branch;
      }
    }

    const responseData = {
      success: true,
      branch: branchInfo,
      is_super_admin: isSuperAdmin,
      user_role: userRole,
      totalEmployees: employeeRows.length,
      activeProjectsCount,
      workloadCounts: {
        available: availableCount,
        limited: limitedCount,
        fullyLoaded: fullyLoadedCount,
      },
      employees: employeeRows,
      departmentUtilization,
      workloadDistributionPct,
      monthlyTrend,
      demandVsAvailableCapacity,
      hiringNeed,
    };

    cache.data[cacheKey] = {
      data: responseData,
      timestamp: Date.now()
    };

    const endTime = Date.now();
    console.log(`✅ Dashboard processed in ${endTime - startTime}ms for branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);

    res.json(responseData);

  } catch (err) {
    console.error('❌ RM dashboard error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
module.exports.clearDashboardCache = clearDashboardCache;