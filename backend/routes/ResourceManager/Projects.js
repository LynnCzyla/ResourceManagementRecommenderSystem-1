const express = require('express');
const router = express.Router();
const { verifyToken } = require('../Middleware/auth');
const supabase = require('../../supabase');

router.use(verifyToken);

/**
 * GET /api/rm/projects
 * Powers RMProjectsTab.jsx
 */
router.get('/projects', async (req, res) => {
  try {
    const { data: projects, error: projErr } = await supabase
      .from('projects')
      .select('id, project_code, project_name, project_description, status, start_date, end_date, priority');
    if (projErr) throw projErr;

    const { data: requirements, error: reqErr } = await supabase
      .from('project_resource_requirements')
      .select('id, project_id, requirement_skills ( skills )');
    if (reqErr) throw reqErr;

    const { data: assignments, error: asgErr } = await supabase
      .from('project_assignments')
      .select(`
        project_id,
        profile_id,
        assigned_role,
        status
      `)
      .eq('status', 'Assigned');
    if (asgErr) throw asgErr;

    const assignedProfileIds = [...new Set((assignments || []).map((assignment) => assignment.profile_id).filter(Boolean))];
    const { data: assignedProfiles, error: profileErr } = assignedProfileIds.length
      ? await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', assignedProfileIds)
      : { data: [], error: null };
    if (profileErr) throw profileErr;

    const profileById = new Map((assignedProfiles || []).map((profile) => [profile.id, profile]));

    const result = (projects || []).map((proj) => {
      const requiredSkills = [
        ...new Set(
          (requirements || [])
            .filter((r) => r.project_id === proj.id)
            .flatMap((r) => (r.requirement_skills || []).map((rs) => rs.skills))
            .filter(Boolean)
        ),
      ];

      const assignedEmployees = (assignments || [])
        .filter((a) => a.project_id === proj.id)
        .map((a) => ({
          employeeId: a.profile_id,
          employeeName: profileById.has(a.profile_id)
            ? `${profileById.get(a.profile_id).first_name || ''} ${profileById.get(a.profile_id).last_name || ''}`.trim() || 'Unknown'
            : 'Unknown',
          role: a.assigned_role,
          avatar: profileById.get(a.profile_id)?.avatar_url,
        }));

      return {
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
      };
    });

    res.json({ success: true, projects: result });
  } catch (err) {
    console.error('RM projects list error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/rm/projects/:id/assign
 * body: { employeeId, role }
 */
router.post('/projects/:id/assign', async (req, res) => {
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
      return res.status(409).json({ success: false, error: 'Employee is already assigned to this project' });
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

    res.json({ success: true, assignment: data });
  } catch (err) {
    console.error('RM project assign error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/rm/projects/:id/assign/:employeeId
 * Removes a team member from a project.
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

    res.json({ success: true });
  } catch (err) {
    console.error('RM project remove member error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;