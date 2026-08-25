import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { fetchResourceRequests, createResourceRequest } from './Rmapi';

const emptyForm = {
  requestTitle: '',
  department: '',
  position: '',
  quantity: 1,
  requiredSkills: '',
  experienceLevel: 'Junior',
  startDate: '',
  endDate: '',
  reason: '',
  urgency: 'Normal',
};

export default function RMResourceRequestFormTab() {
  const [formData, setFormData] = useState(emptyForm);
  const [submittedRequests, setSubmittedRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const res = await fetchResourceRequests();
      setSubmittedRequests(res.data || []);
    } catch (error) {
      console.error('Failed to load resource requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createResourceRequest(formData);

      setFormData(emptyForm);
      await loadRequests();

      Swal.fire({
        title: 'Success!',
        text: 'Resource request submitted to HR for review.',
        icon: 'success',
        confirmButtonColor: 'var(--color-primary)',
        confirmButtonText: 'OK',
        background: 'var(--color-bg-card)',
        color: 'var(--color-text-primary)',
      });
    } catch (error) {
      Swal.fire({
        title: 'Submission Failed',
        text: error.message || 'Could not submit the request. Please try again.',
        icon: 'error',
        confirmButtonColor: 'var(--color-danger)',
        background: 'var(--color-bg-card)',
        color: 'var(--color-text-primary)',
      });
    } finally {
      setSubmitting(false);
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
    textarea: {
      padding: '12px 16px',
      borderRadius: '8px',
      border: '1px solid var(--color-border)',
      background: 'var(--color-bg-root)',
      color: 'var(--color-text-primary)',
      fontSize: '14px',
      outline: 'none',
      resize: 'vertical',
      minHeight: '100px',
      fontFamily: 'inherit',
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
      opacity: submitting ? 0.7 : 1,
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
    statusBadge: {
      padding: '4px 12px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: '600',
    },
    emptyState: {
      padding: '24px',
      textAlign: 'center',
      color: 'var(--color-text-muted)',
      fontSize: '14px',
    },
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Pending':
        return { background: 'var(--color-warning-light)', color: 'var(--color-warning)' };
      case 'Approved':
        return { background: 'var(--color-success-light)', color: 'var(--color-success)' };
      case 'Rejected':
        return { background: 'var(--color-danger-light)', color: 'var(--color-danger)' };
      default:
        return { background: 'var(--color-bg-card-hover)', color: 'var(--color-text-secondary)' };
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Resource Request Form</h1>
        <p style={styles.subtitle}>Submit resource requests to HR for approval and allocation</p>
      </div>

      <div className="glass-card" style={styles.card}>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Request Title *</label>
              <input
                type="text"
                name="requestTitle"
                required
                style={styles.input}
                placeholder="e.g., Additional Software Engineers"
                value={formData.requestTitle}
                onChange={handleChange}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Department *</label>
              <select
                name="department"
                required
                style={styles.select}
                value={formData.department}
                onChange={handleChange}
              >
                <option value="">Select Department</option>
                <option value="Engineering">Engineering</option>
                <option value="Design">Design</option>
                <option value="Analytics">Analytics</option>
                <option value="Operations">Operations</option>
                <option value="Marketing">Marketing</option>
              </select>
            </div>
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Position *</label>
              <input
                type="text"
                name="position"
                required
                style={styles.input}
                placeholder="e.g., Senior Software Engineer"
                value={formData.position}
                onChange={handleChange}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Quantity *</label>
              <input
                type="number"
                name="quantity"
                required
                min="1"
                style={styles.input}
                value={formData.quantity}
                onChange={handleChange}
              />
            </div>
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Required Skills *</label>
              <input
                type="text"
                name="requiredSkills"
                required
                style={styles.input}
                placeholder="e.g., React, Node.js, Python"
                value={formData.requiredSkills}
                onChange={handleChange}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Experience Level *</label>
              <select
                name="experienceLevel"
                required
                style={styles.select}
                value={formData.experienceLevel}
                onChange={handleChange}
              >
                <option value="Junior">Junior</option>
                <option value="Mid-Level">Mid-Level</option>
                <option value="Senior">Senior</option>
                <option value="Lead">Lead</option>
                <option value="Manager">Manager</option>
              </select>
            </div>
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Start Date *</label>
              <input
                type="date"
                name="startDate"
                required
                style={styles.input}
                value={formData.startDate}
                onChange={handleChange}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>End Date *</label>
              <input
                type="date"
                name="endDate"
                required
                style={styles.input}
                value={formData.endDate}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Budget field removed — Resource Managers have no authority to set salary/budget */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Urgency *</label>
            <select
              name="urgency"
              required
              style={styles.select}
              value={formData.urgency}
              onChange={handleChange}
            >
              <option value="Low">Low</option>
              <option value="Normal">Normal</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Reason for Request *</label>
            <textarea
              name="reason"
              required
              style={styles.textarea}
              placeholder="Explain why this resource is needed and how it will benefit the project..."
              value={formData.reason}
              onChange={handleChange}
            />
          </div>

          <button type="submit" style={styles.button} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Request to HR'}
          </button>
        </form>
      </div>

      <div style={styles.historySection}>
        <h2 style={styles.historyTitle}>Submitted Requests</h2>
        <div className="glass-card" style={styles.card}>
          {loading ? (
            <div style={styles.emptyState}>Loading requests...</div>
          ) : submittedRequests.length === 0 ? (
            <div style={styles.emptyState}>No requests submitted yet.</div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Title</th>
                  <th style={styles.th}>Department</th>
                  <th style={styles.th}>Position</th>
                  <th style={styles.th}>Quantity</th>
                  <th style={styles.th}>Urgency</th>
                  <th style={styles.th}>Submitted</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {submittedRequests.map((req) => (
                  <tr key={req.id}>
                    <td style={styles.td}>{req.request_title}</td>
                    <td style={styles.td}>{req.department_name}</td>
                    <td style={styles.td}>{req.position_title}</td>
                    <td style={styles.td}>{req.quantity_needed}</td>
                    <td style={styles.td}>{req.urgency}</td>
                    <td style={styles.td}>
                      {req.created_at ? new Date(req.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={styles.td}>
                      <span style={{ ...styles.statusBadge, ...getStatusStyle(req.status) }}>
                        {req.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}