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
      const [postings, applications, offersSent, recommendedApplications, interviews, hires, resourceRequests] = await Promise.all([
        supabase.from('job_postings').select('id', { count: 'exact', head: true }).eq('status', 'Active'),
        supabase
          .from('job_applications')
          .select('id, job_postings!inner(status)', { count: 'exact', head: true })
          .eq('job_postings.status', 'Active')
          .not('status', 'in', '("Hired","Rejected","Offer Declined","Archived","Withdrawn")'),
        // Offers Sent = hired_employees rows that are Active (offer sent, awaiting response)
        // When applicant accepts or declines, status changes away from Active → count drops
        supabase
          .from('hired_employees')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'Active'),
        supabase
          .from('job_applications')
          .select('id, job_postings!inner(status)', { count: 'exact', head: true })
          .eq('job_postings.status', 'Active')
          .eq('status', 'Recommended'),
        supabase.from('interviews').select('id', { count: 'exact', head: true }).eq('status', 'Scheduled'),
        supabase.from('hired_employees').select('id', { count: 'exact', head: true }).eq('status', 'Onboarding'),
        supabase.from('hr_resource_requests').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          activeJobPostings: postings.count || 0,
          activeApplications: applications.count || 0,
          offersSent: offersSent.count || 0,
          recommendedForEmployment: recommendedApplications.count || 0,
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
    const allUserIds = [...userIds, userId];

    console.log(`📋 Found ${userIds.length} Human Resources users in branch`);

    // ✅ Build queries with branch filtering
    const [postings, applications, offersSent, recommendedApplications, interviews, hires, resourceRequests] = await Promise.all([
      supabase
        .from('job_postings')
        .select('id', { count: 'exact', head: true })
        .in('created_by', allUserIds)
        .eq('status', 'Active'),
      supabase
        .from('job_applications')
        .select('id, job_postings!inner(status)', { count: 'exact', head: true })
        .eq('branch_id', userBranchId)
        .eq('job_postings.status', 'Active')
        .not('status', 'in', '("Hired","Rejected","Offer Declined","Archived","Withdrawn")'),
      // Offers Sent = hired_employees rows that are Active (offer sent, awaiting response)
      // Scoped to this branch via the job_applications join
      supabase
        .from('hired_employees')
        .select('id, job_applications!inner(branch_id)', { count: 'exact', head: true })
        .eq('job_applications.branch_id', userBranchId)
        .eq('status', 'Active'),
      supabase
        .from('job_applications')
        .select('id, job_postings!inner(status)', { count: 'exact', head: true })
        .eq('branch_id', userBranchId)
        .eq('job_postings.status', 'Active')
        .eq('status', 'Recommended'),
      supabase
        .from('interviews')
        .select('id, job_applications!inner(branch_id)', { count: 'exact', head: true })
        .eq('job_applications.branch_id', userBranchId)
        .eq('status', 'Scheduled'),
      supabase
        .from('hired_employees')
        .select('id, job_applications!inner(branch_id)', { count: 'exact', head: true })
        .eq('job_applications.branch_id', userBranchId)
        .eq('status', 'Onboarding'),
      supabase
        .from('hr_resource_requests')
        .select('id, requester:profiles!hr_resource_requests_requested_by_fkey(branch_id)')
        .eq('status', 'Pending'),
    ]);

    console.log(`✅ HR Dashboard stats: Active Job Postings: ${postings.count}, Pending Applications: ${applications.count}`);

    res.status(200).json({
      success: true,
      data: {
        activeJobPostings: postings.count || 0,
        activeApplications: applications.count || 0,
        offersSent: offersSent.count || 0,
        recommendedForEmployment: recommendedApplications.count || 0,
        scheduledInterviews: interviews.count || 0,
        employeesOnboarding: hires.count || 0,
        pendingResourceRequests: (resourceRequests.data || [])
          .filter(request => request.requester?.branch_id === userBranchId).length,
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