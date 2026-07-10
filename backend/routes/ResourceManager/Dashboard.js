const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');


/**
 * GET /api/rm/dashboard
 * Powers RMDashboardTab.jsx
 *
 * NOTE on workload calculation:
 * project_assignments has no "hours" column, so there's no real hours-based
 * utilization number to compute. This uses the count of a profile's active
 * ("Assigned") assignments as a stand-in:
 *   0 active assignments  -> Available      (0%)
 *   1 active assignment   -> Limited        (50%)
 *   2+ active assignments -> Fully loaded   (100%)
 * Swap this out once/if you add a real hours_allocated column.
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { data: employees, error: empErr } = await supabase
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
      .eq('status', 'Active');
    if (empErr) throw empErr;

    const { data: assignments, error: asgErr } = await supabase
      .from('project_assignments')
      .select('profile_id, status')
      .eq('status', 'Assigned');
    if (asgErr) throw asgErr;

    const { data: projects, error: projErr } = await supabase
      .from('projects')
      .select('id, status');
    if (projErr) throw projErr;

    const assignmentCounts = {};
    (assignments || []).forEach((a) => {
      assignmentCounts[a.profile_id] = (assignmentCounts[a.profile_id] || 0) + 1;
    });

    const activeProjectsCount = (projects || []).filter((p) => p.status === 'Active').length;

    const employeeRows = (employees || []).map((emp) => {
      const count = assignmentCounts[emp.id] || 0;
      const workloadStatus =
        count === 0 ? 'Available' : count === 1 ? 'Limited availability' : 'Fully loaded';
      const utilizationRate = Math.min(count * 50, 100);

      return {
        id: emp.id,
        employeeId: emp.employee_id,
        name: `${emp.first_name} ${emp.last_name}`,
        avatar: emp.avatar_url,
        role: emp.positions?.position_name || 'Unassigned',
        department: emp.departments?.department_name || 'Unassigned',
        workloadStatus,
        utilizationRate,
        assignmentCount: count,
      };
    });

    const workloadCounts = {
      available: employeeRows.filter((e) => e.workloadStatus === 'Available').length,
      limited: employeeRows.filter((e) => e.workloadStatus === 'Limited availability').length,
      fullyLoaded: employeeRows.filter((e) => e.workloadStatus === 'Fully loaded').length,
    };

    res.json({
      success: true,
      totalEmployees: employeeRows.length,
      activeProjectsCount,
      workloadCounts,
      employees: employeeRows,
    });
  } catch (err) {
    console.error('RM dashboard error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;