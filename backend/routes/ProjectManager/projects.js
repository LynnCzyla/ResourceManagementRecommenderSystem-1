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

// requirement_skills stores the skill as plain text (column `skills`) plus
// a `skill_type` ('Primary' | 'Secondary'). We still upsert into the master
// `skills` table so the skill exists for autocomplete/reporting elsewhere,
// but the link to the requirement is the text value + type.
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

// Extract project rating and comment from formatted project_feedback string
// e.g., "[Rating: 4.5/5] Great collaboration..." or fallback to average of responses
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

// Transform a joined project row into the shape the PM tabs expect.
function transformProject(row, clientFeedback = null) {
  const requirements = row.project_resource_requirements || [];

  const manpowerNeeded = requirements.reduce((sum, r) => sum + (r.quantity_needed || 0), 0);

  const allPrimarySkills = requirements.flatMap(r =>
    (r.requirement_skills || [])
      .filter(rs => (rs.skill_type || 'Primary') === 'Primary')
      .map(rs => rs.skills)
      .filter(Boolean)
  );
  const allSecondarySkills = requirements.flatMap(r =>
    (r.requirement_skills || [])
      .filter(rs => rs.skill_type === 'Secondary')
      .map(rs => rs.skills)
      .filter(Boolean)
  );

  const rawDesc = row.project_description || '';
  const isRestored = rawDesc.includes('<!-- RESTORED -->') || rawDesc.includes('[RESTORED]');
  const cleanDescription = rawDesc.replace(/<!-- RESTORED -->/g, '').replace(/\[RESTORED\]/g, '').trim();

  return {
    id: row.id,
    name: row.project_name,
    description: cleanDescription,
    rawDescription: rawDesc,
    isRestored,
    teamSize: row.team_size,
    duration: row.duration_days,
    startDate: row.start_date,
    endDate: row.end_date,
    priority: row.priority,
    status: row.status,
    createdBy: row.created_by,
    manpowerNeeded,
    clientFeedback: clientFeedback || null,
    // ✅ kept for backward compatibility with any code still reading `requiredSkills`
    requiredSkills: [...new Set([...allPrimarySkills, ...allSecondarySkills])],
    requiredPrimarySkills: [...new Set(allPrimarySkills)],
    requiredSecondarySkills: [...new Set(allSecondarySkills)],
    resources: requirements.map(r => {
      const skillRows = r.requirement_skills || [];
      const primarySkills = skillRows
        .filter(rs => (rs.skill_type || 'Primary') === 'Primary')
        .map(rs => rs.skills)
        .filter(Boolean);
      const secondarySkills = skillRows
        .filter(rs => rs.skill_type === 'Secondary')
        .map(rs => rs.skills)
        .filter(Boolean);
      return {
        id: r.id,
        role: r.positions?.position_name || r.role_title || '',
        quantity: r.quantity_needed,
        assignment: r.assignment_type,
        justification: r.justification,
        startDate: r.start_date,
        endDate: r.end_date,
        status: r.status,
        skills: [...primarySkills, ...secondarySkills],
        primarySkills,
        secondarySkills,
      };
    }),
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
      skills,
      skill_type
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
  try {
    const { clearDashboardCache } = require('../ResourceManager/Dashboard');
    if (typeof clearDashboardCache === 'function') clearDashboardCache();
  } catch (e) {}
  try {
    const { clearProjectsCache } = require('../ResourceManager/Projects');
    if (typeof clearProjectsCache === 'function') clearProjectsCache();
  } catch (e) {}
}

// ── Routes ──────────────────────────────────────────────────────────────

// ✅ GET /api/pm/projects — list all projects (optional ?createdBy=<profileId>)
router.get('/', async (req, res) => {
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

    const projectIds = (data || []).map(p => p.id);
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
        console.error('Non-fatal error fetching feedback for projects:', fbErr);
      }
    }

    const transformed = (data || []).map(row => transformProject(row, feedbackMap[row.id] || null));
    setCached(cacheKey, transformed);

    res.status(200).json({ success: true, data: transformed });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch projects', error: error.message });
  }
});

// ✅ GET /api/pm/projects/:id/history-details — comprehensive details for project history view
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

    // Collect all profile IDs across assignments, tasks, project creator, and client feedback evaluations
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
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id,
          employee_id,
          first_name,
          middle_name,
          last_name,
          role,
          avatar_url,
          positions ( id, position_name ),
          departments ( id, department_name )
        `)
        .in('id', profileIds);

      if (!profilesError && profilesData) {
        for (const p of profilesData) {
          profileMap[p.id] = p;
        }
      }
    }

    // Format tasks
    const tasks = (rawTasks || []).map(task => {
      const isCompleted = task.status === 'Completed' || task.status === 'Completed-Hidden';
      const prof = profileMap[task.profile_id] || {};
      const empName = [prof.first_name, prof.last_name].filter(Boolean).join(' ').trim()
        || [prof.first_name, prof.middle_name, prof.last_name].filter(Boolean).join(' ').trim()
        || (prof.employee_id ? `Employee (${prof.employee_id})` : 'Unassigned');

      return {
        id: task.id,
        projectId: task.project_id,
        profileId: task.profile_id,
        employeeName: empName,
        employeeRole: prof.positions?.position_name || prof.role || '',
        employeeAvatar: prof.avatar_url || null,
        title: task.title,
        description: task.description,
        priority: task.priority,
        rawStatus: task.status,
        status: isCompleted ? 'Completed' : 'Pending',
        isCompleted,
        dueDate: task.due_date,
        progressLogs: task.progress_logs || [],
        createdAt: task.created_at,
      };
    });

    const assignmentMap = {};
    (assignments || []).forEach(a => {
      assignmentMap[a.profile_id] = a;
    });

    // Compile employee list (anyone assigned, who has tasks, or was evaluated in client feedback)
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

      // Resolve role: Prefer formal position name, avoid generic 'Employee' or 'Team Member'
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
    console.error('Error fetching project history details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project history details',
      error: error.message,
    });
  }
});

// ✅ GET /api/pm/projects/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_SELECT)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Project not found' });

    // Try to get latest feedback if completed
    let clientFeedback = null;
    try {
      const { data: fbData } = await supabase
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
        .eq('project_id', id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1);

      if (fbData && fbData.length > 0) {
        const reqRow = fbData[0];
        const responses = reqRow.feedback_responses || [];
        const primaryResponse = responses.find(r => r.project_feedback) || responses[0] || {};
        const extracted = extractProjectRatingAndFeedback(
          primaryResponse.project_feedback,
          responses
        );
        clientFeedback = {
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
    } catch (fbErr) {
      console.error('Non-fatal error fetching feedback for project:', fbErr);
    }

    res.status(200).json({ success: true, data: transformProject(data, clientFeedback) });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch project', error: error.message });
  }
});

// ✅ POST /api/pm/projects — create a project, its resource requirements, and their skills
router.post('/', async (req, res) => {
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

      const primarySkillNames = resource.primarySkills
        ? resource.primarySkills.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const secondarySkillNames = resource.secondarySkills
        ? resource.secondarySkills.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      await attachSkillsToRequirement(requirement.id, primarySkillNames, 'Primary');
      await attachSkillsToRequirement(requirement.id, secondarySkillNames, 'Secondary');
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

// ✅ PUT /api/pm/projects/:id — update project details
router.put('/:id', async (req, res) => {
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

    if (status === 'Completed') {
      await supabase
        .from('project_resource_requirements')
        .update({ status: 'Completed' })
        .eq('project_id', id)
        .in('status', ['Pending', 'Open', 'Approved', 'Filled']);
    }

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

// ✅ PATCH /api/pm/projects/:id/status — quick status change (e.g. approve -> Active, or mark as Completed)
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, restoreMode = 'with_previous' } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    // Fetch existing project to capture name, description, and creator
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, project_name, status, created_by, project_description')
      .eq('id', id)
      .single();

    if (projErr || !project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const nowIso = new Date().toISOString();
    const todayDate = nowIso.split('T')[0];
      const reportEmployeeId = req.user?.id || project.created_by || null;
      const reportEmployeeName = [req.user?.first_name, req.user?.last_name]
        .filter(Boolean)
        .join(' ')
        .trim() || 'Project Manager';
    const wasCompleted = project.status === 'Completed';
    const isRestoring = status === 'Active' && wasCompleted;

    const updatePayload = { status, updated_at: nowIso };
    if (isRestoring) {
      const existingDesc = project.project_description || '';
      if (!existingDesc.includes('<!-- RESTORED -->') && !existingDesc.includes('[RESTORED]')) {
        updatePayload.project_description = `${existingDesc} <!-- RESTORED -->`.trim();
      }
    }

    const { data, error } = await supabase
      .from('projects')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Handle project completion
    if (status === 'Completed') {
      // 1. Unassign all employees from this project:
      // Set status = 'Completed' and record end_date on project_assignments so active queries treat them as unassigned
      const { error: assignErr } = await supabase
        .from('project_assignments')
        .update({
          status: 'Completed',
          end_date: todayDate,
        })
        .eq('project_id', id)
        .eq('status', 'Assigned');

      if (assignErr) {
        console.error('Non-fatal error updating project assignments on completion:', assignErr);
      }

      // 2. Conclude tasks & add completion progress log entry so Weekly Progress Report includes this project
      const { data: projectTasks, error: tasksFetchErr } = await supabase
        .from('project_tasks')
        .select('*, profiles:profiles!project_tasks_profile_id_fkey(first_name, last_name)')
        .eq('project_id', id);

      if (!tasksFetchErr && projectTasks) {
        if (projectTasks.length === 0) {
          // If no tasks exist, insert a milestone completion task so Weekly Progress Report has the entry
          const { data: insertedTask } = await supabase
            .from('project_tasks')
            .insert({
              project_id: id,
              profile_id: null,
              title: `${project.project_name} - Final Completion Report`,
              description: 'Project concluded and marked as completed.',
              priority: 'Medium',
              status: 'Completed',
              due_date: todayDate,
              progress_logs: [{
                date: nowIso,
                percentage: 100,
                note: 'Project concluded and marked as completed.',
                loggedBy: req.user?.id || project.created_by || null,
              }],
              created_by: req.user?.id || project.created_by || null,
            })
            .select()
            .single();

          if (insertedTask) {
            try {
              const { error: reportError } = await supabase.from('project_report').insert({
                task_id: insertedTask.id,
                project_id: id,
                employee_id: reportEmployeeId,
                task_title: insertedTask.title,
                task_description: insertedTask.description,
                employee_name: reportEmployeeName,
                project_name: project.project_name,
                percentage: 100,
                log_date: todayDate,
              });

              if (reportError) {
                console.error('Non-fatal error inserting milestone into project_report:', reportError);
              }
            } catch (rErr) {
              console.error('Non-fatal error inserting milestone into project_report:', rErr);
            }
          }
        } else {
          for (const task of projectTasks) {
            const existingLogs = Array.isArray(task.progress_logs) ? task.progress_logs : [];
            const currentTotal = existingLogs.reduce((sum, log) => sum + (parseInt(log.percentage, 10) || 0), 0);
            const remaining = Math.max(0, 100 - currentTotal);

            const completionLog = {
              date: nowIso,
              percentage: remaining > 0 ? remaining : 100,
              note: 'Project concluded and marked as completed.',
              loggedBy: req.user?.id || project.created_by || null,
            };

            const updatedLogs = [...existingLogs, completionLog];

            await supabase
              .from('project_tasks')
              .update({
                status: 'Completed',
                progress_logs: updatedLogs,
                updated_at: nowIso,
              })
              .eq('id', task.id);

            // Record the PM who completed the project in the weekly report.
            try {
              const { error: reportError } = await supabase.from('project_report').insert({
                task_id: task.id,
                project_id: id,
                employee_id: reportEmployeeId,
                task_title: task.title,
                task_description: task.description || '',
                employee_name: reportEmployeeName,
                project_name: project.project_name,
                percentage: 100,
                log_date: todayDate,
              });

              if (reportError) {
                console.error('Non-fatal error inserting task completion into project_report:', reportError);
              }
            } catch (rErr) {
              console.error('Non-fatal error inserting task completion into project_report:', rErr);
            }
          }
        }
      }

      // 3. Mark all resource requirements as Completed so RM Pending Requests queue is clean
      const { error: reqErr } = await supabase
        .from('project_resource_requirements')
        .update({
          status: 'Completed',
        })
        .eq('project_id', id)
        .in('status', ['Pending', 'Open', 'Approved', 'Filled']);

      if (reqErr) {
        console.error('Non-fatal error updating project resource requirements on completion:', reqErr);
      }
    } else if (isRestoring) {
      if (restoreMode === 'as_new') {
        // Option B: Restore as New Project
        // Non-destructive: mark previous assignments and previous tasks as 'Archived'
        // Resource requirements are restored to 'Pending' so new staff can be requested/assigned
        await supabase
          .from('project_assignments')
          .update({ status: 'Archived', updated_at: nowIso })
          .eq('project_id', id);

        await supabase
          .from('project_tasks')
          .update({ status: 'Archived', updated_at: nowIso })
          .eq('project_id', id);

        await supabase
          .from('project_resource_requirements')
          .update({ status: 'Pending' })
          .eq('project_id', id)
          .in('status', ['Completed', 'Archived']);
      } else {
        // Option A: Restore with Previous Employees & Tasks (Default)
        // Reactivate snapshot assignments and tasks linked to this project at completion
        await supabase
          .from('project_assignments')
          .update({ status: 'Assigned', updated_at: nowIso })
          .eq('project_id', id)
          .eq('status', 'Completed');

        await supabase
          .from('project_tasks')
          .update({ status: 'In Progress', updated_at: nowIso })
          .eq('project_id', id)
          .in('status', ['Completed', 'Completed-Hidden']);

        // Check active assignments for this project to accurately set each requirement's status
        const { data: activeAssignments } = await supabase
          .from('project_assignments')
          .select('id, requirement_id')
          .eq('project_id', id)
          .eq('status', 'Assigned');

        const { data: projectRequirements } = await supabase
          .from('project_resource_requirements')
          .select('id, quantity_needed')
          .eq('project_id', id)
          .in('status', ['Completed', 'Archived']);

        if (projectRequirements && projectRequirements.length > 0) {
          for (const reqItem of projectRequirements) {
            const qtyNeeded = reqItem.quantity_needed || 1;
            const assignedCount = (activeAssignments || []).filter(a => a.requirement_id === reqItem.id).length;
            const newReqStatus = assignedCount >= qtyNeeded ? 'Filled' : 'Pending';

            await supabase
              .from('project_resource_requirements')
              .update({ status: newReqStatus })
              .eq('id', reqItem.id);
          }
        }
      }
    }

    await logAuditEvent({
      req,
      action: 'Updated',
      systemCategory: 'Resource Management',
      logDescription: `Updated project ${id} status to ${status}`,
    });

    invalidateProjectsCache();
    try {
      const { invalidateTasksCache } = require('./tasks');
      if (typeof invalidateTasksCache === 'function') invalidateTasksCache();
    } catch (e) {}
    try {
      const { invalidateEmployeesCache } = require('./employees');
      if (typeof invalidateEmployeesCache === 'function') invalidateEmployeesCache();
    } catch (e) {}

    res.status(200).json({ success: true, message: 'Project status updated', data });
  } catch (error) {
    console.error('Error updating project status:', error);
    res.status(500).json({ success: false, message: 'Failed to update project status', error: error.message });
  }
});

// ✅ DELETE /api/pm/projects/:id
router.delete('/:id', async (req, res) => {
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