import React, { useState, useEffect } from 'react';
import { getProjects, saveProjects, getEmployees } from '../mockState';

export default function RMProjectsTab() {
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [assignForm, setAssignForm] = useState({ employeeId: '', hours: '8', role: '' });

  useEffect(() => {
    setProjects(getProjects());
    setEmployees(getEmployees());
  }, []);

  const handleOpenAssignModal = (proj) => {
    setSelectedProject(proj);
    setShowAssignModal(true);
    setAssignForm({ employeeId: '', hours: '8', role: '' });
  };

  const handleAssignSubmit = (e) => {
    e.preventDefault();
    if (!assignForm.employeeId) return;

    const chosenEmp = employees.find(emp => emp.id === assignForm.employeeId);
    if (!chosenEmp) return;

    const updatedProjects = projects.map(proj => {
      if (proj.id === selectedProject.id) {
        const currentAssigned = proj.assignedEmployees || [];
        // Check if already assigned
        if (currentAssigned.some(a => a.employeeId === chosenEmp.id)) {
          alert(`${chosenEmp.name} is already assigned to this project!`);
          return proj;
        }

        const newAssignedItem = {
          employeeId: chosenEmp.id,
          employeeName: chosenEmp.name,
          role: assignForm.role || chosenEmp.role,
          hoursAllocated: parseInt(assignForm.hours) || 8,
          avatar: chosenEmp.avatar
        };

        return {
          ...proj,
          assignedEmployees: [...currentAssigned, newAssignedItem]
        };
      }
      return proj;
    });

    setProjects(updatedProjects);
    saveProjects(updatedProjects);
    setShowAssignModal(false);
    alert(`Successfully assigned ${chosenEmp.name} to project!`);
  };

  const handleRemoveMember = (projId, empId) => {
    const updatedProjects = projects.map(proj => {
      if (proj.id === projId) {
        const currentAssigned = proj.assignedEmployees || [];
        return {
          ...proj,
          assignedEmployees: currentAssigned.filter(a => a.employeeId !== empId)
        };
      }
      return proj;
    });
    setProjects(updatedProjects);
    saveProjects(updatedProjects);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Projects Management</h1>
        <p style={styles.subtitle}>Track resource allocations, monitor utilization rates, and assign new candidates to active contracts.</p>
      </div>

      <div style={styles.grid}>
        {projects.map(proj => {
          // Initialize assigned list to defaults if not present
          const assignedList = proj.assignedEmployees || [
            // Mock default assignments if empty to look filled and cohesive
            proj.id === 1 ? { employeeId: 'EMP-1014', employeeName: 'Javier Santos', role: 'Senior Cad Drafter & Lighting Designer', hoursAllocated: 8, avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=100' } :
            proj.id === 2 ? { employeeId: 'EMP-1015', employeeName: 'Vincent Miguel P. Soriano', role: 'Inside Sales / UPS Technical Engineer', hoursAllocated: 6, avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=100' } : null
          ].filter(Boolean);

          const totalAllocatedHours = assignedList.reduce((sum, item) => sum + item.hoursAllocated, 0);
          const utilizationPercentage = Math.min(Math.round((totalAllocatedHours / 16) * 100), 100);

          return (
            <div key={proj.id} className="glass-card" style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h3 style={styles.projName}>{proj.name}</h3>
                  <span style={styles.duration}>Timeline: {proj.startDate} to {proj.endDate}</span>
                </div>
                <span style={{
                  ...styles.statusBadge,
                  backgroundColor: proj.status === 'Active' ? 'var(--color-primary-light)' : 'rgba(245, 158, 11, 0.1)',
                  color: proj.status === 'Active' ? 'var(--color-success)' : 'var(--color-warning)'
                }}>
                  {proj.status}
                </span>
              </div>

              <p style={styles.desc}>{proj.description}</p>

              {/* Skills */}
              <div style={styles.skillsRow}>
                {proj.requiredSkills.map((sk, i) => (
                  <span key={i} style={styles.skillPill}>{sk}</span>
                ))}
              </div>

              {/* Allocation Stats */}
              <div style={styles.statSection}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '700' }}>
                  <span>Manpower Allocated</span>
                  <span>{assignedList.length} members ({totalAllocatedHours} hrs/day)</span>
                </div>
                <div style={styles.utilizationBarContainer}>
                  <div style={{ ...styles.utilizationBar, width: `${utilizationPercentage}%`, backgroundColor: utilizationPercentage > 75 ? 'var(--color-success)' : 'var(--color-primary)' }}></div>
                </div>
              </div>

              {/* Assigned Members List */}
              <div style={styles.assignedSection}>
                <h4 style={styles.assignedHeader}>Assigned Team Members</h4>
                <div style={styles.assignedList}>
                  {assignedList.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No members assigned.</div>
                  ) : (
                    assignedList.map(member => (
                      <div key={member.employeeId} style={styles.memberRow}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <img src={member.avatar} alt={member.employeeName} style={styles.memberAvatar} />
                          <div>
                            <div style={styles.memberName}>{member.employeeName}</div>
                            <div style={styles.memberRole}>{member.role}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={styles.memberHours}>{member.hoursAllocated}h/day</span>
                          <button 
                            onClick={() => handleRemoveMember(proj.id, member.employeeId)}
                            style={styles.removeBtn}
                            title="Remove Member"
                          >
                            &times;
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <button 
                onClick={() => handleOpenAssignModal({ ...proj, assignedEmployees: assignedList })}
                style={styles.assignBtn}
              >
                + Assign Employee
              </button>
            </div>
          );
        })}
      </div>

      {/* Assign Employee Modal */}
      {showAssignModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Assign Resource to: {selectedProject.name}</h2>
              <button onClick={() => setShowAssignModal(false)} style={styles.closeModalBtn}>&times;</button>
            </div>
            <form onSubmit={handleAssignSubmit} style={{ marginTop: '16px' }}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Select Employee</label>
                <select
                  value={assignForm.employeeId}
                  onChange={(e) => setAssignForm({ ...assignForm, employeeId: e.target.value })}
                  style={styles.modalSelect}
                  required
                >
                  <option value="">-- Choose Candidate --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                  ))}
                </select>
              </div>

              <div style={styles.formRow}>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>Allocation (Hours/Day)</label>
                  <select
                    value={assignForm.hours}
                    onChange={(e) => setAssignForm({ ...assignForm, hours: e.target.value })}
                    style={styles.modalSelect}
                  >
                    <option value="2">2 Hours</option>
                    <option value="4">4 Hours</option>
                    <option value="6">6 Hours</option>
                    <option value="8">8 Hours (Full-Time)</option>
                  </select>
                </div>

                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>Project Role Overwrite</label>
                  <input
                    type="text"
                    value={assignForm.role}
                    onChange={(e) => setAssignForm({ ...assignForm, role: e.target.value })}
                    placeholder="Leave blank to use default role"
                    style={styles.modalInput}
                  />
                </div>
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowAssignModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.saveBtn}>Assign Member</button>
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
    textAlign: 'left',
  },
  header: {
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
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
    gap: '24px',
  },
  card: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  projName: {
    fontSize: '18px',
    fontWeight: '800',
    margin: 0,
  },
  duration: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    marginTop: '2px',
    display: 'block',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '30px',
  },
  desc: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.5',
    margin: 0,
  },
  skillsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  skillPill: {
    fontSize: '10px',
    fontWeight: '600',
    background: 'var(--color-bg-card-hover)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    padding: '3px 8px',
    borderRadius: '4px',
  },
  statSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '4px',
  },
  utilizationBarContainer: {
    height: '6px',
    backgroundColor: 'var(--color-border)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  utilizationBar: {
    height: '100%',
    borderRadius: '4px',
  },
  assignedSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    borderTop: '1px solid var(--color-border)',
    paddingTop: '16px',
  },
  assignedHeader: {
    fontSize: '12px',
    fontWeight: '700',
    margin: 0,
    color: 'var(--color-text-primary)',
  },
  assignedList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  memberRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: 'var(--color-bg-card-hover)',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
  },
  memberAvatar: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  memberName: {
    fontSize: '12px',
    fontWeight: '700',
  },
  memberRole: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
  },
  memberHours: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
  },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-danger)',
    fontSize: '18px',
    cursor: 'pointer',
    lineHeight: 1,
  },
  assignBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '10px',
    borderRadius: '6px',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'center',
    marginTop: 'auto',
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
    padding: '24px',
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
    fontSize: '13px',
    outline: 'none',
  },
  modalSelect: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    outline: 'none',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '20px',
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid var(--color-border)',
    padding: '8px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '700',
  }
};
