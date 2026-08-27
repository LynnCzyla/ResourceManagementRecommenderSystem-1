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
        .eq('status', 'Assigned')
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

    // ✅ Process projects
    const result = [];
    const toActivate = [];
    for (const proj of projects) {
      const projectSkills = requirementsByProject.get(proj.id) || [];
      const requiredSkills = [...new Set(projectSkills)];

      const projectAssignments = assignmentsByProject.get(proj.id) || [];
      const assignedEmployees = projectAssignments.map((a) => {
        const profile = profileById.get(a.profile_id);
        return {
          employeeId: a.profile_id,
          employeeName: profile 
            ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown'
            : 'Unknown',
          role: a.assigned_role,
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

      result.push({
        id: proj.id,
        code: proj.project_code,
        name: proj.project_name,
        description: proj.project_description,
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
      .select('branch_id, role')
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
      .select('status')
      .eq('id', id)
      .single();

    if (projectRow && NOT_STARTED_STATUSES.includes(projectRow.status)) {
      await supabase
        .from('projects')
        .update({ status: 'Active', updated_at: new Date().toISOString() })
        .eq('id', id);
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
      .select('branch_id')
      .eq('id', employeeId)
      .single();

    if (empError) throw empError;

    if (!isSuperAdmin && employee.branch_id !== userBranchId) {
      return res.status(403).json({
        success: false,
        error: 'You can only remove employees from your branch'
      });
    }

    const { error } = await supabase
      .from('project_assignments')
      .delete()
      .eq('project_id', id)
      .eq('profile_id', employeeId);
    
    if (error) throw error;

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

module.exports = router;
module.exports.clearProjectsCache = clearProjectsCache;