// backend/routes/HumanResource/resourceRequests.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

console.log('✅ HR resourceRequests route loaded');

// GET /api/hr/resource-requests -> all requests, with requester/reviewer names
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('hr_resource_requests')
      .select(`
        *,
        requester:profiles!hr_resource_requests_requested_by_fkey(first_name,last_name,employee_id),
        reviewer:profiles!hr_resource_requests_reviewed_by_fkey(first_name,last_name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching resource requests:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('❌ Error in GET /hr/resource-requests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/hr/resource-requests/:id/approve
router.patch('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body || {};

    const { data, error } = await supabase
      .from('hr_resource_requests')
      .update({
        status: 'Approved',
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        hr_notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Error approving resource request:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    if (!data) return res.status(404).json({ success: false, error: 'Request not found' });

    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Error in approve resource request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/hr/resource-requests/:id/reject
router.patch('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body || {};

    const { data, error } = await supabase
      .from('hr_resource_requests')
      .update({
        status: 'Rejected',
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        hr_notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Error rejecting resource request:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    if (!data) return res.status(404).json({ success: false, error: 'Request not found' });

    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Error in reject resource request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;