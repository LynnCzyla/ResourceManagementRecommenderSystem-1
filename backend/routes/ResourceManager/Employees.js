const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');


/**
 * GET /api/rm/employees
 * Powers RMEmployeeDirectoryTab.jsx
 */
router.get('/employees', async (req, res) => {
  try {
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select(`
        id,
        employee_id,
        first_name,
        last_name,
        avatar_url,
        status,
        positions ( position_name ),
        departments ( department_name ),
        employee_skills ( skills ( skill_name ) )
      `)
      .eq('status', 'Active');
    if (profErr) throw profErr;

    const { data: documents, error: docErr } = await supabase
      .from('documents')
      .select('id, employee_id, file_name, created_at')
      .eq('document_type', 'Certificate');
    if (docErr) throw docErr;

    const employees = (profiles || []).map((p) => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unnamed';
      const fallbackAvatar = `https://ui-avatars.com/api/?background=3b82f6&color=fff&name=${encodeURIComponent(name)}`;
      const certifications = (documents || [])
        .filter((d) => d.employee_id === p.employee_id)
        .map((d) => ({
          id: d.id,
          name: d.file_name,
          issuer: 'WEA Records', // documents table has no "issuer" column
          date: d.created_at ? d.created_at.split('T')[0] : '',
        }));

      return {
        id: p.id,
        employeeId: p.employee_id,
        name,
        avatar: p.avatar_url || fallbackAvatar,
        role: p.positions?.position_name || 'Unassigned',
        department: p.departments?.department_name || 'Unassigned',
        skills: (p.employee_skills || []).map((es) => es.skills?.skill_name).filter(Boolean),
        certifications,
        // "isVerified" has no backing column yet — see the migration note in this
        // file's header / the README. Defaults to false until you add the column.
        isVerified: p.is_verified || false,
      };
    });

    res.json({ success: true, employees });
  } catch (err) {
    console.error('RM employees list error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/rm/employees/:id/verify
 * Toggles a "verified profile" flag.
 *
 * ⚠️ Requires a new column, since profiles has nothing like this today:
 *   ALTER TABLE public.profiles ADD COLUMN is_verified boolean NOT NULL DEFAULT false;
 * Remove/ignore this route until that column exists, or the update below will fail.
 */
router.patch('/employees/:id/verify', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('profiles')
      .select('is_verified')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    const { data, error } = await supabase
      .from('profiles')
      .update({ is_verified: !existing.is_verified })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    res.json({ success: true, employee: data });
  } catch (err) {
    console.error('RM verify toggle error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/rm/employees/:id/assign
 * body: { projectId, startDate, role, notes }
 * Assigns an employee to a project from the directory card's modal.
 */
router.post('/employees/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { projectId, startDate, role, notes } = req.body;

  if (!projectId || !startDate) {
    return res.status(400).json({ success: false, error: 'projectId and startDate are required' });
  }

  try {
    const { data, error } = await supabase
      .from('project_assignments')
      .insert({
        project_id: projectId,
        profile_id: id,
        assigned_role: role || null,
        start_date: startDate,
        status: 'Assigned',
        assigned_by: req.user?.id || null,
      })
      .select()
      .single();
    if (error) throw error;

    // project_assignments has no "notes" column — logging it to audit_logs instead
    // so it isn't silently dropped.
    if (notes) {
      await supabase.from('audit_logs').insert({
        user_id: req.user?.id || null,
        action: 'ASSIGN_EMPLOYEE',
        system_category: 'Resource Manager',
        log_description: `Assigned profile ${id} to project ${projectId}. Notes: ${notes}`,
      });
    }

    res.json({ success: true, assignment: data });
  } catch (err) {
    console.error('RM assign employee error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;