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

// Extract project rating and comment from formatted project_feedback string
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

// ── GET /api/rm/feedback-report/project-ratings ────────────────────────────
// Resource Manager ONLY: returns overall project outcome ratings and feedback
// submitted by clients. Never accessible to employees or PMs.
router.get('/project-ratings', async (req, res) => {
  try {
    const { data: requests, error } = await supabase
      .from('feedback_requests')
      .select(`
        id,
        project_id,
        client_name,
        client_email,
        status,
        completed_at,
        created_at,
        project:projects!feedback_requests_project_id_fkey ( id, project_name, project_code, start_date, end_date, status ),
        feedback_responses (
          id,
          profile_id,
          rating,
          project_feedback,
          deliverables_feedback,
          additional_comments,
          would_recommend
        )
      `)
      .order('completed_at', { ascending: false });

    if (error) throw error;

    const list = [];
    for (const reqRow of requests || []) {
      const project = reqRow.project;
      const responses = reqRow.feedback_responses || [];
      // Only include requests that have responses or completed status
      if (responses.length === 0 && reqRow.status !== 'completed') continue;

      const primaryResponse = responses.find(r => r.project_feedback) || responses[0] || {};
      const extracted = extractProjectRatingAndFeedback(primaryResponse.project_feedback, responses);

      const recommendVal = responses.find(r => typeof r.would_recommend === 'boolean')?.would_recommend ?? null;

      // Resolve accurate project status:
      // If DB project is explicitly Completed, Cancelled, or Archived, respect it.
      // If client feedback request itself is completed, resolve as 'Completed'.
      let resolvedProjectStatus = project?.status;
      if (resolvedProjectStatus === 'Cancelled' || resolvedProjectStatus === 'Canceled') {
        resolvedProjectStatus = 'Cancelled';
      } else if (resolvedProjectStatus === 'Completed' || reqRow.status === 'completed') {
        resolvedProjectStatus = 'Completed';
      } else {
        resolvedProjectStatus = resolvedProjectStatus || 'Active';
      }

      list.push({
        id: reqRow.id,
        projectId: reqRow.project_id,
        projectName: project?.project_name || 'Unnamed Project',
        projectCode: project?.project_code || '—',
        projectStatus: resolvedProjectStatus,
        clientName: reqRow.client_name || 'Client',
        clientEmail: reqRow.client_email || '—',
        completedAt: reqRow.completed_at || reqRow.created_at,
        projectRating: extracted.rating,
        projectFeedback: extracted.feedback || '',
        deliverablesFeedback: primaryResponse.deliverables_feedback || '',
        additionalComments: primaryResponse.additional_comments || '',
        wouldRecommend: recommendVal,
      });
    }

    // Calculate summary statistics
    const ratedProjects = list.filter(p => p.projectRating != null);
    const totalRated = ratedProjects.length;
    const avgRating = totalRated > 0
      ? Math.round((ratedProjects.reduce((acc, p) => acc + p.projectRating, 0) / totalRated) * 10) / 10
      : null;
    const highRatingCount = ratedProjects.filter(p => p.projectRating >= 4.0).length;
    const needsAttentionCount = ratedProjects.filter(p => p.projectRating < 3.5).length;
    const recommendCount = list.filter(p => p.wouldRecommend === true).length;
    const recommendTotal = list.filter(p => typeof p.wouldRecommend === 'boolean').length;
    const recommendPercent = recommendTotal > 0
      ? Math.round((recommendCount / recommendTotal) * 100)
      : null;

    res.json({
      success: true,
      data: list,
      summary: {
        averageRating: avgRating,
        totalProjects: list.length,
        totalRated,
        highRatingCount,
        needsAttentionCount,
        recommendPercent,
      }
    });
  } catch (error) {
    console.error('Error fetching project client ratings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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
        project:projects!performance_records_project_id_fkey ( id, project_name, project_code, status )
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

        const isVisible = clientRow.feedback_status === 'reviewed' && pmRow.feedback_status === 'reviewed';

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
          status: isVisible ? 'reviewed' : 'submitted',
          isVisible,
          clientStatus: clientRow.feedback_status || 'submitted',
          pmStatus: pmRow.feedback_status || 'submitted',
          clientRecordId: clientRow.id,
          pmRecordId: pmRow.id,
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
        const isVisible = row.feedback_status === 'reviewed';

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
          isVisible,
          clientRecordId: row.feedback_source === 'client' ? row.id : null,
          pmRecordId: row.feedback_source === 'project_manager' ? row.id : null,
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

// ── PUT /api/rm/feedback-report/:id/visibility ─────────────────────────────
// Allows the Resource Manager to grant or revoke permission for PMs and
// employees to view their respective feedback.
router.put('/:id/visibility', async (req, res) => {
  try {
    const { id } = req.params;
    const { visible } = req.body;
    const targetStatus = visible ? 'reviewed' : 'submitted';
    const reviewedAt = visible ? new Date().toISOString() : null;

    let targetIds = [];
    if (id.startsWith('merged_')) {
      const parts = id.replace('merged_', '').split('_');
      targetIds = parts.filter(Boolean);
    } else {
      targetIds = [id];
    }

    if (targetIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid feedback record ID' });
    }

    // 1. Update performance_records
    const { data: updatedRecords, error: updateErr } = await supabase
      .from('performance_records')
      .update({
        feedback_status: targetStatus,
        reviewed_at: reviewedAt,
        updated_at: new Date().toISOString()
      })
      .in('id', targetIds)
      .select('id, profile_id, project_id, feedback_source, feedback_response_id');

    if (updateErr) throw updateErr;

    // 2. Update linked feedback_responses if any
    const responseIds = (updatedRecords || [])
      .map(r => r.feedback_response_id)
      .filter(Boolean);

    if (responseIds.length > 0) {
      const respReviewStatus = visible ? 'approved' : 'pending';
      await supabase
        .from('feedback_responses')
        .update({
          review_status: respReviewStatus,
          reviewed_by: req.user.id,
          reviewed_at: reviewedAt
        })
        .in('id', responseIds);
    }

    // 3. If granting permission (visible = true), notify recipient (PM or Employee)
    if (visible && updatedRecords && updatedRecords.length > 0) {
      const notifs = [];
      const recipientIds = [...new Set(updatedRecords.map(r => r.profile_id).filter(Boolean))];

      for (const recId of recipientIds) {
        const rec = updatedRecords.find(r => r.profile_id === recId);
        let projectName = 'your project';
        if (rec?.project_id) {
          const { data: proj } = await supabase
            .from('projects')
            .select('project_name')
            .eq('id', rec.project_id)
            .maybeSingle();
          if (proj?.project_name) projectName = proj.project_name;
        }

        notifs.push({
          recipient_id: recId,
          type: 'feedback',
          text: `Your feedback for project "${projectName}" has been reviewed and released by the Resource Manager.`,
          read: false
        });
      }

      if (notifs.length > 0) {
        await supabase.from('notifications').insert(notifs);
      }
    }

    res.json({
      success: true,
      message: visible 
        ? 'Permission granted. Feedback is now visible to the recipient.' 
        : 'Permission revoked. Feedback is now hidden from the recipient.',
      data: { id, visible, status: targetStatus }
    });
  } catch (error) {
    console.error('Error updating feedback visibility:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /api/rm/feedback-report/bulk-visibility ───────────────────────────
// Allows Resource Manager to grant or revoke visibility for:
// - All feedback records for a specific employee (target: 'employee', id: profile_id)
// - All feedback records for a specific project  (target: 'project',  id: project_id)
// - Explicit array of record IDs                 (target: 'ids',      recordIds: [...])
router.post('/bulk-visibility', async (req, res) => {
  try {
    const { target, id, recordIds, visible = true } = req.body;

    if (!target) {
      return res.status(400).json({ success: false, message: 'Missing target parameter ("employee", "project", or "ids")' });
    }

    const targetStatus = visible ? 'reviewed' : 'submitted';
    const reviewedAt = visible ? new Date().toISOString() : null;

    let query = supabase
      .from('performance_records')
      .update({
        feedback_status: targetStatus,
        reviewed_at: reviewedAt,
        updated_at: new Date().toISOString()
      });

    if (target === 'employee') {
      if (!id) return res.status(400).json({ success: false, message: 'Missing employee ID' });
      query = query.eq('profile_id', id);
    } else if (target === 'project') {
      if (!id) return res.status(400).json({ success: false, message: 'Missing project ID' });
      query = query.eq('project_id', Number(id) || id);
    } else if (target === 'ids') {
      if (!Array.isArray(recordIds) || recordIds.length === 0) {
        return res.status(400).json({ success: false, message: 'Missing recordIds array' });
      }
      const expandedIds = [];
      for (const rid of recordIds) {
        if (typeof rid === 'string' && rid.startsWith('merged_')) {
          expandedIds.push(...rid.replace('merged_', '').split('_').filter(Boolean));
        } else {
          expandedIds.push(rid);
        }
      }
      query = query.in('id', expandedIds);
    } else {
      return res.status(400).json({ success: false, message: 'Invalid target type. Use "employee", "project", or "ids".' });
    }

    const { data: updatedRecords, error: updateErr } = await query.select(
      'id, profile_id, project_id, feedback_source, feedback_response_id'
    );

    if (updateErr) throw updateErr;

    const count = (updatedRecords || []).length;

    // Update linked feedback_responses if any
    const responseIds = (updatedRecords || [])
      .map(r => r.feedback_response_id)
      .filter(Boolean);

    if (responseIds.length > 0) {
      const respReviewStatus = visible ? 'approved' : 'pending';
      await supabase
        .from('feedback_responses')
        .update({
          review_status: respReviewStatus,
          reviewed_by: req.user.id,
          reviewed_at: reviewedAt
        })
        .in('id', responseIds);
    }

    // If granting visibility (visible = true), notify recipients
    if (visible && updatedRecords && updatedRecords.length > 0) {
      const notifs = [];
      const recipientIds = [...new Set(updatedRecords.map(r => r.profile_id).filter(Boolean))];

      for (const recId of recipientIds) {
        const rec = updatedRecords.find(r => r.profile_id === recId);
        let projectName = 'your project';
        if (rec?.project_id) {
          const { data: proj } = await supabase
            .from('projects')
            .select('project_name')
            .eq('id', rec.project_id)
            .maybeSingle();
          if (proj?.project_name) projectName = proj.project_name;
        }

        notifs.push({
          recipient_id: recId,
          type: 'feedback',
          text: `Your feedback for project "${projectName}" has been reviewed and released by the Resource Manager.`,
          read: false
        });
      }

      if (notifs.length > 0) {
        await supabase.from('notifications').insert(notifs);
      }
    }

    res.json({
      success: true,
      count,
      message: visible
        ? `Permission granted for ${count} feedback record${count !== 1 ? 's' : ''}.`
        : `Permission revoked for ${count} feedback record${count !== 1 ? 's' : ''}.`,
      data: { target, id, visible, count, status: targetStatus }
    });
  } catch (error) {
    console.error('Error updating bulk feedback visibility:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;