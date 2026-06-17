import React, { useState, useEffect } from 'react';
import { getProjects, saveProjects } from '../mockState';

export default function PMProjectsTab() {
  const [projects, setProjects] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    requiredSkills: '',
    manpowerNeeded: 1
  });

  useEffect(() => {
    setProjects(getProjects());
  }, []);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.description) return;

    const skillsArray = formData.requiredSkills
      ? formData.requiredSkills.split(',').map(s => s.trim()).filter(s => s.length > 0)
      : [];

    const newProject = {
      id: Date.now(),
      name: formData.name,
      description: formData.description,
      startDate: formData.startDate || new Date().toISOString().split('T')[0],
      endDate: formData.endDate || new Date().toISOString().split('T')[0],
      status: 'Pending Approval',
      requiredSkills: skillsArray,
      manpowerNeeded: parseInt(formData.manpowerNeeded) || 1
    };

    const updated = [newProject, ...projects];
    setProjects(updated);
    saveProjects(updated);

    setShowCreateModal(false);
    setFormData({
      name: '',
      description: '',
      startDate: '',
      endDate: '',
      requiredSkills: '',
      manpowerNeeded: 1
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>My Projects</h1>
          <p style={styles.subtitle}>Create and manage projects, define skills requirements, and track approvals.</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} style={styles.createBtn}>
          + New Project
        </button>
      </div>

      {/* Projects Grid */}
      <div style={styles.projectsGrid}>
        {projects.length === 0 ? (
          <div className="glass-card" style={styles.emptyCard}>
            No projects found. Create one to get started!
          </div>
        ) : (
          projects.map(proj => (
            <div key={proj.id} className="glass-card" style={styles.projCard}>
              <div style={styles.cardHeader}>
                <h3 style={styles.projName}>{proj.name}</h3>
                <span style={{
                  ...styles.statusBadge,
                  backgroundColor: proj.status === 'Active' ? 'var(--color-primary-light)' : 'rgba(245, 158, 11, 0.1)',
                  color: proj.status === 'Active' ? 'var(--color-success)' : 'var(--color-warning)'
                }}>
                  {proj.status}
                </span>
              </div>
              <p style={styles.projDesc}>{proj.description}</p>
              
              <div style={styles.metaRow}>
                <div style={styles.metaCol}>
                  <span style={styles.metaLabel}>TIMELINE</span>
                  <span style={styles.metaVal}>{proj.startDate} to {proj.endDate}</span>
                </div>
                <div style={styles.metaCol}>
                  <span style={styles.metaLabel}>MANPOWER NEEDED</span>
                  <span style={styles.metaVal}>{proj.manpowerNeeded} requested</span>
                </div>
              </div>

              <div style={styles.skillsSection}>
                <span style={styles.metaLabel}>REQUIRED SKILLS / CERTS</span>
                <div style={styles.skillsContainer}>
                  {proj.requiredSkills && proj.requiredSkills.length > 0 ? (
                    proj.requiredSkills.map((skill, idx) => (
                      <span key={idx} style={styles.skillTag}>{skill}</span>
                    ))
                  ) : (
                    <span style={styles.noSkillsText}>No specific skills defined</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Create New Project</h2>
              <button onClick={() => setShowCreateModal(false)} style={styles.closeModalBtn}>&times;</button>
            </div>
            <form onSubmit={handleCreateSubmit} style={{ marginTop: 16 }}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Project Name</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                  style={styles.modalInput} 
                  placeholder="e.g. Warehouse Automation Portal"
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Description</label>
                <textarea 
                  value={formData.description} 
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                  style={styles.modalTextarea} 
                  placeholder="Summarize the project goals, scopes, and target outcome..."
                  required
                />
              </div>

              <div style={styles.formRow}>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>Start Date</label>
                  <input 
                    type="date" 
                    value={formData.startDate} 
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} 
                    style={styles.modalInput} 
                  />
                </div>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>End Date</label>
                  <input 
                    type="date" 
                    value={formData.endDate} 
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} 
                    style={styles.modalInput} 
                  />
                </div>
              </div>

              <div style={styles.formRow}>
                <div style={{ ...styles.formGroup, flex: 2 }}>
                  <label style={styles.formLabel}>Required Skills / Certifications</label>
                  <input 
                    type="text" 
                    value={formData.requiredSkills} 
                    onChange={(e) => setFormData({ ...formData, requiredSkills: e.target.value })} 
                    style={styles.modalInput} 
                    placeholder="Comma separated: React, Node.js, OCR, FastAPI"
                  />
                  <span style={styles.inputHelp}>Separate skills with commas (e.g. React, Docker, Python).</span>
                </div>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>Manpower Target</label>
                  <input 
                    type="number" 
                    min="1"
                    value={formData.manpowerNeeded} 
                    onChange={(e) => setFormData({ ...formData, manpowerNeeded: e.target.value })} 
                    style={styles.modalInput} 
                  />
                </div>
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowCreateModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.saveBtn}>Create Project</button>
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
  projectsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: '24px',
  },
  projCard: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: '260px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '12px',
  },
  projName: {
    fontSize: '18px',
    fontWeight: '700',
    lineHeight: '1.3',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '4px 10px',
    borderRadius: '30px',
    whiteSpace: 'nowrap',
  },
  projDesc: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.6',
    marginBottom: '20px',
  },
  metaRow: {
    display: 'flex',
    gap: '20px',
    marginBottom: '16px',
    borderTop: '1px solid var(--color-border)',
    paddingTop: '16px',
  },
  metaCol: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  metaLabel: {
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  metaVal: {
    fontSize: '12px',
    color: 'var(--color-text-primary)',
    fontWeight: '600',
  },
  skillsSection: {
    borderTop: '1px solid var(--color-border)',
    paddingTop: '16px',
  },
  skillsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '6px',
  },
  skillTag: {
    fontSize: '11px',
    padding: '4px 10px',
    borderRadius: '30px',
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    fontWeight: '600',
  },
  noSkillsText: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
  },
  emptyCard: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '40px 0',
    color: 'var(--color-text-muted)',
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
    maxWidth: '560px',
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
