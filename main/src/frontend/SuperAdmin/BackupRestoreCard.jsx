import React, { useRef, useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config/api';
import { getStoredToken } from '../../lib/supabaseClient';

export default function BackupRestoreCard() {
  const fileRef = useRef(null);

  // ── backup state ──────────────────────────────────────────────────────────
  const [includeAuth, setIncludeAuth]   = useState(true);
  const [branches, setBranches]         = useState([]);
  const [branchId, setBranchId]         = useState('all');
  const [loadingBranches, setLoadingBranches] = useState(true);

  // ── restore state ─────────────────────────────────────────────────────────
  const [restoreAuth, setRestoreAuth]   = useState(true);
  const [mode, setMode]                 = useState('missing'); // 'missing' | 'overwrite'
  const [file, setFile]                 = useState(null);
  const [confirmText, setConfirmText]   = useState('');

  // ── shared state ──────────────────────────────────────────────────────────
  const [busy, setBusy]   = useState(null); // 'backup' | 'restore' | null
  const [msg, setMsg]     = useState(null); // { type: 'ok'|'err', text, details }

  // ── confirmation modal state ──────────────────────────────────────────────
  const [modal, setModal] = useState(null);
  // modal = { action: 'backup'|'restore', title, body, onConfirm }

  // ── helpers ───────────────────────────────────────────────────────────────
  const authHeaders = () => {
    const token = getStoredToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Load branches on mount
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/superadmin/backup/branches`, {
          headers: authHeaders(),
        });
        const j = await res.json().catch(() => ({}));
        if (j.success) setBranches(j.data || []);
      } catch {
        // non-fatal – dropdown will just show "All Branches"
      } finally {
        setLoadingBranches(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── backup ────────────────────────────────────────────────────────────────
  const doBackup = async () => {
    setBusy('backup');
    setMsg(null);
    setModal(null);
    try {
      const params = new URLSearchParams({
        includeAuth: String(includeAuth),
        branchId,
      });
      const res = await fetch(
        `${API_BASE_URL}/api/superadmin/backup/export?${params}`,
        { headers: authHeaders() }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `Backup failed (${res.status})`);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match
        ? match[1]
        : `rmrs-backup-${new Date().toISOString().slice(0, 10)}.json.gz`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const branchLabel =
        branchId === 'all'
          ? 'all branches'
          : branches.find((b) => b.id === branchId)?.name || branchId;
      setMsg({
        type: 'ok',
        text: `✅ Backup downloaded: ${filename} (${(blob.size / 1024).toFixed(0)} KB) — ${branchLabel}. Store it OUTSIDE Supabase.`,
      });
    } catch (err) {
      setMsg({ type: 'err', text: err.message || 'Backup failed' });
    } finally {
      setBusy(null);
    }
  };

  const handleBackupClick = () => {
    const branchLabel =
      branchId === 'all'
        ? 'ALL branches'
        : `branch "${branches.find((b) => b.id === branchId)?.name || branchId}"`;
    setModal({
      action: 'backup',
      title: 'Confirm Download',
      body: `You are about to download a backup for ${branchLabel}.${
        includeAuth ? ' Login accounts (emails) will be included.' : ''
      }\n\nProceed?`,
      onConfirm: doBackup,
    });
  };

  // ── restore ───────────────────────────────────────────────────────────────
  const doRestore = async () => {
    setBusy('restore');
    setMsg(null);
    setModal(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('confirm', 'RESTORE');
      form.append('restoreAuth', String(restoreAuth));
      form.append('mode', mode);

      const res = await fetch(`${API_BASE_URL}/api/superadmin/backup/restore`, {
        method: 'POST',
        headers: authHeaders(),
        body: form,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.message || `Restore failed (${res.status})`);

      const issues = Object.entries(j.report.tables)
        .filter(([, t]) => t.error)
        .map(([name, t]) => `${name}: ${t.error}`);
      const authNote = j.report.auth
        ? ` Auth users recreated: ${j.report.auth.created} (they must use "Forgot Password").`
        : '';
      const when = new Date(j.backup_created_at).toLocaleString();
      let summary;
      if (j.mode === 'missing') {
        summary =
          j.total_added === null
            ? `Checked ${j.total_processed} records from backup dated ${when}; missing ones were put back.`
            : j.total_added === 0
            ? `Nothing was missing. All ${j.total_processed} records from the backup (dated ${when}) already exist.`
            : `Put back ${j.total_added} missing records (checked ${j.total_processed}, the rest already existed). Backup dated ${when}.`;
      } else {
        summary = `Restored ${j.total_processed} records from backup dated ${when} (existing records overwritten).`;
      }
      if (j.total_skipped > 0) {
        summary += ` ${j.total_skipped} records were skipped because newer data already uses the same unique value.`;
      }
      setMsg({
        type: issues.length ? 'err' : 'ok',
        text: `${summary}${authNote}`,
        details: issues,
      });
      setFile(null);
      setConfirmText('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setMsg({ type: 'err', text: err.message || 'Restore failed' });
    } finally {
      setBusy(null);
    }
  };

  const handleRestoreClick = () => {
    setModal({
      action: 'restore',
      title: 'Confirm Restore',
      body: `You are about to restore data from the file "${file?.name}".\n\nMode: ${
        mode === 'missing' ? 'Put back missing records only' : 'Overwrite with backup version'
      }${restoreAuth ? '\n• Missing login accounts will be recreated.' : ''}\n\n⚠️ This cannot be undone. Proceed?`,
      onConfirm: doRestore,
    });
  };

  const canRestore = !!file && confirmText === 'RESTORE' && !busy;

  return (
    <>
      {/* ── Confirmation Modal ─────────────────────────────────────────────── */}
      {modal && (
        <div style={styles.overlay}>
          <div style={styles.modalBox}>
            <h4 style={styles.modalTitle}>{modal.title}</h4>
            <p style={styles.modalBody}>
              {modal.body.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  <br />
                </React.Fragment>
              ))}
            </p>
            <div style={styles.modalActions}>
              <button
                style={styles.modalCancelBtn}
                onClick={() => setModal(null)}
                disabled={!!busy}
              >
                Cancel
              </button>
              <button
                style={
                  modal.action === 'restore'
                    ? styles.modalDangerBtn
                    : styles.modalPrimaryBtn
                }
                onClick={modal.onConfirm}
                disabled={!!busy}
              >
                {busy
                  ? modal.action === 'backup'
                    ? 'Preparing…'
                    : 'Restoring…'
                  : 'Yes, proceed'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Card ─────────────────────────────────────────────────────── */}
      <div className="glass-card" style={styles.card}>
        <h3 style={styles.title}>Backup &amp; Restore</h3>
        <p style={styles.desc}>
          Downloads all system data (accounts, projects, assignments, employee skills, documents
          metadata, feedback, audit logs) as one compressed file. The file goes to{' '}
          <b>your computer</b>, not to Supabase, so it does not use your storage quota.
        </p>

        {msg && (
          <div style={{ ...styles.alert, ...(msg.type === 'ok' ? styles.ok : styles.err) }}>
            <div>{msg.text}</div>
            {msg.details?.length > 0 && (
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                {msg.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── Section 1: Download backup ──────────────────────────────────── */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>1. Download backup</div>

          {/* Branch selector */}
          <label style={styles.fieldLabel}>Select scope</label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            style={styles.select}
            disabled={loadingBranches || !!busy}
          >
            <option value="all">🌐 All Branches (full system backup)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                🏢 {b.name}
              </option>
            ))}
          </select>

          <label style={styles.check}>
            <input
              type="checkbox"
              checked={includeAuth}
              onChange={(e) => setIncludeAuth(e.target.checked)}
            />
            Include login accounts (emails only — passwords cannot be exported)
          </label>

          <button
            type="button"
            style={styles.primaryBtn}
            onClick={handleBackupClick}
            disabled={!!busy}
          >
            {busy === 'backup' ? 'Preparing backup…' : '⬇️ Download Backup'}
          </button>
        </div>

        {/* ── Section 2: Restore from backup ─────────────────────────────── */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>2. Restore from backup</div>

          <label style={styles.check}>
            <input
              type="radio"
              name="restoreMode"
              checked={mode === 'missing'}
              onChange={() => setMode('missing')}
            />
            <span>
              <b>Put back missing records only</b> (recommended)
            </span>
          </label>
          <p style={{ ...styles.warn, marginLeft: 24, marginTop: -6 }}>
            Deleted records come back. Existing records are NOT touched, so edits and new records
            made after the backup are kept.
          </p>

          <label style={styles.check}>
            <input
              type="radio"
              name="restoreMode"
              checked={mode === 'overwrite'}
              onChange={() => setMode('overwrite')}
            />
            <span>
              <b>Overwrite with backup version</b>
            </span>
          </label>
          <p style={{ ...styles.warn, marginLeft: 24, marginTop: -6 }}>
            Also reverts edited records to how they were at backup time. New records are still kept.
          </p>

          <label style={styles.fieldLabel}>Select backup file</label>
          <input
            ref={fileRef}
            type="file"
            accept=".gz,.json,application/gzip,application/json"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ marginBottom: 12, display: 'block' }}
          />

          <label style={styles.check}>
            <input
              type="checkbox"
              checked={restoreAuth}
              onChange={(e) => setRestoreAuth(e.target.checked)}
            />
            Recreate missing login accounts
          </label>

          <label style={styles.fieldLabel}>Type RESTORE to confirm</label>
          <input
            type="text"
            placeholder="RESTORE"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            style={styles.input}
          />

          <button
            type="button"
            style={{ ...styles.dangerBtn, opacity: canRestore ? 1 : 0.5 }}
            onClick={handleRestoreClick}
            disabled={!canRestore}
          >
            {busy === 'restore' ? 'Restoring… do not close this page' : '♻️ Restore Backup'}
          </button>
        </div>
      </div>
    </>
  );
}

const styles = {
  card: { padding: '28px', marginTop: '8px', marginBottom: '32px', textAlign: 'left' },
  title: {
    fontSize: '16px', fontWeight: '700', color: 'var(--color-text-primary)',
    marginBottom: '12px', borderBottom: '1px solid var(--color-border)', paddingBottom: '10px',
  },
  desc: { fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: '16px' },
  section: { borderTop: '1px solid var(--color-border)', paddingTop: '16px', marginTop: '16px' },
  sectionTitle: { fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '12px' },
  fieldLabel: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  check: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '12px', color: 'var(--color-text-primary)' },
  warn: { fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.4, marginBottom: '12px' },
  select: {
    display: 'block', width: '100%', maxWidth: '380px', padding: '10px 12px', marginBottom: '14px',
    borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '13px',
    background: 'var(--color-bg-secondary, #fff)', color: 'var(--color-text-primary)',
    cursor: 'pointer',
  },
  input: {
    display: 'block', width: '100%', maxWidth: '280px', padding: '10px 12px', marginBottom: '14px',
    borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '13px',
  },
  primaryBtn: {
    padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer',
    background: 'var(--color-primary)', color: '#fff', fontWeight: '700', fontSize: '13px',
  },
  dangerBtn: {
    padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer',
    background: '#dc2626', color: '#fff', fontWeight: '700', fontSize: '13px',
  },
  alert: { padding: '12px 14px', borderRadius: '6px', fontSize: '13px', marginBottom: '8px' },
  ok:  { background: 'var(--color-primary-light)', color: 'var(--color-success)', border: '1px solid var(--color-primary)' },
  err: { background: '#fee', color: '#c00', border: '1px solid #fcc' },

  // ── modal ──────────────────────────────────────────────────────────────────
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modalBox: {
    background: 'var(--color-bg-card, #fff)',
    borderRadius: '12px',
    padding: '28px 32px',
    maxWidth: '440px', width: '90%',
    boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
    border: '1px solid var(--color-border)',
  },
  modalTitle: {
    margin: '0 0 14px', fontSize: '17px', fontWeight: '700', color: 'var(--color-text-primary)',
  },
  modalBody: {
    fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.7,
    margin: '0 0 22px', whiteSpace: 'pre-wrap',
  },
  modalActions: { display: 'flex', gap: '10px', justifyContent: 'flex-end' },
  modalCancelBtn: {
    padding: '9px 18px', borderRadius: '6px', border: '1px solid var(--color-border)',
    background: 'transparent', color: 'var(--color-text-primary)', cursor: 'pointer',
    fontSize: '13px', fontWeight: '600',
  },
  modalPrimaryBtn: {
    padding: '9px 18px', borderRadius: '6px', border: 'none', cursor: 'pointer',
    background: 'var(--color-primary)', color: '#fff', fontWeight: '700', fontSize: '13px',
  },
  modalDangerBtn: {
    padding: '9px 18px', borderRadius: '6px', border: 'none', cursor: 'pointer',
    background: '#dc2626', color: '#fff', fontWeight: '700', fontSize: '13px',
  },
};