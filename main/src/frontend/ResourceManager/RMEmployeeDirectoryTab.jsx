import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { fetchEmployees, toggleEmployeeVerified, assignEmployeeFromDirectory, fetchProjects, fetchEmployeeDetails, fetchRequirements } from './Rmapi';
import RMAvatar from './RMAvatar';

export default function RMEmployeeDirectoryTab() {
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('All');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeeDetails, setEmployeeDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [assignForm, setAssignForm] = useState({
    projectId: '',
    requirementId: '',
    role: '',
    startDate: new Date().toISOString().split('T')[0],
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [expandedSkills, setExpandedSkills] = useState({});

  useEffect(() => {
    loadEmployees();
    const handleUpdate = () => loadEmployees();
    window.addEventListener('rmDataUpdated', handleUpdate);
    return () => window.removeEventListener('rmDataUpdated', handleUpdate);
  }, []);

  const loadEmployees = async () => {
    setLoading(true);
    setError(null);
    try {
      const [empData, projData, reqData] = await Promise.all([
        fetchEmployees(),
        fetchProjects(),
        fetchRequirements()
      ]);
      setEmployees(empData.employees || empData.data || empData || []);
      setProjects(projData.projects || projData.data || projData || []);
      setRequirements(reqData.data || reqData || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleVerify = async (empId) => {
    setEmployees((prev) => prev.map((emp) => (emp.id === empId ? { ...emp, isVerified: !emp.isVerified } : emp)));
    try {
      await toggleEmployeeVerified(empId);
      window.dispatchEvent(new CustomEvent('rmDataUpdated'));
    } catch (err) {
      setEmployees((prev) => prev.map((emp) => (emp.id === empId ? { ...emp, isVerified: !emp.isVerified } : emp)));
      Swal.fire({
        title: 'Error!',
        text: `Couldn't update verification status: ${err.message}`,
        icon: 'error',
        background: 'var(--color-bg-card, #1e293b)',
        color: 'var(--color-text-primary, #fff)',
        confirmButtonColor: 'var(--color-danger, #ef4444)'
      });
    }
  };

  const handleOpenAssignModal = (emp) => {
    if (!emp.isAssignable) return;
    setSelectedEmployee(emp);
    setAssignForm({
      projectId: '',
      requirementId: '',
      role: emp.role || '',
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

    // Guard against duplicate assignment to the same project
    const pIdNum = Number(assignForm.projectId);
    const isAlreadyAssigned =
      (selectedEmployee.assignedProjectIds && (selectedEmployee.assignedProjectIds.includes(pIdNum) || selectedEmployee.assignedProjectIds.includes(assignForm.projectId))) ||
      (selectedEmployee.assignedProjects && selectedEmployee.assignedProjects.some(pName => {
        const p = projects.find(proj => String(proj.id) === String(assignForm.projectId));
        return p && p.name === pName;
      }));

    if (isAlreadyAssigned) {
      Swal.fire({
        title: 'Already Assigned!',
        text: `${selectedEmployee.name} is already assigned to this project.`,
        icon: 'warning',
        background: 'var(--color-bg-card, #1e293b)',
        color: 'var(--color-text-primary, #fff)',
        confirmButtonColor: 'var(--color-primary, #10b981)'
      });
      return;
    }

    setSubmitting(true);
    try {
      await assignEmployeeFromDirectory(selectedEmployee.id, {
        projectId: assignForm.projectId,
        startDate: assignForm.startDate,
        role: assignForm.role || selectedEmployee.role,
        notes: assignForm.notes,
        requirementId: assignForm.requirementId || null
      });

      Swal.fire({
        title: 'Assigned Successfully!',
        text: `Assigned ${selectedEmployee.name} to project.`,
        icon: 'success',
        background: 'var(--color-bg-card, #1e293b)',
        color: 'var(--color-text-primary, #fff)',
        confirmButtonColor: 'var(--color-primary, #10b981)'
      });

      handleCloseAssignModal();
      loadEmployees();
      window.dispatchEvent(new CustomEvent('rmDataUpdated'));
    } catch (err) {
      Swal.fire({
        title: 'Assignment Failed',
        text: err.message || "Couldn't assign employee",
        icon: 'error',
        background: 'var(--color-bg-card, #1e293b)',
        color: 'var(--color-text-primary, #fff)',
        confirmButtonColor: 'var(--color-danger, #ef4444)'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ✅ View Employee Details
  // ✅ Updated: View Employee Details with better debugging
const handleViewEmployee = async (emp) => {
  setSelectedEmployee(emp);
  setShowViewModal(true);
  setLoadingDetails(true);
  setEmployeeDetails(null);
  
  try {
    const details = await fetchEmployeeDetails(emp.id);
    console.log('📊 Employee Details Response:', details);
    
    // ✅ Ensure tasks have title property
    if (details.tasks) {
      details.tasks = details.tasks.map(task => ({
        ...task,
        title: task.title || 'Untitled Task'
      }));
    }
    
    // ✅ Ensure projects have tasks with title
    if (details.projects) {
      details.projects = details.projects.map(project => ({
        ...project,
        tasks: (project.tasks || []).map(task => ({
          ...task,
          title: task.title || 'Untitled Task'
        }))
      }));
    }
    
    setEmployeeDetails(details);
  } catch (err) {
    console.error('Error fetching employee details:', err);
    setEmployeeDetails({
      ...emp,
      projects: [],
      tasks: [],
      workloadScore: 0,
      utilizationRate: 0,
      taskCount: 0,
      workloadStatus: 'Unknown'
    });
  } finally {
    setLoadingDetails(false);
  }
};

  const handleCloseViewModal = () => {
    setShowViewModal(false);
    setSelectedEmployee(null);
    setEmployeeDetails(null);
  };

  const toTitleCase = (str) => {
    if (!str) return '';
    return str
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.role || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.skills.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesRole = selectedRole === 'All' || toTitleCase(emp.role) === selectedRole;
    return matchesSearch && matchesRole;
  });

  const normalizedRoles = employees
    .map((emp) => toTitleCase(emp.role))
    .filter(Boolean);
  const uniqueRoles = ['All', ...new Set(normalizedRoles)].sort((a, b) => {
    if (a === 'All') return -1;
    if (b === 'All') return 1;
    return a.localeCompare(b);
  });

  const toggleSkillsExpand = (empId) => {
    setExpandedSkills(prev => ({
      ...prev,
      [empId]: !prev[empId]
    }));
  };

  // ✅ Unassigned if not assigned in project (not in the task)
  const isEmployeeProjectAssigned = (emp) => {
    if (!emp) return false;
    if (emp.rawRole === 'Project Manager') {
      return Boolean(emp.assignmentCount > 0 || emp.isAssigned);
    }
    return Boolean(
      emp.isAssigned &&
      ((emp.assignedProjects && emp.assignedProjects.length > 0) ||
       (emp.assignedProjectIds && emp.assignedProjectIds.length > 0))
    );
  };

  // ✅ Availability status and percentage based on Availability Factor (A):
  // Formula: A = 1 / (1 + e^(0.4 * (W - 7)))
  // Status Label Reference:
  // W=0   -> A=1.000 / 0.943 -> Available (100%) [Green]
  // W=1   -> A=0.916         -> Available (92%)  [Green]
  // W=3   -> A=0.832         -> Available (83%)  [Green]
  // W=4   -> A=0.802         -> Available (80%)  [Green]
  // W=5   -> A=0.769         -> Limited Availability (77%) [Amber]
  // W=6   -> A=0.599         -> Limited Availability (60%) [Amber]
  // W=7   -> A=0.500         -> Limited Availability (50%) [Amber]
  // W=8   -> A=0.401         -> Fully Utilized (40%) [Red]
  // W=10  -> A=0.231         -> Fully Utilized (23%) [Red]
  // W>=14 -> A=~0.05         -> Fully Utilized (5%)  [Red]
  const getAvailabilityBadge = (emp) => {
    if (!emp) {
      return {
        label: 'Available',
        displayText: 'Available (100%)',
        bg: 'rgba(16, 185, 129, 0.15)',
        color: 'var(--color-success)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        percentage: 100,
      };
    }

    const isPM = emp.rawRole === 'Project Manager' || emp.isPM;
    if (isPM) {
      return {
        label: 'Available',
        displayText: 'Available (100%)',
        bg: 'rgba(16, 185, 129, 0.15)',
        color: 'var(--color-success)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        percentage: 100,
      };
    }

    // Determine Availability Factor A
    let A;
    if (typeof emp.availabilityFactor === 'number' && !isNaN(emp.availabilityFactor)) {
      A = emp.availabilityFactor;
    } else if (typeof emp.workloadScore === 'number' && !isNaN(emp.workloadScore)) {
      const W = emp.workloadScore;
      A = W === 0 ? 1.0 : (1 / (1 + Math.exp(0.4 * (W - 7))));
    } else if (typeof emp.utilizationRate === 'number' && !isNaN(emp.utilizationRate)) {
      const util = emp.utilizationRate;
      if (util === 0) {
        A = 1.0;
      } else {
        const W = (util / 100) * 7;
        A = 1 / (1 + Math.exp(0.4 * (W - 7)));
      }
    } else {
      A = 1.0;
    }

    // Calculate availability percentage (0-100%) from A:
    let availPct;
    if (A >= 0.943 || (emp.workloadScore === 0 && (!emp.activeTaskCount || emp.activeTaskCount === 0))) {
      availPct = 100;
    } else {
      availPct = Math.max(1, Math.min(100, Math.round(A * 100)));
    }

    let label = 'Available';
    let bg = 'rgba(16, 185, 129, 0.15)';
    let color = 'var(--color-success)';
    let border = '1px solid rgba(16, 185, 129, 0.3)';

    // Status Label Reference per paper:
    // A >= 0.80 -> Available (Green)
    // 0.50 <= A < 0.80 -> Limited Availability (Amber)
    // A < 0.50 -> Fully Utilized (Red)
    if (A >= 0.80) {
      label = 'Available';
      bg = 'rgba(16, 185, 129, 0.15)';
      color: 'var(--color-success)';
      border = '1px solid rgba(16, 185, 129, 0.3)';
    } else if (A >= 0.50) {
      label = 'Limited Availability';
      bg = 'rgba(245, 158, 11, 0.15)';
      color = 'var(--color-warning)';
      border = '1px solid rgba(245, 158, 11, 0.3)';
    } else {
      label = 'Fully Utilized';
      bg = 'rgba(239, 68, 68, 0.15)';
      color = 'var(--color-danger)';
      border = '1px solid rgba(239, 68, 68, 0.3)';
    }

    const displayText = `${label} (${availPct}%)`;

    return { label, displayText, bg, color, border, factor: A, percentage: availPct };
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

              {/* Assignment & Availability Badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                {(() => {
                  const isAssigned = isEmployeeProjectAssigned(emp);
                  return (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        backgroundColor: isAssigned ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                        color: isAssigned ? 'var(--color-success)' : 'var(--color-text-muted)',
                        border: isAssigned ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(148, 163, 184, 0.25)',
                      }}
                      title={
                        emp.rawRole === 'Project Manager'
                          ? (isAssigned ? `Assigned — Managing ${emp.assignmentCount} project(s)` : 'Unassigned — No active projects')
                          : isAssigned ? `Assigned to: ${emp.assignedProjects?.join(', ')}` : 'Unassigned — Not assigned to any project'
                      }
                    >
                      <span style={{ fontSize: '9px' }}>{'●'}</span>
                      {isAssigned ? 'Assigned' : 'Unassigned'}
                    </span>
                  );
                })()}

                {(() => {
                  const avail = getAvailabilityBadge(emp);
                  return (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        backgroundColor: avail.bg,
                        color: avail.color,
                        border: avail.border,
                      }}
                      title={`Availability Factor: ${typeof avail.factor === 'number' ? avail.factor.toFixed(3) : avail.factor} (${avail.displayText})`}
                    >
                      {avail.displayText}
                    </span>
                  );
                })()}
              </div>

              {/* Skills Section */}
              <div style={styles.section}>
                <h4 style={styles.sectionHeader}>{emp.rawRole === 'Project Manager' ? 'Role' : 'Core Skills'}</h4>
                <div style={styles.skillsList}>
                  {emp.rawRole === 'Project Manager' ? (
                    <>
                      <span style={{ ...styles.skillPill, background: 'rgba(99,102,241,0.12)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.25)', fontWeight: '600' }}>
                        Project Manager
                      </span>
                      <span style={{ ...styles.skillPill, background: 'rgba(99,102,241,0.08)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)', fontWeight: '600' }}>
                        {emp.assignmentCount > 0 ? `Managing ${emp.assignmentCount} Project${emp.assignmentCount === 1 ? '' : 's'}` : 'No Active Projects'}
                      </span>
                    </>
                  ) : emp.skills.length === 0 ? (
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
                  onClick={() => handleViewEmployee(emp)}
                  style={styles.viewBtn}
                >
                  View Details
                </button>
                {emp.isAssignable ? (
                  <button
                    onClick={() => handleOpenAssignModal(emp)}
                    style={styles.assignBtn}
                  >
                    Assign to Project
                  </button>
                ) : (
                  <span style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: '700',
                    color: '#6366f1',
                    background: 'rgba(99, 102, 241, 0.08)',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                    borderRadius: '6px',
                    padding: '10px',
                    boxSizing: 'border-box',
                    textAlign: 'center',
                  }}>
                    Project Manager
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Assign to Project Modal */}
      {showAssignModal && selectedEmployee && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Assign Employee to Project</h2>
              <button onClick={handleCloseAssignModal} style={styles.modalCloseBtn}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div style={styles.modalProfileCard}>
              <div style={styles.modalProfileBadge}>
                [{selectedEmployee.department}] &bull; {isEmployeeProjectAssigned(selectedEmployee) ? `Assigned (${selectedEmployee.assignedProjects?.join(', ')})` : 'Unassigned'} &bull; [{getAvailabilityBadge(selectedEmployee).displayText}]
              </div>
              <h3 style={styles.modalProfileName}>{selectedEmployee.name}</h3>
              <div style={styles.modalProfileRole}>{selectedEmployee.role}</div>
            </div>

            <form onSubmit={handleAssignSubmit} style={styles.modalForm}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Select Project</label>
                <select
                  value={assignForm.projectId}
                  onChange={(e) => {
                    const pId = e.target.value;
                    const foundProj = projects.find(p => String(p.id) === String(pId));
                    let formattedStartDate = assignForm.startDate;
                    if (foundProj?.startDate) {
                      try {
                        formattedStartDate = new Date(foundProj.startDate).toISOString().split('T')[0];
                      } catch (_) {}
                    }
                    setAssignForm({
                      ...assignForm,
                      projectId: pId,
                      startDate: formattedStartDate,
                      requirementId: '',
                      role: selectedEmployee?.role || ''
                    });
                  }}
                  style={styles.formSelect}
                  required
                >
                  <option value="">-- Select a project (Active / Pending) --</option>
                  {projects
                    .filter(proj => {
                      const st = String(proj.status || '').toLowerCase();
                      return st === 'active' || st === 'pending';
                    })
                    .map(proj => {
                      const pIdNum = Number(proj.id);
                      const isAlreadyAssigned =
                        (selectedEmployee?.assignedProjectIds && (selectedEmployee.assignedProjectIds.includes(pIdNum) || selectedEmployee.assignedProjectIds.includes(proj.id))) ||
                        (selectedEmployee?.assignedProjects && selectedEmployee.assignedProjects.includes(proj.name));
                      return (
                        <option key={proj.id} value={proj.id} disabled={isAlreadyAssigned}>
                          {proj.name} ({proj.status || 'Active'}){isAlreadyAssigned ? ' — [Already Assigned]' : ''}
                        </option>
                      );
                    })}
                </select>
              </div>

              {/* Select Requested Role Dropdown (Item 12) */}
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Select Requested Role (Optional)</label>
                <select
                  value={assignForm.requirementId}
                  onChange={(e) => {
                    const reqId = e.target.value;
                    const foundReq = requirements.find(r => String(r.id) === String(reqId));
                    setAssignForm({
                      ...assignForm,
                      requirementId: reqId,
                      role: foundReq ? (foundReq.role_title || foundReq.role || assignForm.role) : (selectedEmployee?.role || '')
                    });
                  }}
                  style={styles.formSelect}
                  disabled={!assignForm.projectId}
                >
                  <option value="">
                    {assignForm.projectId
                      ? `-- Direct Assignment (${selectedEmployee?.role || 'Default Role'}) --`
                      : '-- Please select a project first --'}
                  </option>
                  {requirements
                    .filter(req => {
                      if (String(req.project_id) !== String(assignForm.projectId)) return false;
                      const st = String(req.status || '').toLowerCase();
                      return st !== 'filled' && st !== 'cancelled' && st !== 'rejected';
                    })
                    .map(req => (
                      <option key={req.id} value={req.id}>
                        {req.role_title || req.role} ({req.quantity_needed || req.quantity || 1} needed - {req.status || 'Pending'})
                      </option>
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

              <div style={styles.modalFooter}>
                <button type="button" onClick={handleCloseAssignModal} style={styles.modalCancelBtn}>
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

      {/* ✅ View Employee Details Modal */}
      {showViewModal && selectedEmployee && (
        <div style={styles.modalOverlay} onClick={(e) => {
          if (e.target === e.currentTarget) handleCloseViewModal();
        }}>
          <div style={{ ...styles.modal, maxWidth: '700px' }}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>
                {employeeDetails?.isPM ? 'Project Manager Details' : 'Employee Details'}
              </h2>
              <button onClick={handleCloseViewModal} style={styles.modalCloseBtn}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {loadingDetails ? (
              <div style={styles.loadingDetails}>Loading employee details...</div>
            ) : employeeDetails ? (
              <>
                {/* Employee Profile */}
                <div style={styles.viewProfileSection}>
                  <div style={styles.viewProfileHeader}>
                    <RMAvatar name={employeeDetails.name} src={employeeDetails.avatar} size={60} />
                    <div style={styles.viewProfileInfo}>
                      <h3 style={styles.viewProfileName}>
                        {employeeDetails.name}
                        {employeeDetails.isVerified && (
                          <span style={styles.verifyBadge}>✓ Verified</span>
                        )}
                      </h3>
                      <div style={styles.viewProfileId}>{employeeDetails.employeeId || 'No ID'}</div>
                      <div style={styles.viewProfileRole}>{employeeDetails.role || 'Unassigned'}</div>
                      <div style={styles.viewProfileDept}>{employeeDetails.department || 'No Department'}</div>
                    </div>
                  </div>
                </div>

                {/* Workload Summary */}
                {employeeDetails.isPM ? (
                  /* PM: show managed projects summary */
                  <div style={styles.viewWorkloadSection}>
                    <div style={styles.viewWorkloadGrid}>
                      <div style={styles.viewWorkloadItem}>
                        <span style={styles.viewWorkloadLabel}>Role</span>
                        <span style={{ ...styles.viewWorkloadValue, color: '#6366f1' }}>Project Manager</span>
                      </div>
                      <div style={styles.viewWorkloadItem}>
                        <span style={styles.viewWorkloadLabel}>Active Projects</span>
                        <span style={styles.viewWorkloadValue}>{employeeDetails.managedProjectCount || 0}</span>
                      </div>
                      <div style={styles.viewWorkloadItem}>
                        <span style={styles.viewWorkloadLabel}>Status</span>
                        <span style={{
                          ...styles.viewStatusBadge,
                          backgroundColor: 'var(--color-primary-light)',
                          color: 'var(--color-success)'
                        }}>
                          Available
                        </span>
                      </div>
                      <div style={styles.viewWorkloadItem}>
                        <span style={styles.viewWorkloadLabel}>Load</span>
                        <span style={styles.viewWorkloadValue}>{employeeDetails.utilizationRate || 0}%</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Employee: show workload metrics */
                  <div style={styles.viewWorkloadSection}>
                    <div style={styles.viewWorkloadGrid}>
                      <div style={styles.viewWorkloadItem}>
                        <span style={styles.viewWorkloadLabel}>Workload Score</span>
                        <span style={styles.viewWorkloadValue}>{employeeDetails.workloadScore || 0}</span>
                      </div>
                      <div style={styles.viewWorkloadItem}>
                        <span style={styles.viewWorkloadLabel}>Availability</span>
                        <span style={styles.viewWorkloadValue}>{getAvailabilityBadge(employeeDetails).percentage}%</span>
                      </div>
                      <div style={styles.viewWorkloadItem}>
                        <span style={styles.viewWorkloadLabel}>Status</span>
                        {(() => {
                          const avail = getAvailabilityBadge(employeeDetails);
                          return (
                            <span style={{
                              ...styles.viewStatusBadge,
                              backgroundColor: avail.bg,
                              color: avail.color
                            }}>
                              {avail.label}
                            </span>
                          );
                        })()}
                      </div>
                      <div style={styles.viewWorkloadItem}>
                        <span style={styles.viewWorkloadLabel}>Active Tasks</span>
                        <span style={styles.viewWorkloadValue}>{employeeDetails.activeTaskCount ?? employeeDetails.taskCount ?? 0}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* PM: Managed Projects */}
                {employeeDetails.isPM && (() => {
                  const activeManaged = (employeeDetails.managedProjects || []).filter(p => p.status === 'Active');
                  const pastManaged = (employeeDetails.managedProjects || []).filter(p => p.status !== 'Active');
                  return (
                    <div style={styles.viewSection}>
                      <h4 style={styles.viewSectionTitle}>
                        Managed Projects ({activeManaged.length})
                      </h4>
                      {activeManaged.length > 0 ? (
                        <div style={styles.viewProjectList}>
                          {activeManaged.map((proj, idx) => (
                            <div key={idx} style={styles.viewProjectCard}>
                              <div style={styles.viewProjectHeader}>
                                <span style={styles.viewProjectName}>
                                  {proj.name || 'Unnamed Project'}
                                  {proj.code && (
                                    <span style={styles.viewProjectCode}> ({proj.code})</span>
                                  )}
                                </span>
                                <span style={{
                                  ...styles.viewProjectStatus,
                                  backgroundColor: 'var(--color-primary-light)',
                                  color: 'var(--color-success)'
                                }}>
                                  {proj.status || 'Active'}
                                </span>
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                👥 {proj.memberCount || 0} team member{proj.memberCount === 1 ? '' : 's'}
                                {proj.members && proj.members.length > 0 && (
                                  <span style={{ marginLeft: '8px', color: 'var(--color-text-secondary)' }}>
                                    — {proj.members.join(', ')}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={styles.viewEmptyText}>No active projects managed</p>
                      )}

                      {/* Completed / Past Projects */}
                      {pastManaged.length > 0 && (
                        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                          <h4 style={{ ...styles.viewSectionTitle, color: 'var(--color-text-muted)' }}>
                            Completed &amp; Past Projects ({pastManaged.length})
                          </h4>
                          <div style={styles.viewProjectList}>
                            {pastManaged.map((proj, idx) => (
                              <div key={idx} style={{ ...styles.viewProjectCard, opacity: 0.85 }}>
                                <div style={styles.viewProjectHeader}>
                                  <span style={styles.viewProjectName}>
                                    {proj.name || 'Unnamed Project'}
                                    {proj.code && (
                                      <span style={styles.viewProjectCode}> ({proj.code})</span>
                                    )}
                                  </span>
                                  <span style={{
                                    ...styles.viewProjectStatus,
                                    backgroundColor: 'var(--color-bg-hover)',
                                    color: 'var(--color-text-muted)'
                                  }}>
                                    {proj.status || 'Completed'}
                                  </span>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                  👥 {proj.memberCount || 0} team member{proj.memberCount === 1 ? '' : 's'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Employee: Projects & Tasks */}
                {!employeeDetails.isPM && (() => {
                  const activeProjects = (employeeDetails.projects || [])
                    .map(p => ({
                      ...p,
                      activeTasks: (p.tasks || []).filter(t => t.isActive !== false)
                    }))
                    .filter(p => p.project_status === 'Active' || p.activeTasks.length > 0);

                  const pastProjects = (employeeDetails.projects || [])
                    .map(p => ({
                      ...p,
                      closedTasks: (p.tasks || []).filter(t => t.isActive === false)
                    }))
                    .filter(p => p.project_status !== 'Active' || p.closedTasks.length > 0);

                  return (
                    <div style={styles.viewSection}>
                      <h4 style={styles.viewSectionTitle}>
                        Projects &amp; Tasks ({activeProjects.length} active project{activeProjects.length === 1 ? '' : 's'})
                      </h4>
                      
                      {activeProjects.length > 0 ? (
                        <div style={styles.viewProjectList}>
                          {activeProjects.map((project, idx) => (
                            <div key={idx} style={styles.viewProjectCard}>
                              <div style={styles.viewProjectHeader}>
                                <span style={styles.viewProjectName}>
                                  {project.project_name || 'Unnamed Project'}
                                  {project.project_code && (
                                    <span style={styles.viewProjectCode}> ({project.project_code})</span>
                                  )}
                                </span>
                                <span style={{
                                  ...styles.viewProjectStatus,
                                  backgroundColor: project.project_status === 'Active' ? 'var(--color-primary-light)' : 'var(--color-bg-hover)',
                                  color: project.project_status === 'Active' ? 'var(--color-success)' : 'var(--color-text-muted)'
                                }}>
                                  {project.project_status || 'Active'}
                                </span>
                              </div>
                              
                              <div style={styles.viewProjectTasks}>
                                {project.activeTasks && project.activeTasks.length > 0 ? (
                                  project.activeTasks.map((task, taskIdx) => (
                                    <div key={taskIdx} style={styles.viewTaskItem}>
                                      <div style={{ flex: 1 }}>
                                        <span style={styles.viewTaskName}>• {task.title || 'Untitled Task'}</span>
                                      </div>
                                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{
                                          ...styles.viewTaskPriority,
                                          backgroundColor: task.priority === 'High' ? 'rgba(239, 68, 68, 0.1)' :
                                                        task.priority === 'Medium' ? 'rgba(245, 158, 11, 0.1)' :
                                                        'rgba(16, 185, 129, 0.1)',
                                          color: task.priority === 'High' ? 'var(--color-danger)' :
                                                task.priority === 'Medium' ? 'var(--color-warning)' :
                                                'var(--color-success)'
                                        }}>
                                          {task.priority || 'Low'}
                                        </span>
                                        <span style={{
                                          ...styles.viewTaskStatus,
                                          backgroundColor: task.status === 'Completed' ? 'var(--color-primary-light)' :
                                                        task.status === 'In Progress' ? 'rgba(245, 158, 11, 0.1)' :
                                                        task.status === 'Completed-Hidden' ? 'var(--color-bg-hover)' :
                                                        'rgba(239, 68, 68, 0.1)',
                                          color: task.status === 'Completed' ? 'var(--color-success)' :
                                                task.status === 'In Progress' ? 'var(--color-warning)' :
                                                task.status === 'Completed-Hidden' ? 'var(--color-text-muted)' :
                                                'var(--color-danger)'
                                        }}>
                                          {task.status || 'Pending'}
                                        </span>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>No active tasks in this project</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={styles.viewEmptyText}>No active projects or tasks assigned</p>
                      )}

                      {/* Completed / Past Tasks & Projects */}
                      {pastProjects.length > 0 && (
                        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                          <h4 style={{ ...styles.viewSectionTitle, color: 'var(--color-text-muted)' }}>
                            Completed Tasks &amp; Past Projects ({pastProjects.reduce((sum, p) => sum + p.closedTasks.length, 0)} completed tasks)
                          </h4>
                          <div style={styles.viewProjectList}>
                            {pastProjects.map((project, idx) => (
                              <div key={idx} style={{ ...styles.viewProjectCard, opacity: 0.85 }}>
                                <div style={styles.viewProjectHeader}>
                                  <span style={styles.viewProjectName}>
                                    {project.project_name || 'Unnamed Project'}
                                    {project.project_code && (
                                      <span style={styles.viewProjectCode}> ({project.project_code})</span>
                                    )}
                                  </span>
                                  <span style={{
                                    ...styles.viewProjectStatus,
                                    backgroundColor: 'var(--color-bg-hover)',
                                    color: 'var(--color-text-muted)'
                                  }}>
                                    {project.project_status || 'Past'}
                                  </span>
                                </div>
                                <div style={styles.viewProjectTasks}>
                                  {project.closedTasks.map((task, taskIdx) => (
                                    <div key={taskIdx} style={styles.viewTaskItem}>
                                      <div style={{ flex: 1 }}>
                                        <span style={{ ...styles.viewTaskName, textDecoration: task.status === 'Completed' ? 'line-through' : 'none', color: 'var(--color-text-muted)' }}>
                                          ✓ {task.title || 'Untitled Task'}
                                        </span>
                                      </div>
                                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{
                                          ...styles.viewTaskStatus,
                                          backgroundColor: 'var(--color-bg-hover)',
                                          color: 'var(--color-text-muted)'
                                        }}>
                                          {task.status}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Skills */}
                <div style={styles.viewSection}>
                  <h4 style={styles.viewSectionTitle}>Skills</h4>
                  <div style={styles.viewSkillsList}>
                    {employeeDetails.skills && employeeDetails.skills.length > 0 ? (
                      employeeDetails.skills.map((skill, idx) => (
                        <span key={idx} style={styles.skillPill}>{skill}</span>
                      ))
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>No skills listed</span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p style={styles.viewEmptyText}>No details available</p>
            )}
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
    gap: '8px',
  },
  viewBtn: {
    flex: 1,
    padding: '10px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s',
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
  },
  // ✅ View Modal Specific Styles
  loadingDetails: {
    padding: '40px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
  },
  viewProfileSection: {
    padding: '20px 24px',
    borderBottom: '1px solid var(--color-border)',
  },
  viewProfileHeader: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  },
  viewProfileInfo: {
    flex: 1,
  },
  viewProfileName: {
    fontSize: '18px',
    fontWeight: '800',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'var(--color-text-primary)',
  },
  viewProfileId: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontFamily: 'monospace',
    fontWeight: '700',
    marginTop: '2px',
  },
  viewProfileRole: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    fontWeight: '600',
    marginTop: '2px',
  },
  viewProfileDept: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    marginTop: '2px',
  },
  viewWorkloadSection: {
    padding: '16px 24px',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
  },
  viewWorkloadGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
  },
  viewWorkloadItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  viewWorkloadLabel: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: '600',
  },
  viewWorkloadValue: {
    fontSize: '20px',
    fontWeight: '800',
    color: 'var(--color-text-primary)',
    marginTop: '4px',
  },
  viewStatusBadge: {
    fontSize: '12px',
    fontWeight: '700',
    padding: '4px 12px',
    borderRadius: '30px',
    display: 'inline-block',
    marginTop: '4px',
  },
  viewSection: {
    padding: '16px 24px',
    borderBottom: '1px solid var(--color-border)',
  },
  viewSectionTitle: {
    fontSize: '14px',
    fontWeight: '700',
    margin: '0 0 12px 0',
    color: 'var(--color-text-primary)',
  },
  viewAssignmentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  viewAssignmentItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: 'var(--color-bg-root)',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
  },
  viewAssignmentName: {
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
  },
  viewAssignmentRole: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
  },
  viewAssignmentStatus: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--color-success)',
  },
  viewTaskList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  viewTaskItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: 'var(--color-bg-root)',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
  },
  viewTaskName: {
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    flex: 1,
  },
  viewTaskPriority: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: '4px',
    margin: '0 8px',
  },
  viewTaskStatus: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--color-text-secondary)',
  },
  viewSkillsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  viewEmptyText: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
    margin: 0,
  },

  // Add to styles object
  viewProjectList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  viewProjectCard: {
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '12px 16px',
    background: 'var(--color-bg-root)',
  },
  viewProjectHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    paddingBottom: '8px',
    borderBottom: '1px solid var(--color-border)',
  },
  viewProjectName: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  viewProjectCode: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontWeight: '400',
    marginLeft: '8px',
  },
  viewProjectStatus: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '2px 10px',
    borderRadius: '20px',
  },
  viewProjectTasks: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
};