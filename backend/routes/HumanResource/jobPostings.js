// backend/routes/HumanResource/jobPostings.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');

// GET /api/hr/job-postings/resource-requests — Approved RM requests HR can post from.
// IMPORTANT: this must be declared BEFORE '/:id' or Express will treat
// "resource-requests" as an :id value.
router.get('/resource-requests', async (req, res) => {
  try {
    const { data: requests, error } = await supabase
      .from('hr_resource_requests')
      .select(`
        *,
        requester:profiles!hr_resource_requests_requested_by_fkey(first_name,last_name)
      `)
      .eq('status', 'Approved')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Flag requests that already have a job posting created from them, so the
    // frontend can show "(already posted)" without hiding them entirely.
    const { data: postings, error: postingsError } = await supabase
      .from('job_postings')
      .select('source_request_id')
      .not('source_request_id', 'is', null);

    if (postingsError) throw postingsError;

    const usedIds = new Set((postings || []).map((p) => p.source_request_id));

    const shaped = (requests || []).map((r) => ({
      ...r,
      already_posted: usedIds.has(r.id),
    }));

    res.status(200).json({ success: true, data: shaped });
  } catch (error) {
    console.error('Error fetching resource requests for job postings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch resource requests.' });
  }
});

// GET /api/hr/job-postings — list all postings (optional ?status= filter)
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;

    let query = supabase
      .from('job_postings')
      .select(`
        *,
        departments ( id, department_name ),
        positions ( id, position_name ),
        job_applications ( id )
      `)
      .order('posted_date', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    // Flatten applications count so the frontend can keep using `applications`
    const shaped = (data || []).map((row) => ({
      ...row,
      applications: row.job_applications?.length || 0,
    }));

    res.status(200).json({ success: true, data: shaped });
  } catch (error) {
    console.error('Error fetching job postings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch job postings.' });
  }
});

// GET /api/hr/job-postings/:id — single posting
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('job_postings')
      .select(`*, departments ( id, department_name ), positions ( id, position_name )`)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Job posting not found.' });

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching job posting:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch job posting.' });
  }
});

// POST /api/hr/job-postings — create a posting
router.post('/', async (req, res) => {
  try {
    const {
      title, description, department_id, position_id, location,
      employment_type, salary_min, salary_max, requirements,
      responsibilities, benefits, status, closing_date, source_request_id,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Job title is required.' });
    }

    const { data, error } = await supabase
      .from('job_postings')
      .insert({
        title: title.trim(),
        description: description?.trim() || null,
        department_id: department_id || null,
        position_id: position_id || null,
        location: location?.trim() || null,
        employment_type: employment_type || 'Full-time',
        salary_min: salary_min || null,
        salary_max: salary_max || null,
        requirements: requirements?.trim() || null,
        responsibilities: responsibilities?.trim() || null,
        benefits: benefits?.trim() || null,
        status: status || 'Active',
        closing_date: closing_date || null,
        source_request_id: source_request_id || null,
        created_by: req.user?.id || null,
      })
      .select()
      .single();

    if (error) throw error;

    await logAuditEvent({
      req,
      action: 'Created',
      systemCategory: 'HR - Job Postings',
      logDescription: `Created job posting: ${title.trim()}`,
    });

    res.status(201).json({ success: true, message: 'Job posting created successfully.', data });
  } catch (error) {
    console.error('Error creating job posting:', error);
    res.status(500).json({ success: false, error: 'Failed to create job posting.' });
  }
});

// PUT /api/hr/job-postings/:id — update a posting
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title, description, department_id, position_id, location,
      employment_type, salary_min, salary_max, requirements,
      responsibilities, benefits, status, closing_date, source_request_id,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Job title is required.' });
    }

    const { data, error } = await supabase
      .from('job_postings')
      .update({
        title: title.trim(),
        description: description?.trim() || null,
        department_id: department_id || null,
        position_id: position_id || null,
        location: location?.trim() || null,
        employment_type,
        salary_min: salary_min || null,
        salary_max: salary_max || null,
        requirements: requirements?.trim() || null,
        responsibilities: responsibilities?.trim() || null,
        benefits: benefits?.trim() || null,
        status,
        closing_date: closing_date || null,
        source_request_id: source_request_id || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Job posting not found.' });

    await logAuditEvent({
      req,
      action: 'Updated',
      systemCategory: 'HR - Job Postings',
      logDescription: `Updated job posting: ${title.trim()}`,
    });

    res.status(200).json({ success: true, message: 'Job posting updated successfully.', data });
  } catch (error) {
    console.error('Error updating job posting:', error);
    res.status(500).json({ success: false, error: 'Failed to update job posting.' });
  }
});

// DELETE /api/hr/job-postings/:id — delete a posting
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: linkedApplications } = await supabase
      .from('job_applications')
      .select('id')
      .eq('job_posting_id', id)
      .limit(1);

    if (linkedApplications && linkedApplications.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete this posting. It has applications on file — close it instead.',
      });
    }

    const { error } = await supabase.from('job_postings').delete().eq('id', id);
    if (error) throw error;

    await logAuditEvent({
      req,
      action: 'Deleted',
      systemCategory: 'HR - Job Postings',
      logDescription: `Deleted job posting ${id}`,
    });

    res.status(200).json({ success: true, message: 'Job posting deleted successfully.' });
  } catch (error) {
    console.error('Error deleting job posting:', error);
    res.status(500).json({ success: false, error: 'Failed to delete job posting.' });
  }
});

module.exports = router;