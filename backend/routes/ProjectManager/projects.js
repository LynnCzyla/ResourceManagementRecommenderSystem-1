// backend/routes/ProjectManager/projects.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');

// ── Helpers ─────────────────────────────────────────────────────────────

// Find an existing skill by name (case-insensitive), or create it.
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

// Try to match a free-typed role (e.g. "Frontend Developer") to an
// existing position. Returns null if there's no match — the caller
// falls back to storing the typed text in role_title.
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

// Transform a joined project row into the shape the PM tabs expect.
function transformProject(row) {
  const requirements = row.project_resource_requirements || [];
  const manpowerNeeded = requirements.reduce((sum, r) => sum + (r.quantity_needed || 0), 0);
  const allSkills = requirements.flatMap(r =>
    (r.requirement_skills || []).map(rs => rs.skills).filter(Boolean)
  );

  return {
    id: row.id,
    name: row.project_name,
    description: row.project_description,
    teamSize: row.team_size,
    duration: row.duration_days,
    startDate: row.start_date,
    endDate: row.end_date,
    priority: row.priority,
    status: row.status,
    createdBy: row.created_by,
    manpowerNeeded,
    requiredSkills: [...new Set(allSkills)],
    resources: requirements.map(r => ({
      id: r.id,
      role: r.positions?.position_name || r.role_title || '',
      quantity: r.quantity_needed,
      assignment: r.assignment_type,
      justification: r.justification,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
      skills: (r.requirement_skills || []).map(rs => rs.skills).filter(Boolean),
    })),
  };
}

const PROJECT_SELECT = `
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
  project_resource_requirements (
    id,
    quantity_needed,
    assignment_type,
    justification,
    role_title,
    start_date,
    end_date,
    status,
    positions ( id, position_name ),
    requirement_skills (
      id,
      skills
    )
  )
`;

// Simple in-memory cache for the list endpoint — avoids re-running the
// expensive nested join on every tab switch. 30s TTL keeps data fresh
// enough while killing repeat-fetch egress.
const projectsCache = new Map();
const CACHE_TTL_MS = 30 * 1000;

function getCached(key) {
  const entry = projectsCache.get(key);
  if (entry && Date.now() - entry.time < CACHE_TTL_MS) return entry.data;
  return null;
}
function setCached(key, data) {
  projectsCache.set(key, { data, time: Date.now() });
}
function invalidateProjectsCache() {
  projectsCache.clear();
}

// ── Routes ──────────────────────────────────────────────────────────────

// GET /api/pm/projects — list all projects (optional ?createdBy=<profileId>)
router.get('/projects', async (req, res) => {
  try {
    const { createdBy } = req.query;
    const cacheKey = `list:${createdBy || 'all'}`;

    const cached = getCached(cacheKey);
    if (cached) {
      return res.status(200).json({ success: true, data: cached, cached: true });
    }

    let query = supabase
      .from('projects')
      .select(PROJECT_SELECT)
      .order('created_at', { ascending: false });

    if (createdBy) query = query.eq('created_by', createdBy);

    const { data, error } = await query;
    if (error) throw error;

    const transformed = (data || []).map(transformProject);
    setCached(cacheKey, transformed);

    res.status(200).json({ success: true, data: transformed });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch projects', error: error.message });
  }
});

// GET /api/pm/projects/:id
router.get('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_SELECT)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Project not found' });

    res.status(200).json({ success: true, data: transformProject(data) });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch project', error: error.message });
  }
});

// POST /api/pm/projects — create a project, its resource requirements, and their skills
router.post('/projects', async (req, res) => {
  try {
    const {
      name,
      description,
      teamSize,
      duration,
      startDate,
      endDate,
      priority = 'Medium',
      resources = [],
      createdBy, // profile id of the PM creating this project
    } = req.body;

    if (!name || !description) {
      return res.status(400).json({ success: false, message: 'Project name and description are required' });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Start date and end date are required' });
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        project_name: name,
        project_description: description,
        team_size: teamSize ? parseInt(teamSize, 10) : null,
        duration_days: duration ? parseInt(duration, 10) : null,
        start_date: startDate,
        end_date: endDate,
        priority,
        status: 'Pending Approval',
        created_by: createdBy || null,
      })
      .select()
      .single();

    if (projectError) throw projectError;

    for (const resource of resources) {
      const positionId = await findPositionIdByName(resource.role);

      const { data: requirement, error: reqError } = await supabase
        .from('project_resource_requirements')
        .insert({
          project_id: project.id,
          position_id: positionId,
          role_title: positionId ? null : (resource.role || null),
          quantity_needed: parseInt(resource.quantity, 10) || 1,
          assignment_type: resource.assignment || 'Full-time',
          justification: resource.justification || null,
          start_date: resource.startDate || null,
          end_date: resource.endDate || null,
        })
        .select()
        .single();

      if (reqError) throw reqError;

      const skillNames = resource.skills
        ? resource.skills.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      await attachSkillsToRequirement(requirement.id, skillNames);
    }

    const { data: fullProject, error: fetchError } = await supabase
      .from('projects')
      .select(PROJECT_SELECT)
      .eq('id', project.id)
      .single();

    if (fetchError) throw fetchError;

    await logAuditEvent({
      req,
      userId: createdBy || null,
      action: 'Created',
      systemCategory: 'Resource Management',
      logDescription: `Created project ${name}`,
    });

    invalidateProjectsCache();

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: transformProject(fullProject),
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ success: false, message: 'Failed to create project', error: error.message });
  }
});

// PUT /api/pm/projects/:id — update project details
router.put('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, startDate, endDate, priority, status, teamSize, duration } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.project_name = name;
    if (description !== undefined) updateData.project_description = description;
    if (startDate !== undefined) updateData.start_date = startDate;
    if (endDate !== undefined) updateData.end_date = endDate;
    if (priority !== undefined) updateData.priority = priority;
    if (status !== undefined) updateData.status = status;
    if (teamSize !== undefined) updateData.team_size = parseInt(teamSize, 10) || null;
    if (duration !== undefined) updateData.duration_days = parseInt(duration, 10) || null;

    const { data, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Project not found' });

    await logAuditEvent({
      req,
      action: 'Updated',
      systemCategory: 'Resource Management',
      logDescription: `Updated project ${id}`,
    });

    invalidateProjectsCache();
    res.status(200).json({ success: true, message: 'Project updated successfully', data });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ success: false, message: 'Failed to update project', error: error.message });
  }
});

// PATCH /api/pm/projects/:id/status — quick status change (e.g. approve -> Active)
router.patch('/projects/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const { data, error } = await supabase
      .from('projects')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logAuditEvent({
      req,
      action: 'Updated',
      systemCategory: 'Resource Management',
      logDescription: `Updated project ${id} status to ${status}`,
    });

    invalidateProjectsCache();
    res.status(200).json({ success: true, message: 'Project status updated', data });
  } catch (error) {
    console.error('Error updating project status:', error);
    res.status(500).json({ success: false, message: 'Failed to update project status', error: error.message });
  }
});

// DELETE /api/pm/projects/:id
router.delete('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;

    await logAuditEvent({
      req,
      action: 'Deleted',
      systemCategory: 'Resource Management',
      logDescription: `Deleted project ${id}`,
    });
    invalidateProjectsCache();
    res.status(200).json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ success: false, message: 'Failed to delete project', error: error.message });
  }
});

module.exports = router;