// backend/routes/ProjectManager/resourceRequests.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');

// ── Helpers ─────────────────────────────────────────────────────────────

async function findOrCreateSkill(skillName) {
  const name = skillName.trim();
  if (!name) return null;

  const { data: existing } = await supabase
    .from('skills')
    .select('id')
    .ilike('skill_name', name)
    .limit(1);

  if (existing && existing.length > 0) return existing[0].id;

  const { data: created, error } = await supabase
    .from('skills')
    .insert({ skill_name: name })
    .select()
    .single();

  if (error) throw error;
  return created.id;
}

async function findPositionIdByName(roleName) {
  if (!roleName) return null;
  const { data } = await supabase
    .from('positions')
    .select('id')
    .ilike('position_name', roleName.trim())
    .limit(1);
  return data && data.length > 0 ? data[0].id : null;
}

// ✅ skillType is 'Primary' or 'Secondary'
async function attachSkillsToRequirement(requirementId, skillNames = [], skillType = 'Primary') {
  for (const rawName of skillNames) {
    const name = rawName.trim();
    if (!name) continue;
    await findOrCreateSkill(name);
    await supabase.from('requirement_skills').insert({
      requirement_id: requirementId,
      skills: name,
      skill_type: skillType,
    });
  }
}

function transformRequest(row) {
  const allSkillRows = row.requirement_skills || [];
  const primarySkills = allSkillRows
    .filter(rs => (rs.skill_type || 'Primary') === 'Primary')
    .map(rs => rs.skills)
    .filter(Boolean);
  const secondarySkills = allSkillRows
    .filter(rs => rs.skill_type === 'Secondary')
    .map(rs => rs.skills)
    .filter(Boolean);

  const effectiveStartDate = row.start_date || row.projects?.start_date || null;
  const effectiveEndDate = row.end_date || row.projects?.end_date || null;

  let duration = null;
  if (effectiveStartDate && effectiveEndDate) {
    const s = new Date(effectiveStartDate);
    const e = new Date(effectiveEndDate);
    if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && e >= s) {
      const diffDays = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
      const weeks = Math.round(diffDays / 7);
      if (diffDays >= 7 && diffDays <= 55) {
        duration = `${weeks} ${weeks === 1 ? 'Week' : 'Weeks'}`;
      } else if (diffDays > 55) {
        const months = (diffDays / 30.4375).toFixed(1);
        duration = months.endsWith('.0')
          ? `${parseInt(months, 10)} Months`
          : `~${months} Months`;
      } else {
        duration = `${diffDays} ${diffDays === 1 ? 'day' : 'days'}`;
      }
    }
  }

  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.projects?.project_name || 'Unknown Project',
    role: row.positions?.position_name || row.role_title || '',
    // ✅ kept for backward compatibility with any code still reading `skills`
    skills: [...primarySkills, ...secondarySkills],
    primarySkills,
    secondarySkills,
    timeline: row.assignment_type,
    duration: duration || (row.duration ? `${row.duration} days` : null),
    startDate: effectiveStartDate,
    endDate: effectiveEndDate,
    status: row.status,
    quantity: row.quantity_needed,
    justification: row.justification,
    createdBy: row.created_by,
    requestedBy: row.created_by, // Alias for clarity
    projectOwner: row.projects?.created_by,
  };
}

const REQUEST_SELECT = `
  *,
  projects ( id, project_name, start_date, end_date, created_by ),
  positions ( id, position_name ),
  requirement_skills (
    id,
    skills,
    skill_type
  )
`;

// ── Routes ──────────────────────────────────────────────────────────────

// ✅ GET /api/pm/resource-requests — WITH PROPER PM FILTERING
router.get('/', async (req, res) => {
  try {
    const { projectId } = req.query;
    const userId = req.user?.id;
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userRole = req.user?.role;

    console.log(`📋 Fetching resource requests for user: ${userId}`);
    console.log(`🏢 Branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);
    console.log(`👤 Role: ${userRole}`);

    let query = supabase
      .from('project_resource_requirements')
      .select(REQUEST_SELECT)
      .order('created_at', { ascending: false });

    // ✅ If projectId is provided, filter by it
    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    // ✅ For Project Managers: Only show requests from their projects
    if (!isSuperAdmin && userRole === 'Project Manager') {
      // Get projects created by this PM
      const { data: myProjects } = await supabase
        .from('projects')
        .select('id')
        .eq('created_by', userId);

      const projectIds = myProjects?.map(p => p.id) || [];

      if (projectIds.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }

      // ✅ Filter by projects owned by this PM
      query = query.in('project_id', projectIds);

      console.log(`🔍 Filtering by ${projectIds.length} projects owned by PM`);
    }

    // ✅ For Resource Managers: Filter by branch
    if (!isSuperAdmin && userRole === 'Resource Manager') {
      // Get all users in this branch
      const { data: branchUsers } = await supabase
        .from('profiles')
        .select('id')
        .eq('branch_id', userBranchId)
        .eq('status', 'Active');

      const userIds = branchUsers?.map(u => u.id) || [];

      if (userIds.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }

      // Get projects created by users in this branch
      const { data: branchProjects } = await supabase
        .from('projects')
        .select('id')
        .in('created_by', userIds);

      const projectIds = branchProjects?.map(p => p.id) || [];

      if (projectIds.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }

      // ✅ Filter by projects in this branch
      query = query.in('project_id', projectIds);

      console.log(`🔍 Filtering by ${projectIds.length} projects in branch`);
    }

    const { data, error } = await query;
    if (error) throw error;

    console.log(`✅ Found ${data?.length || 0} resource requests`);

    res.status(200).json({ success: true, data: (data || []).map(transformRequest) });
  } catch (error) {
    console.error('Error fetching resource requests:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch resource requests', error: error.message });
  }
});

// ✅ POST /api/pm/resource-requests — PM creates request for their project
router.post('/', async (req, res) => {
  try {
    const { projectId, resources = [] } = req.body;
    const userId = req.user?.id;
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userRole = req.user?.role;

    console.log(`📋 Creating resource request for project: ${projectId}`);
    console.log(`👤 User: ${userId}`);
    console.log(`🏢 Branch: ${userBranchId}`);
    console.log(`👤 Role: ${userRole}`);

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Project is required' });
    }
    if (!resources.length) {
      return res.status(400).json({ success: false, message: 'At least one resource requirement is required' });
    }

    // ✅ Verify the project exists and user has access
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, created_by, project_name, start_date, end_date')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // ✅ Check if user has access to this project
    // - PM must own the project (created_by = userId)
    // - Super Admin can create for any project
    // - RM cannot create (should use HR route)
    if (userRole === 'Project Manager') {
      if (project.created_by !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only create resource requests for your own projects'
        });
      }
    } else if (userRole === 'Resource Manager') {
      return res.status(403).json({
        success: false,
        message: 'Resource Managers should use the HR resource request route'
      });
    } else if (!isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create resource requests'
      });
    }

    // ✅ Check if user belongs to a branch
    if (!isSuperAdmin && !userBranchId) {
      return res.status(403).json({
        success: false,
        message: 'Your account is not assigned to a branch'
      });
    }

    // ✅ Validate every resource has at least one primary skill
    for (const resource of resources) {
      const hasPrimary = resource.primarySkills && resource.primarySkills.trim().length > 0;
      if (!hasPrimary) {
        return res.status(400).json({
          success: false,
          message: 'Each resource requirement must include at least one primary skill'
        });
      }
    }

    const createdIds = [];

    for (const resource of resources) {
      const positionId = await findPositionIdByName(resource.role);

      const { data: requirement, error: reqError } = await supabase
        .from('project_resource_requirements')
        .insert({
          project_id: projectId,
          position_id: positionId,
          role_title: positionId ? null : (resource.role || null),
          quantity_needed: parseInt(resource.quantity, 10) || 1,
          assignment_type: resource.assignment || 'Full-Time (40 hours/week)',
          justification: resource.justification || null,
          start_date: resource.startDate || project.start_date || null,
          end_date: resource.endDate || project.end_date || null,
          status: 'Pending',
        })
        .select()
        .single();

      if (reqError) throw reqError;

      const primarySkillNames = resource.primarySkills
        ? resource.primarySkills.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const secondarySkillNames = resource.secondarySkills
        ? resource.secondarySkills.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      await attachSkillsToRequirement(requirement.id, primarySkillNames, 'Primary');
      await attachSkillsToRequirement(requirement.id, secondarySkillNames, 'Secondary');

      createdIds.push(requirement.id);
    }

    const { data: fullRequests, error: fetchError } = await supabase
      .from('project_resource_requirements')
      .select(REQUEST_SELECT)
      .in('id', createdIds);

    if (fetchError) throw fetchError;

    await logAuditEvent({
      req,
      action: 'Created',
      systemCategory: 'Resource Management',
      logDescription: `PM ${userId} submitted resource request(s) for project ${projectId}`,
    });

    res.status(201).json({
      success: true,
      message: 'Resource request(s) submitted successfully',
      data: fullRequests.map(transformRequest),
    });
  } catch (error) {
    console.error('Error creating resource request:', error);
    res.status(500).json({ success: false, message: 'Failed to create resource request', error: error.message });
  }
});

// ✅ PATCH /api/pm/resource-requests/:id/status — only project owner or super admin
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user?.id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userRole = req.user?.role;

    console.log(`📋 Updating resource request ${id} to ${status}`);
    console.log(`👤 User: ${userId}, Role: ${userRole}`);

    const validStatuses = ['Pending', 'Approved', 'Rejected', 'Cancelled', 'Canceled', 'Completed', 'Done', 'Open', 'Filled', 'Fulfilled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    // ✅ Check if user has permission to update this request
    const { data: existing, error: findError } = await supabase
      .from('project_resource_requirements')
      .select(`
        id,
        project_id,
        status,
        projects (
          id,
          created_by
        )
      `)
      .eq('id', id)
      .single();

    if (findError || !existing) {
      console.error('Error finding resource request:', findError);
      return res.status(404).json({ success: false, message: 'Resource request not found' });
    }

    // ✅ Check permissions
    const projectOwnerId = existing.projects?.created_by;
    const isProjectOwner = projectOwnerId === userId;

    let hasPermission = isSuperAdmin || !userId || isProjectOwner;

    if (userRole === 'Project Manager') {
      hasPermission = isProjectOwner || !userId;
    } else if (userRole === 'Resource Manager') {
      const { data: projectOwner } = await supabase
        .from('profiles')
        .select('branch_id')
        .eq('id', projectOwnerId)
        .single();

      const userBranchId = req.user?.branch_id;
      hasPermission = projectOwner?.branch_id === userBranchId;
    }

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this request'
      });
    }

    const { data, error } = await supabase
      .from('project_resource_requirements')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Resource request not found' });

    const auditAction = (status === 'Cancelled' || status === 'Canceled') ? 'Cancelled' : 'Updated';
    await logAuditEvent({
      req,
      action: auditAction,
      systemCategory: 'Resource Management',
      logDescription: `${auditAction} resource request ${id} (status: ${status})`,
    });

    try {
      const { clearDashboardCache } = require('../ResourceManager/Dashboard');
      if (typeof clearDashboardCache === 'function') clearDashboardCache();
    } catch (e) {}

    res.status(200).json({ success: true, message: 'Resource request status updated', data });
  } catch (error) {
    console.error('Error updating resource request status:', error);
    res.status(500).json({ success: false, message: 'Failed to update resource request status', error: error.message });
  }
});

// ✅ DELETE /api/pm/resource-requests/:id — only project owner or requester
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const isSuperAdmin = req.user?.is_super_admin || false;

    console.log(`📋 Deleting resource request ${id}`);

    // ✅ Check if user has permission to delete this request
    const { data: existing, error: findError } = await supabase
      .from('project_resource_requirements')
      .select(`
        id,
        project_id,
        projects (
          id,
          created_by
        )
      `)
      .eq('id', id)
      .single();

    if (findError || !existing) {
      return res.status(404).json({ success: false, message: 'Resource request not found' });
    }

    const isProjectOwner = existing.projects?.created_by === userId;

    if (!isSuperAdmin && userId && !isProjectOwner) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this request'
      });
    }

    const { error } = await supabase.from('project_resource_requirements').delete().eq('id', id);
    if (error) throw error;

    await logAuditEvent({
      req,
      action: 'Deleted',
      systemCategory: 'Resource Management',
      logDescription: `Deleted resource request ${id}`,
    });
    res.status(200).json({ success: true, message: 'Resource request deleted successfully' });
  } catch (error) {
    console.error('Error deleting resource request:', error);
    res.status(500).json({ success: false, message: 'Failed to delete resource request', error: error.message });
  }
});

module.exports = router;