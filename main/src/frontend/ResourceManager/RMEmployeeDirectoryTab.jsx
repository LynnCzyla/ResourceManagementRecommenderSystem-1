import React, { useState, useEffect } from 'react';
import { fetchEmployees, toggleEmployeeVerified, assignEmployeeFromDirectory, fetchProjects } from './rmApi';
import RMAvatar from './RMAvatar';

export default function RMEmployeeDirectoryTab() {
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('All');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [assignForm, setAssignForm] = useState({
    projectId: '',
    startDate: new Date().toISOString().split('T')[0],
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [expandedSkills, setExpandedSkills] = useState({});

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    setLoading(true);
    setError(null);
    try {
      const [empData, projData] = await Promise.all([fetchEmployees(), fetchProjects()]);
      setEmployees(empData.employees || []);
      setProjects(projData.projects || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleVerify = async (empId) => {
    // optimistic update
    setEmployees((prev) => prev.map((emp) => (emp.id === empId ? { ...emp, isVerified: !emp.isVerified } : emp)));
    try {
      await toggleEmployeeVerified(empId);
    } catch (err) {
      // revert on failure
      setEmployees((prev) => prev.map((emp) => (emp.id === empId ? { ...emp, isVerified: !emp.isVerified } : emp)));
      alert(`Couldn't update verification status: ${err.message}`);
    }
  };

  const handleOpenAssignModal = (emp) => {
    setSelectedEmployee(emp);
    setAssignForm({
      projectId: '',
      startDate: new Date().toISOString().split('T')[0],
      notes: ''
    });
    setShowAssignModal(true);
  };

  const handleCloseAssignModal = () => {
    setShowAssignModal(false);
    setSelectedEmployee(null);
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEmployee || !assignForm.projectId) return;

    setSubmitting(true);
    try {
      await assignEmployeeFromDirectory(selectedEmployee.id, {
        projectId: assignForm.projectId,
        startDate: assignForm.startDate,
        notes: assignForm.notes
      });
      alert(`Assigned ${selectedEmployee.name} to project`);
      handleCloseAssignModal();
    } catch (err) {
      alert(`Couldn't assign employee: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.skills.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesRole = selectedRole === 'All' || emp.role === selectedRole;
    return matchesSearch && matchesRole;
  });

  const uniqueRoles = ['All', ...new Set(employees.map(emp => emp.role))];

  const toggleSkillsExpand = (empId) => {
    setExpandedSkills(prev => ({
      ...prev,
      [empId]: !prev[empId]
    }));
  };

  const MAX_VISIBLE_SKILLS = 4;

  if (loading) {
    return <div style={styles.container}><p>Loading employee directory…</p></div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Employee Directory</h1>
        <p style={styles.subtitle}>View employee profiles, skills, and assign resources to projects.</p>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '12px 16px', color: 'var(--color-danger)' }}>
          Couldn't load employee data: {error}
        </div>
      )}

      {/* Filter Row */}
      <div style={styles.filterRow}>
        <div style={styles.searchWrapper}>
          <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search by name, skills, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
          style={styles.selectFilter}
        >
          {uniqueRoles.map((role, idx) => (
            <option key={idx} value={role}>{role}</option>
          ))}
        </select>
      </div>

      {/* Grid List */}
      <div style={styles.grid}>
        {filteredEmployees.length === 0 ? (
          <div className="glass-card" style={styles.emptyCard}>
            No employee profiles found matching the filters.
          </div>
        ) : (
          filteredEmployees.map(emp => (
            <div key={emp.id} className="glass-card" style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.profileMetaWrap}>
                  <RMAvatar name={emp.name} src={emp.avatar} size={40} />
                  <div>
                    <h3 style={styles.empName}>
                      {emp.name}
                      {emp.isVerified && (
                        <span
                          style={{ ...styles.verifyBadge, cursor: 'pointer' }}
                          title="Verified Profile — click to unverify"
                          onClick={() => handleToggleVerify(emp.id)}
                        >
                          ✓ Verified
                        </span>
                      )}
                    </h3>
                      <div style={styles.empId}>{emp.employeeId || 'No ID'}</div>
                      <div style={styles.empRole}>{emp.role || 'Unassigned'}</div>
                  </div>
                </div>
                
              </div>

              {/* Skills Section */}
              <div style={styles.section}>
                <h4 style={styles.sectionHeader}>Core Skills</h4>
                <div style={styles.skillsList}>
                  {emp.skills.length === 0 ? (
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>No skills on file.</span>
                  ) : (
                    <>
                      {emp.skills.slice(0, expandedSkills[emp.id] ? emp.skills.length : MAX_VISIBLE_SKILLS).map((skill, idx) => (
                        <span key={idx} style={styles.skillPill}>{skill}</span>
                      ))}
                      {emp.skills.length > MAX_VISIBLE_SKILLS && (
                        <button
                          onClick={() => toggleSkillsExpand(emp.id)}
                          style={styles.seeMoreBtn}
                        >
                          {expandedSkills[emp.id] ? 'See less' : `+${emp.skills.length - MAX_VISIBLE_SKILLS} more`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Footer / Actions */}
              <div style={styles.cardFooter}>
                <button
                  onClick={() => handleOpenAssignModal(emp)}
                  style={styles.assignBtn}
                >
                  Assign to Project
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Assign to Project Modal */}
      {showAssignModal && selectedEmployee && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            {/* Modal Header */}
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Assign Employee to Project</h2>
              <button
                onClick={handleCloseAssignModal}
                style={styles.modalCloseBtn}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {/* Employee Profile Card */}
            <div style={styles.modalProfileCard}>
              <div style={styles.modalProfileBadge}>[{selectedEmployee.department}]</div>
              <h3 style={styles.modalProfileName}>{selectedEmployee.name}</h3>
              <div style={styles.modalProfileRole}>{selectedEmployee.role}</div>
            </div>

            {/* Form Fields */}
            <form onSubmit={handleAssignSubmit} style={styles.modalForm}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Select Project</label>
                <select
                  value={assignForm.projectId}
                  onChange={(e) => setAssignForm({ ...assignForm, projectId: e.target.value })}
                  style={styles.formSelect}
                  required
                >
                  <option value="">-- Select a project --</option>
                  {projects.map(proj => (
                    <option key={proj.id} value={proj.id}>{proj.name}</option>
                  ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Start Date</label>
                <input
                  type="date"
                  value={assignForm.startDate}
                  onChange={(e) => setAssignForm({ ...assignForm, startDate: e.target.value })}
                  style={styles.formInput}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Notes (Optional)</label>
                <textarea
                  value={assignForm.notes}
                  onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                  style={styles.formTextarea}
                  placeholder="Add any additional notes..."
                  rows="3"
                />
              </div>

              {/* Footer Buttons */}
              <div style={styles.modalFooter}>
                <button
                  type="button"
                  onClick={handleCloseAssignModal}
                  style={styles.modalCancelBtn}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ ...styles.modalSubmitBtn, opacity: submitting ? 0.6 : 1 }}
                >
                  {submitting ? 'Assigning…' : '✓ Assign to Project'}
                </button>
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
  filterRow: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  },
  searchWrapper: {
    position: 'relative',
    flex: 1,
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--color-text-muted)',
  },
  searchInput: {
    width: '100%',
    padding: '10px 14px 10px 38px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    outline: 'none',
    fontSize: '14px',
  },
  selectFilter: {
    padding: '10px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    fontWeight: '600',
    outline: 'none',
    fontSize: '14px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
    gap: '24px',
  },
  emptyCard: {
    gridColumn: '1 / -1',
    padding: '40px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
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
  profileMetaWrap: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  },
  empName: {
    fontSize: '13px',
    fontWeight: '700',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  verifyBadge: {
    backgroundColor: 'var(--color-primary-light)',
    color: 'var(--color-success)',
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: '700',
  },
  verifyToggleBtn: {
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--color-text-secondary)',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    padding: '4px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  empId: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    fontWeight: '700',
    fontFamily: 'monospace',
    marginTop: '2px',
  },
  empRole: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    fontWeight: '600',
    marginTop: '2px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  sectionHeader: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-text-muted)',
    fontWeight: '700',
    margin: 0,
  },
  skillsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  skillPill: {
    fontSize: '11px',
    background: 'var(--color-bg-card-hover)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    padding: '3px 8px',
    borderRadius: '4px',
    fontWeight: '600',
  },
  seeMoreBtn: {
    fontSize: '11px',
    background: 'transparent',
    border: 'none',
    color: 'var(--color-primary)',
    padding: '3px 8px',
    borderRadius: '4px',
    fontWeight: '600',
    cursor: 'pointer',
    textDecoration: 'none',
  },
  cardFooter: {
    marginTop: 'auto',
    borderTop: '1px solid var(--color-border)',
    paddingTop: '16px',
    display: 'flex',
    justifyContent: 'stretch',
  },
  assignBtn: {
    flex: 1,
    padding: '10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'var(--color-bg-card)',
    borderRadius: 'var(--radius-lg)',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px 24px 16px',
    borderBottom: '1px solid var(--color-border)',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '800',
    margin: 0,
    color: 'var(--color-text-primary)',
  },
  modalCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.2s',
  },
  modalProfileCard: {
    margin: '0 24px 20px',
    padding: '16px',
    background: 'var(--color-bg-root)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    textAlign: 'center',
  },
  modalProfileBadge: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--color-primary)',
    backgroundColor: 'var(--color-primary-light)',
    padding: '4px 8px',
    borderRadius: '4px',
    marginBottom: '8px',
  },
  modalProfileName: {
    fontSize: '18px',
    fontWeight: '800',
    margin: '0 0 4px',
    color: 'var(--color-text-primary)',
  },
  modalProfileRole: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    fontWeight: '600',
  },
  modalForm: {
    padding: '0 24px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  formLabel: {
    fontSize: '12px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-text-secondary)',
  },
  formInput: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  formSelect: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  formTextarea: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    resize: 'vertical',
  },
  modalFooter: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
  },
  modalCancelBtn: {
    flex: 1,
    padding: '10px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  modalSubmitBtn: {
    flex: 1,
    padding: '10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  }
};