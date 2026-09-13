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
    const { projectId, employeeId, startDate, endDate } = req.query;

    // Query directly from public.project_report table
    let reportQuery = supabase
      .from('project_report')
      .select('*')
      .order('log_date', { ascending: false })
      .order('id', { ascending: false });

    if (projectId) {
      reportQuery = reportQuery.eq('project_id', projectId);
    }

    if (employeeId) {
      reportQuery = reportQuery.eq('employee_id', employeeId);
    }

    if (startDate) {
      reportQuery = reportQuery.gte('log_date', startDate);
    }

    if (endDate) {
      reportQuery = reportQuery.lte('log_date', endDate);
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
