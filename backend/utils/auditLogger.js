const supabase = require('../supabase');

const resolveActorId = async (req) => {
  if (req?.user?.id) return req.user.id;

  const authHeader = req?.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  try {
    const token = authHeader.split(' ')[1];
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return data.user.id;
  } catch (error) {
    return null;
  }
};

const logAuditEvent = async ({ req = null, userId = null, action, systemCategory, logDescription }) => {
  try {
    const actorId = userId || (req ? await resolveActorId(req) : null);

    await supabase.from('audit_logs').insert({
      user_id: actorId,
      action,
      system_category: systemCategory,
      log_description: logDescription,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Audit log write failed:', error.message);
  }
};

module.exports = {
  logAuditEvent,
  resolveActorId,
};