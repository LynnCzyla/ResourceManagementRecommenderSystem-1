// backend/routes/ResourceManager/feedbackReport.js
//
// GET /api/rm/feedback-report — global 360-feedback report for the
// Resource Manager: joins performance_records with profiles (twice, once
// for the subject being rated and once for whoever created the row) and
// projects. Mounted under ResourceManager/Index.js, which already applies
// verifyToken to everything under /api/rm.

const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

router.get('/', async (req, res) => {
  try {
    const { project_id, pm_id, emp_id, feedback_source } = req.query;

    let query = supabase
      .from('performance_records')
      .select(`
        id,
        profile_id,
        project_id,
        created_by,
        client_name,
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
        feedback_source,
        feedback_status,
        rated_at,
        created_at,
        subject:profiles!performance_records_profile_id_fkey ( id, employee_id, first_name, last_name, role ),
        evaluator:profiles!performance_records_created_by_fkey ( id, employee_id, first_name, last_name, role ),
        project:projects!performance_records_project_id_fkey ( id, project_name, project_code )
      `)
      .order('rated_at', { ascending: false });

    if (project_id) query = query.eq('project_id', project_id);
    if (emp_id) query = query.eq('profile_id', emp_id);
    if (feedback_source) query = query.eq('feedback_source', feedback_source);
    // pm_id can appear either as the subject (client → PM row) or as the
    // creator (PM → EMP row), so match either column.
    if (pm_id) query = query.or(`profile_id.eq.${pm_id},created_by.eq.${pm_id}`);

    const { data, error } = await query;
    if (error) throw error;

    // Group records by profile_id and project_id
    const groups = {};
    for (const r of data || []) {
      const key = `${r.profile_id}_${r.project_id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }

    const result = [];
    for (const key of Object.keys(groups)) {
      const groupRows = groups[key];
      const clientRow = groupRows.find(r => r.feedback_source === 'client');
      const pmRow = groupRows.find(r => r.feedback_source === 'project_manager');

      const subject = groupRows[0].subject;
      const subjectName = subject
        ? ([subject.first_name, subject.last_name].filter(Boolean).join(' ') || 'Unnamed')
        : 'Unknown';
      const project = groupRows[0].project;
      const projectName = project?.project_name || 'Unknown project';

      if (clientRow && pmRow) {
        // Calculate merged rating
        const ratings = [Number(clientRow.rating), Number(pmRow.rating)];
        const averageRating = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;

        const clientEvaluator = clientRow.client_name || 'Client';
        const pmEvaluator = pmRow.evaluator
          ? ([pmRow.evaluator.first_name, pmRow.evaluator.last_name].filter(Boolean).join(' ') || 'Unnamed')
          : 'Project Manager';

        // Calculate merged breakdowns
        const mergedRatings = {};
        const breakdownFields = [
          'technical_skills_rating',
          'communication_rating',
          'timeliness_rating',
          'quality_of_work_rating',
          'teamwork_rating',
          'problem_solving_rating'
        ];
        for (const field of breakdownFields) {
          const vals = [];
          if (clientRow[field] != null) vals.push(Number(clientRow[field]));
          if (pmRow[field] != null) vals.push(Number(pmRow[field]));
          mergedRatings[field] = vals.length > 0
            ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
            : null;
        }

        result.push({
          id: `merged_${clientRow.id}_${pmRow.id}`,
          subjectId: clientRow.profile_id,
          subjectName,
          subjectRole: subject?.role || null,
          subjectEmployeeId: subject?.employee_id || null,
          projectId: clientRow.project_id,
          projectName,
          projectCode: project?.project_code || null,
          evaluatorSource: 'merged',
          evaluatorName: `${clientEvaluator} & PM (${pmEvaluator})`,
          rating: averageRating,
          ratings: mergedRatings,
          status: 'submitted',
          ratedAt: clientRow.rated_at || clientRow.created_at,
          isMerged: true,
          client: {
            evaluatorName: clientEvaluator,
            rating: clientRow.rating,
            strengths: clientRow.strengths,
            areasForImprovement: clientRow.areas_for_improvement,
            clientFeedback: clientRow.client_feedback || clientRow.deliverables_feedback || '',
          },
          pm: {
            evaluatorName: pmEvaluator,
            rating: pmRow.rating,
            strengths: pmRow.strengths,
            areasForImprovement: pmRow.areas_for_improvement,
            pmAssessment: pmRow.pm_assessment || pmRow.project_feedback || '',
          }
        });
      } else {
        // Only one source is available
        const row = clientRow || pmRow;
        const evaluatorName = row.feedback_source === 'client'
          ? (row.client_name || 'Client')
          : (row.evaluator ? ([row.evaluator.first_name, row.evaluator.last_name].filter(Boolean).join(' ') || 'Unnamed') : 'Unknown');

        result.push({
          id: row.id,
          subjectId: row.profile_id,
          subjectName,
          subjectRole: subject?.role || null,
          subjectEmployeeId: subject?.employee_id || null,
          projectId: row.project_id,
          projectName,
          projectCode: project?.project_code || null,
          evaluatorSource: row.feedback_source,
          evaluatorName,
          rating: row.rating,
          ratings: {
            technical_skills_rating: row.technical_skills_rating,
            communication_rating: row.communication_rating,
            timeliness_rating: row.timeliness_rating,
            quality_of_work_rating: row.quality_of_work_rating,
            teamwork_rating: row.teamwork_rating,
            problem_solving_rating: row.problem_solving_rating,
          },
          status: row.feedback_status || 'submitted',
          ratedAt: row.rated_at || row.created_at,
          isMerged: false,
          client: row.feedback_source === 'client' ? {
            evaluatorName,
            rating: row.rating,
            strengths: row.strengths,
            areasForImprovement: row.areas_for_improvement,
            clientFeedback: row.client_feedback || row.deliverables_feedback || '',
          } : null,
          pm: row.feedback_source === 'project_manager' ? {
            evaluatorName,
            rating: row.rating,
            strengths: row.strengths,
            areasForImprovement: row.areas_for_improvement,
            pmAssessment: row.pm_assessment || row.project_feedback || '',
          } : null
        });
      }
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching global feedback report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;