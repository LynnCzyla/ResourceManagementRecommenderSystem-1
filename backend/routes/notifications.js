const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { verifyToken } = require('./Middleware/auth');

// Optional/flexible auth: verify token if authorization header is present;
// otherwise fallback to req.query.userId or req.body.userId
const authenticateNotificationUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return verifyToken(req, res, next);
  }
  const userId = req.query.userId || req.body?.userId;
  if (userId) {
    req.user = { id: userId };
    return next();
  }
  return verifyToken(req, res, next);
};

router.use(authenticateNotificationUser);

// GET notifications for a specific user
// Usage: GET /api/notifications?userId=UUID
router.get('/', async (req, res) => {
  try {
    const targetUserId = req.user?.id || req.query.userId;
    if (!targetUserId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, text, read, created_at')
      .eq('recipient_id', targetUserId)
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
    const targetUserId = req.user?.id || req.body?.userId;
    if (!targetUserId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', targetUserId)
      .eq('read', false);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE one notification — only the recipient can delete it
router.delete('/:id', async (req, res) => {
  try {
    const targetUserId = req.user?.id || req.query.userId || req.body?.userId;

    let query = supabase
      .from('notifications')
      .delete()
      .eq('id', req.params.id);

    if (targetUserId) {
      query = query.eq('recipient_id', targetUserId);
    }

    const { error } = await query;

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;