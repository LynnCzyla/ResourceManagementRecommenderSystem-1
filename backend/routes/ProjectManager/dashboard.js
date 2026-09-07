// backend/routes/ProjectManager/dashboard.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

router.get('/dashboard', async (req, res) => {
  try {
    const { createdBy } = req.query;
    
    // Get the user's branch from the request (set by auth middleware)
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    
    console.log(`📊 PM Dashboard requested by: ${createdBy}`);
    console.log(`🏢 User branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);

    // ✅ Step 1: Get projects created by this PM (NO branch_id in select)
    const projectsResult = await supabase
      .from('projects')
      .select('id, status, created_by')
      .eq('created_by', createdBy);

    if (projectsResult.error) throw projectsResult.error;

    const projects = projectsResult.data || [];
    const projectIds = projects.map(p => p.id);

    console.log(`📋 Found ${projects.length} projects for PM ${createdBy}`);

    // ✅ Step 2: Get tasks for these projects
    let tasks = [];
    if (projectIds.length > 0) {
      const { data, error } = await supabase
        .from('project_tasks')
        .select('id, status, project_id, profile_id')
        .in('project_id', projectIds);
      
      if (error) throw error;
      tasks = data || [];
    }

    // ✅ Step 3: Get assignments for these projects
    let assignments = [];
    if (projectIds.length > 0) {
      const { data, error } = await supabase
        .from('project_assignments')
        .select('profile_id, project_id, status')
        .in('project_id', projectIds);
      
      if (error) throw error;
      assignments = data || [];
    }

    // ✅ Step 4: Get unique active team members (assigned to active projects)
    const activeProjectIds = projects.filter(p => p.status === 'Active').map(p => p.id);
    const activeAssignments = assignments.filter(a => activeProjectIds.includes(a.project_id) && a.status === 'Assigned');
    const uniqueTeamMemberIds = [...new Set(activeAssignments.map(a => a.profile_id))];

    // ✅ Step 5: Get team member details (with branch filtering)
    let teamMembers = [];
    if (uniqueTeamMemberIds.length > 0) {
      let query = supabase
        .from('profiles')
        .select('id, first_name, last_name, employee_id, branch_id')
        .in('id', uniqueTeamMemberIds);
      
      // ✅ For non-super admins, only show employees from their branch
      if (!isSuperAdmin && userBranchId) {
        query = query.eq('branch_id', userBranchId);
      }
      
      const { data, error } = await query;
      if (!error) {
        teamMembers = data || [];
      }
    }

    // ✅ Step 6: Get requirements for these projects
    let requirements = [];
    if (projectIds.length > 0) {
      const { data, error } = await supabase
        .from('project_resource_requirements')
        .select('id, status, project_id')
        .in('project_id', projectIds);
      
      if (error) throw error;
      requirements = data || [];
    }

    // Calculate stats
    const activeProjects = projects.filter(p => p.status === 'Active');
    const completedProjects = projects.filter(p => p.status === 'Completed');
    const pendingProjects = projects.filter(p => p.status === 'Pending' || p.status === 'Pending Approval');

    const tasksByStatus = {
      Pending: tasks.filter(t => t.status === 'Pending' || t.status === 'Pending Approval').length,
      'In Progress': tasks.filter(t => t.status === 'In Progress' || t.status === 'Active').length,
      Completed: tasks.filter(t => t.status === 'Completed').length,
      'On Hold': tasks.filter(t => t.status === 'On Hold').length,
    };

    const requirementsByStatus = {
      Open: requirements.filter(r => ['Open', 'Pending'].includes(r.status)).length,
      Fulfilled: requirements.filter(r => ['Fulfilled', 'Filled', 'Completed'].includes(r.status)).length,
      'In Progress': requirements.filter(r => r.status === 'In Progress').length,
    };

    // Get recent activity (tasks updated in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let recentTasks = [];
    if (projectIds.length > 0) {
      const { data, error } = await supabase
        .from('project_tasks')
        .select('id, title, status, updated_at, project_id')
        .in('project_id', projectIds)
        .gte('updated_at', sevenDaysAgo.toISOString())
        .order('updated_at', { ascending: false })
        .limit(5);
      
      if (!error) {
        recentTasks = data || [];
      }
    }

    res.status(200).json({
      success: true,
      data: {
        // Project stats
        projects: {
          total: projects.length,
          active: activeProjects.length,
          completed: completedProjects.length,
          pending: pendingProjects.length,
        },
        // Task stats
        tasks: {
          total: tasks.length,
          byStatus: tasksByStatus,
        },
        // Team stats
        team: {
          totalMembers: teamMembers.length,
          members: teamMembers.map(m => ({
            id: m.id,
            name: `${m.first_name} ${m.last_name}`,
            employeeId: m.employee_id,
            branchId: m.branch_id,
          })),
        },
        // Requirements stats
        requirements: {
          total: requirements.length,
          byStatus: requirementsByStatus,
        },
        // Recent activity
        recentActivity: recentTasks.map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          updatedAt: t.updated_at,
          projectId: t.project_id,
        })),
        // Branch info
        branchInfo: {
          branchId: userBranchId,
          isSuperAdmin: isSuperAdmin,
        }
      },
    });
  } catch (error) {
    console.error('❌ Error fetching PM dashboard stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch dashboard stats', 
      error: error.message 
    });
  }
});

module.exports = router;