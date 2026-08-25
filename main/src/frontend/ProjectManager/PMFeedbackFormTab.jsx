import React, { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';
import { getProjects, getEmployees } from './pmApi';
import weaLogo from '../../assets/WEA_logo_bgremoved.png';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PM_BASE = 'http://localhost:5000/api/pm';

const STATUS_STYLES = {
  pending: { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', label: 'Pending' },
  sent: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', label: 'Sent' },
  viewed: { bg: 'rgba(168,85,247,0.15)', color: '#a855f7', label: 'Viewed' },
  started: { bg: 'rgba(234,179,8,0.15)', color: '#eab308', label: 'In Progress' },
  completed: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: 'Completed' },
  expired: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Expired' },
};

// Labels used for the "(Status)" suffix next to a project name in the
// dropdown. Keyed by feedback_requests.status (same values as STATUS_STYLES).
const DROPDOWN_STATUS_LABELS = {
  pending: 'Pending',
  sent: 'Feedback Sent',
  viewed: 'Viewed by Client',
  started: 'In Progress',
  completed: 'Completed',
  expired: 'Expired',
};

function defaultIntro(projectName) {
  return `We hope you've been satisfied with the progress of ${projectName || 'your project'}. We'd love to hear your feedback on the team members who worked on it.`;
}

// App.jsx always writes a full user object (with `.id`) to
// localStorage['user'] on login, on session restore, and on every
// getSession()/TOKEN_REFRESHED cycle — see checkSession() and
// handleLogin() in App.jsx. Whatever prop-drilling issue is dropping
// `.id` on the way down to this tab, localStorage is the one place
// that's reliably kept in sync, so we fall back to it rather than
// silently sending createdBy: null/undefined to the backend (which
// now hard-fails with a 400 instead of a cryptic DB error, but it's
// still better to just not fail).
function resolveUserId(user) {
  if (user?.id) return user.id;
  try {
    const stored = JSON.parse(localStorage.getItem('user') || 'null');
    if (stored?.id) {
      console.warn(
        '[PMFeedbackFormTab] `user` prop had no id — falling back to localStorage user.id. ' +
        'This means PMLayout is not passing the current user correctly; worth fixing there too.'
      );
      return stored.id;
    }
  } catch (err) {
    console.error('[PMFeedbackFormTab] Failed to parse localStorage user:', err);
  }
  return undefined;
}

// Same fallback pattern as resolveUserId — used to label the PM's own
// checkbox entry in the "Team Members to Rate" list.
function resolvePmDisplayName(user) {
  const fromProp = user?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' ');
  if (fromProp) return fromProp;
  try {
    const stored = JSON.parse(localStorage.getItem('user') || 'null');
    const fromStorage = stored?.name || [stored?.first_name, stored?.last_name].filter(Boolean).join(' ');
    if (fromStorage) return fromStorage;
  } catch (err) {
    // resolveUserId already logs the parse failure for this same read
  }
  return 'Project Manager (You)';
}

export default function PMFeedbackFormTab({ user }) {
  const effectiveUserId = resolveUserId(user);
  const pmDisplayName = resolvePmDisplayName(user);

  const [formData, setFormData] = useState({
    clientName: '',
    clientEmail: '',
    projectId: '',
    projectName: '',
    introMessage: '',
  });

  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [introTouched, setIntroTouched] = useState(false);

  const [loadError, setLoadError] = useState('');
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSending, setIsSending] = useState(false);

  const [sentRequests, setSentRequests] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [resendingId, setResendingId] = useState(null);

  // Load this PM's real projects for the dropdown
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getProjects(effectiveUserId);
        if (!cancelled) setProjects(data || []);
      } catch (err) {
        console.error('Failed to load projects:', err);
        if (!cancelled) setLoadError(err.message || 'Failed to load projects');
      }
    })();
    return () => { cancelled = true; };
  }, [effectiveUserId]);

  // Load real sent-request history from the backend instead of localStorage
  const loadHistory = async () => {
    if (!effectiveUserId) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`${PM_BASE}/feedback-requests?createdBy=${encodeURIComponent(effectiveUserId)}`);
      const body = await res.json();
      if (!res.ok || body.success === false) throw new Error(body.message || 'Failed to load history');
      setSentRequests(body.data || []);
    } catch (err) {
      console.error('Failed to load feedback request history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => { loadHistory(); }, [effectiveUserId]);

  // Load the employees actually assigned to the selected project, plus the
  // PM themselves — the PM manages the project but isn't in
  // project_assignments, so getEmployees() alone would never surface them
  // as a rateable person.
  useEffect(() => {
    if (!formData.projectId) {
      setEmployees([]);
      setSelectedEmployeeIds([]);
      return;
    }
    let cancelled = false;
    setEmployeesLoading(true);
    (async () => {
      try {
        const data = await getEmployees(undefined, undefined, formData.projectId);
        if (!cancelled) {
          const withoutPm = (data || []).filter(e => e.id !== effectiveUserId);
          const pmEntry = effectiveUserId
            ? [{ id: effectiveUserId, name: pmDisplayName, isPm: true }]
            : [];
          setEmployees([...pmEntry, ...withoutPm]);
          setSelectedEmployeeIds([]);
        }
      } catch (err) {
        console.error('Failed to load project employees:', err);
        if (!cancelled) setEmployees([]);
      } finally {
        if (!cancelled) setEmployeesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [formData.projectId, effectiveUserId, pmDisplayName]);

  // Keep the intro message in sync with the project name unless the PM has
  // started editing it themselves.
  useEffect(() => {
    if (!introTouched) {
      setFormData(prev => ({ ...prev, introMessage: defaultIntro(prev.projectName) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.projectName]);

  // For each project, find its MOST RECENT feedback_requests row (by
  // createdAt) so the dropdown can show "(Completed)" / "(Feedback Sent)"
  // etc. next to the project name. A project with no feedback request yet
  // gets no suffix at all.
  const projectFeedbackStatusMap = useMemo(() => {
    const map = {};
    for (const req of sentRequests) {
      if (!req.projectId) continue;
      const existing = map[req.projectId];
      const reqTime = req.createdAt ? new Date(req.createdAt).getTime() : 0;
      const existingTime = existing?.createdAt ? new Date(existing.createdAt).getTime() : -1;
      if (!existing || reqTime > existingTime) {
        map[req.projectId] = req;
      }
    }
    const statusMap = {};
    for (const [projectId, req] of Object.entries(map)) {
      statusMap[projectId] = req.status || 'pending';
    }
    return statusMap;
  }, [sentRequests]);

  // Projects sorted so ones whose latest feedback request is "completed"
  // sink to the bottom of the dropdown — those don't need action from the
  // PM right now. Everything else (never requested, or still pending/sent/
  // viewed/in progress/expired) stays on top, alphabetical within each group.
  const sortedProjects = useMemo(() => {
    const withStatus = projects.map(p => {
      const feedbackStatus = projectFeedbackStatusMap[p.id] || null;
      return {
        ...p,
        feedbackStatus,
        isDone: feedbackStatus === 'completed',
      };
    });

    return [...withStatus].sort((a, b) => {
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [projects, projectFeedbackStatusMap]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFieldErrors(prev => ({ ...prev, [name]: undefined }));

    if (name === 'projectId') {
      const project = projects.find(p => p.id === value);
      setFormData(prev => ({
        ...prev,
        projectId: value,
        projectName: project ? project.name : '',
      }));
      return;
    }

    if (name === 'introMessage') setIntroTouched(true);
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const toggleEmployee = (id) => {
    setFieldErrors(prev => ({ ...prev, employees: undefined }));
    setSelectedEmployeeIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const validate = () => {
    const errors = {};
    if (!formData.clientName.trim()) errors.clientName = 'Client name is required';
    if (!formData.clientEmail.trim()) errors.clientEmail = 'Client email is required';
    else if (!EMAIL_RE.test(formData.clientEmail.trim())) errors.clientEmail = 'Enter a valid email address';
    if (!formData.projectId) errors.projectId = 'Select a project';
    if (selectedEmployeeIds.length === 0) errors.employees = 'Select at least one team member to rate';
    if (!effectiveUserId) errors.general = 'Could not determine your account — please log out and back in.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => {
    setFormData({ clientName: '', clientEmail: '', projectId: '', projectName: '', introMessage: '' });
    setSelectedEmployeeIds([]);
    setIntroTouched(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSending) return;
    if (!validate()) return;

    setIsSending(true);
    try {
      const res = await fetch(`${PM_BASE}/feedback-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          createdBy: effectiveUserId,
          clientName: formData.clientName.trim(),
          clientEmail: formData.clientEmail.trim(),
          projectId: formData.projectId,
          employeeIds: selectedEmployeeIds,
          introMessage: formData.introMessage.trim(),
          redirectOrigin: window.location.origin,
        }),
      });
      const body = await res.json();

      if (!res.ok || body.success === false) {
        throw new Error(body.message || 'Failed to send feedback request');
      }

      resetForm();
      await loadHistory();

      Swal.fire({
        title: 'Sent!',
        text: `Feedback request emailed to ${formData.clientEmail || 'the client'}.`,
        icon: 'success',
        confirmButtonColor: 'var(--color-primary)',
        confirmButtonText: 'OK',
        background: 'var(--color-bg-card)',
        color: 'var(--color-text-primary)',
      });
    } catch (err) {
      console.error('Failed to send feedback request:', err);
      Swal.fire({
        title: 'Could not send',
        text: err.message || 'Something went wrong while sending the feedback request.',
        icon: 'error',
        confirmButtonColor: 'var(--color-primary)',
        background: 'var(--color-bg-card)',
        color: 'var(--color-text-primary)',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleResend = async (request) => {
    if (resendingId) return;
    setResendingId(request.id);
    try {
      const res = await fetch(`${PM_BASE}/feedback-requests/${request.id}/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirectOrigin: window.location.origin }),
    });
      const body = await res.json();
      if (!res.ok || body.success === false) throw new Error(body.message || 'Failed to resend');
      await loadHistory();
      Swal.fire({
        title: 'Resent!',
        text: `Feedback request re-emailed to ${request.clientEmail}.`,
        icon: 'success',
        confirmButtonColor: 'var(--color-primary)',
        background: 'var(--color-bg-card)',
        color: 'var(--color-text-primary)',
      });
    } catch (err) {
      Swal.fire({
        title: 'Could not resend',
        text: err.message || 'Something went wrong.',
        icon: 'error',
        confirmButtonColor: 'var(--color-primary)',
        background: 'var(--color-bg-card)',
        color: 'var(--color-text-primary)',
      });
    } finally {
      setResendingId(null);
    }
  };

  const copyLink = async (link) => {
    try {
      await navigator.clipboard.writeText(link);
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Link copied',
        showConfirmButton: false,
        timer: 1500,
        background: 'var(--color-bg-card)',
        color: 'var(--color-text-primary)',
      });
    } catch {
      // clipboard API unavailable; ignore silently
    }
  };

  const selectedProject = useMemo(
    () => projects.find(p => p.id === formData.projectId),
    [projects, formData.projectId]
  );

  const styles = {
    container: { padding: '24px' },
    header: { marginBottom: '32px' },
    title: { fontSize: '28px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' },
    subtitle: { fontSize: '15px', color: 'var(--color-text-secondary)' },
    card: { padding: '24px', marginBottom: '24px' },
    form: { display: 'flex', flexDirection: 'column', gap: '20px' },
    formRow: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
    label: { fontSize: '14px', fontWeight: '600', color: 'var(--color-text-secondary)' },
    input: {
      padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--color-border)',
      background: 'var(--color-bg-root)', color: 'var(--color-text-primary)', fontSize: '14px', outline: 'none',
    },
    select: {
      padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--color-border)',
      background: 'var(--color-bg-root)', color: 'var(--color-text-primary)', fontSize: '14px', outline: 'none',
    },
    textarea: {
      padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--color-border)',
      background: 'var(--color-bg-root)', color: 'var(--color-text-primary)', fontSize: '14px',
      outline: 'none', minHeight: '90px', resize: 'vertical', fontFamily: 'inherit',
    },
    employeeGrid: {
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px',
      padding: '14px', border: '1px solid var(--color-border)', borderRadius: '10px',
      background: 'var(--color-bg-root)', maxHeight: '220px', overflowY: 'auto',
    },
    employeeChip: {
      display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
      borderRadius: '8px', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '13px',
      color: 'var(--color-text-primary)',
    },
    employeeChipSelected: {
      borderColor: 'var(--color-primary)', background: 'rgba(59,130,246,0.08)',
    },
    pmBadge: {
      fontSize: '10px', fontWeight: '700', color: 'var(--color-primary)', marginLeft: 'auto',
      letterSpacing: '0.5px',
    },
    emptyNote: { fontSize: '13px', color: 'var(--color-text-muted)' },
    button: {
      padding: '12px 24px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none',
      borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', alignSelf: 'flex-start',
    },
    buttonDisabled: { opacity: 0.6, cursor: 'not-allowed' },
    fieldError: { fontSize: '12px', color: 'var(--color-danger, #ef4444)', marginTop: '-2px' },
    loadError: { fontSize: '13px', color: 'var(--color-danger, #ef4444)', marginBottom: '12px' },
    previewNote: {
      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)',
      borderRadius: '10px', fontSize: '12px', color: 'var(--color-text-muted)',
    },
    previewLogo: { height: '22px', objectFit: 'contain' },
    historySection: { marginTop: '32px' },
    historyTitle: { fontSize: '20px', fontWeight: '600', color: 'var(--color-text-primary)', marginBottom: '16px' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: {
      padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--color-border)',
      color: 'var(--color-text-secondary)', fontWeight: '600', fontSize: '13px',
    },
    td: { padding: '12px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: '14px' },
    link: { color: 'var(--color-primary)', textDecoration: 'none', fontWeight: '500' },
    smallBtn: {
      padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--color-border)',
      background: 'transparent', color: 'var(--color-text-primary)', fontSize: '12px', cursor: 'pointer', marginRight: '6px',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Send Feedback Request</h1>
        <p style={styles.subtitle}>Email clients a link so they can rate the team members who worked on their project</p>
      </div>

      <div className="glass-card" style={styles.card}>
        {loadError && <div style={styles.loadError}>{loadError}</div>}
        {fieldErrors.general && <div style={styles.loadError}>{fieldErrors.general}</div>}
        <form onSubmit={handleSubmit} style={styles.form} noValidate>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Client Name *</label>
              <input
                type="text" name="clientName" style={styles.input}
                placeholder="Enter client name" value={formData.clientName} onChange={handleChange}
              />
              {fieldErrors.clientName && <span style={styles.fieldError}>{fieldErrors.clientName}</span>}
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Client Email *</label>
              <input
                type="email" name="clientEmail" style={styles.input}
                placeholder="client@company.com" value={formData.clientEmail} onChange={handleChange}
              />
              {fieldErrors.clientEmail && <span style={styles.fieldError}>{fieldErrors.clientEmail}</span>}
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Project *</label>
            <select name="projectId" style={styles.select} value={formData.projectId} onChange={handleChange}>
              <option value="">-- Select a project --</option>
              {sortedProjects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.feedbackStatus ? ` (${DROPDOWN_STATUS_LABELS[p.feedbackStatus] || p.feedbackStatus})` : ''}
                </option>
              ))}
            </select>
            {fieldErrors.projectId && <span style={styles.fieldError}>{fieldErrors.projectId}</span>}
            {projects.length === 0 && !loadError && (
              <span style={styles.emptyNote}>No projects found for your account yet.</span>
            )}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Team Members to Rate *</label>
            {!formData.projectId ? (
              <span style={styles.emptyNote}>Select a project first to see its assigned team.</span>
            ) : employeesLoading ? (
              <span style={styles.emptyNote}>Loading team members…</span>
            ) : employees.length === 0 ? (
              <span style={styles.emptyNote}>No employees are assigned to this project yet.</span>
            ) : (
              <div style={styles.employeeGrid}>
                {employees.map(emp => {
                  const selected = selectedEmployeeIds.includes(emp.id);
                  return (
                    <label
                      key={emp.id}
                      style={{ ...styles.employeeChip, ...(selected ? styles.employeeChipSelected : {}) }}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleEmployee(emp.id)}
                      />
                      {emp.name}
                      {emp.isPm && <span style={styles.pmBadge}>PM</span>}
                    </label>
                  );
                })}
              </div>
            )}
            {fieldErrors.employees && <span style={styles.fieldError}>{fieldErrors.employees}</span>}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Message to Client</label>
            <textarea
              name="introMessage" style={styles.textarea}
              value={formData.introMessage}
              placeholder={defaultIntro(selectedProject?.name)}
              onChange={handleChange}
            />
            <span style={styles.emptyNote}>Edit this freely — it's the intro paragraph in the email. The 5-star rating categories stay standard.</span>
          </div>

          <div style={styles.previewNote}>
            <img src={weaLogo} alt="WEA logo" style={styles.previewLogo} />
            Emails go out branded with your WEA logo, matching your interview and offer emails.
          </div>

          <button
            type="submit"
            style={{ ...styles.button, ...(isSending ? styles.buttonDisabled : {}) }}
            disabled={isSending}
          >
            {isSending ? 'Sending…' : 'Send Feedback Request Email'}
          </button>
        </form>
      </div>

      <div style={styles.historySection}>
        <h2 style={styles.historyTitle}>Sent Feedback Requests</h2>
        <div className="glass-card" style={styles.card}>
          {historyLoading ? (
            <span style={styles.emptyNote}>Loading history…</span>
          ) : sentRequests.length === 0 ? (
            <span style={styles.emptyNote}>No feedback requests sent yet.</span>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Client</th>
                  <th style={styles.th}>Project</th>
                  <th style={styles.th}>Team Members</th>
                  <th style={styles.th}>Feedback Link</th>
                  <th style={styles.th}>Sent</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {sentRequests.map((req) => {
                  const statusStyle = STATUS_STYLES[req.status] || STATUS_STYLES.pending;
                  return (
                    <tr key={req.id}>
                      <td style={styles.td}>
                        {req.clientName}
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{req.clientEmail}</div>
                      </td>
                      <td style={styles.td}>{req.projectName}</td>
                      <td style={styles.td}>{req.employeeNames?.join(', ') || '—'}</td>
                      <td style={styles.td}>
                        <a href={req.feedbackLink} target="_blank" rel="noopener noreferrer" style={styles.link}>
                          {req.feedbackLink}
                        </a>
                      </td>
                      <td style={styles.td}>{req.emailSentAt ? new Date(req.emailSentAt).toLocaleDateString() : '—'}</td>
                      <td style={styles.td}>
                        <span style={{
                          padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600',
                          background: statusStyle.bg, color: statusStyle.color,
                        }}>
                          {statusStyle.label}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <button type="button" style={styles.smallBtn} onClick={() => copyLink(req.feedbackLink)}>
                          Copy Link
                        </button>
                        {(req.status === 'pending' || req.status === 'sent') && (
                          <button
                            type="button"
                            style={{ ...styles.smallBtn, ...(resendingId === req.id ? styles.buttonDisabled : {}) }}
                            disabled={resendingId === req.id}
                            onClick={() => handleResend(req)}
                          >
                            {resendingId === req.id ? 'Resending…' : 'Resend'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}