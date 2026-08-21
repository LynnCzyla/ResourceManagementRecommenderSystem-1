import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { getProjects } from './pmApi';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HISTORY_KEY_PREFIX = 'pmFeedbackRequests:';

export default function PMFeedbackFormTab({ user }) {
  const [formData, setFormData] = useState({
    clientName: '',
    clientEmail: '',
    projectId: '',
    projectName: '',
    projectPhase: 'Planning',
    feedbackLink: '',
  });

  const [projects, setProjects] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSending, setIsSending] = useState(false);

  const historyKey = `${HISTORY_KEY_PREFIX}${user?.id || 'anon'}`;
  const [sentRequests, setSentRequests] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(historyKey) || '[]');
    } catch {
      return [];
    }
  });

  // Load this PM's real projects for the dropdown
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getProjects(user?.id);
        if (!cancelled) setProjects(data || []);
      } catch (err) {
        console.error('Failed to load projects:', err);
        if (!cancelled) setLoadError(err.message || 'Failed to load projects');
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Persist sent-request history per user so it survives tab switches/reloads
  useEffect(() => {
    try {
      localStorage.setItem(historyKey, JSON.stringify(sentRequests));
    } catch {
      // ignore storage errors (e.g. private browsing quota)
    }
  }, [sentRequests, historyKey]);

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
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    const errors = {};
    if (!formData.clientName.trim()) errors.clientName = 'Client name is required';
    if (!formData.clientEmail.trim()) errors.clientEmail = 'Client email is required';
    else if (!EMAIL_RE.test(formData.clientEmail.trim())) errors.clientEmail = 'Enter a valid email address';
    if (!formData.projectId) errors.projectId = 'Select a project';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSending) return;
    if (!validate()) return;

    setIsSending(true);
    try {
      // Generate a unique feedback link (mock)
      const feedbackLink = `https://wea.com/feedback/${Date.now()}`;

      // Open Gmail with pre-filled email
      const subject = `Feedback Request - ${formData.projectName} at WEA`;
      const body = `Dear ${formData.clientName},\n\nWe hope you are satisfied with the progress of ${formData.projectName} (${formData.projectPhase} phase).\n\nWe value your feedback and would appreciate it if you could take a moment to share your experience with us. Please use the link below to submit your feedback:\n\n${feedbackLink}\n\nYour feedback helps us improve our services and serve you better.\n\nIf you have any questions or concerns, please don't hesitate to reach out.\n\nBest regards,\nWEA Project Management Team`;
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(formData.clientEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      const mailWindow = window.open(gmailUrl, '_blank');

      if (!mailWindow) {
        Swal.fire({
          title: 'Pop-up blocked',
          text: 'Please allow pop-ups for this site so Gmail can open, then try again.',
          icon: 'warning',
          confirmButtonColor: 'var(--color-primary)',
          background: 'var(--color-bg-card)',
          color: 'var(--color-text-primary)',
        });
        return;
      }

      // Add to sent requests history
      const newRequest = {
        id: Date.now(),
        clientName: formData.clientName.trim(),
        clientEmail: formData.clientEmail.trim(),
        projectName: formData.projectName,
        projectPhase: formData.projectPhase,
        feedbackLink,
        sentDate: new Date().toISOString().split('T')[0],
        status: 'Sent',
      };
      setSentRequests(prev => [newRequest, ...prev]);

      // Reset form (keep project list loaded)
      setFormData({
        clientName: '',
        clientEmail: '',
        projectId: '',
        projectName: '',
        projectPhase: 'Planning',
        feedbackLink: '',
      });

      Swal.fire({
        title: 'Success!',
        text: 'Feedback request email opened in Gmail.',
        icon: 'success',
        confirmButtonColor: 'var(--color-primary)',
        confirmButtonText: 'OK',
        background: 'var(--color-bg-card)',
        color: 'var(--color-text-primary)',
      });
    } finally {
      setIsSending(false);
    }
  };

  const styles = {
    container: {
      padding: '24px',
    },
    header: {
      marginBottom: '32px',
    },
    title: {
      fontSize: '28px',
      fontWeight: '700',
      color: 'var(--color-text-primary)',
      marginBottom: '8px',
    },
    subtitle: {
      fontSize: '15px',
      color: 'var(--color-text-secondary)',
    },
    card: {
      padding: '24px',
      marginBottom: '24px',
    },
    form: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
    },
    formRow: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '20px',
    },
    formGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    },
    label: {
      fontSize: '14px',
      fontWeight: '600',
      color: 'var(--color-text-secondary)',
    },
    input: {
      padding: '12px 16px',
      borderRadius: '8px',
      border: '1px solid var(--color-border)',
      background: 'var(--color-bg-root)',
      color: 'var(--color-text-primary)',
      fontSize: '14px',
      outline: 'none',
    },
    select: {
      padding: '12px 16px',
      borderRadius: '8px',
      border: '1px solid var(--color-border)',
      background: 'var(--color-bg-root)',
      color: 'var(--color-text-primary)',
      fontSize: '14px',
      outline: 'none',
    },
    button: {
      padding: '12px 24px',
      backgroundColor: 'var(--color-primary)',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      alignSelf: 'flex-start',
    },
    buttonDisabled: {
      opacity: 0.6,
      cursor: 'not-allowed',
    },
    fieldError: {
      fontSize: '12px',
      color: 'var(--color-danger, #ef4444)',
      marginTop: '-2px',
    },
    loadError: {
      fontSize: '13px',
      color: 'var(--color-danger, #ef4444)',
      marginBottom: '12px',
    },
    historySection: {
      marginTop: '32px',
    },
    historyTitle: {
      fontSize: '20px',
      fontWeight: '600',
      color: 'var(--color-text-primary)',
      marginBottom: '16px',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
    },
    th: {
      padding: '12px',
      textAlign: 'left',
      borderBottom: '1px solid var(--color-border)',
      color: 'var(--color-text-secondary)',
      fontWeight: '600',
      fontSize: '13px',
    },
    td: {
      padding: '12px',
      borderBottom: '1px solid var(--color-border)',
      color: 'var(--color-text-primary)',
      fontSize: '14px',
    },
    link: {
      color: 'var(--color-primary)',
      textDecoration: 'none',
      fontWeight: '500',
    },
    statusBadge: {
      padding: '4px 12px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: '600',
      background: 'var(--color-success-light)',
      color: 'var(--color-success)',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Send Feedback Request</h1>
        <p style={styles.subtitle}>Send feedback request emails to clients for their projects</p>
      </div>

      <div className="glass-card" style={styles.card}>
        {loadError && <div style={styles.loadError}>{loadError}</div>}
        <form onSubmit={handleSubmit} style={styles.form} noValidate>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Client Name *</label>
              <input
                type="text"
                name="clientName"
                style={styles.input}
                placeholder="Enter client name"
                value={formData.clientName}
                onChange={handleChange}
              />
              {fieldErrors.clientName && <span style={styles.fieldError}>{fieldErrors.clientName}</span>}
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Client Email *</label>
              <input
                type="email"
                name="clientEmail"
                style={styles.input}
                placeholder="client@company.com"
                value={formData.clientEmail}
                onChange={handleChange}
              />
              {fieldErrors.clientEmail && <span style={styles.fieldError}>{fieldErrors.clientEmail}</span>}
            </div>
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Project Name *</label>
              <select
                name="projectId"
                style={styles.select}
                value={formData.projectId}
                onChange={handleChange}
              >
                <option value="">-- Select a project --</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {fieldErrors.projectId && <span style={styles.fieldError}>{fieldErrors.projectId}</span>}
              {projects.length === 0 && !loadError && (
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No projects found for your account yet.</span>
              )}
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Project Phase *</label>
              <select
                name="projectPhase"
                style={styles.select}
                value={formData.projectPhase}
                onChange={handleChange}
              >
                <option value="Planning">Planning</option>
                <option value="Development">Development</option>
                <option value="Testing">Testing</option>
                <option value="Deployment">Deployment</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            style={{ ...styles.button, ...(isSending ? styles.buttonDisabled : {}) }}
            disabled={isSending}
          >
            {isSending ? 'Sending...' : 'Send Feedback Request Email'}
          </button>
        </form>
      </div>

      {sentRequests.length > 0 && (
        <div style={styles.historySection}>
          <h2 style={styles.historyTitle}>Sent Feedback Requests</h2>
          <div className="glass-card" style={styles.card}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Client</th>
                  <th style={styles.th}>Project</th>
                  <th style={styles.th}>Phase</th>
                  <th style={styles.th}>Feedback Link</th>
                  <th style={styles.th}>Sent Date</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {sentRequests.map((req) => (
                  <tr key={req.id}>
                    <td style={styles.td}>{req.clientName}</td>
                    <td style={styles.td}>{req.projectName}</td>
                    <td style={styles.td}>{req.projectPhase}</td>
                    <td style={styles.td}>
                      <a href={req.feedbackLink} target="_blank" rel="noopener noreferrer" style={styles.link}>
                        {req.feedbackLink}
                      </a>
                    </td>
                    <td style={styles.td}>{req.sentDate}</td>
                    <td style={styles.td}>
                      <span style={styles.statusBadge}>{req.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}