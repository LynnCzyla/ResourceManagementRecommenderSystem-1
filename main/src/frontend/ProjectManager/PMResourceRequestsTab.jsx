import React, { useState, useEffect } from 'react';
import { getRequests, saveRequests, getProjects } from '../mockState';

export default function PMResourceRequestsTab() {
  const [requests, setRequests] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    projectId: '',
    skills: '',
    timeline: 'Full-Time',
    duration: '60 days',
    startDate: '',
    endDate: '',
    quantity: 1
  });

  useEffect(() => {
    setRequests(getRequests());
    setProjects(getProjects());
  }, []);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    const selectedProj = projects.find(p => p.id === parseInt(formData.projectId)) || { name: 'Unknown Project' };

    const skillsArray = formData.skills
      ? formData.skills.split(',').map(s => s.trim()).filter(s => s.length > 0)
      : [];

    const newRequest = {
      id: Date.now(),
      projectName: selectedProj.name,
      skills: skillsArray,
      timeline: formData.timeline,
      duration: formData.duration,
      startDate: formData.startDate || new Date().toISOString().split('T')[0],
      endDate: formData.endDate || new Date().toISOString().split('T')[0],
      status: 'Pending',
      quantity: parseInt(formData.quantity) || 1
    };

    const updated = [newRequest, ...requests];
    setRequests(updated);
    saveRequests(updated);

    setShowCreateModal(false);
    setFormData({
      projectId: '',
      skills: '',
      timeline: 'Full-Time',
      duration: '60 days',
      startDate: '',
      endDate: '',
      quantity: 1
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Resource Requests</h1>
          <p style={styles.subtitle}>Track and manage your manpower requests for project allocation.</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} style={styles.createBtn}>
          + New Request
        </button>
      </div>

      {/* Requests Table */}
      <div className="glass-card" style={styles.card}>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.trHeader}>
                <th style={styles.th}>Project</th>
                <th style={styles.th}>Required Skills</th>
                <th style={styles.th}>Timeline</th>
                <th style={styles.th}>Duration</th>
                <th style={styles.th}>Dates</th>
                <th style={styles.th}>Qty</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan="7" style={styles.emptyRow}>No resource requests found.</td>
                </tr>
              ) : (
                requests.map(req => (
                  <tr key={req.id} style={styles.trRow}>
                    <td style={{ ...styles.td, fontWeight: '700', color: 'var(--color-text-primary)' }}>{req.projectName}</td>
                    <td style={styles.td}>
                      <div style={styles.skillsWrapper}>
                        {req.skills.map((skill, idx) => (
                          <span key={idx} style={styles.skillTag}>{skill}</span>
                        ))}
                      </div>
                    </td>
                    <td style={styles.td}>{req.timeline}</td>
                    <td style={styles.td}>{req.duration}</td>
                    <td style={styles.td}>{req.startDate} to {req.endDate}</td>
                    <td style={{ ...styles.td, fontWeight: '600' }}>{req.quantity}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: req.status === 'Approved' ? 'var(--color-primary-light)' : 'rgba(245, 158, 11, 0.1)',
                        color: req.status === 'Approved' ? 'var(--color-success)' : 'var(--color-warning)'
                      }}>
                        {req.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Request Modal */}
      {showCreateModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Request Manpower</h2>
              <button onClick={() => setShowCreateModal(false)} style={styles.closeModalBtn}>&times;</button>
            </div>
            <form onSubmit={handleCreateSubmit} style={{ marginTop: 16 }}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Select Project</label>
                <select 
                  value={formData.projectId} 
                  onChange={(e) => setFormData({ ...formData, projectId: e.target.value })} 
                  style={styles.modalSelect}
                  required
                >
                  <option value="">-- Select Project --</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Required Skills / Certifications</label>
                <input 
                  type="text" 
                  value={formData.skills} 
                  onChange={(e) => setFormData({ ...formData, skills: e.target.value })} 
                  style={styles.modalInput} 
                  placeholder="e.g. React, Docker, GCP Professional Architect"
                  required
                />
              </div>

              <div style={styles.formRow}>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>Quantity</label>
                  <input 
                    type="number" 
                    min="1"
                    value={formData.quantity} 
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} 
                    style={styles.modalInput} 
                  />
                </div>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>Timeline</label>
                  <select 
                    value={formData.timeline} 
                    onChange={(e) => setFormData({ ...formData, timeline: e.target.value })} 
                    style={styles.modalSelect}
                  >
                    <option value="Full-Time">Full-Time</option>
                    <option value="Part-Time">Part-Time</option>
                    <option value="Contract">Contract</option>
                  </select>
                </div>
              </div>

              <div style={styles.formRow}>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>Start Date</label>
                  <input 
                    type="date" 
                    value={formData.startDate} 
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} 
                    style={styles.modalInput} 
                    required
                  />
                </div>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>End Date</label>
                  <input 
                    type="date" 
                    value={formData.endDate} 
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} 
                    style={styles.modalInput} 
                    required
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Duration Description</label>
                <input 
                  type="text" 
                  value={formData.duration} 
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })} 
                  style={styles.modalInput} 
                  placeholder="e.g. 60 days, 3 months"
                  required
                />
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowCreateModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.saveBtn}>Submit Request</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '800',
    letterSpacing: '-0.75px',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '15px',
    color: 'var(--color-text-secondary)',
  },
  createBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '10px 18px',
    borderRadius: 'var(--radius-md)',
    fontWeight: '700',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  card: {
    padding: '24px',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  trHeader: {
    borderBottom: '2px solid var(--color-border)',
  },
  th: {
    padding: '14px 16px',
    fontSize: '12px',
    fontWeight: '700',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
  },
  trRow: {
    borderBottom: '1px solid var(--color-border)',
  },
  td: {
    padding: '14px 16px',
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
  },
  emptyRow: {
    textAlign: 'center',
    padding: '40px 0',
    color: 'var(--color-text-muted)',
  },
  skillsWrapper: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  skillTag: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    fontWeight: '600',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '4px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  modalCard: {
    width: '100%',
    maxWidth: '480px',
    padding: '28px',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '12px',
  },
  closeModalBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: 'var(--color-text-muted)',
  },
  formGroup: {
    marginBottom: '16px',
    textAlign: 'left',
  },
  formRow: {
    display: 'flex',
    gap: '16px',
  },
  formLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
    marginBottom: '6px',
  },
  modalInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  modalSelect: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '24px',
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid var(--color-border)',
    padding: '10px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '700',
  }
};
