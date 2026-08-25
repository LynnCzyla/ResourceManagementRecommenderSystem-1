// backend/controllers/feedbackRequestController.js
//
// PM-side controller for the client project feedback feature.
// Reads/writes the EXISTING feedback_requests table only (see schema in
// the PM feature spec) — never touches feedback_responses.
//
// Follows the same conventions as routes/ProjectManager/projects.js and
// employees.js: plain supabase-js queries, { success, data } responses,
// employees resolved from `profiles` (first_name/last_name), no auth
// middleware (PM routes currently have none — matches routes/index.js).

const crypto = require('crypto');
const supabase = require('../supabase');
const { sendFeedbackRequestEmail } = require('../utils/mailer');
const { logAuditEvent } = require('../utils/auditLogger');

// Fallback only — the real base URL comes from `redirectOrigin` sent by the
// frontend on each request (window.location.origin), the same pattern
// forgotPassword.js uses. This constant only kicks in if the frontend
// somehow doesn't send one and APP_URL/FRONTEND_URL aren't set in .env.
const DEFAULT_APP_URL = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
const FEEDBACK_LINK_TTL_DAYS = 30;

function buildFeedbackLink(accessToken, origin) {
  const baseUrl = (origin || DEFAULT_APP_URL).toString();
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${cleanBaseUrl}/feedback/${accessToken}`;
}

function generateAccessToken() {
  // access_token is a `uuid` column in Postgres — must be a valid UUID,
  // not an arbitrary hex string, or the insert throws 22P02.
  return crypto.randomUUID();
}

function computeExpiresAt() {
  return new Date(Date.now() + FEEDBACK_LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// Audit logging is a side effect, not part of the core operation — a
// failure here (missing column, RLS, FK mismatch, etc.) must never make
// an otherwise-successful request/email look like it failed.
async function safeLogAuditEvent(args) {
  try {
    await logAuditEvent(args);
  } catch (auditError) {
    console.error('Non-fatal: logAuditEvent failed:', auditError);
  }
}

// Look up display names for a list of profile ids, in the same shape
// employees.js already uses (first_name + last_name). Works for the PM's
// own id too, since PMs have a `profiles` row like everyone else.
async function getEmployeeNameMap(employeeIds) {
  if (!employeeIds || employeeIds.length === 0) return {};

  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', employeeIds);

  if (error) throw error;

  const map = {};
  for (const row of data || []) {
    map[row.id] = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unnamed';
  }
  return map;
}

// Shape a feedback_requests row (plus a resolved project name / employee
// names) into what PMFeedbackFormTab.jsx expects in its history table.
function transformFeedbackRequest(row, projectName, nameMap, origin) {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: projectName || 'Unknown project',
    clientName: row.client_name,
    clientEmail: row.client_email,
    employeeIds: row.employee_ids || [],
    employeeNames: (row.employee_ids || []).map(id => nameMap[id] || 'Unknown'),
    feedbackLink: buildFeedbackLink(row.access_token, origin),
    status: row.status,
    emailSentAt: row.email_sent_at,
    viewedAt: row.viewed_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

// ── POST /api/pm/feedback-requests ───────────────────────────────────────
const createFeedbackRequest = async (req, res) => {
  try {
    const { projectId, createdBy, clientName, clientEmail, employeeIds, introMessage, redirectOrigin } = req.body;

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }
    if (!clientName || !clientName.trim()) {
      return res.status(400).json({ success: false, message: 'Client name is required' });
    }
    if (!clientEmail || !clientEmail.trim()) {
      return res.status(400).json({ success: false, message: 'Client email is required' });
    }
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Select at least one employee' });
    }
    if (!createdBy) {
      // feedback_requests.created_by is NOT NULL — catch this here with a
      // clear message instead of letting it surface as a raw 23502 from
      // the insert. If you're hitting this, the logged-in PM's id isn't
      // making it into the request body — check what `user` prop the
      // Feedback Request tab actually receives.
      return res.status(400).json({ success: false, message: 'Missing logged-in user id (createdBy)' });
    }

    // Validate the project exists. Pull created_by too — that's the
    // project's assigned PM, who is rateable even though they never show
    // up in project_assignments.
    let project;
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, project_name, created_by')
        .eq('id', projectId)
        .maybeSingle();
      if (error) throw error;
      project = data;
    } catch (err) {
      console.error('Error validating project:', err);
      return res.status(500).json({ success: false, message: 'Failed to validate project', error: err.message });
    }
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Validate the selected employees are actually assigned to this project
    // (same project_assignments table employees.js uses to scope
    // ?projectId=), OR are the project's assigned PM.
    let assignments;
    try {
      const { data, error } = await supabase
        .from('project_assignments')
        .select('profile_id')
        .eq('project_id', projectId)
        .in('profile_id', employeeIds);
      if (error) throw error;
      assignments = data;
    } catch (err) {
      console.error('Error checking project assignments:', err);
      return res.status(500).json({ success: false, message: 'Failed to validate assigned employees', error: err.message });
    }

    const assignedIds = new Set((assignments || []).map(a => a.profile_id));
    if (project.created_by) assignedIds.add(project.created_by);

    const invalidIds = employeeIds.filter(id => !assignedIds.has(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'One or more selected employees are not assigned to this project',
      });
    }

    let nameMap;
    try {
      nameMap = await getEmployeeNameMap(employeeIds);
    } catch (err) {
      console.error('Error resolving employee names:', err);
      return res.status(500).json({ success: false, message: 'Failed to resolve employee names', error: err.message });
    }
    const employeeNames = employeeIds.map(id => nameMap[id] || 'Unknown');

    // Create the row first (status stays 'pending' until the email actually
    // sends). access_token/expires_at are generated here explicitly rather
    // than assumed from a DB default/trigger, so a missing default can't
    // cause a NOT NULL failure on insert.
    let created;
    try {
      const { data, error } = await supabase
        .from('feedback_requests')
        .insert({
          project_id: projectId,
          created_by: createdBy || null,
          client_name: clientName.trim(),
          client_email: clientEmail.trim(),
          employee_ids: employeeIds,
          status: 'pending',
          access_token: generateAccessToken(),
          expires_at: computeExpiresAt(),
        })
        .select()
        .single();
      if (error) throw error;
      created = data;
    } catch (err) {
      console.error('Error inserting feedback_requests row:', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to create feedback request',
        error: err.message,
        details: err.details || err.hint || undefined,
      });
    }

    const feedbackLink = buildFeedbackLink(created.access_token, redirectOrigin);

    // Send the email. If this fails, the row stays 'pending' and we do
    // NOT report success — the PM can retry via the Resend button.
    try {
      await sendFeedbackRequestEmail({
        to: created.client_email,
        clientName: created.client_name,
        projectName: project.project_name,
        employeeNames,
        introMessage: introMessage || '',
        feedbackLink,
        expiresAt: created.expires_at,
      });
    } catch (emailError) {
      console.error('Error sending feedback request email:', emailError);
      return res.status(502).json({
        success: false,
        message: 'Feedback request was created, but the email failed to send. Use Resend to try again.',
        error: emailError.message,
      });
    }

    // From here on the email has already been sent — any failure below
    // must not be reported to the client as a full failure.
    let updated = created;
    try {
      const { data, error } = await supabase
        .from('feedback_requests')
        .update({
          status: 'sent',
          email_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', created.id)
        .select()
        .single();
      if (error) throw error;
      updated = data;
    } catch (err) {
      console.error('Non-fatal: failed to mark feedback_requests row as sent:', err);
    }

    await safeLogAuditEvent({
      req,
      userId: createdBy || null,
      action: 'Created',
      systemCategory: 'Resource Management',
      logDescription: `Sent feedback request for project ${project.project_name} to ${created.client_email}`,
    });

    res.status(201).json({
      success: true,
      message: 'Feedback request sent',
      data: transformFeedbackRequest(updated, project.project_name, nameMap, redirectOrigin),
    });
  } catch (error) {
    console.error('Error creating feedback request:', error);
    res.status(500).json({ success: false, message: 'Failed to create feedback request', error: error.message });
  }
};

// ── GET /api/pm/feedback-requests?createdBy=<profileId> ─────────────────
const getFeedbackRequests = async (req, res) => {
  try {
    const { createdBy } = req.query;

    let query = supabase
      .from('feedback_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (createdBy) query = query.eq('created_by', createdBy);

    const { data: rows, error } = await query;
    if (error) throw error;

    if (!rows || rows.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    // Resolve project names for every row in one query.
    const projectIds = [...new Set(rows.map(r => r.project_id))];
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, project_name')
      .in('id', projectIds);
    if (projectsError) throw projectsError;

    const projectNameMap = {};
    for (const p of projects || []) projectNameMap[p.id] = p.project_name;

    // Resolve employee names for every row in one query.
    const allEmployeeIds = [...new Set(rows.flatMap(r => r.employee_ids || []))];
    const nameMap = await getEmployeeNameMap(allEmployeeIds);

    // GET has no request body to pull an origin from, so links returned by
    // this endpoint use the server-side default. This only affects display
    // in the PM history table — the actual emailed link always uses the
    // origin captured at send time (see createFeedbackRequest/resend).
    const data = rows.map(row =>
      transformFeedbackRequest(row, projectNameMap[row.project_id], nameMap)
    );

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching feedback requests:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch feedback requests', error: error.message });
  }
};

// ── POST /api/pm/feedback-requests/:id/resend ────────────────────────────
const resendFeedbackRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { redirectOrigin } = req.body || {};

    const { data: row, error: fetchError } = await supabase
      .from('feedback_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!row) {
      return res.status(404).json({ success: false, message: 'Feedback request not found' });
    }
    if (row.status === 'completed') {
      return res.status(400).json({ success: false, message: 'This feedback request has already been completed' });
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, project_name')
      .eq('id', row.project_id)
      .maybeSingle();
    if (projectError) throw projectError;

    const nameMap = await getEmployeeNameMap(row.employee_ids || []);
    const employeeNames = (row.employee_ids || []).map(eid => nameMap[eid] || 'Unknown');
    const feedbackLink = buildFeedbackLink(row.access_token, redirectOrigin);

    try {
      await sendFeedbackRequestEmail({
        to: row.client_email,
        clientName: row.client_name,
        projectName: project ? project.project_name : 'your project',
        employeeNames,
        introMessage: '',
        feedbackLink,
        expiresAt: row.expires_at,
      });
    } catch (emailError) {
      console.error('Error resending feedback request email:', emailError);
      return res.status(502).json({
        success: false,
        message: 'Failed to resend the feedback request email',
        error: emailError.message,
      });
    }

    let updated = row;
    try {
      const { data, error } = await supabase
        .from('feedback_requests')
        .update({
          status: row.status === 'pending' ? 'sent' : row.status,
          email_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      updated = data;
    } catch (err) {
      console.error('Non-fatal: failed to update feedback_requests row after resend:', err);
    }

    await safeLogAuditEvent({
      req,
      action: 'Updated',
      systemCategory: 'Resource Management',
      logDescription: `Resent feedback request ${id} to ${row.client_email}`,
    });

    res.status(200).json({
      success: true,
      message: 'Feedback request resent',
      data: transformFeedbackRequest(updated, project ? project.project_name : null, nameMap, redirectOrigin),
    });
  } catch (error) {
    console.error('Error resending feedback request:', error);
    res.status(500).json({ success: false, message: 'Failed to resend feedback request', error: error.message });
  }
};

module.exports = { createFeedbackRequest, getFeedbackRequests, resendFeedbackRequest };