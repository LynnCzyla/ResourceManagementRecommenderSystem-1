const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

// ✅ Cache for projects data
const cache = {
  data: null,
  timestamp: 0,
  ttl: 60000 // 1 minute cache
};

// Statuses that mean "not started yet"
const NOT_STARTED_STATUSES = ['Pending', 'Pending Approval', 'Inactive'];

/**
 * GET /api/rm/projects
 * Powers RMProjectsTab.jsx - OPTIMIZED VERSION
 */
// ✅ CHANGE: Remove '/projects' from path - use '/'
router.get('/', async (req, res) => {
  try {
    // ✅ Check cache first
    const now = Date.now();
    if (cache.data && (now - cache.timestamp) < cache.ttl) {
      console.log('📁 Returning CACHED projects data');
      return res.json(cache.data);
    }

    console.log('📁 Fetching FRESH projects data...');
    const startTime = Date.now();

    // ✅ Run all queries in PARALLEL
    const [projectsResult, requirementsResult, assignmentsResult] = await Promise.all([
      supabase
        .from('projects')
        .select('id, project_code, project_name, project_description, status, start_date, end_date, priority'),
      
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

    // ✅ Process projects in a single pass
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
      }
    };

    cache.data = responseData;
    cache.timestamp = Date.now();

    const endTime = Date.now();
    console.log(`✅ Projects processed in ${endTime - startTime}ms`);

    res.json(responseData);

  } catch (err) {
    console.error('❌ RM projects list error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/rm/projects/:id (NEW - For project detail with avatars)
 */
// ✅ CHANGE: Remove '/projects' from path - use '/:id'
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

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
        project_assignments (
          profile_id,
          assigned_role,
          status,
          profiles (
            id,
            first_name,
            last_name,
            avatar_url
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    res.json({
      success: true,
      project: {
        ...project,
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
// ✅ CHANGE: Remove '/projects' from path - use '/:id/assign'
router.post('/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { employeeId, role } = req.body;

  if (!employeeId) {
    return res.status(400).json({ success: false, error: 'employeeId is required' });
  }

  try {
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

    clearProjectsCache();

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
// ✅ CHANGE: Remove '/projects' from path - use '/:id/assign/:employeeId'
router.delete('/:id/assign/:employeeId', async (req, res) => {
  const { id, employeeId } = req.params;

  try {
    const { error } = await supabase
      .from('project_assignments')
      .delete()
      .eq('project_id', id)
      .eq('profile_id', employeeId);
    
    if (error) throw error;

    clearProjectsCache();

    res.json({ 
      success: true,
      message: 'Employee removed from project successfully'
    });
  } catch (err) {
    console.error('❌ RM project remove member error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const clearProjectsCache = () => {
  cache.data = null;
  cache.timestamp = 0;
  console.log('🗑️ Projects cache cleared');
};

module.exports = router;
module.exports.clearProjectsCache = clearProjectsCache;