const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

// ✅ Cache for projects data
const cache = {
  data: null,
  timestamp: 0,
  ttl: 60000 // 1 minute cache
};

/**
 * GET /api/rm/projects
 * Powers RMProjectsTab.jsx - OPTIMIZED VERSION
 */
router.get('/projects', async (req, res) => {
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

    // ✅ Fetch profiles for assigned employees (only if needed)
    let profileById = new Map();
    if (assignedProfileIds.length > 0) {
      const { data: assignedProfiles, error: profileErr } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', assignedProfileIds);
      
      if (!profileErr && assignedProfiles) {
        profileById = new Map(assignedProfiles.map((p) => [p.id, p]));
      }
    }

    // ✅ Build project requirements map for faster lookup
    const requirementsByProject = new Map();
    for (const req of requirements) {
      if (!requirementsByProject.has(req.project_id)) {
        requirementsByProject.set(req.project_id, []);
      }
      const skills = req.requirement_skills || [];
      requirementsByProject.get(req.project_id).push(...skills.map(s => s.skills).filter(Boolean));
    }

    // ✅ Build assignments map for faster lookup
    const assignmentsByProject = new Map();
    for (const assignment of assignments) {
      if (!assignmentsByProject.has(assignment.project_id)) {
        assignmentsByProject.set(assignment.project_id, []);
      }
      assignmentsByProject.get(assignment.project_id).push(assignment);
    }

    // ✅ Process projects in a single pass
    const result = [];
    for (const proj of projects) {
      // Get unique skills for this project
      const projectSkills = requirementsByProject.get(proj.id) || [];
      const requiredSkills = [...new Set(projectSkills)];

      // Get assigned employees for this project
      const projectAssignments = assignmentsByProject.get(proj.id) || [];
      const assignedEmployees = projectAssignments.map((a) => {
        const profile = profileById.get(a.profile_id);
        return {
          employeeId: a.profile_id,
          employeeName: profile 
            ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown'
            : 'Unknown',
          role: a.assigned_role,
          avatar: profile?.avatar_url,
        };
      });

      result.push({
        id: proj.id,
        code: proj.project_code,
        name: proj.project_name,
        description: proj.project_description,
        status: proj.status,
        startDate: proj.start_date,
        endDate: proj.end_date,
        priority: proj.priority,
        requiredSkills,
        assignedEmployees,
        // ✅ Add some useful stats
        teamSize: assignedEmployees.length,
        skillsCount: requiredSkills.length,
      });
    }

    const responseData = {
      success: true,
      projects: result,
      totalProjects: result.length,
      // ✅ Add summary stats
      summary: {
        active: result.filter(p => p.status === 'Active').length,
        completed: result.filter(p => p.status === 'Completed').length,
        onHold: result.filter(p => p.status === 'On Hold').length,
        totalTeamMembers: result.reduce((sum, p) => sum + p.teamSize, 0),
      }
    };

    // ✅ Store in cache
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
 * POST /api/rm/projects/:id/assign
 * Assign an employee to a project
 */
router.post('/projects/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { employeeId, role } = req.body;

  if (!employeeId) {
    return res.status(400).json({ success: false, error: 'employeeId is required' });
  }

  try {
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

    // ✅ Create assignment
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

    // ✅ Clear cache since data changed
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
 * Removes a team member from a project
 */
router.delete('/projects/:id/assign/:employeeId', async (req, res) => {
  const { id, employeeId } = req.params;

  try {
    const { error } = await supabase
      .from('project_assignments')
      .delete()
      .eq('project_id', id)
      .eq('profile_id', employeeId);
    
    if (error) throw error;

    // ✅ Clear cache since data changed
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

// ✅ Function to clear the cache
const clearProjectsCache = () => {
  cache.data = null;
  cache.timestamp = 0;
  console.log('🗑️ Projects cache cleared');
};

// ✅ Export both the router and the cache clearer
module.exports = router;
module.exports.clearProjectsCache = clearProjectsCache;