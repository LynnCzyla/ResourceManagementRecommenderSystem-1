// backend/controllers/employeeFeedbackController.js
//
// Employee-side controller for viewing client feedback about themselves.
// READ-ONLY. Only reads feedback_responses (scoped to req.user.id) plus
// feedback_requests / projects for display context. Never writes anything.

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

// GET /api/employee/feedback
const getMyFeedback = async (req, res) => {
  try {
    const profileId = req.user.id;

    const { data: responses, error: responsesError } = await supabase
      .from('feedback_responses')
      .select('*')
      .eq('profile_id', profileId);

    if (responsesError) throw responsesError;

    if (!responses || responses.length === 0) {
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

    // Resolve feedback_requests (for project_id, client_name, completed_at)
    const requestIds = [...new Set(responses.map((r) => r.feedback_request_id))];
    const { data: requests, error: requestsError } = await supabase
      .from('feedback_requests')
      .select('id, project_id, client_name, completed_at')
      .in('id', requestIds);
    if (requestsError) throw requestsError;

    const requestMap = {};
    for (const r of requests || []) requestMap[r.id] = r;

    // Resolve project names
    const projectIds = [...new Set((requests || []).map((r) => r.project_id).filter(Boolean))];
    let projectMap = {};
    if (projectIds.length > 0) {
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('id, project_name')
        .in('id', projectIds);
      if (projectsError) throw projectsError;
      for (const p of projects || []) projectMap[p.id] = p.project_name;
    }

    // Build summary averages across all responses
    const averages = {};
    for (const field of RATING_FIELDS) {
      averages[field] = average(responses.map((r) => r[field]));
    }

    const recommendVotes = responses.filter((r) => typeof r.would_recommend === 'boolean');
    const recommendPercent = recommendVotes.length > 0
      ? Math.round((recommendVotes.filter((r) => r.would_recommend).length / recommendVotes.length) * 100)
      : null;

    const feedback = responses.map((r) => {
      const request = requestMap[r.feedback_request_id];
      return {
        id: r.id,
        projectName: request?.project_id ? (projectMap[request.project_id] || 'Unknown project') : 'Unknown project',
        clientName: request?.client_name || 'Client',
        submittedAt: request?.completed_at || null,
        ratings: RATING_FIELDS.reduce((acc, f) => ({ ...acc, [f]: r[f] ?? null }), {}),
        strengths: r.strengths || '',
        areasForImprovement: r.areas_for_improvement || '',
        wouldRecommend: typeof r.would_recommend === 'boolean' ? r.would_recommend : null,
      };
    });

    // Sort newest first using the feedback_request's completed_at
    feedback.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalReviews: responses.length,
          averages,
          recommendPercent,
        },
        feedback,
      },
    });
  } catch (error) {
    console.error('Error fetching employee feedback:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch feedback', error: error.message });
  }
};

module.exports = { getMyFeedback };