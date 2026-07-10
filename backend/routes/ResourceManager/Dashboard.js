const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

// ✅ Simple in-memory cache
const cache = {
  data: null,
  timestamp: 0,
  ttl: 60000 // Cache for 1 minute (60,000 milliseconds)
};

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

    // ✅ Run all 3 queries in PARALLEL for speed
    const [employeesResult, assignmentsResult, projectsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select(`
          id,
          employee_id,
          first_name,
          last_name,
          avatar_url,
          status,
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
        .select('id, status')
    ]);

    // Check for errors
    if (employeesResult.error) throw employeesResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;
    if (projectsResult.error) throw projectsResult.error;

    const employees = employeesResult.data || [];
    const assignments = assignmentsResult.data || [];
    const projects = projectsResult.data || [];

    console.log(`📊 Data: ${employees.length} employees, ${assignments.length} assignments, ${projects.length} projects`);

    // ✅ Count assignments efficiently (single pass)
    const assignmentCounts = {};
    for (const a of assignments) {
      assignmentCounts[a.profile_id] = (assignmentCounts[a.profile_id] || 0) + 1;
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
      let workloadStatus;
      
      if (count === 0) {
        workloadStatus = 'Available';
        availableCount++;
      } else if (count === 1) {
        workloadStatus = 'Limited availability';
        limitedCount++;
      } else {
        workloadStatus = 'Fully loaded';
        fullyLoadedCount++;
      }

      employeeRows.push({
        id: emp.id,
        employeeId: emp.employee_id,
        name: `${emp.first_name} ${emp.last_name}`,
        avatar: emp.avatar_url,
        role: emp.positions?.position_name || 'Unassigned',
        department: emp.departments?.department_name || 'Unassigned',
        workloadStatus,
        utilizationRate: Math.min(count * 50, 100),
        assignmentCount: count,
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