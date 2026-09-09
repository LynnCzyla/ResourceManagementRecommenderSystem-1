// backend/controllers/clientFeedbackController.js
//
// Public-side controller for the client feedback form. Reads/writes ONLY
// feedback_requests (viewed_at/status/completed_at) and feedback_responses.
// Never touches feedbackController.js, feedbackRequestController.js, or
// any other table. No auth middleware — matches the existing PM public
// route convention (routes/ProjectManager/* also has none).
//
// ── PM auto-sync (Prompt 1, item 1) ────────────────────────────────────
// When a client rates someone who turns out to be a Project Manager,
// submitFeedbackResponses() also writes a performance_records row for
// that PM with feedback_source = 'client'. This is a create-only side
// effect — nothing here ever UPDATEs an existing performance_records
// row, so a PM can never edit their own client-sourced record; the only
// writer of 'project_manager'-sourced rows is submitPmEvaluation() in
// employeeFeedbackController.js.

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

// Create performance_records rows for any respondent (both PM and Employee)
// so that Resource Managers can view them consolidated in performance_records.
// Non-fatal: a failure here must never make the client's
// feedback submission look like it failed — the feedback_responses rows
// are already saved by the time this runs.
async function syncPerformanceRecords({ feedbackRequestRow, insertedResponses }) {
  try {
    if (!insertedResponses || insertedResponses.length === 0) return;

    const perfRows = insertedResponses.map(r => ({
      profile_id: r.profile_id,
      project_id: feedbackRequestRow.project_id,
      // feedback_requests.created_by is the PM/staff member who set the
      // request up — always a valid profiles.id, so it satisfies the
      // NOT NULL created_by FK even though this row is client-sourced.
      created_by: feedbackRequestRow.created_by,
      client_name: feedbackRequestRow.client_name,
      client_email: feedbackRequestRow.client_email,
      feedback_response_id: r.id,
      feedback_request_id: feedbackRequestRow.id,
      rating: r.rating,
      client_original_rating: r.rating,
      technical_skills_rating: r.technical_skills_rating,
      communication_rating: r.communication_rating,
      timeliness_rating: r.timeliness_rating,
      quality_of_work_rating: r.quality_of_work_rating,
      teamwork_rating: r.teamwork_rating,
      problem_solving_rating: r.problem_solving_rating,
      deliverables_feedback: r.deliverables_feedback,
      client_feedback: r.project_feedback,
      strengths: r.strengths,
      areas_for_improvement: r.areas_for_improvement,
      project_feedback: r.project_feedback,
      feedback_source: 'client',
      feedback_status: 'submitted',
      rated_at: new Date().toISOString(),
    }));

    if (perfRows.length > 0) {
      const { error: insertError } = await supabase.from('performance_records').insert(perfRows);
      if (insertError) {
        console.error('Non-fatal: failed to create performance_records:', insertError);
      }
    }
  } catch (err) {
    console.error('Non-fatal: performance_records sync failed:', err);
  }
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

    const { responses, projectRating, deliverablesFeedback, projectFeedback, additionalComments } = req.body;

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

    const formattedProjectFeedback = projectRating
      ? `[Rating: ${projectRating}/5] ${projectFeedback || ''}`.trim()
      : (projectFeedback || null);

    const rowsToInsert = responses.map(r => {
      const record = {
        feedback_request_id: row.id,
        profile_id: r.employeeId,
        strengths: r.strengths || null,
        areas_for_improvement: r.areasForImprovement || null,
        would_recommend: typeof r.wouldRecommend === 'boolean' ? r.wouldRecommend : null,
        deliverables_feedback: deliverablesFeedback || null,
        project_feedback: formattedProjectFeedback,
        additional_comments: additionalComments || null,
      };
      for (const field of RATING_FIELDS) {
        record[field] = r[field] != null ? Number(r[field]) : null;
      }
      return record;
    });

    // ✅ CHANGED: .select() added so we get back the inserted rows'
    // (id, profile_id) — needed to link performance_records back to the
    // exact feedback_responses row via feedback_response_id.
    const { data: insertedResponses, error: insertError } = await supabase
      .from('feedback_responses')
      .insert(rowsToInsert)
      .select();

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
      console.error('Non-fatal: failed to mark feedback_requests row as completed:', updateError);
    }

    // ✅ NEW: auto-create performance_records for all rated respondents
    await syncPerformanceRecords({ feedbackRequestRow: row, insertedResponses: insertedResponses || [] });

    // Cross-role notifications: notify PM, RM(s), and rated employees
    try {
      const { data: project } = await supabase
        .from('projects')
        .select('project_name, created_by, branch_id')
        .eq('id', row.project_id)
        .maybeSingle();

      const projectName = project?.project_name || 'your project';
      const notifs = [];

      // Notify PM (created_by)
      if (project?.created_by) {
        notifs.push({
          recipient_id: project.created_by,
          type: 'feedback',
          text: `Client feedback has been submitted for project "${projectName}".`,
          read: false
        });
      }

      // Notify Branch Resource Manager(s)
      if (project?.branch_id) {
        const { data: rms } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'Resource Manager')
          .eq('branch_id', project.branch_id);
        (rms || []).forEach(rm => {
          if (rm.id !== project.created_by) {
            notifs.push({
              recipient_id: rm.id,
              type: 'feedback',
              text: `Client feedback has been submitted for project "${projectName}".`,
              read: false
            });
          }
        });
      }

      // Notify rated employees
      const ratedIds = (responses || []).map(r => r.employeeId).filter(Boolean);
      ratedIds.forEach(empId => {
        notifs.push({
          recipient_id: empId,
          type: 'feedback',
          text: `You have received new client performance feedback for project "${projectName}".`,
          read: false
        });
      });

      if (notifs.length > 0) {
        await supabase.from('notifications').insert(notifs);
      }
    } catch (notifErr) {
      console.error('Non-fatal error creating client feedback notifications:', notifErr.message);
    }

    res.status(201).json({ success: true, message: 'Feedback submitted successfully' });
  } catch (error) {
    console.error('Error submitting feedback responses:', error);
    res.status(500).json({ success: false, message: 'Failed to submit feedback', error: error.message });
  }
};

module.exports = { getFeedbackRequestByToken, submitFeedbackResponses };