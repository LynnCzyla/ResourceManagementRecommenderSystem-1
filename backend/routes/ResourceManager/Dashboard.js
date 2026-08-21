// backend/routes/ResourceManager/Dashboard.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

// ✅ Simple in-memory cache
const cache = {
  data: null,
  timestamp: 0,
  ttl: 60000 // Cache for 1 minute (60,000 milliseconds)
};

// Converts a string like "senior design engineer" or "SENIOR DESIGN ENGINEER"
// into "Senior Design Engineer".
const toTitleCase = (str) =>
  (str || '')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

/**
 * GET /api/rm/dashboard
 * Powers RMDashboardTab.jsx - OPTIMIZED VERSION
 */
// ✅ CHANGE: Remove '/dashboard' from the path - just use '/'
router.get('/', async (req, res) => {
  try {
    // ✅ Check cache first
    const now = Date.now();
    if (cache.data && (now - cache.timestamp) < cache.ttl) {
      console.log('📊 Returning CACHED dashboard data');
      return res.json(cache.data);
    }

    console.log('📊 Fetching FRESH dashboard data...');
    const startTime = Date.now();

    // ✅ Run queries in PARALLEL
    const [employeesResult, assignmentsResult, projectsResult, tasksResult] = await Promise.all([
      supabase
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
          positions ( position_name ),
          departments ( department_name )
        `)
        .eq('status', 'Active'),

      supabase
        .from('project_assignments')
        .select('profile_id, status')
        .eq('status', 'Assigned'),

      supabase
        .from('projects')
        .select('id, status'),

      supabase
        .from('project_tasks')
        .select('profile_id, status, project_id')
    ]);

    // ✅ Check for errors FIRST
    if (employeesResult.error) throw employeesResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;
    if (projectsResult.error) throw projectsResult.error;
    if (tasksResult.error) throw tasksResult.error;

    // ✅ Define projects BEFORE using it
    const projects = projectsResult.data || [];
    const projectIds = projects.map(p => p.id);  // ✅ Now defined!

    // ✅ Filter tasks to only include relevant projects
    const allTasks = tasksResult.data || [];
    const tasks = allTasks.filter(t => projectIds.includes(t.project_id));

    // Admin accounts aren't assignable to projects/tasks
    const employees = (employeesResult.data || []).filter(
      (emp) => (emp.role || '').trim().toLowerCase() !== 'admin'
    );
    const assignments = assignmentsResult.data || [];

    console.log(`📊 Data: ${employees.length} employees, ${assignments.length} assignments, ${projects.length} projects, ${tasks.length} tasks`);

    // ✅ Count assignments efficiently (single pass)
    const assignmentCounts = {};
    for (const a of assignments) {
      assignmentCounts[a.profile_id] = (assignmentCounts[a.profile_id] || 0) + 1;
    }

    // ✅ Count tasks assigned to each employee (single pass)
    const taskCounts = {};
    for (const t of tasks) {
      if (t.profile_id) {
        taskCounts[t.profile_id] = (taskCounts[t.profile_id] || 0) + 1;
      }
    }

    // ✅ Count active projects (single pass)
    let activeProjectsCount = 0;
    for (const p of projects) {
      if (p.status === 'Active') activeProjectsCount++;
    }

    // ✅ Process employees with counters (single pass)
    const employeeRows = [];
    let availableCount = 0;
    let limitedCount = 0;
    let fullyLoadedCount = 0;

    for (const emp of employees) {
      const count = assignmentCounts[emp.id] || 0;
      const taskCount = taskCounts[emp.id] || 0;
      let workloadStatus;

      if (taskCount === 0) {
        workloadStatus = 'Available';
        availableCount++;
      } else if (taskCount === 1) {
        workloadStatus = 'Limited Availability';
        limitedCount++;
      } else {
        workloadStatus = 'Fully Utilized';
        fullyLoadedCount++;
      }

      const rawPosition = emp.positions?.position_name?.trim();
      const rawRole = (emp.role || '').trim();
      const roleLower = rawRole.toLowerCase();

      // ✅ CHANGE: Drop the "Employee / " prefix — just show the position/role itself
      // (e.g. "Human Resources" instead of "Employee / Human Resources").
      let displayRole;
      if (roleLower === 'project manager') {
        displayRole = 'Project Manager';
      } else if (roleLower === 'resource manager') {
        displayRole = 'Resource Manager';
      } else if (rawPosition && rawPosition.toLowerCase() !== 'employee') {
        displayRole = toTitleCase(rawPosition);
      } else if (rawRole && roleLower !== 'employee') {
        displayRole = toTitleCase(rawRole);
      } else {
        displayRole = 'Employee';
      }

      const hasTask = (taskCounts[emp.id] || 0) > 0;
      const utilizationRate = Math.min(taskCount * 50, 100);

      employeeRows.push({
        id: emp.id,
        employeeId: emp.employee_id,
        name: `${emp.first_name} ${emp.last_name}`,
        avatar: emp.avatar_url || null,
        role: displayRole,
        rawRole: emp.role,
        department: emp.departments?.department_name || 'Unassigned',
        workloadStatus,
        utilizationRate,
        assignmentCount: count,
        taskStatus: hasTask ? 'Assigned' : 'Unassigned',
        createdAt: emp.created_at || null,
      });
    }

    // ✅ Resource Utilization by Department — computed from real per-employee
    // utilization rates instead of hardcoded numbers.
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

    // ✅ Workload Distribution — real percentages instead of hardcoded 40/30/30.
    const totalForPct = employeeRows.length || 1;
    const workloadDistributionPct = {
      available: Math.round((availableCount / totalForPct) * 100),
      limited: Math.round((limitedCount / totalForPct) * 100),
      fullyLoaded: Math.round((fullyLoadedCount / totalForPct) * 100),
    };

    // ✅ Build the last 6 calendar months once, shared by the "Monthly Resource
    // Requests Trend" chart and the new "Workload vs. Employee Growth" chart
    // so both use the exact same buckets.
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

    // ✅ Monthly Resource Requests Trend — pulled from a `project_resource_requirements`
    // table (created_at), last 6 months. Degrades gracefully (empty array)
    // if that table doesn't exist yet or the query fails, instead of
    // showing fabricated numbers.
    let monthlyTrend = [];
    let requestMonthBuckets = {};
    try {
      const { data: requestsData, error: requestsError } = await supabase
        .from('project_resource_requirements')
        .select('created_at, quantity_needed, role_title')
        .gte('created_at', sixMonthsAgo.toISOString());

      if (requestsError) throw requestsError;

      // Filter out resource requests for project managers, resource managers, admins, and HR
      const excludedKeywords = ['project manager', 'resource manager', 'admin', 'human resources', 'hr'];
      const filteredReqs = (requestsData || []).filter((r) => {
        const title = (r.role_title || '').trim().toLowerCase();
        return !excludedKeywords.some((kw) => title.includes(kw));
      });

      requestMonthBuckets = monthMeta.reduce((acc, m) => ({ ...acc, [m.key]: 0 }), {});
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
      console.warn('⚠️ Could not compute monthly resource request trend:', trendErr.message);
      monthlyTrend = [];
      requestMonthBuckets = monthMeta.reduce((acc, m) => ({ ...acc, [m.key]: 0 }), {});
    }

    // ✅ Demand vs. Available Capacity — cumulative open demand (Pending resource-request
    // quantity_needed created on or before the end of the month) mapped against cumulative
    // available capacity (active Employees with workloadStatus of 'Available' or 'Limited Availability'
    // hired on or before the end of the month).
    // Note: workloadStatus is computed from current task counts, not historical per-month task counts.
    // If historical workload status isn't tracked, we use current workloadStatus for all months
    // as an approximation (this limitation will be flagged in the capstone writeup).
    let demandVsAvailableCapacity = [];
    try {
      const { data: pendingReqs, error: reqsError } = await supabase
        .from('project_resource_requirements')
        .select('created_at, quantity_needed, role_title')
        .eq('status', 'Pending')
        .gte('created_at', sixMonthsAgo.toISOString());

      if (reqsError) throw reqsError;

      // Filter out role_title keywords for managers/admins/HR
      const excludedKeywords = ['project manager', 'resource manager', 'admin', 'human resources', 'hr'];
      const filteredPending = (pendingReqs || []).filter((r) => {
        const title = (r.role_title || '').trim().toLowerCase();
        return !excludedKeywords.some((kw) => title.includes(kw));
      });

      // Filter capacity: active Employees (database role is 'Employee')
      // who are currently 'Available' or 'Limited Availability'.
      const availableCapacityEmployees = employeeRows.filter((e) => {
        const roleMatch = (e.rawRole || '').trim().toLowerCase() === 'employee';
        const isAvailable = e.workloadStatus === 'Available' || e.workloadStatus === 'Limited Availability';
        return roleMatch && isAvailable;
      });

      demandVsAvailableCapacity = monthMeta.map(({ key, label, endOfMonth }) => {
        // Calculate cumulative pending demand: sum of quantity_needed for all pending requests created on or before endOfMonth
        const openDemand = filteredPending
          .filter((r) => new Date(r.created_at) <= endOfMonth)
          .reduce((sum, r) => sum + (r.quantity_needed || r.quantity || 1), 0);

        // Calculate available capacity: count of active Employees with workload status 'Available' or 'Limited Availability' created on or before endOfMonth
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
      console.warn('⚠️ Could not compute demand vs available capacity:', growthErr.message);
      demandVsAvailableCapacity = [];
    }

    // ✅ Hiring Outlook — flags whether the current headcount looks like it
    // needs reinforcement, based on average utilization and how many
    // departments are running hot (>=85% utilization).
    const overallUtilizationRate = employeeRows.length
      ? Math.round(employeeRows.reduce((sum, e) => sum + e.utilizationRate, 0) / employeeRows.length)
      : 0;

    const overloadedDepartments = departmentUtilization.filter((d) => d.utilization >= 85);

    let recommendation;
    let level; // 'high' | 'medium' | 'low'
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

    const responseData = {
      success: true,
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

    // ✅ Store in cache
    cache.data = responseData;
    cache.timestamp = Date.now();

    const endTime = Date.now();
    console.log(`✅ Dashboard processed in ${endTime - startTime}ms`);

    res.json(responseData);

  } catch (err) {
    console.error('❌ RM dashboard error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ✅ Optional: Clear cache when data changes (call this from other routes)
const clearDashboardCache = () => {
  cache.data = null;
  cache.timestamp = 0;
  console.log('🗑️ Dashboard cache cleared');
};

// Export the router and the cache clearer
module.exports = router;
module.exports.clearDashboardCache = clearDashboardCache;