// main/src/frontend/ResourceManager/RMProjectsTab.jsx
import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import {
  fetchProjects,
  fetchEmployees,
  assignEmployeeToProject,
  removeEmployeeFromProject,
  fetchProjectHistoryDetails
} from './Rmapi';
import RMAvatar from './RMAvatar';

const COMPLETED_STATUSES = ['Completed', 'Archived'];

export default function RMProjectsTab() {
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [assignForm, setAssignForm] = useState({ employeeId: '', role: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [submitting, setSubmitting] = useState(false);

  // ✅ Tabs: "active" (Projects) vs "history" (Project History / completed)
  const [activeTab, setActiveTab] = useState('active');

  // ✅ Project History Details Modal state (view employees, tasks, client feedback)
  const [historyDetailsModal, setHistoryDetailsModal] = useState({
    isOpen: false,
    project: null,
    loading: false,
    data: null,
    error: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projData, empData] = await Promise.all([fetchProjects(), fetchEmployees()]);
      setProjects(projData.projects || []);
      setEmployees(empData.employees || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const showSuccessAlert = (message, title = 'Success!') => {
    Swal.fire({
      title,
      text: message,
      icon: 'success',
      confirmButtonColor: 'var(--color-primary)',
      confirmButtonText: 'OK',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
      iconColor: 'var(--color-success)',
      customClass: { popup: 'swal-custom-popup', confirmButton: 'swal-custom-confirm' }
    });
  };

  const showErrorAlert = (message, title = 'Error!') => {
    Swal.fire({
      title,
      text: message,
      icon: 'error',
      confirmButtonColor: 'var(--color-danger)',
      confirmButtonText: 'OK',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
      iconColor: 'var(--color-danger)',
      customClass: { popup: 'swal-custom-popup', confirmButton: 'swal-custom-confirm' }
    });
  };

  const showConfirmationAlert = (title, text, confirmText = 'Yes, remove') => {
    return Swal.fire({
      title,
      text,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'var(--color-primary)',
      cancelButtonColor: 'var(--color-text-muted)',
      confirmButtonText: confirmText,
      cancelButtonText: 'Cancel',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
      iconColor: 'var(--color-warning)',
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm',
        cancelButton: 'swal-custom-cancel'
      }
    });
  };

  const handleOpenAssignModal = (proj) => {
    setSelectedProject(proj);
    setShowAssignModal(true);
    setAssignForm({ employeeId: '', role: '' });
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assignForm.employeeId) return;

    const chosenEmp = employees.find(emp => emp.id === assignForm.employeeId);
    if (!chosenEmp) return;

    setSubmitting(true);
    try {
      await assignEmployeeToProject(selectedProject.id, {
        employeeId: chosenEmp.id,
        role: assignForm.role || chosenEmp.role
      });
      setShowAssignModal(false);
      showSuccessAlert(`Successfully assigned ${chosenEmp.name} to project!`);
      await loadData();
    } catch (err) {
      showErrorAlert(err.message.includes('already assigned')
        ? `${chosenEmp.name} is already assigned to this project!`
        : err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveMember = async (projId, empId, empName, projName) => {
    const result = await showConfirmationAlert(
      'Remove member?',
      `Remove ${empName} from ${projName}?`,
      'Yes, remove'
    );
    if (!result.isConfirmed) return;

    try {
      await removeEmployeeFromProject(projId, empId);
      await loadData();
    } catch (err) {
      showErrorAlert(err.message);
    }
  };

  // ✅ Open Project History details modal (client feedback, assigned employees, tasks)
  const handleOpenHistoryDetails = async (project) => {
    setHistoryDetailsModal({
      isOpen: true,
      project,
      loading: true,
      data: null,
      error: '',
    });
    try {
      const res = await fetchProjectHistoryDetails(project.id);
      const detailsData = res?.data || res;
      setHistoryDetailsModal(prev => ({
        ...prev,
        loading: false,
        data: detailsData,
      }));
    } catch (err) {
      console.error('Failed to load project history details:', err);
      setHistoryDetailsModal(prev => ({
        ...prev,
        loading: false,
        error: err.message || 'Failed to load project history details',
      }));
    }
  };

  const handleCloseHistoryDetails = () => {
    setHistoryDetailsModal({
      isOpen: false,
      project: null,
      loading: false,
      data: null,
      error: '',
    });
  };

  // Filter projects by active vs history
  const activeProjects = projects.filter(p => !COMPLETED_STATUSES.includes(p.status));
  const historyProjects = projects.filter(p => COMPLETED_STATUSES.includes(p.status));
  const currentTabProjects = activeTab === 'history' ? historyProjects : activeProjects;

  const filteredProjects = currentTabProjects.filter(proj => {
    const matchesSearch =
      proj.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (proj.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (proj.requiredSkills || []).some(skill => skill.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'All' || proj.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return <div style={styles.container}><p>Loading projects…</p></div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Projects Management</h1>
          <p style={styles.subtitle}>Track resource allocations, monitor utilization rates, and assign new candidates to active contracts.</p>
        </div>
        <div style={styles.controls}>
          <div style={styles.searchWrapper}>
            <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="All">All Status</option>
            {activeTab === 'history' ? (
              <>
                <option value="Completed">Completed</option>
                <option value="Archived">Archived</option>
              </>
            ) : (
              <>
                <option value="Active">Active</option>
                <option value="Pending">Pending</option>
                <option value="Inactive">Inactive</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* ✅ Sub-tabs: Projects (active) / Project History (completed) */}
      <div style={styles.tabsRow}>
        <button
          type="button"
          onClick={() => { setActiveTab('active'); setStatusFilter('All'); }}
          style={{ ...styles.tabBtn, ...(activeTab === 'active' ? styles.tabBtnActive : {}) }}
        >
          Projects
          <span style={{ ...styles.tabCount, ...(activeTab === 'active' ? styles.tabCountActive : {}) }}>
            {activeProjects.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('history'); setStatusFilter('All'); }}
          style={{ ...styles.tabBtn, ...(activeTab === 'history' ? styles.tabBtnActive : {}) }}
        >
          Project History
          <span style={{ ...styles.tabCount, ...(activeTab === 'history' ? styles.tabCountActive : {}) }}>
            {historyProjects.length}
          </span>
        </button>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '12px 16px', color: 'var(--color-danger)' }}>
          Couldn't load project data: {error}
        </div>
      )}

      {/* Projects Grid */}
      <div style={styles.grid}>
        {filteredProjects.length === 0 ? (
          <div className="glass-card" style={styles.emptyCard}>
            {activeTab === 'history'
              ? 'No completed projects found in history.'
              : (projects.length === 0
                ? 'No projects available.'
                : 'No active projects match your search.')}
          </div>
        ) : (
          filteredProjects.map(proj => {
            const assignedList = proj.assignedEmployees || [];

            return (
              <div key={proj.id} className="glass-card" style={styles.card}>
                <div style={styles.cardHeader}>
                  <div>
                    <h3 style={styles.projName}>{proj.name}</h3>
                    <span style={styles.duration}>Timeline: {proj.startDate} to {proj.endDate}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{
                      ...styles.statusBadge,
                      backgroundColor: proj.status === 'Active'
                        ? 'var(--color-primary-light)'
                        : (COMPLETED_STATUSES.includes(proj.status)
                          ? 'rgba(148, 163, 184, 0.15)'
                          : 'rgba(245, 158, 11, 0.1)'),
                      color: proj.status === 'Active'
                        ? 'var(--color-success)'
                        : (COMPLETED_STATUSES.includes(proj.status)
                          ? 'var(--color-text-secondary)'
                          : 'var(--color-warning)')
                    }}>
                      {proj.status}
                    </span>
                    {proj.isRestored && (
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: 'rgba(59, 130, 246, 0.12)',
                        color: '#2563eb',
                        fontWeight: 700,
                        letterSpacing: '0.5px'
                      }}>
                        RESTORED
                      </span>
                    )}
                  </div>
                </div>

                <p style={styles.desc}>{proj.description}</p>

                {/* Skills */}
                <div style={styles.skillsRow}>
                  {(!proj.requiredSkills || proj.requiredSkills.length === 0) ? (
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>No required skills listed.</span>
                  ) : (
                    proj.requiredSkills.map((sk, i) => (
                      <span key={i} style={styles.skillPill}>{sk}</span>
                    ))
                  )}
                </div>

                {/* Client Feedback Preview on History Card */}
                {activeTab === 'history' && (
                  <div style={styles.historyFeedbackCard}>
                    <div style={styles.historyFeedbackHeader}>
                      <span style={styles.metaLabel}>CLIENT FEEDBACK</span>
                      {proj.clientFeedback?.rating ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ color: '#f59e0b', fontSize: '13px', letterSpacing: '1px' }}>
                            {'★'.repeat(Math.min(5, Math.round(proj.clientFeedback.rating)))}
                            {'☆'.repeat(Math.max(0, 5 - Math.round(proj.clientFeedback.rating)))}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--color-text-primary)' }}>
                            {Number(proj.clientFeedback.rating).toFixed(1)} / 5
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                          Pending feedback
                        </span>
                      )}
                    </div>

                    {proj.clientFeedback ? (
                      <div>
                        <p style={styles.feedbackSnippet}>
                          &ldquo;{proj.clientFeedback.projectFeedback || proj.clientFeedback.deliverablesFeedback || 'Client submitted evaluation for this project.'}&rdquo;
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: '600' }}>
                            — {proj.clientFeedback.clientName || 'Client'}
                          </span>
                          {proj.clientFeedback.completedAt && (
                            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                              {new Date(proj.clientFeedback.completedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0, fontStyle: 'italic' }}>
                        No client review submitted yet.
                      </p>
                    )}
                  </div>
                )}

                {/* Allocation Stats */}
                <div style={styles.statSection}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '700' }}>
                    <span>Team Members</span>
                    <span>{assignedList.length} member{assignedList.length === 1 ? '' : 's'}</span>
                  </div>
                </div>

                {/* Assigned Members List */}
                <div style={styles.assignedSection}>
                  <h4 style={styles.assignedHeader}>
                    {activeTab === 'history' ? 'Project Personnel' : 'Assigned Team Members'}
                  </h4>
                  <div style={styles.assignedList}>
                    {assignedList.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No members recorded.</div>
                    ) : (
                      assignedList.map(member => (
                        <div key={member.employeeId} style={styles.memberRow}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <RMAvatar name={member.employeeName} src={member.avatar} size={34} />
                            <div>
                              <div style={styles.memberName}>{member.employeeName}</div>
                              <div style={styles.memberRole}>{member.role}</div>
                            </div>
                          </div>
                          {activeTab !== 'history' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <button
                                onClick={() => handleRemoveMember(proj.id, member.employeeId, member.employeeName, proj.name)}
                                style={styles.removeBtn}
                                title="Remove Member"
                              >
                                &times;
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Card Action Button */}
                {activeTab === 'history' ? (
                  <button
                    type="button"
                    onClick={() => handleOpenHistoryDetails(proj)}
                    style={styles.viewDetailsBtn}
                  >
                    👁 View Details
                  </button>
                ) : (
                  <button onClick={() => handleOpenAssignModal(proj)} style={styles.assignBtn}>
                    Assign Resource
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Assign Employee Modal */}
      {showAssignModal && selectedProject && (
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

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Project Role Overwrite</label>
                <input
                  type="text"
                  value={assignForm.role}
                  onChange={(e) => setAssignForm({ ...assignForm, role: e.target.value })}
                  placeholder="Leave blank to use default role"
                  style={styles.modalInput}
                />
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowAssignModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" disabled={submitting} style={{ ...styles.saveBtn, opacity: submitting ? 0.6 : 1 }}>
                  {submitting ? 'Assigning…' : 'Assign Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ✅ Project History Details Modal (Client Feedback, Employees & Task Status) */}
      {historyDetailsModal.isOpen && (
        <div style={styles.modalOverlay} onClick={handleCloseHistoryDetails}>
          <div
            className="glass-card"
            style={{
              ...styles.detailsModalCard,
              maxWidth: '840px',
              maxHeight: '88vh',
              padding: '24px 28px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={styles.modalHeader}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800' }}>
                    {historyDetailsModal.project?.name}
                  </h2>
                  <span style={{
                    ...styles.statusBadge,
                    backgroundColor: 'rgba(148, 163, 184, 0.15)',
                    color: 'var(--color-text-secondary)',
                  }}>
                    {historyDetailsModal.project?.status || 'Completed'}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  Project History &bull; Client Feedback &bull; Assigned Personnel &amp; Task Completion Status
                </p>
              </div>
              <button onClick={handleCloseHistoryDetails} style={styles.closeModalBtn}>&times;</button>
            </div>

            {/* Loading state */}
            {historyDetailsModal.loading && (
              <div style={{ padding: '50px 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                <div style={{ fontSize: '28px', marginBottom: '10px' }}>⏳</div>
                <p style={{ fontSize: '14px', fontWeight: '600', margin: 0 }}>
                  Loading project details, client review, and task history...
                </p>
              </div>
            )}

            {/* Error state */}
            {!historyDetailsModal.loading && historyDetailsModal.error && (
              <div style={{
                padding: '14px 18px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: 'var(--color-danger)',
                fontSize: '13px',
                fontWeight: '600',
              }}>
                {historyDetailsModal.error}
              </div>
            )}

            {/* Content */}
            {!historyDetailsModal.loading && historyDetailsModal.data && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', paddingRight: '4px' }}>

                {/* 1. OVERALL CLIENT FEEDBACK */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(245, 158, 11, 0.02) 100%)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: '12px',
                  padding: '18px 20px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '18px' }}>🌟</span>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--color-text-primary)' }}>
                          Overall Client Feedback &amp; Rating
                        </h3>
                      </div>
                      {historyDetailsModal.data.clientFeedback?.clientName && (
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                          Submitted by <strong>{historyDetailsModal.data.clientFeedback.clientName}</strong> ({historyDetailsModal.data.clientFeedback.clientEmail})
                          {historyDetailsModal.data.clientFeedback.completedAt && ` on ${new Date(historyDetailsModal.data.clientFeedback.completedAt).toLocaleDateString()}`}
                        </p>
                      )}
                    </div>

                    {historyDetailsModal.data.clientFeedback?.rating ? (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(245, 158, 11, 0.15)',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                      }}>
                        <span style={{ color: '#f59e0b', fontSize: '17px', letterSpacing: '2px' }}>
                          {'★'.repeat(Math.min(5, Math.round(historyDetailsModal.data.clientFeedback.rating)))}
                          {'☆'.repeat(Math.max(0, 5 - Math.round(historyDetailsModal.data.clientFeedback.rating)))}
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: '800', color: '#b45309' }}>
                          {Number(historyDetailsModal.data.clientFeedback.rating).toFixed(1)} / 5.0
                        </span>
                      </div>
                    ) : (
                      <span style={{
                        fontSize: '12px',
                        color: 'var(--color-text-muted)',
                        fontStyle: 'italic',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        background: 'var(--color-bg-card)',
                      }}>
                        No overall rating recorded
                      </span>
                    )}
                  </div>

                  {historyDetailsModal.data.clientFeedback ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {historyDetailsModal.data.clientFeedback.projectFeedback && (
                        <div style={{
                          background: 'var(--color-bg-card)',
                          padding: '12px 16px',
                          borderRadius: '8px',
                          borderLeft: '4px solid #f59e0b',
                          fontSize: '13px',
                          color: 'var(--color-text-primary)',
                          lineHeight: '1.6',
                          fontStyle: 'italic',
                        }}>
                          &ldquo;{historyDetailsModal.data.clientFeedback.projectFeedback}&rdquo;
                        </div>
                      )}
                      {historyDetailsModal.data.clientFeedback.deliverablesFeedback && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                          <strong>Deliverables Evaluation:</strong> {historyDetailsModal.data.clientFeedback.deliverablesFeedback}
                        </div>
                      )}
                      {historyDetailsModal.data.clientFeedback.additionalComments && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                          <strong>Additional Comments:</strong> {historyDetailsModal.data.clientFeedback.additionalComments}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                      No client feedback has been submitted for this project yet.
                    </p>
                  )}
                </div>

                {/* 2. TASK EXECUTION SUMMARY */}
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '12px', color: 'var(--color-text-primary)' }}>
                    Task Execution Overview
                  </h3>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '12px',
                    marginBottom: '14px',
                  }}>
                    <div className="glass-card" style={{ padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                      <span style={styles.metaLabel}>ASSIGNED PERSONNEL</span>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)', marginTop: '4px' }}>
                        {historyDetailsModal.data.summary?.totalTeamMembers || 0}
                      </div>
                    </div>
                    <div className="glass-card" style={{ padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                      <span style={styles.metaLabel}>TOTAL TASKS</span>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)', marginTop: '4px' }}>
                        {historyDetailsModal.data.summary?.totalTasks || 0}
                      </div>
                    </div>
                    <div className="glass-card" style={{ padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                      <span style={{ ...styles.metaLabel, color: 'var(--color-success)' }}>COMPLETED TASKS</span>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-success)', marginTop: '4px' }}>
                        {historyDetailsModal.data.summary?.completedTasks || 0}
                      </div>
                    </div>
                    <div className="glass-card" style={{ padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                      <span style={{ ...styles.metaLabel, color: '#f59e0b' }}>PENDING WHEN CLOSED</span>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: '#f59e0b', marginTop: '4px' }}>
                        {historyDetailsModal.data.summary?.pendingTasks || 0}
                      </div>
                    </div>
                  </div>

                  {/* Completion Progress Bar */}
                  <div style={{
                    background: 'var(--color-bg-card)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    border: '1px solid var(--color-border)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '700', marginBottom: '6px' }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>Overall Task Completion Rate</span>
                      <span style={{ color: historyDetailsModal.data.summary?.completionPercentage === 100 ? 'var(--color-success)' : 'var(--color-primary)' }}>
                        {historyDetailsModal.data.summary?.completionPercentage || 0}%
                      </span>
                    </div>
                    <div style={{ height: '8px', width: '100%', background: 'rgba(148, 163, 184, 0.2)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${historyDetailsModal.data.summary?.completionPercentage || 0}%`,
                        background: historyDetailsModal.data.summary?.completionPercentage === 100 ? 'var(--color-success)' : 'var(--color-primary)',
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                  </div>
                </div>

                {/* 3. ASSIGNED EMPLOYEES & THEIR TASKS */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: 'var(--color-text-primary)' }}>
                      Assigned Employees &amp; Task Breakdown
                    </h3>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {historyDetailsModal.data.employees?.length || 0} Member{historyDetailsModal.data.employees?.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {(!historyDetailsModal.data.employees || historyDetailsModal.data.employees.length === 0) ? (
                    <div className="glass-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                      No employees were assigned or had tasks recorded for this project.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {historyDetailsModal.data.employees.map((emp) => (
                        <div
                          key={emp.id}
                          className="glass-card"
                          style={{
                            padding: '16px',
                            borderRadius: '10px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-bg-card)',
                          }}
                        >
                          {/* Employee Header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <img
                                src={emp.avatar}
                                alt={emp.name}
                                style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                              />
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                                    {emp.name}
                                  </span>
                                  <span style={{
                                    fontSize: '11px',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    background: 'var(--color-primary-light)',
                                    color: 'var(--color-primary)',
                                    fontWeight: '600',
                                  }}>
                                    {emp.role}
                                  </span>
                                </div>
                                {emp.department && (
                                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                    {emp.department}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Client Rating & Task stats for employee */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {emp.clientRating && (
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  background: 'rgba(245, 158, 11, 0.12)',
                                  padding: '4px 10px',
                                  borderRadius: '16px',
                                }}>
                                  <span style={{ color: '#f59e0b', fontSize: '13px' }}>★</span>
                                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#b45309' }}>
                                    {Number(emp.clientRating).toFixed(1)} / 5
                                  </span>
                                </div>
                              )}
                              <span style={{
                                fontSize: '11px',
                                fontWeight: '700',
                                color: emp.totalTasks === 0
                                  ? 'var(--color-text-muted)'
                                  : (emp.pendingTasks > 0 ? '#d97706' : 'var(--color-success)'),
                                background: emp.totalTasks === 0
                                  ? 'rgba(148, 163, 184, 0.1)'
                                  : (emp.pendingTasks > 0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(34, 197, 94, 0.1)'),
                                padding: '4px 10px',
                                borderRadius: '14px',
                              }}>
                                {emp.totalTasks === 0
                                  ? 'No tasks assigned'
                                  : `${emp.completedTasks} / ${emp.totalTasks} task${emp.totalTasks === 1 ? '' : 's'} completed`}
                              </span>
                            </div>
                          </div>

                          {/* Employee's Task list */}
                          {emp.tasks && emp.tasks.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {emp.tasks.map((task) => (
                                <div
                                  key={task.id}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    background: task.isCompleted ? 'rgba(34, 197, 94, 0.04)' : 'rgba(245, 158, 11, 0.04)',
                                    border: `1px solid ${task.isCompleted ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.25)'}`,
                                    gap: '12px',
                                  }}
                                >
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                      <span style={{
                                        fontSize: '13px',
                                        fontWeight: '600',
                                        color: 'var(--color-text-primary)',
                                        textDecoration: task.isCompleted ? 'line-through' : 'none',
                                        opacity: task.isCompleted ? 0.8 : 1,
                                      }}>
                                        {task.title}
                                      </span>
                                      <span style={{
                                        fontSize: '10px',
                                        fontWeight: '700',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        background: task.priority === 'High' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                                        color: task.priority === 'High' ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                                      }}>
                                        {task.priority}
                                      </span>
                                    </div>
                                    {task.description && (
                                      <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: '1.4' }}>
                                        {task.description}
                                      </p>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                    <span style={{
                                      fontSize: '11px',
                                      fontWeight: '700',
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      background: task.isCompleted ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                      color: task.isCompleted ? 'var(--color-success)' : 'var(--color-warning)',
                                    }}>
                                      {task.isCompleted ? '✓ Completed' : `${task.totalProgress}% In Progress`}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                              No tasks logged for this member on this project.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
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
    gap: '20px',
    textAlign: 'left',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
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
  controls: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    color: 'var(--color-text-muted)',
  },
  searchInput: {
    paddingLeft: '40px',
    padding: '8px 12px 8px 40px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    outline: 'none',
    minWidth: '200px',
  },
  filterSelect: {
    padding: '8px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    outline: 'none',
  },
  // Sub-tabs row
  tabsRow: {
    display: 'flex',
    borderBottom: '1px solid var(--color-border)',
    marginBottom: '4px',
  },
  tabBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '10px 4px',
    marginRight: '20px',
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  tabBtnActive: {
    color: 'var(--color-primary)',
    borderBottom: '2px solid var(--color-primary)',
  },
  tabCount: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: '30px',
    background: 'var(--color-bg-card-hover)',
    color: 'var(--color-text-muted)',
  },
  tabCountActive: {
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
    gap: '24px',
  },
  card: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    justifyContent: 'space-between',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
  },
  projName: {
    fontSize: '18px',
    fontWeight: '800',
    margin: 0,
    lineHeight: '1.3',
  },
  duration: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    marginTop: '4px',
    display: 'block',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '30px',
    whiteSpace: 'nowrap',
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
  // Feedback preview on history card
  historyFeedbackCard: {
    padding: '12px',
    borderRadius: '8px',
    background: 'rgba(245, 158, 11, 0.05)',
    border: '1px solid rgba(245, 158, 11, 0.2)',
  },
  historyFeedbackHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  feedbackSnippet: {
    fontSize: '12px',
    color: 'var(--color-text-primary)',
    fontStyle: 'italic',
    lineHeight: '1.5',
    margin: '4px 0',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  metaLabel: {
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '4px',
  },
  assignedSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    borderTop: '1px solid var(--color-border)',
    paddingTop: '14px',
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
  memberName: {
    fontSize: '12px',
    fontWeight: '700',
  },
  memberRole: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
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
    transition: 'background-color 0.2s ease',
  },
  viewDetailsBtn: {
    backgroundColor: 'var(--color-primary-light)',
    border: '1px solid var(--color-primary)',
    color: 'var(--color-primary)',
    padding: '10px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '700',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    marginTop: 'auto',
    transition: 'all 0.2s ease',
  },
  emptyCard: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '40px 0',
    color: 'var(--color-text-muted)',
    fontSize: '14px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    padding: '16px',
  },
  modalCard: {
    width: '100%',
    maxWidth: '480px',
    padding: '24px',
  },
  detailsModalCard: {
    width: '100%',
    maxWidth: '840px',
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