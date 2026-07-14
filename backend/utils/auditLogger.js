const supabase = require('../supabase');
const jwt = require('jsonwebtoken');

/**
 * Resolve the actor ID from the request object
 * ✅ FIXED: Uses req.user from middleware instead of extra auth.getUser() call
 */
const resolveActorId = async (req) => {
  // ✅ PRIMARY: Use already-verified user from middleware
  if (req?.user?.id) {
    return req.user.id;
  }

  // ⚠️ FALLBACK: Try to decode token without extra network call
  const authHeader = req?.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  try {
    const token = authHeader.split(' ')[1];
    
    // ✅ Try to decode without verification (faster, no network call)
    const decoded = jwt.decode(token);
    if (decoded?.sub) {
      return decoded.sub;
    }
    
    // Only verify if decode fails (rare - should almost never happen)
    // This is the only case where we make the extra call
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return data.user.id;
  } catch (error) {
    console.warn('⚠️ Failed to resolve actor ID:', error.message);
    return null;
  }
};

/**
 * Log an audit event
 * @param {Object} params
 * @param {Object} params.req - Express request object (with user from middleware)
 * @param {string} params.userId - User ID (optional if req provided)
 * @param {string} params.action - Action being performed
 * @param {string} params.systemCategory - System category
 * @param {string} params.logDescription - Description of the event
 */
const logAuditEvent = async ({ 
  req = null, 
  userId = null, 
  action, 
  systemCategory, 
  logDescription 
}) => {
  try {
    // ✅ Prefer userId, then req.user, then fallback
    let actorId = userId;
    
    if (!actorId && req) {
      actorId = await resolveActorId(req);
    }

    // If still no actor ID, log as system
    if (!actorId) {
      console.warn('⚠️ Audit log: No actor ID found, logging as system');
      actorId = 'system';
    }

    await supabase.from('audit_logs').insert({
      user_id: actorId,
      action,
      system_category: systemCategory,
      log_description: logDescription,
      created_at: new Date().toISOString(),
    });
    
  } catch (error) {
    console.warn('⚠️ Audit log write failed:', error.message);
  }
};

/**
 * Log an audit event with explicit user ID (bypasses resolution)
 * Use this when you already have the user ID
 */
const logAuditEventWithUserId = async ({ 
  userId, 
  action, 
  systemCategory, 
  logDescription 
}) => {
  if (!userId) {
    console.warn('⚠️ Audit log: No userId provided, skipping');
    return;
  }

  try {
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      system_category: systemCategory,
      log_description: logDescription,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('⚠️ Audit log write failed:', error.message);
  }
};

module.exports = {
  logAuditEvent,
  logAuditEventWithUserId,
  resolveActorId,
};