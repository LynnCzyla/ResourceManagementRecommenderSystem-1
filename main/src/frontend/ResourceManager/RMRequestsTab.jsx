// main/src/frontend/ResourceManager/RMRequestsTab.jsx
import React, { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';
import RMAvatar from './RMAvatar';
import {
  fetchRequirements,
  fetchEmployees,
  fetchAssignments,
  fetchRecommendations,
  createAssignment,
  updateRequirementStatus
} from './Rmapi';

export default function RMRequestsTab() {
  const [requests, setRequests] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [activeRequestDetails, setActiveRequestDetails] = useState(null);
  const [recommendations, setRecommendations] = useState({ recommended: [], all: [] });
  const [recommendationTab, setRecommendationTab] = useState('Recommended');
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [loading, setLoading] = useState(true);
  // ✅ Start with all projects expanded - use a Set
  const [expandedProjects, setExpandedProjects] = useState(new Set());

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [requestsData, employeesData, assignmentsData] = await Promise.all([
        fetchRequirements(),
        fetchEmployees(),
        fetchAssignments()
      ]);

      setRequests(requestsData.data || requestsData || []);
      setEmployees(employeesData.data || employeesData || []);
      setAssignments(assignmentsData.data || assignmentsData || []);
    } catch (error) {
      console.error('❌ Error fetching data:', error);
      Swal.fire({
        title: 'Error!',
        text: error.message || 'Failed to load data. Please try again.',
        icon: 'error',
        confirmButtonColor: 'var(--color-danger)',
        confirmButtonText: 'OK',
      });
    } finally {
      setLoading(false);
    }
  };

  const getAssignmentCount = (requestId) => {
    return assignments.filter(a => a.requirement_id === requestId).length;
  };

  const getAssignedEmployees = (requestId) => {
    return assignments
      .filter(a => a.requirement_id === requestId)
      .map(a => employees.find(e => e.id === a.profile_id) || { name: 'Unknown' });
  };

  const groupRequestsByProject = (requestsList) => {
    const groups = new Map();

    requestsList.forEach(req => {
      const key = req.project_id || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, {
          projectId: key,
          projectName: req.projectName || 'Unnamed Project',
          requirements: [],
          totalNeeded: 0,
          totalFilled: 0,
          isFullyAssigned: true
        });
      }

      const group = groups.get(key);
      const assignedCount = getAssignmentCount(req.id);
      const reqWithCount = { ...req, assignedCount };
      group.requirements.push(reqWithCount);
      group.totalNeeded += req.quantity || 1;
      group.totalFilled += assignedCount;
      group.isFullyAssigned = group.totalFilled >= group.totalNeeded;
    });

    return Array.from(groups.values());
  };

  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      const matchesSearch =
        req.projectName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.role_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.skills?.some(skill => skill?.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus = statusFilter === 'All' || req.status === statusFilter;

      const assignedCount = getAssignmentCount(req.id);
      const hasAssignments = assignedCount > 0;
      const matchesUnassigned = showUnassignedOnly ? !hasAssignments : true;

      return matchesSearch && matchesStatus && matchesUnassigned;
    });
  }, [requests, searchQuery, statusFilter, showUnassignedOnly]);

  const groupedProjects = useMemo(
    () => groupRequestsByProject(filteredRequests),
    [filteredRequests]
  );

  // ✅ Auto-expand ALL projects when data loads
  useEffect(() => {
    if (groupedProjects.length > 0) {
      const newExpanded = new Set();
      groupedProjects.forEach(project => {
        newExpanded.add(project.projectId);
      });
      setExpandedProjects(newExpanded);
      console.log('✅ Projects expanded:', newExpanded.size);
    }
  }, [groupedProjects]);

  const handleAllocateCandidate = async (request, candidate) => {
    try {
      await createAssignment({
        project_id: request.project_id,
        profile_id: candidate.id,
        requirement_id: request.id,
        assigned_role: candidate.role,
        start_date: request.start_date,
        end_date: request.end_date,
        status: 'Assigned'
      });

      await fetchData();
      setActiveRequestDetails(null);

      showSuccessAlert(`Allocated ${candidate.name} to ${request.projectName}`);
    } catch (error) {
      console.error('Error allocating:', error);
      showErrorAlert(error.message || 'Failed to allocate candidate. Please try again.');
    }
  };

  const showConfirmationAlert = (title, text, confirmText = 'Yes, proceed!') => {
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

  const showSuccessAlert = (message) => {
    Swal.fire({
      title: 'Success!',
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

  const showErrorAlert = (message) => {
    Swal.fire({
      title: 'Error!',
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

  const handleReject = async (reqId) => {
    const result = await showConfirmationAlert(
      'Reject Request',
      'Are you sure you want to reject this resource request? This action cannot be undone.',
      'Yes, Reject'
    );
    if (!result.isConfirmed) return;

    try {
      await updateRequirementStatus(reqId, 'Rejected');
      await fetchData();
      showSuccessAlert('Request has been rejected.');
    } catch (error) {
      console.error('Error rejecting request:', error);
      showErrorAlert('Failed to reject request. Please try again.');
    }
  };

  const fetchRecommendationsData = async (requirementId) => {
    try {
      const data = await fetchRecommendations(requirementId);
      setRecommendations(data.data || data || { recommended: [], all: [] });
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      setRecommendations({ recommended: [], all: [] });
    }
  };

  const handleViewRecommendations = async (req) => {
    console.log('🔍 Viewing recommendations for:', req.role_title);
    console.log('📋 Requirement ID from frontend:', req.id);  // Should be 1
    console.log('📋 Skills from frontend:', req.skills);      // Should be UPS skills
    console.log('📋 Project ID:', req.project_id);            // Should be 2
    setActiveRequestDetails(req);
    setRecommendationTab('Recommended');
    setSelectedCandidateId(null);
    await fetchRecommendationsData(req.id);
  };

  const toggleProjectExpansion = (projectId) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      console.log('📂 Toggled project:', projectId, 'Expanded:', newSet.has(projectId));
      return newSet;
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'TBD';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'TBD';
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Resource Allocation Requests</h1>
          <p style={styles.subtitle}>Loading requests...</p>
        </div>
        <div style={styles.loadingContainer}>
          <div style={styles.loadingSpinner}></div>
        </div>
      </div>
    );
  }

  const displayedRecommendations = recommendationTab === 'View all'
    ? recommendations.all
    : recommendations.recommended;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Resource Allocation Requests</h1>
        <p style={styles.subtitle}>Review requested skill sets, analyze system-ranked candidates, and approve deployments.</p>
      </div>

      <div style={styles.mainLayout}>
        {/* Left Panel - Requests List */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Pending Requests</h2>
            <div style={styles.controls}>
              <div style={styles.searchWrapper}>
                <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  placeholder="Search requests..."
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
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
              <button
                onClick={() => setShowUnassignedOnly(!showUnassignedOnly)}
                style={{
                  ...styles.unassignedBtn,
                  backgroundColor: showUnassignedOnly ? 'var(--color-primary)' : 'transparent',
                  color: showUnassignedOnly ? '#ffffff' : 'var(--color-text-secondary)',
                }}
              >
                {showUnassignedOnly ? 'Unassigned Only' : 'Show All'}
              </button>
            </div>
          </div>

          <div style={styles.requestList}>
            {groupedProjects.length === 0 ? (
              <div style={styles.emptyState}>
                {showUnassignedOnly ? 'No unassigned requests found.' : 'No requests found.'}
              </div>
            ) : (
              groupedProjects.map(project => {
                const isExpanded = expandedProjects.has(project.projectId);

                return (
                  <div key={project.projectId} style={styles.projectCard}>
                    {/* Project Header */}
                    <div
                      style={styles.projectHeader}
                      onClick={() => toggleProjectExpansion(project.projectId)}
                    >
                      <div style={styles.projectHeaderLeft}>
                        <span style={styles.expandIcon}>
                          {isExpanded ? '▾' : '▸'}
                        </span>
                        <div style={styles.projectInfo}>
                          <h3 style={styles.projectName}>{project.projectName}</h3>
                          <div style={styles.projectSubtitle}>
                            <span>{project.requirements.length} role{project.requirements.length > 1 ? 's' : ''}</span>
                            <span style={styles.dot}>•</span>
                            <span>{project.totalFilled}/{project.totalNeeded} filled</span>
                            <span style={styles.dot}>•</span>
                            <span style={{
                              color: project.isFullyAssigned ? '#22c55e' : '#f59e0b',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}>
                              {project.isFullyAssigned ? (
                                <>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                  </svg>
                                  Fully Staffed
                                </>
                              ) : (
                                <>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <polyline points="12 6 12 12 16 14"></polyline>
                                  </svg>
                                  Needs Staff
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div style={styles.projectHeaderRight}>
                        <span style={{
                          ...styles.projectStatusBadge,
                          backgroundColor: project.isFullyAssigned ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: project.isFullyAssigned ? '#22c55e' : '#f59e0b',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}>
                          {project.isFullyAssigned ? (
                            <>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                              </svg>
                              Staffed
                            </>
                          ) : (
                            <>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                              </svg>
                              Needs Staff
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Requirements - ALWAYS SHOW when expanded */}
                    {isExpanded ? (
                      <div style={styles.requirementsContainer}>
                        {project.requirements.length === 0 ? (
                          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                            No requirements for this project
                          </div>
                        ) : (
                          project.requirements.map(req => {
                            const assignedCount = req.assignedCount;
                            const assignedEmployees = getAssignedEmployees(req.id);
                            const isFullyAssigned = assignedCount >= (req.quantity || 1);
                            const hasTimeline = req.start_date || req.end_date;

                            return (
                              <div key={req.id} style={styles.requirementCard}>
                                <div style={styles.requirementHeader}>
                                  <div style={styles.requirementTitle}>
                                    <span style={styles.requirementRole}>
                                      {req.role_title || 'Role Not Specified'}
                                    </span>
                                    <span style={styles.requirementFillStatus}>
                                      {assignedCount}/{req.quantity || 1} filled
                                    </span>
                                  </div>
                                  <div style={styles.requirementActions}>
                                    {req.status === 'Pending' && (
                                      <span style={styles.pendingBadge}>Pending</span>
                                    )}
                                    {isFullyAssigned && (
                                      <span style={styles.staffedBadge}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: '2px' }}>
                                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                          <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                        </svg>
                                        Staffed
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Timeline - Always show dates */}
                                <div style={styles.requirementTimeline}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.timelineIcon}>
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                  </svg>
                                  <span>
                                    {formatDate(req.start_date)} → {formatDate(req.end_date)}
                                  </span>
                                </div>

                                {/* Assigned Employees */}
                                {assignedCount > 0 && (
                                  <div style={styles.assignedContainer}>
                                    <span style={styles.assignedLabel}>Assigned:</span>
                                    <div style={styles.assignedList}>
                                      {assignedEmployees.map((emp, i) => (
                                        <span key={i} style={styles.assignedPill}>
                                          {emp.name}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Skills */}
                                {req.skills && req.skills.length > 0 && (
                                  <div style={styles.skillsContainer}>
                                    {req.skills.map((skill, i) => (
                                      <span key={i} style={styles.skillPill}>{skill}</span>
                                    ))}
                                  </div>
                                )}

                                {/* ✅ ACTIONS - Always visible */}
                                <div style={styles.requirementFooter}>
                                  <button
                                    onClick={() => handleViewRecommendations(req)}
                                    style={{
                                      ...styles.viewBtn,
                                      opacity: (req.status === 'Rejected' || isFullyAssigned) ? 0.5 : 1,
                                      cursor: (req.status === 'Rejected' || isFullyAssigned) ? 'not-allowed' : 'pointer'
                                    }}
                                    disabled={req.status === 'Rejected' || isFullyAssigned}
                                  >
                                    {isFullyAssigned ? (
                                      <>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: '4px' }}>
                                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                          <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                        </svg>
                                        Staffed
                                      </>
                                    ) : 'View Candidates'}
                                  </button>
                                  {req.status === 'Pending' && !isFullyAssigned && (
                                    <button
                                      onClick={() => handleReject(req.id)}
                                      style={styles.rejectBtn}
                                    >
                                      Reject
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel - Recommendations */}
        <div style={styles.panel}>
          <h2 style={styles.panelTitle}>Recommendations</h2>

          {!activeRequestDetails ? (
            <div style={styles.emptyPanelState}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={styles.emptyIcon}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <p>Select a role to see candidates</p>
              <span style={styles.emptySubtext}>Click "View Candidates" on any request</span>
            </div>
          ) : (
            <div>
              <div style={styles.requestInfoBar}>
                <div>
                  <strong style={styles.infoProject}>{activeRequestDetails.projectName}</strong>
                  <span style={styles.infoRole}>{activeRequestDetails.role_title || 'Role'}</span>
                </div>
                <div style={styles.infoStats}>
                  <span>{activeRequestDetails.quantity || 1} position{activeRequestDetails.quantity > 1 ? 's' : ''}</span>
                </div>
              </div>

              <div style={styles.tabs}>
                <button
                  onClick={() => setRecommendationTab('Recommended')}
                  style={{
                    ...styles.tabBtn,
                    ...(recommendationTab === 'Recommended' ? styles.tabActive : {})
                  }}
                >
                  Top Matches
                </button>
                <button
                  onClick={() => setRecommendationTab('View all')}
                  style={{
                    ...styles.tabBtn,
                    ...(recommendationTab === 'View all' ? styles.tabActive : {})
                  }}
                >
                  All Candidates
                </button>
              </div>

              <div style={styles.recommendationList}>
                {displayedRecommendations.length === 0 ? (
                  <div style={styles.emptyRecommendation}>
                    <p>No candidates found</p>
                    <span style={styles.emptySubtext}>Try adjusting the search criteria</span>
                  </div>
                ) : (
                  displayedRecommendations.map((rec) => {
                    const isAlreadyAssigned = assignments.some(
                      a => a.requirement_id === activeRequestDetails.id && a.profile_id === rec.employee.id
                    );

                    return (
                      <div key={rec.employee.id} style={styles.recCard}>
                        <div style={styles.recHeader}>
                          <RMAvatar name={rec.employee.name} src={rec.employee.avatar} size={40} />
                          <div style={styles.recInfo}>
                            <div style={styles.recName}>{rec.employee.name}</div>
                            <div style={styles.recRole}>{rec.employee.role || 'Employee'}</div>
                          </div>
                          <div style={styles.recScore}>
                            <span style={{
                              ...styles.scoreValue,
                              color: rec.score > 75 ? '#22c55e' : rec.score > 40 ? '#f59e0b' : '#ef4444'
                            }}>
                              {rec.score}%
                            </span>
                            <span style={styles.scoreLabel}>match</span>
                          </div>
                        </div>

                        {rec.matchedSkills && rec.matchedSkills.length > 0 && (
                          <div style={styles.recSkills}>
                            {rec.matchedSkills.slice(0, 3).map((skill, i) => (
                              <span key={i} style={styles.matchingSkill}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: '4px' }}>
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                                {skill}
                              </span>
                            ))}
                            {rec.matchedSkills.length > 3 && (
                              <span style={styles.moreSkills}>+{rec.matchedSkills.length - 3} more</span>
                            )}
                          </div>
                        )}

                        <button
                          onClick={() => handleAllocateCandidate(activeRequestDetails, rec.employee)}
                          style={{
                            ...styles.allocateBtn,
                            opacity: isAlreadyAssigned ? 0.5 : 1,
                            cursor: isAlreadyAssigned ? 'not-allowed' : 'pointer',
                            backgroundColor: isAlreadyAssigned ? 'var(--color-text-muted)' : 'var(--color-primary)',
                          }}
                          disabled={isAlreadyAssigned}
                        >
                          {isAlreadyAssigned ? (
                            <>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: '4px' }}>
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                              </svg>
                              Already Assigned
                            </>
                          ) : 'Allocate Resource'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    padding: '20px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '8px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '800',
    letterSpacing: '-0.75px',
    marginBottom: '4px',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    fontSize: '15px',
    color: 'var(--color-text-secondary)',
  },
  mainLayout: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1.8fr',
    gap: '24px',
  },
  panel: {
    background: 'var(--color-bg-card)',
    borderRadius: '12px',
    padding: '24px',
    border: '1px solid var(--color-border)',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '16px',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '12px',
  },
  panelTitle: {
    fontSize: '18px',
    fontWeight: '700',
    margin: 0,
    color: 'var(--color-text-primary)',
  },
  controls: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: '10px',
    color: 'var(--color-text-muted)',
  },
  searchInput: {
    padding: '6px 10px 6px 32px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    outline: 'none',
    minWidth: '180px',
  },
  filterSelect: {
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    outline: 'none',
  },
  unassignedBtn: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
  },
  requestList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxHeight: '600px',
    overflowY: 'auto',
    paddingRight: '4px',
  },
  projectCard: {
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    overflow: 'visible',
    display: 'block',
  },
  projectHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    cursor: 'pointer',
    backgroundColor: 'var(--color-bg-card-hover)',
    borderBottom: '1px solid var(--color-border)',
    transition: 'all 0.2s ease',
  },
  projectHeaderLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    flex: 1,
    minWidth: 0,
  },
  projectInfo: {
    flex: 1,
    minWidth: 0,
  },
  expandIcon: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
    flexShrink: 0,
    marginTop: '2px',
  },
  projectName: {
    fontSize: '15px',
    fontWeight: '700',
    margin: 0,
    color: 'var(--color-text-primary)',
    wordBreak: 'break-word',
    lineHeight: 1.3,
  },
  projectSubtitle: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    display: 'flex',
    gap: '6px',
    marginTop: '2px',
    flexWrap: 'wrap',
  },
  dot: {
    color: 'var(--color-border)',
  },
  projectHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: '12px',
  },
  projectStatusBadge: {
    fontSize: '11px',
    fontWeight: '600',
    padding: '4px 12px',
    borderRadius: '20px',
    whiteSpace: 'nowrap',
  },
  requirementsContainer: {
    padding: '16px',
    backgroundColor: 'var(--color-bg-root)',
    borderTop: '1px solid var(--color-border)',
  },
  requirementCard: {
    padding: '16px',
    borderRadius: '8px',
    backgroundColor: 'var(--color-bg-card)',
    marginBottom: '12px',
    border: '1px solid var(--color-border)',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  requirementHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    flexWrap: 'wrap',
    gap: '8px',
  },
  requirementTitle: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  requirementRole: {
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    wordBreak: 'break-word',
    lineHeight: 1.3,
  },
  requirementFillStatus: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-bg-card-hover)',
    padding: '2px 8px',
    borderRadius: '12px',
  },
  requirementActions: {
    display: 'flex',
    gap: '8px',
  },
  pendingBadge: {
    fontSize: '10px',
    fontWeight: '600',
    padding: '2px 10px',
    borderRadius: '12px',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    color: '#f59e0b',
  },
  staffedBadge: {
    fontSize: '10px',
    fontWeight: '600',
    padding: '2px 10px',
    borderRadius: '12px',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    color: '#22c55e',
  },
  requirementTimeline: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    marginBottom: '8px',
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  timelineIcon: {
    flexShrink: 0,
    color: 'var(--color-text-muted)',
  },
  assignedContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '8px',
  },
  assignedLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
  },
  assignedList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  assignedPill: {
    fontSize: '10px',
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    padding: '2px 8px',
    borderRadius: '12px',
    fontWeight: '500',
  },
  skillsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginBottom: '10px',
  },
  skillPill: {
    fontSize: '10px',
    background: 'var(--color-bg-card-hover)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    padding: '3px 10px',
    borderRadius: '4px',
    maxWidth: '100%',
    wordBreak: 'break-word',
  },
  requirementFooter: {
    display: 'flex',
    gap: '10px',
    marginTop: '4px',
  },
  viewBtn: {
    flex: 1,
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    fontWeight: '600',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minWidth: '120px',
    '&:hover': {
      opacity: 0.9,
    },
    '&:disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },
  rejectBtn: {
    backgroundColor: 'transparent',
    color: 'var(--color-danger)',
    border: '1px solid var(--color-danger)',
    padding: '8px 16px',
    borderRadius: '6px',
    fontWeight: '600',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
    '&:hover': {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
  },
  emptyState: {
    padding: '40px 20px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '13px',
  },
  emptyPanelState: {
    padding: '60px 20px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '8px',
  },
  emptySubtext: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  tabs: {
    display: 'flex',
    gap: '0',
    marginBottom: '16px',
    borderBottom: '1px solid var(--color-border)',
  },
  tabBtn: {
    padding: '8px 16px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    borderBottom: '2px solid transparent',
    transition: 'all 0.2s',
  },
  tabActive: {
    color: 'var(--color-primary)',
    borderBottomColor: 'var(--color-primary)',
  },
  requestInfoBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'var(--color-bg-card-hover)',
    borderRadius: '8px',
    marginBottom: '16px',
    border: '1px solid var(--color-border)',
  },
  infoProject: {
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    marginRight: '8px',
  },
  infoRole: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
  },
  infoStats: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
  },
  recommendationList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxHeight: '500px',
    overflowY: 'auto',
    paddingRight: '4px',
  },
  recCard: {
    padding: '14px 16px',
    background: 'var(--color-bg-card-hover)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    transition: 'all 0.2s',
  },
  recHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  recInfo: {
    flex: 1,
    minWidth: 0,
  },
  recName: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    wordBreak: 'break-word',
  },
  recRole: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    wordBreak: 'break-word',
  },
  recScore: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flexShrink: 0,
  },
  scoreValue: {
    fontSize: '18px',
    fontWeight: '800',
  },
  scoreLabel: {
    fontSize: '9px',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  recSkills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  matchingSkill: {
    fontSize: '11px',
    color: 'var(--color-success)',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    padding: '2px 10px',
    borderRadius: '4px',
    fontWeight: '500',
  },
  moreSkills: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    padding: '2px 4px',
  },
  allocateBtn: {
    padding: '8px',
    borderRadius: '6px',
    fontWeight: '600',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    color: '#ffffff',
    border: 'none',
    '&:hover': {
      opacity: 0.9,
    },
    '&:disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },
  emptyRecommendation: {
    padding: '40px 20px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '400px',
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid var(--color-border)',
    borderTop: '4px solid var(--color-primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};