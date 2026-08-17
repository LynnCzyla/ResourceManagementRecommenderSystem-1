// backend/routes/HumanResource/dashboard.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

// GET /api/hr/dashboard/summary — quick counts for the HR dashboard tab
router.get('/summary', async (req, res) => {
  try {
    const [postings, applications, interviews, hires] = await Promise.all([
      supabase.from('job_postings').select('id', { count: 'exact', head: true }).eq('status', 'Active'),
      supabase.from('job_applications').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
      supabase.from('interviews').select('id', { count: 'exact', head: true }).eq('status', 'Scheduled'),
      supabase.from('hired_employees').select('id', { count: 'exact', head: true }).eq('status', 'Onboarding'),
    ]);

    res.status(200).json({
      success: true,
      data: {
        activeJobPostings: postings.count || 0,
        pendingApplications: applications.count || 0,
        scheduledInterviews: interviews.count || 0,
        employeesOnboarding: hires.count || 0,
      },
    });
  } catch (error) {
    console.error('Error building HR dashboard summary:', error);
    res.status(500).json({ success: false, error: 'Failed to load HR dashboard summary.' });
  }
});

module.exports = router;
