// backend/routes/ResourceManager/Projects.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { verifyToken } = require('../Middleware/auth');

// ✅ Apply auth middleware
router.use(verifyToken);

// ✅ Cache for projects data with branch-aware keys
const cache = {
  data: {}, // Store by branch_id
  ttl: 60000 // 1 minute cache
};

const getCacheKey = (branchId) => `branch_${branchId || 'all'}`;

const clearProjectsCache = (branchId = null) => {
  if (branchId) {
    const key = getCacheKey(branchId);
    delete cache.data[key];
    console.log(`🗑️ Projects cache cleared for branch: ${branchId}`);
  } else {
    cache.data = {};
    console.log('🗑️ All projects cache cleared');
  }
};

// Statuses that mean "not started yet"
const NOT_STARTED_STATUSES = ['Pending', 'Pending Approval', 'Inactive'];

// Extract project rating and comment from formatted project_feedback string
function extractProjectRatingAndFeedback(rawFeedback, responses = []) {
  let rating = null;
  let feedback = (rawFeedback || '').trim();

  if (feedback) {
    const match = feedback.match(/^\[Rating:\s*([1-5](?:\.\d+)?)\/5\]\s*([\s\S]*)$/);
    if (match) {
      rating = parseFloat(match[1]);
      feedback = match[2].trim();
    }
  }

  // Fallback: If no explicit rating tag was extracted, compute average of employee ratings
  if (rating === null && responses && responses.length > 0) {
    const validRatings = responses
      .map(r => Number(r.rating))
      .filter(r => !isNaN(r) && r > 0);
    if (validRatings.length > 0) {
      const avg = validRatings.reduce((sum, r) => sum + r, 0) / validRatings.length;
      rating = Math.round(avg * 10) / 10;
    }
  }

  return { rating, feedback };
}

/**
 * GET /api/rm/projects
 * Powers RMProjectsTab.jsx - WITH BRANCH FILTERING VIA created_by
 */
router.get('/', async (req, res) => {
  try {
    const userBranchId = req.user.branch_id;
    const isSuperAdmin = req.user.is_super_admin;
    const userRole = req.user.role;

    console.log(`📁 Projects requested by: ${req.user.employee_id} (${userRole})`);
    console.log(`🏢 Branch filter: ${isSuperAdmin ? 'ALL' : userBranchId}`);

    if (!isSuperAdmin && !userBranchId) {
      return res.status(403).json({
        success: false,
        error: 'Your account is not assigned to a branch. Please contact your administrator.'
      });
    }

    // ✅ Use branch-specific cache key
    const cacheKey = getCacheKey(isSuperAdmin ? 'all' : userBranchId);
    const now = Date.now();

    if (cache.data[cacheKey] && (now - cache.data[cacheKey].timestamp) < cache.ttl) {
      console.log(`📁 Returning CACHED projects data for branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);
      return res.json(cache.data[cacheKey].data);
    }

    console.log(`📁 Fetching FRESH projects data for branch: ${isSuperAdmin ? 'ALL' : userBranchId}...`);
    const startTime = Date.now();

    // ✅ Step 1: Get all users in this branch
    let branchUserQuery = supabase
      .from('profiles')
      .select('id')
      .eq('status', 'Active');

    if (!isSuperAdmin && userBranchId) {
      branchUserQuery = branchUserQuery.eq('branch_id', userBranchId);
    }

    const { data: branchUsers, error: userError } = await branchUserQuery;

    if (userError) {
      console.error('Error fetching branch users:', userError);
      throw userError;
    }

    const userIds = branchUsers.map(u => u.id);
    console.log(`📁 Found ${userIds.length} users in branch`);

    // ✅ Step 2: Get projects created by users in this branch
    let projectsQuery = supabase
      .from('projects')
      .select('id, project_code, project_name, project_description, status, start_date, end_date, priority, created_by')
      .order('created_at', { ascending: false });

    // Filter by created_by (users in this branch) for non-super admins
    if (!isSuperAdmin && userIds.length > 0) {
      projectsQuery = projectsQuery.in('created_by', userIds);
    } else if (!isSuperAdmin && userIds.length === 0) {
      // No users in branch, return empty
      return res.json({
        success: true,
        projects: [],
        totalProjects: 0,
        summary: {
          active: 0,
          completed: 0,
          onHold: 0,
          totalTeamMembers: 0,
        },
        meta: {
          branch_filter: isSuperAdmin ? 'all' : userBranchId,
          user_role: userRole,
          is_super_admin: isSuperAdmin,
        }
      });
    }

    const [projectsResult, requirementsResult, assignmentsResult] = await Promise.all([
      projectsQuery,
      supabase
        .from('project_resource_requirements')
        .select('id, project_id, requirement_skills ( skills )'),
      supabase
        .from('project_assignments')
        .select(`
          project_id,
          profile_id,
          assigned_role,
          status
        `)
        .in('status', ['Assigned', 'Completed'])
    ]);

    if (projectsResult.error) throw projectsResult.error;
    if (requirementsResult.error) throw requirementsResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;

    const projects = projectsResult.data || [];
    const requirements = requirementsResult.data || [];
    const assignments = assignmentsResult.data || [];

    console.log(`📁 Data: ${projects.length} projects, ${requirements.length} requirements, ${assignments.length} assignments`);

    // ✅ Get creator info for each project
    const creatorIds = [...new Set(projects.map(p => p.created_by).filter(Boolean))];
    let creatorMap = new Map();
    if (creatorIds.length > 0) {
      const { data: creators, error: creatorErr } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, employee_id')
        .in('id', creatorIds);
      
      if (!creatorErr && creators) {
        creatorMap = new Map(creators.map(c => [c.id, c]));
      }
    }

    // ✅ Get unique profile IDs from assignments
    const assignedProfileIds = [...new Set(
      assignments
        .map((a) => a.profile_id)
        .filter(Boolean)
    )];

    // ✅ Fetch profiles for assigned employees
    let profileById = new Map();
    if (assignedProfileIds.length > 0) {
      const { data: assignedProfiles, error: profileErr } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', assignedProfileIds);
      
      if (!profileErr && assignedProfiles) {
        profileById = new Map(assignedProfiles.map((p) => [p.id, p]));
      }
    }

    // ✅ Build project requirements map
    const requirementsByProject = new Map();
    for (const req of requirements) {
      if (!requirementsByProject.has(req.project_id)) {
        requirementsByProject.set(req.project_id, []);
      }
      const skills = req.requirement_skills || [];
      requirementsByProject.get(req.project_id).push(...skills.map(s => s.skills).filter(Boolean));
    }

    // ✅ Build assignments map
    const assignmentsByProject = new Map();
    for (const assignment of assignments) {
      if (!assignmentsByProject.has(assignment.project_id)) {
        assignmentsByProject.set(assignment.project_id, []);
      }
      assignmentsByProject.get(assignment.project_id).push(assignment);
    }

    // ✅ Get branch name for response
    let branchName = 'All Branches';
    if (!isSuperAdmin && userBranchId) {
      const { data: branchData } = await supabase
        .from('branches')
        .select('name')
        .eq('id', userBranchId)
        .single();
      if (branchData) {
        branchName = branchData.name;
      }
    }

    // ✅ Fetch client feedback for projects
    const projectIds = projects.map(p => p.id);
    let feedbackMap = {};
    if (projectIds.length > 0) {
      try {
        const { data: feedbackData, error: feedbackError } = await supabase
          .from('feedback_requests')
          .select(`
            id,
            project_id,
            client_name,
            client_email,
            status,
            completed_at,
            feedback_responses (
              id,
              profile_id,
              rating,
              project_feedback,
              deliverables_feedback,
              additional_comments
            )
          `)
          .in('project_id', projectIds)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false });

        if (!feedbackError && feedbackData) {
          for (const reqRow of feedbackData) {
            if (!feedbackMap[reqRow.project_id]) {
              const responses = reqRow.feedback_responses || [];
              const primaryResponse = responses.find(r => r.project_feedback) || responses[0] || {};
              const extracted = extractProjectRatingAndFeedback(
                primaryResponse.project_feedback,
                responses
              );

              feedbackMap[reqRow.project_id] = {
                requestId: reqRow.id,
                clientName: reqRow.client_name,
                clientEmail: reqRow.client_email,
                completedAt: reqRow.completed_at,
                rating: extracted.rating,
                projectFeedback: extracted.feedback,
                deliverablesFeedback: primaryResponse.deliverables_feedback || null,
                additionalComments: primaryResponse.additional_comments || null,
              };
            }
          }
        }
      } catch (fbErr) {
        console.error('Non-fatal error fetching feedback for projects in RM:', fbErr);
      }
    }

    // ✅ Process projects
    const result = [];
    const toActivate = [];
    for (const proj of projects) {
      const projectSkills = requirementsByProject.get(proj.id) || [];
      const requiredSkills = [...new Set(projectSkills)];

      const projectAssignments = assignmentsByProject.get(proj.id) || [];
      const relevantAssignments = proj.status === 'Completed'
        ? projectAssignments
        : projectAssignments.filter(a => a.status === 'Assigned');
      const assignedEmployees = relevantAssignments.map((a) => {
        const profile = profileById.get(a.profile_id);
        return {
          employeeId: a.profile_id,
          employeeName: profile 
            ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown'
            : 'Unknown',
          role: a.assigned_role,
          status: a.status,
          avatar: `https://ui-avatars.com/api/?background=3b82f6&color=fff&name=${encodeURIComponent(
            profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown' : 'Unknown'
          )}`,
        };
      });

      // ✅ Get creator info
      const creator = creatorMap.get(proj.created_by);
      const createdByName = creator 
        ? `${creator.first_name || ''} ${creator.last_name || ''}`.trim() || 'Unknown'
        : 'Unknown';

      let status = proj.status;
      const hasMembers = assignedEmployees.length > 0;
      const started = proj.start_date && new Date(proj.start_date) <= new Date();
      if (NOT_STARTED_STATUSES.includes(status) && (hasMembers || started)) {
        status = 'Active';
        toActivate.push(proj.id);
      }

      const rawDesc = proj.project_description || '';
      const isRestored = rawDesc.includes('<!-- RESTORED -->') || rawDesc.includes('[RESTORED]');
      const cleanDescription = rawDesc
        .replace(/<!--\s*RESTORED\s*-->/gi, '')
        .replace(/\[RESTORED\]/gi, '')
        .trim();

      result.push({
        id: proj.id,
        code: proj.project_code,
        name: proj.project_name,
        description: cleanDescription,
        rawDescription: rawDesc,
        isRestored,
        status,
        startDate: proj.start_date,
        endDate: proj.end_date,
        priority: proj.priority,
        requiredSkills,
        assignedEmployees,
        teamSize: assignedEmployees.length,
        skillsCount: requiredSkills.length,
        createdBy: proj.created_by,
        createdByName: createdByName,
        clientFeedback: feedbackMap[proj.id] || null,
      });
    }

    if (toActivate.length > 0) {
      await Promise.all(
        toActivate.map((pid) =>
          supabase
            .from('projects')
            .update({ status: 'Active', updated_at: new Date().toISOString() })
            .eq('id', pid)
        )
      );
    }

    const responseData = {
      success: true,
      projects: result,
      totalProjects: result.length,
      summary: {
        active: result.filter(p => p.status === 'Active').length,
        completed: result.filter(p => p.status === 'Completed').length,
        onHold: result.filter(p => p.status === 'On Hold').length,
        totalTeamMembers: result.reduce((sum, p) => sum + p.teamSize, 0),
      },
      meta: {
        branch: branchName,
        branch_filter: isSuperAdmin ? 'all' : userBranchId,
        user_role: userRole,
        is_super_admin: isSuperAdmin,
      }
    };

    cache.data[cacheKey] = {
      data: responseData,
      timestamp: Date.now()
    };

    const endTime = Date.now();
    console.log(`✅ Projects processed in ${endTime - startTime}ms for branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);

    res.json(responseData);

  } catch (err) {
    console.error('❌ RM projects list error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/rm/projects/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userBranchId = req.user.branch_id;
    const isSuperAdmin = req.user.is_super_admin;

    const { data: project, error } = await supabase
      .from('projects')
      .select(`
        id,
        project_code,
        project_name,
        project_description,
        status,
        start_date,
        end_date,
        priority,
        created_by,
        project_assignments (
          profile_id,
          assigned_role,
          status,
          profiles (
            id,
            first_name,
            last_name,
            avatar_url,
            branch_id
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // ✅ Check if user has access to this project (via created_by branch)
    if (!isSuperAdmin) {
      // Get the creator's branch
      const { data: creator } = await supabase
        .from('profiles')
        .select('branch_id')
        .eq('id', project.created_by)
        .single();

      if (!creator || creator.branch_id !== userBranchId) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to view this project'
        });
      }
    }

    // Get creator info
    let createdByName = 'Unknown';
    if (project.created_by) {
      const { data: creator } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', project.created_by)
        .single();
      if (creator) {
        createdByName = `${creator.first_name || ''} ${creator.last_name || ''}`.trim() || 'Unknown';
      }
    }

    res.json({
      success: true,
      project: {
        ...project,
        createdByName: createdByName,
        assignedEmployees: (project.project_assignments || []).map((a) => ({
          employeeId: a.profile_id,
          employeeName: a.profiles ? `${a.profiles.first_name} ${a.profiles.last_name}` : 'Unknown',
          role: a.assigned_role,
          avatar: a.profiles?.avatar_url || null,
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching project detail:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/rm/projects/:id/assign
 */
router.post('/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { employeeId, role } = req.body;
  const userBranchId = req.user.branch_id;
  const isSuperAdmin = req.user.is_super_admin;

  if (!employeeId) {
    return res.status(400).json({ success: false, error: 'employeeId is required' });
  }

  try {
    // ✅ Check if employee belongs to user's branch
    const { data: employee, error: empError } = await supabase
      .from('profiles')
      .select('branch_id, role, first_name, last_name')
      .eq('id', employeeId)
      .single();

    if (empError) throw empError;

    if (!isSuperAdmin && employee.branch_id !== userBranchId) {
      return res.status(403).json({
        success: false,
        error: 'You can only assign employees from your branch'
      });
    }

    // ✅ Check if already assigned
    const { data: existing, error: existErr } = await supabase
      .from('project_assignments')
      .select('id')
      .eq('project_id', id)
      .eq('profile_id', employeeId)
      .eq('status', 'Assigned');
    
    if (existErr) throw existErr;

    if (existing && existing.length > 0) {
      return res.status(409).json({ 
        success: false, 
        error: 'Employee is already assigned to this project' 
      });
    }

    const { data, error } = await supabase
      .from('project_assignments')
      .insert({
        project_id: id,
        profile_id: employeeId,
        assigned_role: role || null,
        status: 'Assigned',
        assigned_by: req.user?.id || null,
        start_date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();
    
    if (error) throw error;

    // ✅ Check and update project status if needed
    const { data: projectRow } = await supabase
      .from('projects')
      .select('status, project_name, created_by')
      .eq('id', id)
      .single();

    if (projectRow && NOT_STARTED_STATUSES.includes(projectRow.status)) {
      await supabase
        .from('projects')
        .update({ status: 'Active', updated_at: new Date().toISOString() })
        .eq('id', id);
    }

    // Cross-role notifications: notify employee and PM
    try {
      const notifs = [
        {
          recipient_id: employeeId,
          type: 'assignment',
          text: `You have been assigned to project "${projectRow?.project_name || 'a project'}" as ${role || 'team member'}.`,
          read: false
        }
      ];
      if (projectRow?.created_by && projectRow.created_by !== req.user?.id) {
        const empName = `${employee.first_name || ''} ${employee.last_name || ''}`.trim();
        notifs.push({
          recipient_id: projectRow.created_by,
          type: 'assignment',
          text: `${empName || 'An employee'} has been assigned to your project "${projectRow.project_name}" as ${role || 'team member'}.`,
          read: false
        });
      }
      await supabase.from('notifications').insert(notifs);
    } catch (notifErr) {
      console.error('Non-fatal error creating assignment notification:', notifErr.message);
    }

    clearProjectsCache(isSuperAdmin ? null : userBranchId);

    res.json({ 
      success: true, 
      assignment: data,
      message: 'Employee assigned successfully'
    });
  } catch (err) {
    console.error('❌ RM project assign error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/rm/projects/:id/assign/:employeeId
 */
router.delete('/:id/assign/:employeeId', async (req, res) => {
  const { id, employeeId } = req.params;
  const userBranchId = req.user.branch_id;
  const isSuperAdmin = req.user.is_super_admin;

  try {
    // ✅ Check if employee belongs to user's branch
    const { data: employee, error: empError } = await supabase
      .from('profiles')
      .select('branch_id, first_name, last_name')
      .eq('id', employeeId)
      .single();

    if (empError) throw empError;

    if (!isSuperAdmin && employee.branch_id !== userBranchId) {
      return res.status(403).json({
        success: false,
        error: 'You can only remove employees from your branch'
      });
    }

    // Get assignment details before deletion to check requirement and role
    const { data: assignmentData } = await supabase
      .from('project_assignments')
      .select('requirement_id, assigned_role')
      .eq('project_id', id)
      .eq('profile_id', employeeId)
      .maybeSingle();

    const requirementId = assignmentData?.requirement_id;
    const assignedRole = assignmentData?.assigned_role || 'team member';

    const { error } = await supabase
      .from('project_assignments')
      .delete()
      .eq('project_id', id)
      .eq('profile_id', employeeId);
    
    if (error) throw error;

    // Reset requirement status to 'Pending' if needed
    if (requirementId) {
      const { data: remaining } = await supabase
        .from('project_assignments')
        .select('id')
        .eq('requirement_id', requirementId)
        .eq('status', 'Assigned');

      const { data: reqData } = await supabase
        .from('project_resource_requirements')
        .select('quantity_needed')
        .eq('id', requirementId)
        .single();

      const needed = reqData?.quantity_needed || 1;
      const count = remaining?.length || 0;

      if (count < needed) {
        await supabase
          .from('project_resource_requirements')
          .update({ status: 'Pending' })
          .eq('id', requirementId);
      }
    }

    // Fetch project info for notifications
    const { data: project } = await supabase
      .from('projects')
      .select('project_name, created_by')
      .eq('id', id)
      .single();

    try {
      const projectName = project?.project_name || 'a project';
      const empName = `${employee.first_name || ''} ${employee.last_name || ''}`.trim();
      const notifs = [
        {
          recipient_id: employeeId,
          type: 'assignment',
          text: `You have been removed from project "${projectName}".`,
          read: false
        }
      ];
      if (project?.created_by && project.created_by !== req.user?.id) {
        notifs.push({
          recipient_id: project.created_by,
          type: 'assignment',
          text: `${empName || 'An employee'} has been removed from project "${projectName}" (${assignedRole}).`,
          read: false
        });
      }
      await supabase.from('notifications').insert(notifs);
    } catch (notifErr) {
      console.error('Non-fatal error creating unassign notification:', notifErr.message);
    }

    clearProjectsCache(isSuperAdmin ? null : userBranchId);

    res.json({ 
      success: true, 
      message: 'Employee removed from project successfully' 
    });
  } catch (err) {
    console.error('❌ RM project remove member error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/rm/projects/:id/history-details — comprehensive details for project history view
 */
router.get('/:id/history-details', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch Project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(`
        id,
        project_name,
        project_description,
        team_size,
        duration_days,
        start_date,
        end_date,
        priority,
        status,
        created_by,
        created_at,
        updated_at
      `)
      .eq('id', id)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // 2. Fetch Client Feedback
    const { data: feedbackRequests, error: feedbackError } = await supabase
      .from('feedback_requests')
      .select(`
        id,
        client_name,
        client_email,
        completed_at,
        status,
        feedback_responses (
          id,
          profile_id,
          rating,
          technical_skills_rating,
          communication_rating,
          timeliness_rating,
          quality_of_work_rating,
          teamwork_rating,
          problem_solving_rating,
          strengths,
          areas_for_improvement,
          would_recommend,
          project_feedback,
          deliverables_feedback,
          additional_comments
        )
      `)
      .eq('project_id', id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });

    let clientFeedback = null;
    const employeeFeedbackMap = {};

    if (!feedbackError && feedbackRequests && feedbackRequests.length > 0) {
      const latestReq = feedbackRequests[0];
      const responses = latestReq.feedback_responses || [];
      const primaryResponse = responses.find(r => r.project_feedback) || responses[0] || {};
      const extracted = extractProjectRatingAndFeedback(primaryResponse.project_feedback, responses);

      clientFeedback = {
        requestId: latestReq.id,
        clientName: latestReq.client_name,
        clientEmail: latestReq.client_email,
        completedAt: latestReq.completed_at,
        rating: extracted.rating,
        projectFeedback: extracted.feedback,
        deliverablesFeedback: primaryResponse.deliverables_feedback || null,
        additionalComments: primaryResponse.additional_comments || null,
      };

      for (const resp of responses) {
        employeeFeedbackMap[resp.profile_id] = {
          rating: resp.rating,
          strengths: resp.strengths,
          areasForImprovement: resp.areas_for_improvement,
          wouldRecommend: resp.would_recommend,
          technicalSkillsRating: resp.technical_skills_rating,
          communicationRating: resp.communication_rating,
          timelinessRating: resp.timeliness_rating,
          qualityOfWorkRating: resp.quality_of_work_rating,
          teamworkRating: resp.teamwork_rating,
          problemSolvingRating: resp.problem_solving_rating,
        };
      }
    }

    // 3. Fetch Project Assignments
    const { data: assignments, error: assignmentsError } = await supabase
      .from('project_assignments')
      .select('id, profile_id, assigned_role, start_date, end_date, status, assigned_at')
      .eq('project_id', id);

    if (assignmentsError) throw assignmentsError;

    // 4. Fetch Project Tasks
    const { data: rawTasks, error: tasksError } = await supabase
      .from('project_tasks')
      .select(`
        id,
        project_id,
        profile_id,
        title,
        description,
        priority,
        status,
        due_date,
        progress_logs,
        created_at
      `)
      .eq('project_id', id)
      .order('created_at', { ascending: true });

    if (tasksError) throw tasksError;

    // Collect all profile IDs
    const profileIdSet = new Set();
    (assignments || []).forEach(a => a.profile_id && profileIdSet.add(a.profile_id));
    (rawTasks || []).forEach(t => t.profile_id && profileIdSet.add(t.profile_id));
    if (project.created_by) profileIdSet.add(project.created_by);
    (feedbackRequests || []).forEach(fr => {
      (fr.employee_ids || []).forEach(eid => eid && profileIdSet.add(eid));
      (fr.feedback_responses || []).forEach(r => r.profile_id && profileIdSet.add(r.profile_id));
    });

    const profileIds = Array.from(profileIdSet);
    let profileMap = {};

    if (profileIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id,
          first_name,
          middle_name,
          last_name,
          employee_id,
          role,
          avatar_url,
          departments ( id, department_name ),
          positions ( id, position_name )
        `)
        .in('id', profileIds);

      if (!profilesError && profiles) {
        profiles.forEach(p => { profileMap[p.id] = p; });
      }
    }

    const tasks = (rawTasks || []).map(t => {
      const logs = Array.isArray(t.progress_logs) ? t.progress_logs : [];
      const totalProgress = logs.reduce((sum, log) => sum + (parseInt(log.percentage, 10) || 0), 0);
      const isCompleted = t.status === 'Completed' || totalProgress >= 100;
      const assignedEmp = t.profile_id ? profileMap[t.profile_id] : null;
      const assignedName = assignedEmp
        ? [assignedEmp.first_name, assignedEmp.last_name].filter(Boolean).join(' ').trim()
        : 'Unassigned';

      return {
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        dueDate: t.due_date,
        profileId: t.profile_id,
        assignedTo: assignedName,
        totalProgress: Math.min(100, totalProgress),
        isCompleted,
        progressLogs: logs,
      };
    });

    const assignmentMap = {};
    (assignments || []).forEach(a => {
      if (a.profile_id && !assignmentMap[a.profile_id]) {
        assignmentMap[a.profile_id] = a;
      }
    });

    const employeeIdsToDisplay = Array.from(profileIdSet).filter(pid => {
      return (
        assignmentMap[pid] ||
        tasks.some(t => t.profileId === pid) ||
        employeeFeedbackMap[pid]
      );
    });

    const employees = employeeIdsToDisplay.map(pid => {
      const p = profileMap[pid] || {};
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
        || [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ').trim()
        || (p.employee_id ? `Employee (${p.employee_id})` : 'Employee');
      const assignment = assignmentMap[pid];
      const empTasks = tasks.filter(t => t.profileId === pid);
      const completedTasks = empTasks.filter(t => t.isCompleted).length;
      const pendingTasks = empTasks.filter(t => !t.isCompleted).length;
      const totalTasks = empTasks.length;
      const fb = employeeFeedbackMap[pid] || null;

      let role = p.positions?.position_name;
      if (!role) {
        if (assignment?.assigned_role && assignment.assigned_role !== 'Employee' && assignment.assigned_role !== 'Team Member') {
          role = assignment.assigned_role;
        } else if (p.role && p.role !== 'Employee' && p.role !== 'Team Member') {
          role = p.role;
        } else {
          role = assignment?.assigned_role || p.role || 'Team Member';
        }
      } else if (assignment?.assigned_role && assignment.assigned_role !== 'Employee' && assignment.assigned_role !== 'Team Member') {
        role = assignment.assigned_role;
      }

      return {
        id: pid,
        name,
        employeeId: p.employee_id || '',
        role: role || 'Team Member',
        department: p.departments?.department_name || '',
        avatar: p.avatar_url || `https://ui-avatars.com/api/?background=3b82f6&color=fff&name=${encodeURIComponent(name)}`,
        assignedAt: assignment?.assigned_at || null,
        assignmentStatus: assignment?.status || 'Assigned',
        clientRating: fb?.rating || null,
        clientStrengths: fb?.strengths || null,
        clientImprovements: fb?.areasForImprovement || null,
        wouldRecommend: fb?.wouldRecommend ?? null,
        totalTasks,
        completedTasks,
        pendingTasks,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        tasks: empTasks,
      };
    });

    const totalTasksCount = tasks.length;
    const completedTasksCount = tasks.filter(t => t.isCompleted).length;
    const pendingTasksCount = totalTasksCount - completedTasksCount;
    const overallCompletionRate = totalTasksCount > 0
      ? Math.round((completedTasksCount / totalTasksCount) * 100)
      : 100;

    res.status(200).json({
      success: true,
      data: {
        project: {
          id: project.id,
          name: project.project_name,
          description: project.project_description,
          status: project.status,
          priority: project.priority,
          startDate: project.start_date,
          endDate: project.end_date,
          durationDays: project.duration_days,
          teamSize: project.team_size,
          createdAt: project.created_at,
          updatedAt: project.updated_at,
        },
        clientFeedback,
        summary: {
          totalTeamMembers: employees.length,
          totalTasks: totalTasksCount,
          completedTasks: completedTasksCount,
          pendingTasks: pendingTasksCount,
          completionPercentage: overallCompletionRate,
        },
        employees,
        tasks,
      },
    });
  } catch (error) {
    console.error('Error fetching project history details for RM:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project history details',
      error: error.message,
    });
  }
});

module.exports = router;
module.exports.clearProjectsCache = clearProjectsCache;