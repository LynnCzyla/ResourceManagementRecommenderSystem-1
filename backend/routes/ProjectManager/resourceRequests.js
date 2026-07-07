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

// requirement_skills stores the skill as plain text (column `skills`) —
// there is no skill_id foreign key on this table. We still upsert into the
// master `skills` table so the skill exists for autocomplete/reporting
// elsewhere, but the link to the requirement is just the text value.
async function attachSkillsToRequirement(requirementId, skillNames = []) {
  for (const rawName of skillNames) {
    const name = rawName.trim();
    if (!name) continue;
    await findOrCreateSkill(name);
    await supabase.from('requirement_skills').insert({
      requirement_id: requirementId,
      skills: name,
    });
  }
}

function transformRequest(row) {
  const skills = (row.requirement_skills || []).map(rs => rs.skills).filter(Boolean);

  let duration = null;
  if (row.start_date && row.end_date) {
    const diffDays = Math.ceil(
      Math.abs(new Date(row.end_date) - new Date(row.start_date)) / (1000 * 60 * 60 * 24)
    );
    duration = `${diffDays} days`;
  }

  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.projects?.project_name || 'Unknown Project',
    role: row.positions?.position_name || row.role_title || '',
    skills,
    timeline: row.assignment_type,
    duration,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    quantity: row.quantity_needed,
    justification: row.justification,
  };
}

const REQUEST_SELECT = `
  *,
  projects ( id, project_name ),
  positions ( id, position_name ),
  requirement_skills (
    id,
    skills
  )
`;

// ── Routes ──────────────────────────────────────────────────────────────

// GET /api/pm/resource-requests — list all (optional ?projectId= filter)
router.get('/resource-requests', async (req, res) => {
  try {
    const { projectId } = req.query;

    let query = supabase
      .from('project_resource_requirements')
      .select(REQUEST_SELECT)
      .order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json({ success: true, data: (data || []).map(transformRequest) });
  } catch (error) {
    console.error('Error fetching resource requests:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch resource requests', error: error.message });
  }
});

// POST /api/pm/resource-requests — create one or more resource requests for a project
router.post('/resource-requests', async (req, res) => {
  try {
    const { projectId, resources = [] } = req.body;

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Project is required' });
    }
    if (!resources.length) {
      return res.status(400).json({ success: false, message: 'At least one resource requirement is required' });
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
          start_date: resource.startDate || null,
          end_date: resource.endDate || null,
          status: 'Pending',
        })
        .select()
        .single();

      if (reqError) throw reqError;

      const skillNames = resource.skills
        ? resource.skills.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      await attachSkillsToRequirement(requirement.id, skillNames);

      createdIds.push(requirement.id);
    }

    const { data: fullRequests, error: fetchError } = await supabase
      .from('project_resource_requirements')
      .select(REQUEST_SELECT)
      .in('id', createdIds);

    if (fetchError) throw fetchError;

    await logAuditEvent({
      req,
      action: 'Assigned',
      systemCategory: 'Resource Management',
      logDescription: `Submitted resource request(s) for project ${projectId}`,
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

// PATCH /api/pm/resource-requests/:id/status — approve / reject a request
router.patch('/resource-requests/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['Pending', 'Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be 'Pending', 'Approved', or 'Rejected'" });
    }

    const { data, error } = await supabase
      .from('project_resource_requirements')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Resource request not found' });

    await logAuditEvent({
      req,
      action: 'Updated',
      systemCategory: 'Resource Management',
      logDescription: `Updated resource request ${id} status to ${status}`,
    });

    res.status(200).json({ success: true, message: 'Resource request status updated', data });
  } catch (error) {
    console.error('Error updating resource request status:', error);
    res.status(500).json({ success: false, message: 'Failed to update resource request status', error: error.message });
  }
});

// DELETE /api/pm/resource-requests/:id
router.delete('/resource-requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
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