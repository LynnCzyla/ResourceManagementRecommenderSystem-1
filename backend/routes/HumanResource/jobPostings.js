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
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userId = req.user?.id;

    console.log(`📋 Fetching resource requests for HR: ${userId}`);
    console.log(`🏢 Branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);

    // ✅ For Super Admin: Get all approved requests
    if (isSuperAdmin) {
      const { data: requests, error } = await supabase
        .from('hr_resource_requests')
        .select(`
          *,
          requester:profiles!hr_resource_requests_requested_by_fkey(first_name,last_name)
        `)
        .eq('status', 'Approved')
        .order('created_at', { ascending: false });

      if (error) throw error;

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

      return res.status(200).json({ success: true, data: shaped });
    }

    // ✅ For non-super admins: Check branch
    if (!userBranchId) {
      return res.status(403).json({
        success: false,
        error: 'Your account is not assigned to a branch'
      });
    }

    // ✅ Get all users in this branch
    const { data: branchUsers } = await supabase
      .from('profiles')
      .select('id')
      .eq('branch_id', userBranchId)
      .eq('status', 'Active');

    const userIds = branchUsers?.map(u => u.id) || [];

    if (userIds.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    // ✅ Get resource requests from users in this branch
    const { data: requests, error } = await supabase
      .from('hr_resource_requests')
      .select(`
        *,
        requester:profiles!hr_resource_requests_requested_by_fkey(first_name,last_name)
      `)
      .in('requested_by', userIds)
      .eq('status', 'Approved')
      .order('created_at', { ascending: false });

    if (error) throw error;

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

    console.log(`✅ Found ${shaped.length} resource requests in branch`);

    res.status(200).json({ success: true, data: shaped });
  } catch (error) {
    console.error('Error fetching resource requests for job postings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch resource requests.' });
  }
});

// GET /api/hr/job-postings — list all postings (filtered by branch via created_by)
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userId = req.user?.id;

    console.log(`📋 Fetching job postings for HR: ${userId}`);
    console.log(`🏢 Branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);

    // ✅ For Super Admin: Get all
    if (isSuperAdmin) {
      let query = supabase
        .from('job_postings')
        .select(`
          *,
          departments ( id, department_name ),
          positions ( id, position_name ),
          profiles:created_by (id, first_name, last_name, branch_id, branches:branch_id (id, name, location)),
          job_applications ( id )
        `)
        .order('posted_date', { ascending: false });

      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw error;

      const shaped = (data || []).map((row) => ({
        ...row,
        applications: row.job_applications?.length || 0,
      }));

      return res.status(200).json({ success: true, data: shaped });
    }

    // ✅ For non-super admins: Check branch
    if (!userBranchId) {
      return res.status(403).json({
        success: false,
        error: 'Your account is not assigned to a branch'
      });
    }

    // ✅ Get all users in this branch
    const { data: branchUsers } = await supabase
      .from('profiles')
      .select('id')
      .eq('branch_id', userBranchId)
      .eq('status', 'Active');

    const userIds = branchUsers?.map(u => u.id) || [];

    if (userIds.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    // ✅ Get job postings created by users in this branch
    let query = supabase
      .from('job_postings')
      .select(`
        *,
        departments ( id, department_name ),
        positions ( id, position_name ),
        profiles:created_by (id, first_name, last_name, branch_id, branches:branch_id (id, name, location)),
        job_applications ( id )
      `)
      .in('created_by', userIds)
      .order('posted_date', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    const shaped = (data || []).map((row) => ({
      ...row,
      applications: row.job_applications?.length || 0,
    }));

    console.log(`✅ Found ${shaped.length} job postings in branch`);

    res.status(200).json({ success: true, data: shaped });
  } catch (error) {
    console.error('Error fetching job postings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch job postings.' });
  }
});

// GET /api/hr/job-postings/:id — single posting (with branch check)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;

    const { data, error } = await supabase
      .from('job_postings')
      .select(`
        *,
        departments ( id, department_name ),
        positions ( id, position_name ),
        profiles:created_by (id, first_name, last_name, branch_id, branches:branch_id (id, name, location))
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Job posting not found.' });

    // ✅ Check if user has access
    if (!isSuperAdmin) {
      const creatorBranchId = data.profiles?.branch_id;
      if (!creatorBranchId || creatorBranchId !== userBranchId) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to view this job posting'
        });
      }
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching job posting:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch job posting.' });
  }
});

// POST /api/hr/job-postings — create a posting (with branch check and auto-location)
router.post('/', async (req, res) => {
  try {
    const {
      title, description, department_id, position_id, location,
      employment_type, salary_min, salary_max, requirements,
      responsibilities, benefits, status, closing_date, source_request_id,
    } = req.body;

    const userId = req.user?.id;
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;

    console.log(`📋 Creating job posting: ${title}`);
    console.log(`👤 User: ${userId}`);
    console.log(`🏢 Branch: ${userBranchId}`);

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Job title is required.' });
    }

    // ✅ Check if user belongs to a branch
    if (!isSuperAdmin && !userBranchId) {
      return res.status(403).json({
        success: false,
        error: 'Your account is not assigned to a branch'
      });
    }

    // ✅ Auto-fill location from branch if not provided
    let locationValue = location;
    if (!locationValue && userBranchId) {
      const { data: branch, error: branchError } = await supabase
        .from('branches')
        .select('location, name')
        .eq('id', userBranchId)
        .single();
      
      if (!branchError && branch) {
        locationValue = branch.location || branch.name || '';
        console.log(`📍 Auto-filled location from branch: ${locationValue}`);
      }
    }

    // ✅ If source_request_id is provided, verify the request belongs to this branch
    if (source_request_id && !isSuperAdmin) {
      const { data: request } = await supabase
        .from('hr_resource_requests')
        .select('requested_by')
        .eq('id', source_request_id)
        .single();

      if (request) {
        const { data: requester } = await supabase
          .from('profiles')
          .select('branch_id')
          .eq('id', request.requested_by)
          .single();

        if (!requester || requester.branch_id !== userBranchId) {
          return res.status(403).json({
            success: false,
            error: 'You do not have permission to create a job posting from this resource request'
          });
        }
      }
    }

    const { data, error } = await supabase
      .from('job_postings')
      .insert({
        title: title.trim(),
        description: description?.trim() || null,
        department_id: department_id || null,
        position_id: position_id || null,
        location: locationValue,
        employment_type: employment_type || 'Full-time',
        salary_min: salary_min || null,
        salary_max: salary_max || null,
        requirements: requirements?.trim() || null,
        responsibilities: responsibilities?.trim() || null,
        benefits: benefits?.trim() || null,
        status: status || 'Active',
        closing_date: closing_date || null,
        source_request_id: source_request_id || null,
        created_by: userId || null,
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

// PUT /api/hr/job-postings/:id — update a posting (with branch check)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title, description, department_id, position_id, location,
      employment_type, salary_min, salary_max, requirements,
      responsibilities, benefits, status, closing_date, source_request_id,
    } = req.body;

    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;

    console.log(`📋 Updating job posting: ${id}`);

    // ✅ Check if user has access to update this posting
    if (!isSuperAdmin) {
      const { data: existing } = await supabase
        .from('job_postings')
        .select('created_by, profiles:created_by (branch_id)')
        .eq('id', id)
        .single();

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Job posting not found.' });
      }

      const creatorBranchId = existing.profiles?.branch_id;
      if (!creatorBranchId || creatorBranchId !== userBranchId) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to update this job posting'
        });
      }
    }

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
        location: location || null,
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

// DELETE /api/hr/job-postings/:id — delete a posting (with branch check)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;

    console.log(`📋 Deleting job posting: ${id}`);

    // ✅ Check if user has access to delete this posting
    if (!isSuperAdmin) {
      const { data: existing } = await supabase
        .from('job_postings')
        .select('created_by, profiles:created_by (branch_id)')
        .eq('id', id)
        .single();

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Job posting not found.' });
      }

      const creatorBranchId = existing.profiles?.branch_id;
      if (!creatorBranchId || creatorBranchId !== userBranchId) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to delete this job posting'
        });
      }
    }

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