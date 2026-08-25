// backend/routes/ResourceManager/resourceRequests.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

console.log('✅ RM resourceRequests route loaded');

// GET /api/rm/resource-requests -> requests submitted by the logged-in RM
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('hr_resource_requests')
      .select('*')
      .eq('requested_by', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching resource requests:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('❌ Error in GET /resource-requests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/rm/resource-requests -> create a new request
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

    if (!requestTitle || !department || !position || !reason || !startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

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
        requested_by: req.user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating resource request:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('❌ Error in POST /resource-requests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;