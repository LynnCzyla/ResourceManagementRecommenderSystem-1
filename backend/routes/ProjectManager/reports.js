// backend/routes/ProjectManager/reports.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

/**
 * GET /api/pm/reports
 * Returns weekly report entries EXCLUSIVELY from public.project_report table.
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    const isSuperAdmin = req.user?.is_super_admin || req.user?.role === 'Super Admin' || req.user?.role === 'Admin';
    const { projectId, employeeId } = req.query;

    // 1. Fetch relevant projects to determine scope if non-super-admin
    let projectsQuery = supabase
      .from('projects')
      .select('id, created_by');

    if (!isSuperAdmin && userId) {
      projectsQuery = projectsQuery.eq('created_by', userId);
    }

    if (projectId) {
      projectsQuery = projectsQuery.eq('id', projectId);
    }

    const { data: userProjects, error: projErr } = await projectsQuery;
    if (projErr) throw projErr;

    const projectIds = (userProjects || []).map(p => p.id);

    if (!isSuperAdmin && projectIds.length === 0) {
      return res.status(200).json({ success: true, data: [], count: 0 });
    }

    // 2. Query ONLY public.project_report table
    let reportQuery = supabase
      .from('project_report')
      .select('*')
      .order('log_date', { ascending: false })
      .order('id', { ascending: false });

    if (!isSuperAdmin && projectIds.length > 0) {
      reportQuery = reportQuery.in('project_id', projectIds);
    }

    if (projectId) {
      reportQuery = reportQuery.eq('project_id', projectId);
    }

    if (employeeId) {
      reportQuery = reportQuery.eq('employee_id', employeeId);
    }

    const { data: reports, error: repErr } = await reportQuery;
    if (repErr) throw repErr;

    res.status(200).json({
      success: true,
      data: reports || [],
      count: (reports || []).length,
    });
  } catch (error) {
    console.error('❌ Error fetching project reports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project reports',
      error: error.message,
    });
  }
});

module.exports = router;
