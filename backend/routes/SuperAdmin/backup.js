// backend/routes/SuperAdmin/backup.js
// Super Admin only: download a full data backup, or restore from one.
//
//   GET  /api/superadmin/backup/export?includeAuth=true|false   -> rmrs-backup-<date>.json.gz
//   POST /api/superadmin/backup/restore  (multipart: file, confirm=RESTORE, restoreAuth, mode=missing|overwrite)
//
// The backup is STREAMED to the browser (never stored in Supabase), so it does
// not eat into the 1 GB storage / 500 MB database quota.
//
// NOT included (by design): the actual files in Storage buckets
// (documents / resumes / ml-models) and Auth password hashes.

const express = require('express');
const zlib = require('zlib');
const crypto = require('crypto');
const multer = require('multer');
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');

const router = express.Router();

const BACKUP_VERSION = 1;
const PAGE_SIZE = 1000;      // PostgREST returns max 1000 rows per request
const UPSERT_BATCH = 500;
const MAX_PASSES = 3;        // retry passes for foreign-key ordering issues

// Parents first, so foreign keys resolve when restoring.
// (user_login_attempts is intentionally skipped: it is transient lockout state.)
const BACKUP_TABLES = [
  // reference / lookup data
  'branches', 'departments', 'positions',
  'skills', 'skill_components', 'skill_aliases',
  'system_settings',
  // people
  'profiles', 'admins',
  // HR / recruitment
  'job_postings', 'job_applications', 'interviews',
  'hired_employees', 'hr_resource_requests',
  // projects & staffing
  'projects', 'project_resource_requirements', 'requirement_skills',
  'project_resource_requirements_history',
  'project_assignments', 'project_tasks', 'project_report',
  // employee records & ML training data
  'documents', 'employee_skills',
  'feedback_requests', 'feedback_responses', 'feedback_training',
  'performance_records',
  // logs / misc
  'notifications', 'audit_logs', 'contact_requests',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

const requireSuperAdmin = (req, res, next) => {
  if (!req.user?.is_super_admin) {
    return res.status(403).json({ success: false, message: 'Super Admin access required' });
  }
  next();
};

const isMissingTableError = (err) =>
  err && (err.code === '42P01' || err.code === 'PGRST205' ||
    /does not exist|schema cache/i.test(err.message || ''));

// ---------- helpers ----------

async function listAllAuthUsers() {
  const out = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users || [];
    for (const u of users) {
      out.push({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        user_metadata: u.user_metadata || {},
      });
    }
    if (users.length < 1000) break;
    page++;
  }
  return out;
}

async function fetchPage(table, from, useOrder) {
  let q = supabase.from(table).select('*');
  if (useOrder) q = q.order('id', { ascending: true });
  return q.range(from, from + PAGE_SIZE - 1);
}

// ---------- EXPORT ----------

router.get('/backup/export', requireSuperAdmin, async (req, res) => {
  const includeAuth = req.query.includeAuth !== 'false';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="rmrs-backup-${stamp}.json.gz"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

  const gz = zlib.createGzip();
  gz.pipe(res);
  const write = (s) =>
    new Promise((resolve) => { if (gz.write(s)) resolve(); else gz.once('drain', resolve); });

  const summary = {};
  const skipped = {};

  try {
    await write(
      `{"version":${BACKUP_VERSION},` +
      `"created_at":${JSON.stringify(new Date().toISOString())},` +
      `"created_by":${JSON.stringify(req.user.email || req.user.id)},` +
      `"tables":{`
    );

    let firstTable = true;
    for (const table of BACKUP_TABLES) {
      let useOrder = true;
      let { data, error } = await fetchPage(table, 0, useOrder);
      if (error && !isMissingTableError(error)) {
        // table may not have an "id" column -> retry unordered
        useOrder = false;
        ({ data, error } = await fetchPage(table, 0, useOrder));
      }
      if (error) {
        skipped[table] = error.message;
        continue;
      }

      await write(`${firstTable ? '' : ','}${JSON.stringify(table)}:[`);
      firstTable = false;

      let count = 0;
      let from = 0;
      for (;;) {
        if (data.length) {
          await write((count ? ',' : '') + data.map((r) => JSON.stringify(r)).join(','));
          count += data.length;
        }
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
        const next = await fetchPage(table, from, useOrder);
        if (next.error) throw new Error(`${table}: ${next.error.message}`);
        data = next.data;
      }
      await write(']');
      summary[table] = count;
    }
    await write('}');

    if (includeAuth) {
      const users = await listAllAuthUsers();
      await write(`,"auth_users":${JSON.stringify(users)}`);
      summary.auth_users = users.length;
    }

    await write(`,"summary":${JSON.stringify(summary)},"skipped":${JSON.stringify(skipped)}}`);
    gz.end();

    await logAuditEvent({
      req,
      action: 'Backup',
      systemCategory: 'System Settings',
      logDescription: `Data backup downloaded (${Object.values(summary).reduce((a, b) => a + b, 0)} records)`,
    });
  } catch (err) {
    console.error('❌ Backup export failed:', err);
    // Abort the stream so the browser sees a FAILED download,
    // never a silently incomplete "successful" file.
    gz.destroy();
    res.destroy(err);
  }
});

// ---------- RESTORE ----------

async function upsertTable(table, rows, missingOnly) {
  // missingOnly = true : INSERT ... ON CONFLICT DO NOTHING   (existing rows are left untouched)
  // missingOnly = false: INSERT ... ON CONFLICT DO UPDATE    (existing rows are overwritten)
  const opts = missingOnly ? { ignoreDuplicates: true, count: 'exact' } : {};
  let processed = 0;      // rows handled without error
  let added = 0;          // rows newly inserted (missing-only mode)
  let countKnown = missingOnly;
  let skipped = 0;        // rows blocked because newer data already uses the same unique value
  let firstError = null;

  const tally = (n, count) => {
    processed += n;
    if (missingOnly) { if (typeof count === 'number') added += count; else countKnown = false; }
  };
  const result = (extra = {}) => ({
    processed, skipped, added: countKnown ? added : null, error: firstError, ...extra,
  });

  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error, count } = await supabase.from(table).upsert(batch, opts);
    if (!error) { tally(batch.length, count); continue; }

    if (isMissingTableError(error)) return result({ error, missing: true });
    if (error.code === '23503') {           // FK not there yet -> retry in a later pass
      firstError = firstError || error;
      continue;
    }
    // Bad row inside the batch: salvage the good ones one-by-one.
    console.warn(`⚠️ [restore] ${table}: batch ${i}-${i + batch.length} failed (${error.code || '?'}: ${error.message}) - retrying row by row`);
    let consecutiveFails = 0;
    for (const row of batch) {
      const r = await supabase.from(table).upsert(row, opts);
      if (!r.error) { tally(1, r.count); consecutiveFails = 0; continue; }
      if (missingOnly && r.error.code === '23505') { skipped++; continue; } // a newer record already uses this value
      firstError = firstError || r.error;
      // Same error over and over = systematic problem, not one bad row.
      if (++consecutiveFails >= 5) {
        console.warn(`⚠️ [restore] ${table}: 5 rows in a row failed, skipping rest of this batch`);
        break;
      }
    }
  }
  return result();
}

router.post('/backup/restore', requireSuperAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No backup file uploaded' });
    }
    if (req.body.confirm !== 'RESTORE') {
      return res.status(400).json({ success: false, message: 'Confirmation text missing' });
    }

    let buf = req.file.buffer;
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);

    let backup;
    try { backup = JSON.parse(buf.toString('utf8')); }
    catch { return res.status(400).json({ success: false, message: 'File is not a valid backup (bad JSON / incomplete download)' }); }

    if (!backup || backup.version !== BACKUP_VERSION || typeof backup.tables !== 'object') {
      return res.status(400).json({ success: false, message: 'Not an RMRS backup file or unsupported version' });
    }

    // 'missing' (default, safest): only put back records that no longer exist.
    // 'overwrite': also revert edited records to the backup version.
    const missingOnly = (req.body.mode || 'missing') !== 'overwrite';
    const report = { auth: null, tables: {} };
    const acc = {};   // per-table "added" totals across retry passes

    console.log(`[restore] started - backup dated ${backup.created_at}`);
    // 1) Auth users first (profiles.id references auth.users)
    if (req.body.restoreAuth !== 'false' && Array.isArray(backup.auth_users)) {
      const existing = new Set((await listAllAuthUsers()).map((u) => u.id));
      const a = { created: 0, already_exists: 0, failed: 0 };
      for (const u of backup.auth_users) {
        if (existing.has(u.id)) { a.already_exists++; continue; }
        const { error } = await supabase.auth.admin.createUser({
          id: u.id,
          email: u.email,
          email_confirm: true,
          user_metadata: u.user_metadata || {},
          // Password hashes cannot be exported; user must use "Forgot Password".
          password: crypto.randomBytes(24).toString('base64url') + 'Aa1!',
        });
        if (error) a.failed++; else a.created++;
      }
      report.auth = a;
    }

    // 2) Tables, parents first, with retry passes for FK ordering
    let pending = BACKUP_TABLES.filter(
      (t) => Array.isArray(backup.tables[t]) && backup.tables[t].length
    );
    for (let pass = 1; pass <= MAX_PASSES && pending.length; pass++) {
      const retry = [];
      for (const table of pending) {
        const t0 = Date.now();
        const r = await upsertTable(table, backup.tables[table], missingOnly);
        acc[table] = acc[table] || { added: 0, known: true };
        if (r.added === null) acc[table].known = false; else acc[table].added += r.added;
        console.log(`[restore] pass ${pass} ${table}: ${r.processed}/${backup.tables[table].length} checked` +
          `${missingOnly && r.added !== null ? `, ${r.added} added` : ''}${r.skipped ? `, ${r.skipped} skipped` : ''} in ${Date.now() - t0}ms` +
          `${r.error ? ' (error: ' + r.error.message + ')' : ''}`);
        if (r.missing) {
          report.tables[table] = { processed: 0, added: 0, skipped: 0, error: 'table does not exist in this database' };
        } else if (r.error && pass < MAX_PASSES) {
          retry.push(table);
        } else {
          report.tables[table] = {
            processed: r.processed,
            added: missingOnly ? (acc[table].known ? acc[table].added : null) : null,
            skipped: r.skipped,
            error: r.error ? r.error.message : null,
          };
        }
      }
      pending = retry;
    }

    console.log('[restore] finished');
    const tables = Object.values(report.tables);
    const totalProcessed = tables.reduce((n, t) => n + t.processed, 0);
    const totalSkipped = tables.reduce((n, t) => n + t.skipped, 0);
    const totalAdded = missingOnly && tables.every((t) => t.added !== null)
      ? tables.reduce((n, t) => n + t.added, 0) : null;
    const failedTables = Object.entries(report.tables).filter(([, t]) => t.error).map(([n]) => n);

    await logAuditEvent({
      req,
      action: 'Restore',
      systemCategory: 'System Settings',
      logDescription: `Database restored from backup dated ${backup.created_at} ` +
        `(mode: ${missingOnly ? 'missing records only' : 'overwrite'}; ` +
        `${missingOnly && totalAdded !== null ? totalAdded + ' records added' : totalProcessed + ' records processed'}` +
        `${failedTables.length ? `, issues in: ${failedTables.join(', ')}` : ''})`,
    });

    res.json({
      success: true,
      mode: missingOnly ? 'missing' : 'overwrite',
      backup_created_at: backup.created_at,
      total_processed: totalProcessed,
      total_added: totalAdded,
      total_skipped: totalSkipped,
      report,
    });
  } catch (err) {
    console.error('❌ Restore failed:', err);
    res.status(500).json({ success: false, message: 'Restore failed', error: err.message });
  }
});

module.exports = router;