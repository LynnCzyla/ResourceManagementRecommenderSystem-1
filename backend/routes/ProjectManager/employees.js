// backend/routes/ProjectManager/employees.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

// Transform a profiles row (joined with positions/departments) into the
// shape the PM tabs expect (PMDashboardTab, PMProjectTrackingTab).
function transformEmployee(row) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unnamed';
  return {
    id: row.id,
    employeeId: row.employee_id,
    name,
    role: row.positions?.position_name || 'Unassigned',
    department: row.departments?.department_name || '',
    avatar: row.avatar_url || `https://ui-avatars.com/api/?background=3b82f6&color=fff&name=${encodeURIComponent(name)}`,
    availability: row.availability_status,
    totalAvailableHours: row.total_available_hours,
  };
}

const EMPLOYEE_SELECT = `
  id,
  employee_id,
  first_name,
  last_name,
  avatar_url,
  availability_status,
  total_available_hours,
  status,
  positions ( position_name ),
  departments ( department_name )
`;

// GET /api/pm/employees — list active employees.
// Optional ?departmentId= narrows by department.
// Optional ?pmId=<profileId> scopes the list to ONLY the employees who are
// actually assigned (via project_assignments) to a project that this PM
// created — a PM should not see the entire company roster, just their
// own team members.
// Optional ?projectId=<projectId> narrows further (or on its own) to only
// the employees assigned to that ONE project — e.g. so a "Assign Task"
// dropdown for Project A doesn't list employees who are only staffed on
// Project B.
router.get('/employees', async (req, res) => {
  try {
    const { departmentId, pmId, projectId } = req.query;

    let allowedProfileIds = null;

    if (projectId) {
      // Scoped to a single project — optionally still verify that project
      // belongs to this PM if pmId was also supplied.
      if (pmId) {
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('id')
          .eq('id', projectId)
          .eq('created_by', pmId)
          .maybeSingle();
        if (projectError) throw projectError;
        if (!project) {
          return res.status(200).json({ success: true, data: [] });
        }
      }

      const { data: assignments, error: assignmentsError } = await supabase
        .from('project_assignments')
        .select('profile_id')
        .eq('project_id', projectId);
      if (assignmentsError) throw assignmentsError;

      allowedProfileIds = [...new Set((assignments || []).map(a => a.profile_id))];
      if (allowedProfileIds.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }
    } else if (pmId) {
      const { data: pmProjects, error: projectsError } = await supabase
        .from('projects')
        .select('id')
        .eq('created_by', pmId);
      if (projectsError) throw projectsError;

      const projectIds = (pmProjects || []).map(p => p.id);
      if (projectIds.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }

      const { data: assignments, error: assignmentsError } = await supabase
        .from('project_assignments')
        .select('profile_id')
        .in('project_id', projectIds);
      if (assignmentsError) throw assignmentsError;

      allowedProfileIds = [...new Set((assignments || []).map(a => a.profile_id))];
      if (allowedProfileIds.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }
    }

    let query = supabase
      .from('profiles')
      .select(EMPLOYEE_SELECT)
      .eq('status', 'Active')
      .order('first_name', { ascending: true });

    if (departmentId) query = query.eq('department_id', departmentId);
    if (allowedProfileIds) query = query.in('id', allowedProfileIds);

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json({ success: true, data: (data || []).map(transformEmployee) });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch employees', error: error.message });
  }
});

module.exports = router;