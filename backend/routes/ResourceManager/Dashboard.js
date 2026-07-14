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
router.get('/dashboard', async (req, res) => {
  try {
    // ✅ Check if we have cached data that's still fresh
    const now = Date.now();
    if (cache.data && (now - cache.timestamp) < cache.ttl) {
      console.log('📊 Returning CACHED dashboard data');
      return res.json(cache.data);
    }

    console.log('📊 Fetching FRESH dashboard data...');
    const startTime = Date.now();

    // ✅ Run all 4 queries in PARALLEL
    // ✅ REMOVED avatar_url from employees select - only need basic info
    const [employeesResult, assignmentsResult, projectsResult, tasksResult] = await Promise.all([
      supabase
        .from('profiles')
        .select(`
          id,
          employee_id,
          first_name,
          last_name,
          -- avatar_url,  // ❌ REMOVED - not needed for dashboard
          status,
          role,
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
        .select('profile_id, status')
    ]);

    // Check for errors
    if (employeesResult.error) throw employeesResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;
    if (projectsResult.error) throw projectsResult.error;
    if (tasksResult.error) throw tasksResult.error;

    // Admin accounts aren't assignable to projects/tasks, so they never
    // belong in this table — filter them out before any counting happens.
    const employees = (employeesResult.data || []).filter(
      (emp) => (emp.role || '').trim().toLowerCase() !== 'admin'
    );
    const assignments = assignmentsResult.data || [];
    const projects = projectsResult.data || [];
    const tasks = tasksResult.data || [];

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
      // Workload is driven by assigned TASKS, not project links — an employee
      // with no tasks is "Available" even if they're linked to a project.
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

      // Prefer the actual assigned position from the positions table. Only
      // fall back to the profile's role if no real position record exists —
      // and never fall back to the literal word "Employee" as a position,
      // since that produced the bogus "Employee / Employee" display.
      const rawPosition = emp.positions?.position_name?.trim();
      const rawRole = (emp.role || '').trim();
      const roleLower = rawRole.toLowerCase();

      let displayRole;
      if (roleLower === 'project manager') {
        displayRole = 'Project Manager';
      } else if (roleLower === 'resource manager') {
        displayRole = 'Resource Manager';
      } else if (rawPosition && rawPosition.toLowerCase() !== 'employee') {
        displayRole = `Employee / ${toTitleCase(rawPosition)}`;
      } else if (rawRole && roleLower !== 'employee') {
        displayRole = `Employee / ${toTitleCase(rawRole)}`;
      } else {
        displayRole = 'Employee';
      }

      const hasTask = (taskCounts[emp.id] || 0) > 0;

      employeeRows.push({
        id: emp.id,
        employeeId: emp.employee_id,
        name: `${emp.first_name} ${emp.last_name}`,
        // ✅ No avatar in dashboard - use generated URL in frontend
        avatar: `https://ui-avatars.com/api/?background=3b82f6&color=fff&name=${encodeURIComponent(`${emp.first_name} ${emp.last_name}`)}`,
        role: displayRole,
        department: emp.departments?.department_name || 'Unassigned',
        workloadStatus,
        utilizationRate: Math.min(taskCount * 50, 100),
        assignmentCount: count,
        taskStatus: hasTask ? 'Assigned' : 'Unassigned',
      });
    }

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