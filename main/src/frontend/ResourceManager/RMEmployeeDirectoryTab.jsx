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
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    backgroundColor: emp.isAssigned ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                    color: emp.isAssigned ? 'var(--color-success)' : 'var(--color-text-muted)',
                    border: emp.isAssigned ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(148, 163, 184, 0.25)',
                  }}
                  title={emp.isAssigned ? `Assigned to: ${emp.assignedProjects?.join(', ')}` : 'No active project assignments'}
                >
                  <span style={{ fontSize: '9px' }}>{emp.isAssigned ? '●' : '○'}</span>
                  {emp.isAssigned
                    ? `Assigned: ${emp.assignedProjects?.join(', ') || 'Active Project'}`
                    : 'Unassigned'}
                </span>

                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    backgroundColor:
                      emp.workloadStatus === 'Available'
                        ? 'rgba(16, 185, 129, 0.15)'
                        : emp.workloadStatus === 'Limited Availability'
                        ? 'rgba(245, 158, 11, 0.15)'
                        : 'rgba(239, 68, 68, 0.15)',
                    color:
                      emp.workloadStatus === 'Available'
                        ? 'var(--color-success)'
                        : emp.workloadStatus === 'Limited Availability'
                        ? 'var(--color-warning)'
                        : 'var(--color-danger)',
                    border:
                      emp.workloadStatus === 'Available'
                        ? '1px solid rgba(16, 185, 129, 0.3)'
                        : emp.workloadStatus === 'Limited Availability'
                        ? '1px solid rgba(245, 158, 11, 0.3)'
                        : '1px solid rgba(239, 68, 68, 0.3)',
                  }}
                >
                  {emp.workloadStatus || 'Available'}
                  {emp.utilizationRate !== undefined && emp.utilizationRate !== null && emp.workloadStatus !== 'Available'
                    ? ` (${emp.utilizationRate}%)`
                    : ''}
                </span>
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
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic', display: 'block', width: '100%', textAlign: 'center', alignSelf: 'center' }}>
                    Not assignable
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
                [{selectedEmployee.department}] &bull; {selectedEmployee.isAssigned ? `Assigned (${selectedEmployee.assignedProjects?.join(', ')})` : 'Unassigned'} &bull; [{selectedEmployee.workloadStatus || 'Available'}]
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
              <h2 style={styles.modalTitle}>Employee Details</h2>
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
                <div style={styles.viewWorkloadSection}>
                  <div style={styles.viewWorkloadGrid}>
                    <div style={styles.viewWorkloadItem}>
                      <span style={styles.viewWorkloadLabel}>Workload Score</span>
                      <span style={styles.viewWorkloadValue}>{employeeDetails.workloadScore || 0}</span>
                    </div>
                    <div style={styles.viewWorkloadItem}>
                      <span style={styles.viewWorkloadLabel}>Utilization</span>
                      <span style={styles.viewWorkloadValue}>{employeeDetails.utilizationRate || 0}%</span>
                    </div>
                    <div style={styles.viewWorkloadItem}>
                      <span style={styles.viewWorkloadLabel}>Status</span>
                      <span style={{
                        ...styles.viewStatusBadge,
                        backgroundColor: employeeDetails.workloadStatus === 'Available' ? 'var(--color-primary-light)' : 
                                       employeeDetails.workloadStatus === 'Limited Availability' ? 'rgba(245, 158, 11, 0.1)' : 
                                       'rgba(239, 68, 68, 0.1)',
                        color: employeeDetails.workloadStatus === 'Available' ? 'var(--color-success)' : 
                               employeeDetails.workloadStatus === 'Limited Availability' ? 'var(--color-warning)' : 
                               'var(--color-danger)'
                      }}>
                        {employeeDetails.workloadStatus || 'Unknown'}
                      </span>
                    </div>
                    <div style={styles.viewWorkloadItem}>
                      <span style={styles.viewWorkloadLabel}>Tasks</span>
                      <span style={styles.viewWorkloadValue}>{employeeDetails.taskCount || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Projects & Tasks */}
                <div style={styles.viewSection}>
                  <h4 style={styles.viewSectionTitle}>
                    📋 Projects & Tasks ({employeeDetails.projects?.length || 0} projects)
                  </h4>
                  
                  {employeeDetails.projects && employeeDetails.projects.length > 0 ? (
                    <div style={styles.viewProjectList}>
                      {employeeDetails.projects.map((project, idx) => (
                        <div key={idx} style={styles.viewProjectCard}>
                          <div style={styles.viewProjectHeader}>
                            <span style={styles.viewProjectName}>
                              {project.project_name || 'Unnamed Project'}
                              <span style={styles.viewProjectCode}>({project.project_code || 'N/A'})</span>
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
                            {project.tasks && project.tasks.length > 0 ? (
                              project.tasks.map((task, taskIdx) => (
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
                              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>No tasks in this project</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={styles.viewEmptyText}>No projects or tasks assigned</p>
                  )}
                </div>

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