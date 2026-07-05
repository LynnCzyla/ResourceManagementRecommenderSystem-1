import React, { useState, useEffect } from 'react';
import { getResourceRequests, createResourceRequest, getProjects } from './pmApi';

export default function PMResourceRequestsTab({ user }) {
  const [requests, setRequests] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const initialResources = [{
    role: '',
    quantity: 1,
    experience: 'Intermediate',
    assignment: 'Full-Time (40 hours/week)',
    skills: '',
    startDate: '',
    endDate: '',
    justification: ''
  }];

  const [formData, setFormData] = useState({
    projectId: '',
    resources: initialResources
  });

  const loadData = async () => {
    try {
      const [requestsData, projectsData] = await Promise.all([
        getResourceRequests(),
        getProjects(user?.id),
      ]);
      setRequests(requestsData);
      setProjects(projectsData);
      setLoadError('');
    } catch (err) {
      console.error('Failed to load resource requests:', err);
      setLoadError(err.message || 'Failed to load resource requests');
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleResourceChange = (index, field, value) => {
    setFormData(prev => {
      const updated = [...prev.resources];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, resources: updated };
    });
  };

  const handleAddResource = () => {
    setFormData(prev => ({
      ...prev,
      resources: [
        ...prev.resources,
        {
          role: '',
          quantity: 1,
          experience: 'Intermediate',
          assignment: 'Full-Time (40 hours/week)',
          skills: '',
          startDate: '',
          endDate: '',
          justification: ''
        }
      ]
    }));
  };

  const handleRemoveResource = (index) => {
    if (formData.resources.length <= 1) return;
    setFormData(prev => ({
      ...prev,
      resources: prev.resources.filter((_, i) => i !== index)
    }));
  };

  const resetFormData = () => {
    setFormData({
      projectId: '',
      resources: [{
        role: '',
        quantity: 1,
        experience: 'Intermediate',
        assignment: 'Full-Time (40 hours/week)',
        skills: '',
        startDate: '',
        endDate: '',
        justification: ''
      }]
    });
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.projectId || !formData.resources.length) return;

    setSubmitError('');
    try {
      await createResourceRequest({
        projectId: formData.projectId,
        resources: formData.resources,
      });

      await loadData();
      setShowCreateModal(false);
      resetFormData();
    } catch (err) {
      console.error('Failed to create resource request:', err);
      setSubmitError(err.message || 'Failed to create resource request');
    }
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

      {loadError && (
        <div className="glass-card" style={styles.errorBanner}>{loadError}</div>
      )}

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
              <h2 style={{ margin: 0, fontSize: 18 }}>New Resource Request</h2>
              <button onClick={() => setShowCreateModal(false)} style={styles.closeModalBtn}>&times;</button>
            </div>
            
            <form onSubmit={handleCreateSubmit} style={{ marginTop: 16 }}>
              {submitError && (
                <div style={{ ...styles.errorBanner, marginBottom: 16 }}>{submitError}</div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Project <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                <select 
                  value={formData.projectId} 
                  onChange={(e) => setFormData({ ...formData, projectId: e.target.value })} 
                  style={styles.modalSelect}
                  required
                >
                  <option value="">Select a project</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Resource Requirements Section */}
              <div style={{ ...styles.sectionContainer, marginTop: '20px' }}>
                <div style={styles.sectionHeader}>
                  <span style={styles.sectionTitle}>Resource Requirements</span>
                </div>

                {formData.resources.map((res, index) => (
                  <div key={index} style={styles.resourceCard}>
                    <div style={styles.resourceCardHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)', fontWeight: '600', fontSize: '13px' }}>
                        Resource #{index + 1}
                      </div>
                      {formData.resources.length > 1 && (
                        <button type="button" onClick={() => handleRemoveResource(index)} style={styles.removeBtn}>Remove</button>
                      )}
                    </div>

                    <div style={styles.formRow}>
                      <div style={{ ...styles.formGroup, flex: 2 }}>
                        <label style={styles.formLabel}>Position/Role <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <input 
                          type="text" 
                          value={res.role} 
                          onChange={(e) => handleResourceChange(index, 'role', e.target.value)} 
                          style={styles.modalInput} 
                          placeholder="e.g., Frontend Developer"
                          required
                        />
                      </div>
                      <div style={{ ...styles.formGroup, flex: 1 }}>
                        <label style={styles.formLabel}>Quantity Needed <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <input 
                          type="number" 
                          min="1"
                          value={res.quantity} 
                          onChange={(e) => handleResourceChange(index, 'quantity', e.target.value)} 
                          style={styles.modalInput} 
                          required
                        />
                      </div>
                    </div>

                    <div style={styles.formRow}>
                      <div style={{ ...styles.formGroup, flex: 1 }}>
                        <label style={styles.formLabel}>Experience Level <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <select 
                          value={res.experience} 
                          onChange={(e) => handleResourceChange(index, 'experience', e.target.value)} 
                          style={styles.modalSelect}
                          required
                        >
                          <option value="Junior">Junior</option>
                          <option value="Intermediate">Intermediate</option>
                          <option value="Senior">Senior</option>
                        </select>
                      </div>
                      <div style={{ ...styles.formGroup, flex: 1 }}>
                        <label style={styles.formLabel}>Assignment Type <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <select 
                          value={res.assignment} 
                          onChange={(e) => handleResourceChange(index, 'assignment', e.target.value)} 
                          style={styles.modalSelect}
                          required
                        >
                          <option value="Full-Time (40 hours/week)">Full-Time (40 hours/week)</option>
                          <option value="Part-Time (20 hours/week)">Part-Time (20 hours/week)</option>
                        </select>
                      </div>
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Required Skills <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                      <input 
                        type="text" 
                        value={res.skills} 
                        onChange={(e) => handleResourceChange(index, 'skills', e.target.value)} 
                        style={styles.modalInput} 
                        placeholder="e.g., High-Voltage Wiring, Circuit Calibration, LOTO Protocol"
                        required
                      />
                      <span style={styles.inputHelp}>Separate multiple skills with commas</span>
                    </div>

                    <div style={styles.formRow}>
                      <div style={{ ...styles.formGroup, flex: 1 }}>
                        <label style={styles.formLabel}>Start Date <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <input 
                          type="date" 
                          value={res.startDate} 
                          onChange={(e) => handleResourceChange(index, 'startDate', e.target.value)} 
                          style={styles.modalInput} 
                          required
                        />
                      </div>
                      <div style={{ ...styles.formGroup, flex: 1 }}>
                        <label style={styles.formLabel}>End Date <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <input 
                          type="date" 
                          value={res.endDate} 
                          onChange={(e) => handleResourceChange(index, 'endDate', e.target.value)} 
                          style={styles.modalInput} 
                          required
                        />
                      </div>
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Justification / Requirements</label>
                      <textarea 
                        value={res.justification} 
                        onChange={(e) => handleResourceChange(index, 'justification', e.target.value)} 
                        style={styles.modalTextarea} 
                        placeholder="Why do you need this resource? Provide details about the work they will be doing..."
                      />
                    </div>
                  </div>
                ))}

                <button type="button" onClick={handleAddResource} style={styles.addResourceBtn}>
                  + Add Another Resource
                </button>
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
  errorBanner: {
    padding: '12px 16px',
    color: 'var(--color-danger)',
    fontSize: '13px',
    fontWeight: '600',
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
    maxWidth: '760px',
    maxHeight: '85vh',
    overflowY: 'auto',
    padding: '28px',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '12px',
    marginBottom: '20px',
  },
  closeModalBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: 'var(--color-text-muted)',
  },
  sectionContainer: {
    backgroundColor: 'var(--color-bg-card-hover)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '20px',
    textAlign: 'left',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '8px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  resourceCard: {
    backgroundColor: 'var(--color-bg-root)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  },
  resourceCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    borderBottom: '1px dotted var(--color-border)',
    paddingBottom: '8px',
  },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-danger)',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  addResourceBtn: {
    width: '100%',
    padding: '12px',
    border: '2px dashed var(--color-primary)',
    background: 'transparent',
    color: 'var(--color-primary)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '700',
    fontSize: '13px',
    transition: 'all 0.2s',
    marginTop: '8px',
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
  modalTextarea: {
    width: '100%',
    height: '100px',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    resize: 'none',
  },
  inputHelp: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    marginTop: '4px',
    display: 'block',
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