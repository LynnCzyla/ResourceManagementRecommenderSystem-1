// backend/routes/HumanResource/dashboard.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

router.get('/summary', async (req, res) => {
  try {
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    console.log(`📊 HR Dashboard requested by: ${req.user?.employee_id} (${userId})`);
    console.log(`👤 Role: ${userRole}`);
    console.log(`🏢 Branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);

    // ✅ Check if user has HR role
    if (userRole !== 'Human Resources' && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Human Resources role required.'
      });
    }

    // ✅ For Super Admin: Get all data
    if (isSuperAdmin) {
      const [postings, applications, interviews, hires, resourceRequests] = await Promise.all([
        supabase.from('job_postings').select('id', { count: 'exact', head: true }).eq('status', 'Active'),
        supabase.from('job_applications').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
        supabase.from('interviews').select('id', { count: 'exact', head: true }).eq('status', 'Scheduled'),
        supabase.from('hired_employees').select('id', { count: 'exact', head: true }).eq('status', 'Onboarding'),
        supabase.from('hr_resource_requests').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          activeJobPostings: postings.count || 0,
          pendingApplications: applications.count || 0,
          scheduledInterviews: interviews.count || 0,
          employeesOnboarding: hires.count || 0,
          pendingResourceRequests: resourceRequests.count || 0,
        },
      });
    }

    // ✅ For non-super admins: Check branch
    if (!userBranchId) {
      return res.status(403).json({
        success: false,
        error: 'Your account is not assigned to a branch'
      });
    }

    // ✅ Get all users in this branch with Human Resources role
    const { data: branchUsers, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('branch_id', userBranchId)
      .eq('role', 'Human Resources')
      .eq('status', 'Active');

    if (userError) {
      console.error('Error fetching branch users:', userError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch branch users'
      });
    }

    const userIds = branchUsers?.map(u => u.id) || [];

    console.log(`📋 Found ${userIds.length} Human Resources users in branch`);

    // If no HR users in branch, return empty (or allow the current user)
    // Since the current user IS Human Resources, we should include them
    const allUserIds = [...userIds, userId];

    // ✅ Build queries with branch filtering
    const [postings, applications, interviews, hires, resourceRequests] = await Promise.all([
      supabase
        .from('job_postings')
        .select('id', { count: 'exact', head: true })
        .in('created_by', allUserIds)
        .eq('status', 'Active'),
      supabase
        .from('job_applications')
        .select('id', { count: 'exact', head: true })
        .in('created_by', allUserIds)
        .eq('status', 'Pending'),
      supabase
        .from('interviews')
        .select('id', { count: 'exact', head: true })
        .in('created_by', allUserIds)
        .eq('status', 'Scheduled'),
      supabase
        .from('hired_employees')
        .select('id', { count: 'exact', head: true })
        .in('created_by', allUserIds)
        .eq('status', 'Onboarding'),
      supabase
        .from('hr_resource_requests')
        .select('id', { count: 'exact', head: true })
        .in('requested_by', allUserIds)
        .eq('status', 'Pending'),
    ]);

    console.log(`✅ HR Dashboard stats: Active Job Postings: ${postings.count}, Pending Applications: ${applications.count}`);

    res.status(200).json({
      success: true,
      data: {
        activeJobPostings: postings.count || 0,
        pendingApplications: applications.count || 0,
        scheduledInterviews: interviews.count || 0,
        employeesOnboarding: hires.count || 0,
        pendingResourceRequests: resourceRequests.count || 0,
      },
    });
  } catch (error) {
    console.error('Error building HR dashboard summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load HR dashboard summary.'
    });
  }
});

module.exports = router;