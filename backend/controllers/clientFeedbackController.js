// backend/controllers/clientFeedbackController.js
//
// Public-side controller for the client feedback form. Reads/writes ONLY
// feedback_requests (viewed_at/status/completed_at) and feedback_responses.
// Never touches feedbackController.js, feedbackRequestController.js, or
// any other table. No auth middleware — matches the existing PM public
// route convention (routes/ProjectManager/* also has none).

const supabase = require('../supabase');

const RATING_FIELDS = [
  'rating',
  'technical_skills_rating',
  'communication_rating',
  'timeliness_rating',
  'quality_of_work_rating',
  'teamwork_rating',
  'problem_solving_rating',
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isExpired(row) {
  return row.expires_at ? new Date(row.expires_at).getTime() < Date.now() : false;
}

// Look up display names for the employees on a feedback request, same
// pattern feedbackRequestController.js already uses (profiles.first_name +
// last_name).
async function getEmployeeSummaries(employeeIds) {
  if (!employeeIds || employeeIds.length === 0) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, role')
    .in('id', employeeIds);

  if (error) throw error;

  const byId = {};
  for (const row of data || []) byId[row.id] = row;

  return employeeIds.map(id => {
    const p = byId[id];
    return {
      id,
      name: p ? ([p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unnamed') : 'Unknown',
      role: p?.role || null,
    };
  });
}

// ── GET /api/public/feedback/:token ──────────────────────────────────────
const getFeedbackRequestByToken = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token || !UUID_RE.test(token)) {
      return res.status(400).json({
        success: false,
        invalid: true,
        message: 'This feedback request is invalid or has expired.',
      });
    }

    const { data: row, error } = await supabase
      .from('feedback_requests')
      .select('*')
      .eq('access_token', token)
      .maybeSingle();

    if (error) throw error;

    if (!row) {
      return res.status(404).json({
        success: false,
        invalid: true,
        message: 'This feedback request is invalid or has expired.',
      });
    }

    if (isExpired(row)) {
      return res.status(410).json({
        success: false,
        invalid: true,
        expired: true,
        message: 'This feedback request is invalid or has expired.',
      });
    }

    if (row.status === 'completed') {
      return res.status(200).json({
        success: true,
        alreadyCompleted: true,
        message: 'Feedback Already Submitted',
      });
    }

    // Mark as viewed the first time the client opens the link. Non-fatal
    // if this write fails — the client should still see and be able to
    // submit the form.
    if (!row.viewed_at) {
      try {
        await supabase
          .from('feedback_requests')
          .update({
            status: (row.status === 'sent' || row.status === 'pending') ? 'viewed' : row.status,
            viewed_at: new Date().toISOString(),
          })
          .eq('id', row.id);
      } catch (viewError) {
        console.error('Non-fatal: failed to mark feedback_requests row as viewed:', viewError);
      }
    }

    let project = null;
    try {
      const { data, error: projectError } = await supabase
        .from('projects')
        .select('id, project_name')
        .eq('id', row.project_id)
        .maybeSingle();
      if (projectError) throw projectError;
      project = data;
    } catch (projectError) {
      console.error('Error loading project for feedback request:', projectError);
    }

    let employees = [];
    try {
      employees = await getEmployeeSummaries(row.employee_ids || []);
    } catch (empError) {
      console.error('Error loading employees for feedback request:', empError);
      return res.status(500).json({
        success: false,
        message: 'Failed to load team members for this feedback request',
        error: empError.message,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: row.id,
        clientName: row.client_name,
        projectName: project ? project.project_name : 'your project',
        employees,
        expiresAt: row.expires_at,
      },
    });
  } catch (error) {
    console.error('Error loading feedback request by token:', error);
    res.status(500).json({ success: false, message: 'Failed to load feedback request', error: error.message });
  }
};

// ── POST /api/public/feedback/:token ─────────────────────────────────────
const submitFeedbackResponses = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token || !UUID_RE.test(token)) {
      return res.status(400).json({
        success: false,
        invalid: true,
        message: 'This feedback request is invalid or has expired.',
      });
    }

    const { responses, deliverablesFeedback, projectFeedback, additionalComments } = req.body;

    if (!Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one employee rating is required' });
    }

    const { data: row, error } = await supabase
      .from('feedback_requests')
      .select('*')
      .eq('access_token', token)
      .maybeSingle();

    if (error) throw error;

    if (!row) {
      return res.status(404).json({
        success: false,
        invalid: true,
        message: 'This feedback request is invalid or has expired.',
      });
    }

    if (isExpired(row)) {
      return res.status(410).json({
        success: false,
        invalid: true,
        expired: true,
        message: 'This feedback request is invalid or has expired.',
      });
    }

    // Hard stop against double submission.
    if (row.status === 'completed') {
      return res.status(409).json({
        success: false,
        alreadyCompleted: true,
        message: 'Feedback Already Submitted',
      });
    }

    const validEmployeeIds = new Set(row.employee_ids || []);
    for (const r of responses) {
      if (!r.employeeId || !validEmployeeIds.has(r.employeeId)) {
        return res.status(400).json({
          success: false,
          message: 'One or more submitted employees do not belong to this feedback request',
        });
      }
      if (!r.rating) {
        return res.status(400).json({ success: false, message: 'Overall rating is required for every employee' });
      }
    }

    const rowsToInsert = responses.map(r => {
      const record = {
        feedback_request_id: row.id,
        profile_id: r.employeeId,
        strengths: r.strengths || null,
        areas_for_improvement: r.areasForImprovement || null,
        would_recommend: typeof r.wouldRecommend === 'boolean' ? r.wouldRecommend : null,
        deliverables_feedback: deliverablesFeedback || null,
        project_feedback: projectFeedback || null,
        additional_comments: additionalComments || null,
      };
      for (const field of RATING_FIELDS) {
        record[field] = r[field] != null ? Number(r[field]) : null;
      }
      return record;
    });

    // Re-check status right before inserting isn't necessary beyond the
    // check above since there's no auth/session to race against, but we
    // still guard the insert itself.
    const { error: insertError } = await supabase
      .from('feedback_responses')
      .insert(rowsToInsert);

    if (insertError) {
      console.error('Error inserting feedback_responses rows:', insertError);
      return res.status(500).json({
        success: false,
        message: 'Failed to save feedback responses',
        error: insertError.message,
        details: insertError.details || insertError.hint || undefined,
      });
    }

    const { error: updateError } = await supabase
      .from('feedback_requests')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (updateError) {
      // Responses are already saved — don't report this as a failure to
      // the client, just log it.
      console.error('Non-fatal: failed to mark feedback_requests row as completed:', updateError);
    }

    res.status(201).json({ success: true, message: 'Feedback submitted successfully' });
  } catch (error) {
    console.error('Error submitting feedback responses:', error);
    res.status(500).json({ success: false, message: 'Failed to submit feedback', error: error.message });
  }
};

module.exports = { getFeedbackRequestByToken, submitFeedbackResponses };