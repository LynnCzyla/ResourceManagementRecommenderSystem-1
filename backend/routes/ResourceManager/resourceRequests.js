// backend/routes/ResourceManager/resourceRequests.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

console.log('✅ RM resourceRequests route loaded');

// GET /api/rm/resource-requests -> requests submitted by the logged-in RM (filtered by branch)
router.get('/', async (req, res) => {
  try {
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userId = req.user?.id;

    console.log(`📋 Fetching resource requests for user ${userId}`);
    console.log(`🏢 Branch filter: ${isSuperAdmin ? 'ALL' : userBranchId}`);

    // For Super Admin, get all requests
    if (isSuperAdmin) {
      const { data, error } = await supabase
        .from('hr_resource_requests')
        .select(`
          *,
          profiles:requested_by (
            id,
            first_name,
            last_name,
            employee_id,
            branch_id
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching resource requests:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      console.log(`✅ Found ${data?.length || 0} resource requests (Super Admin)`);
      return res.json({ success: true, data: data || [] });
    }

    // For non-super admins, get requests from their branch
    // Step 1: Get all users in this branch
    const { data: branchUsers, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('branch_id', userBranchId)
      .eq('status', 'Active');

    if (userError) {
      console.error('❌ Error fetching branch users:', userError);
      return res.status(500).json({ success: false, error: userError.message });
    }

    const userIds = branchUsers.map(u => u.id);
    console.log(`📁 Found ${userIds.length} users in branch`);

    if (userIds.length === 0) {
      console.log('✅ No users found in branch');
      return res.json({ success: true, data: [] });
    }

    // Step 2: Get requests created by users in this branch
    const { data, error } = await supabase
      .from('hr_resource_requests')
      .select(`
        *,
        profiles:requested_by (
          id,
          first_name,
          last_name,
          employee_id,
          branch_id
        )
      `)
      .in('requested_by', userIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching resource requests:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ Found ${data?.length || 0} resource requests for branch ${userBranchId}`);
    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('❌ Error in GET /resource-requests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/rm/resource-requests/:id - Get single request with branch check
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userId = req.user?.id;

    console.log(`📋 Fetching resource request ${id}`);
    console.log(`🏢 User branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);

    const { data, error } = await supabase
      .from('hr_resource_requests')
      .select(`
        *,
        profiles:requested_by (
          id,
          first_name,
          last_name,
          employee_id,
          branch_id
        )
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ 
        success: false, 
        error: 'Resource request not found' 
      });
    }

    const requestBranchId = data.profiles?.branch_id;

    // ✅ Check if user has access to this request
    if (!isSuperAdmin && requestBranchId !== userBranchId) {
      console.warn(`❌ Access denied: Request branch ${requestBranchId} != User branch ${userBranchId}`);
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view this request'
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Error in GET /resource-requests/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/rm/resource-requests -> create a new request (automatically uses user's branch)
router.post('/', async (req, res) => {
  try {
    const {
      requestTitle,
      department,
      position,
      quantity,
      requiredSkills,
      experienceLevel,
      startDate,
      endDate,
      urgency,
      reason,
    } = req.body;

    const userId = req.user?.id;
    const userBranchId = req.user?.branch_id;

    console.log(`📋 Creating resource request for user ${userId}`);
    console.log(`🏢 User branch: ${userBranchId}`);

    // Validate required fields
    if (!requestTitle || !department || !position || !reason || !startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    // Check if user belongs to a branch
    if (!userBranchId) {
      return res.status(403).json({
        success: false,
        error: 'Your account is not assigned to a branch. Please contact your administrator.'
      });
    }

    // Create the request (branch is determined by the user's branch via requested_by)
    const { data, error } = await supabase
      .from('hr_resource_requests')
      .insert({
        request_title: requestTitle,
        department_name: department,
        position_title: position,
        quantity_needed: Number(quantity) || 1,
        required_skills: requiredSkills || null,
        experience_level: experienceLevel || 'Junior',
        start_date: startDate,
        end_date: endDate,
        urgency: urgency || 'Normal',
        reason,
        status: 'Pending',
        requested_by: userId,
      })
      .select(`
        *,
        profiles:requested_by (
          id,
          first_name,
          last_name,
          employee_id,
          branch_id
        )
      `)
      .single();

    if (error) {
      console.error('❌ Error creating resource request:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ Resource request created with ID: ${data.id}`);
    res.status(201).json({ 
      success: true, 
      data,
      message: 'Resource request created successfully'
    });
  } catch (error) {
    console.error('❌ Error in POST /resource-requests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/rm/resource-requests/:id/status - Update status with branch check
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    const userId = req.user?.id;

    console.log(`📋 Updating resource request ${id} to ${status}`);

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }

    // First, check if user has access to this request
    const { data: existingRequest, error: checkError } = await supabase
      .from('hr_resource_requests')
      .select(`
        id,
        requested_by,
        profiles:requested_by (
          branch_id
        )
      `)
      .eq('id', id)
      .single();

    if (checkError || !existingRequest) {
      return res.status(404).json({
        success: false,
        error: 'Resource request not found'
      });
    }

    const requestBranchId = existingRequest.profiles?.branch_id;

    // ✅ Check if user has access to update this request
    if (!isSuperAdmin && requestBranchId !== userBranchId) {
      console.warn(`❌ Access denied: Request branch ${requestBranchId} != User branch ${userBranchId}`);
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to update this request'
      });
    }

    const { data, error } = await supabase
      .from('hr_resource_requests')
      .update({
        status: status,
        updated_at: new Date().toISOString(),
        updated_by: userId
      })
      .eq('id', id)
      .select(`
        *,
        profiles:requested_by (
          id,
          first_name,
          last_name,
          employee_id,
          branch_id
        )
      `)
      .single();

    if (error) {
      console.error('❌ Error updating resource request:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ Resource request ${id} updated to ${status}`);
    res.json({
      success: true,
      data,
      message: `Resource request status updated to ${status}`
    });
  } catch (error) {
    console.error('❌ Error in PUT /resource-requests/:id/status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/rm/resource-requests/:id - Delete request with branch check
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;

    console.log(`📋 Deleting resource request ${id}`);

    // First, check if user has access to this request
    const { data: existingRequest, error: checkError } = await supabase
      .from('hr_resource_requests')
      .select(`
        id,
        requested_by,
        profiles:requested_by (
          branch_id
        )
      `)
      .eq('id', id)
      .single();

    if (checkError || !existingRequest) {
      return res.status(404).json({
        success: false,
        error: 'Resource request not found'
      });
    }

    const requestBranchId = existingRequest.profiles?.branch_id;

    // ✅ Check if user has access to delete this request
    if (!isSuperAdmin && requestBranchId !== userBranchId) {
      console.warn(`❌ Access denied: Request branch ${requestBranchId} != User branch ${userBranchId}`);
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to delete this request'
      });
    }

    const { error } = await supabase
      .from('hr_resource_requests')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ Error deleting resource request:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ Resource request ${id} deleted`);
    res.json({
      success: true,
      message: 'Resource request deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error in DELETE /resource-requests/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;