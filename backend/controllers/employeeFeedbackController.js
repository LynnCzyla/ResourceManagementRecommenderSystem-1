// backend/controllers/employeeFeedbackController.js
//
// - getMyFeedback: Employee-side, READ-ONLY view of their own client feedback.
// - getClientFeedbackForEmployee: PM-side, reads the client feedback given to
//   one EMP on one project, so the PM can review it before evaluating.
// - submitPmEvaluation: PM-side, WRITE. Creates/updates a
//   performance_records row with feedback_source = 'project_manager' for
//   the EMP. Never touches feedback_source = 'client' rows (those are only
//   ever written by clientFeedbackController.js) — that's what keeps the
//   client-sourced PM record un-editable by the PM.

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

function average(nums) {
  const valid = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n));
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

/// GET /api/employee/feedback
const getMyFeedback = async (req, res) => {
  try {
    const profileId = req.user.id;

    const { data: records, error: recordsError } = await supabase
      .from('performance_records')
      .select(`
        id,
        project_id,
        created_by,
        client_name,
        feedback_source,
        rating,
        technical_skills_rating,
        communication_rating,
        timeliness_rating,
        quality_of_work_rating,
        teamwork_rating,
        problem_solving_rating,
        deliverables_feedback,
        client_feedback,
        strengths,
        areas_for_improvement,
        pm_assessment,
        project_feedback,
        rated_at,
        created_at,
        project:projects!performance_records_project_id_fkey ( project_name ),
        evaluator:profiles!performance_records_created_by_fkey ( first_name, last_name, role ),
        feedback_response:feedback_responses!performance_records_feedback_response_id_fkey ( would_recommend )
      `)
      .eq('profile_id', profileId)
      .in('feedback_status', ['submitted', 'reviewed']);

    if (recordsError) throw recordsError;

    if (!records || records.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          summary: {
            totalReviews: 0,
            averages: RATING_FIELDS.reduce((acc, f) => ({ ...acc, [f]: null }), {}),
            recommendPercent: null,
          },
          feedback: [],
        },
      });
    }

    const averages = {};
    for (const field of RATING_FIELDS) {
      averages[field] = average(records.map((r) => r[field]));
    }

    const clientResponses = records.filter(r => r.feedback_source === 'client' && r.feedback_response);
    const recommendVotes = clientResponses.map(r => r.feedback_response.would_recommend).filter(v => typeof v === 'boolean');
    const recommendPercent = recommendVotes.length > 0
      ? Math.round((recommendVotes.filter(v => v).length / recommendVotes.length) * 100)
      : null;

    const feedback = records.map((r) => {
      const evaluatorName = r.feedback_source === 'client'
        ? (r.client_name || 'Client')
        : (r.evaluator ? ([r.evaluator.first_name, r.evaluator.last_name].filter(Boolean).join(' ') || 'Unnamed') : 'Unknown');

      const isClient = r.feedback_source === 'client';
      const detailFeedback = isClient 
        ? (r.client_feedback || r.deliverables_feedback || '')
        : (r.pm_assessment || r.project_feedback || '');

      return {
        id: r.id,
        projectName: r.project?.project_name || 'Unknown project',
        clientName: evaluatorName,
        submittedAt: r.rated_at || r.created_at,
        ratings: RATING_FIELDS.reduce((acc, f) => ({ ...acc, [f]: r[f] ?? null }), {}),
        strengths: r.strengths || '',
        areasForImprovement: r.areas_for_improvement || '',
        wouldRecommend: isClient && r.feedback_response ? r.feedback_response.would_recommend : null,
        feedbackSource: r.feedback_source,
        detailFeedback: detailFeedback,
      };
    });

    feedback.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalReviews: records.length,
          averages,
          recommendPercent,
        },
        feedback,
      },
    });
  } catch (error) {
    console.error('Error fetching employee feedback:', error);
    res.status(500).json({ success: false, message: 'Failed to load feedback', error: error.message });
  }
};

// GET /api/pm/performance/my-client-feedback
const getPmClientFeedback = async (req, res) => {
  try {
    const pmProfileId = req.user?.profile_id || req.user?.id;
    if (!pmProfileId) {
      return res.status(401).json({ success: false, message: 'Missing authenticated PM profile' });
    }

    const { data: records, error: recordsError } = await supabase
      .from('performance_records')
      .select(`
        id,
        project_id,
        created_by,
        client_name,
        feedback_source,
        rating,
        technical_skills_rating,
        communication_rating,
        timeliness_rating,
        quality_of_work_rating,
        teamwork_rating,
        problem_solving_rating,
        deliverables_feedback,
        client_feedback,
        strengths,
        areas_for_improvement,
        pm_assessment,
        project_feedback,
        rated_at,
        created_at,
        project:projects!performance_records_project_id_fkey ( project_name ),
        feedback_response:feedback_responses!performance_records_feedback_response_id_fkey ( would_recommend )
      `)
      .eq('profile_id', pmProfileId)
      .eq('feedback_source', 'client')
      .in('feedback_status', ['submitted', 'reviewed']);

    if (recordsError) throw recordsError;

    if (!records || records.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          summary: {
            totalReviews: 0,
            averages: RATING_FIELDS.reduce((acc, f) => ({ ...acc, [f]: null }), {}),
            recommendPercent: null,
          },
          feedback: [],
        },
      });
    }

    const averages = {};
    for (const field of RATING_FIELDS) {
      averages[field] = average(records.map((r) => r[field]));
    }

    const recommendVotes = records.map(r => r.feedback_response?.would_recommend).filter(v => typeof v === 'boolean');
    const recommendPercent = recommendVotes.length > 0
      ? Math.round((recommendVotes.filter(v => v).length / recommendVotes.length) * 100)
      : null;

    const feedback = records.map((r) => ({
      id: r.id,
      projectName: r.project?.project_name || 'Unknown project',
      clientName: r.client_name || 'Client',
      submittedAt: r.rated_at || r.created_at,
      ratings: RATING_FIELDS.reduce((acc, f) => ({ ...acc, [f]: r[f] ?? null }), {}),
      strengths: r.strengths || '',
      areasForImprovement: r.areas_for_improvement || '',
      wouldRecommend: r.feedback_response ? r.feedback_response.would_recommend : null,
      feedbackSource: r.feedback_source,
      detailFeedback: r.client_feedback || r.deliverables_feedback || '',
    }));

    feedback.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalReviews: records.length,
          averages,
          recommendPercent,
        },
        feedback,
      },
    });
  } catch (error) {
    console.error('Error fetching PM client feedback:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch feedback', error: error.message });
  }
};

// GET /api/pm/performance/client-feedback?profileId=<EMP id>&projectId=<optional>
const getClientFeedbackForEmployee = async (req, res) => {
  try {
    const { profileId, projectId } = req.query;

    if (!profileId) {
      return res.status(400).json({ success: false, message: 'profileId is required' });
    }

    let requestQuery = supabase
      .from('feedback_requests')
      .select('id, project_id, client_name, completed_at, status');
    if (projectId) requestQuery = requestQuery.eq('project_id', projectId);

    const { data: requests, error: reqErr } = await requestQuery;
    if (reqErr) throw reqErr;

    const requestIds = (requests || []).map((r) => r.id);
    if (requestIds.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const { data: responses, error: respErr } = await supabase
      .from('feedback_responses')
      .select('*')
      .eq('profile_id', profileId)
      .in('feedback_request_id', requestIds);
    if (respErr) throw respErr;

    const requestMap = {};
    for (const r of requests) requestMap[r.id] = r;

    const data = (responses || []).map((r) => {
      const request = requestMap[r.feedback_request_id];
      return {
        id: r.id,
        feedbackRequestId: r.feedback_request_id,
        projectId: request?.project_id || null,
        clientName: request?.client_name || 'Client',
        submittedAt: request?.completed_at || null,
        ratings: RATING_FIELDS.reduce((acc, f) => ({ ...acc, [f]: r[f] ?? null }), {}),
        strengths: r.strengths || '',
        areasForImprovement: r.areas_for_improvement || '',
        deliverablesFeedback: r.deliverables_feedback || '',
        projectFeedback: r.project_feedback || '',
        additionalComments: r.additional_comments || '',
        wouldRecommend: typeof r.would_recommend === 'boolean' ? r.would_recommend : null,
      };
    });

    data.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching client feedback for employee:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch client feedback', error: error.message });
  }
};

// POST /api/pm/performance/evaluations
const submitPmEvaluation = async (req, res) => {
  try {
    const pmProfileId = req.user?.profile_id || req.user?.id;
    if (!pmProfileId) {
      return res.status(401).json({ success: false, message: 'Missing authenticated PM profile' });
    }

    const {
      profileId, // EMP being evaluated
      projectId,
      feedbackResponseId, // optional link to the client feedback_responses row this is based on
      rating,
      technical_skills_rating,
      communication_rating,
      timeliness_rating,
      quality_of_work_rating,
      teamwork_rating,
      problem_solving_rating,
      pmAssessment,
      strengths,
      areasForImprovement,
      projectFeedback,
    } = req.body;

    if (!profileId) return res.status(400).json({ success: false, message: 'profileId (employee) is required' });
    if (!projectId) return res.status(400).json({ success: false, message: 'projectId is required' });
    if (rating === undefined || rating === null) {
      return res.status(400).json({ success: false, message: 'Overall rating is required' });
    }
    if (String(profileId) === String(pmProfileId)) {
      return res.status(400).json({ success: false, message: 'You cannot submit a project_manager evaluation for yourself' });
    }

    // Confirm the employee is actually assigned to this project
    const { data: assignment, error: assignError } = await supabase
      .from('project_assignments')
      .select('id')
      .eq('project_id', projectId)
      .eq('profile_id', profileId)
      .maybeSingle();
    if (assignError) throw assignError;
    if (!assignment) {
      return res.status(400).json({ success: false, message: 'This employee is not assigned to the selected project' });
    }

    const record = {
      profile_id: profileId,
      project_id: projectId,
      created_by: pmProfileId,
      feedback_response_id: feedbackResponseId || null,
      rating: Number(rating),
      technical_skills_rating: technical_skills_rating != null ? Number(technical_skills_rating) : null,
      communication_rating: communication_rating != null ? Number(communication_rating) : null,
      timeliness_rating: timeliness_rating != null ? Number(timeliness_rating) : null,
      quality_of_work_rating: quality_of_work_rating != null ? Number(quality_of_work_rating) : null,
      teamwork_rating: teamwork_rating != null ? Number(teamwork_rating) : null,
      problem_solving_rating: problem_solving_rating != null ? Number(problem_solving_rating) : null,
      pm_assessment: pmAssessment || null,
      strengths: strengths || null,
      areas_for_improvement: areasForImprovement || null,
      project_feedback: projectFeedback || null,
      feedback_source: 'project_manager',
      feedback_status: 'submitted',
      rated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 1. Save or update the project manager's own evaluation record
    const { data: existing, error: existingErr } = await supabase
      .from('performance_records')
      .select('id')
      .eq('profile_id', profileId)
      .eq('project_id', projectId)
      .eq('created_by', pmProfileId)
      .eq('feedback_source', 'project_manager')
      .maybeSingle();
    if (existingErr) throw existingErr;

    let saved;
    if (existing) {
      const { data, error } = await supabase
        .from('performance_records')
        .update(record)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await supabase
        .from('performance_records')
        .insert(record)
        .select()
        .single();
      if (error) throw error;
      saved = data;
    }

    // 2. If client feedback response exists, copy/upsert it directly into performance_records as feedback_source = 'client'
    if (feedbackResponseId) {
      const { data: resp, error: respErr } = await supabase
        .from('feedback_responses')
        .select('*')
        .eq('id', feedbackResponseId)
        .maybeSingle();
      if (respErr) throw respErr;

      if (resp) {
        const { data: reqRow, error: reqErr } = await supabase
          .from('feedback_requests')
          .select('*')
          .eq('id', resp.feedback_request_id)
          .maybeSingle();
        if (reqErr) throw reqErr;

        const clientRecord = {
          profile_id: profileId,
          project_id: projectId,
          created_by: pmProfileId,
          feedback_response_id: feedbackResponseId,
          feedback_request_id: resp.feedback_request_id,
          client_name: reqRow?.client_name || 'Client',
          client_email: reqRow?.client_email || null,
          rating: Number(resp.rating),
          client_original_rating: Number(resp.rating),
          technical_skills_rating: resp.technical_skills_rating != null ? Number(resp.technical_skills_rating) : null,
          communication_rating: resp.communication_rating != null ? Number(resp.communication_rating) : null,
          timeliness_rating: resp.timeliness_rating != null ? Number(resp.timeliness_rating) : null,
          quality_of_work_rating: resp.quality_of_work_rating != null ? Number(resp.quality_of_work_rating) : null,
          teamwork_rating: resp.teamwork_rating != null ? Number(resp.teamwork_rating) : null,
          problem_solving_rating: resp.problem_solving_rating != null ? Number(resp.problem_solving_rating) : null,
          deliverables_feedback: resp.deliverables_feedback || null,
          client_feedback: resp.additional_comments || null,
          strengths: resp.strengths || null,
          areas_for_improvement: resp.areas_for_improvement || null,
          project_feedback: resp.project_feedback || null,
          feedback_source: 'client',
          feedback_status: 'submitted',
          rated_at: resp.submitted_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data: existingClientRec, error: clientRecErr } = await supabase
          .from('performance_records')
          .select('id')
          .eq('profile_id', profileId)
          .eq('project_id', projectId)
          .eq('feedback_response_id', feedbackResponseId)
          .eq('feedback_source', 'client')
          .maybeSingle();
        if (clientRecErr) throw clientRecErr;

        if (existingClientRec) {
          const { error: updErr } = await supabase
            .from('performance_records')
            .update(clientRecord)
            .eq('id', existingClientRec.id);
          if (updErr) throw updErr;
        } else {
          const { error: insErr } = await supabase
            .from('performance_records')
            .insert(clientRecord);
          if (insErr) throw insErr;
        }
      }
    }

    // 3. Store the PM's evaluation in the feedback_responses table
    let targetRequestId = null;
    if (feedbackResponseId) {
      const { data: clientResp, error: clientRespErr } = await supabase
        .from('feedback_responses')
        .select('feedback_request_id')
        .eq('id', feedbackResponseId)
        .maybeSingle();
      if (!clientRespErr && clientResp) {
        targetRequestId = clientResp.feedback_request_id;
      }
    }

    if (!targetRequestId) {
      // Find a feedback request for this project and employee
      const { data: freq, error: freqErr } = await supabase
        .from('feedback_requests')
        .select('id')
        .eq('project_id', projectId)
        .maybeSingle();
      if (!freqErr && freq) {
        targetRequestId = freq.id;
      }
    }

    if (targetRequestId) {
      const pmResponse = {
        feedback_request_id: targetRequestId,
        profile_id: profileId,
        rating: Number(rating),
        technical_skills_rating: technical_skills_rating != null ? Number(technical_skills_rating) : null,
        communication_rating: communication_rating != null ? Number(communication_rating) : null,
        timeliness_rating: timeliness_rating != null ? Number(timeliness_rating) : null,
        quality_of_work_rating: quality_of_work_rating != null ? Number(quality_of_work_rating) : null,
        teamwork_rating: teamwork_rating != null ? Number(teamwork_rating) : null,
        problem_solving_rating: problem_solving_rating != null ? Number(problem_solving_rating) : null,
        deliverables_feedback: pmAssessment || null,
        strengths: strengths || null,
        areas_for_improvement: areas_for_improvement || null,
        project_feedback: projectFeedback || null,
        reviewed_by: pmProfileId,
        reviewed_at: new Date().toISOString(),
        review_status: 'approved'
      };

      const { data: existingPmResp, error: pmRespErr } = await supabase
        .from('feedback_responses')
        .select('id')
        .eq('feedback_request_id', targetRequestId)
        .eq('profile_id', profileId)
        .eq('reviewed_by', pmProfileId)
        .maybeSingle();

      if (!pmRespErr) {
        if (existingPmResp) {
          await supabase
            .from('feedback_responses')
            .update(pmResponse)
            .eq('id', existingPmResp.id);
        } else {
          await supabase
            .from('feedback_responses')
            .insert(pmResponse);
        }
      }
    }

    res.status(201).json({ success: true, message: 'Evaluation submitted', data: saved });
  } catch (error) {
    console.error('Error submitting PM evaluation:', error);
    res.status(500).json({ success: false, message: 'Failed to submit evaluation', error: error.message });
  }
};

module.exports = { getMyFeedback, getClientFeedbackForEmployee, submitPmEvaluation, getPmClientFeedback };