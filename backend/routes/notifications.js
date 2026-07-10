const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// GET notifications for a specific user
// Usage: GET /api/notifications?userId=UUID
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, text, read, created_at')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH mark all as read for a user
router.patch('/mark-all-read', async (req, res) => {
  try {
    const { userId } = req.body;

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', userId)
      .eq('read', false);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE one notification
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;