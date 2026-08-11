import React, { useState } from 'react';
import Swal from 'sweetalert2';

export default function PMFeedbackFormTab() {
  const [formData, setFormData] = useState({
    clientName: '',
    clientEmail: '',
    projectName: '',
    projectPhase: 'Planning',
    feedbackLink: '',
  });

  const [sentRequests, setSentRequests] = useState([]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Generate a unique feedback link (mock)
    const feedbackLink = `https://wea.com/feedback/${Date.now()}`;
    
    // Add to sent requests (mock data)
    const newRequest = {
      id: Date.now(),
      ...formData,
      feedbackLink,
      sentDate: new Date().toISOString().split('T')[0],
      status: 'Sent',
    };
    
    setSentRequests([...sentRequests, newRequest]);
    
    // Open Gmail with pre-filled email
    const subject = `Feedback Request - ${formData.projectName} at WEA`;
    const body = `Dear ${formData.clientName},\n\nWe hope you are satisfied with the progress of ${formData.projectName} (${formData.projectPhase} phase).\n\nWe value your feedback and would appreciate it if you could take a moment to share your experience with us. Please use the link below to submit your feedback:\n\n${feedbackLink}\n\nYour feedback helps us improve our services and serve you better.\n\nIf you have any questions or concerns, please don't hesitate to reach out.\n\nBest regards,\nWEA Project Management Team`;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(formData.clientEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
    
    // Reset form
    setFormData({
      clientName: '',
      clientEmail: '',
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
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Client Name *</label>
              <input
                type="text"
                name="clientName"
                required
                style={styles.input}
                placeholder="Enter client name"
                value={formData.clientName}
                onChange={handleChange}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Client Email *</label>
              <input
                type="email"
                name="clientEmail"
                required
                style={styles.input}
                placeholder="client@company.com"
                value={formData.clientEmail}
                onChange={handleChange}
              />
            </div>
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Project Name *</label>
              <input
                type="text"
                name="projectName"
                required
                style={styles.input}
                placeholder="Enter project name"
                value={formData.projectName}
                onChange={handleChange}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Project Phase *</label>
              <select
                name="projectPhase"
                required
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

          <button type="submit" style={styles.button}>
            Send Feedback Request Email
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
