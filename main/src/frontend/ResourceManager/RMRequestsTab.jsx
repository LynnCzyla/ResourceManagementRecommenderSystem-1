import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { getRequests, getEmployees, getProjects } from '../mockState';
import RMAvatar from './RMAvatar';

export default function RMRequestsTab() {
  const [requests, setRequests] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeRequestDetails, setActiveRequestDetails] = useState(null);
  const [recommendationTab, setRecommendationTab] = useState('Recommended');
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    setRequests(getRequests());
    setEmployees(getEmployees());
    setProjects(getProjects());
  }, []);

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

  const handleReject = (reqId) => {
    const updated = requests.map(req => req.id === reqId ? { ...req, status: 'Rejected' } : req);
    setRequests(updated);
    showSuccessAlert('Request rejected.');
  };

  const handleAllocateCandidate = (request, candidate) => {
    // 1. Update project mock state only
    const targetProjectName = request.projectName;
    let projectFound = false;

    const updatedProjects = projects.map(proj => {
      if (proj.name.toLowerCase() === targetProjectName.toLowerCase()) {
        projectFound = true;
        const currentAssigned = proj.assignedEmployees || [];
        if (currentAssigned.some(a => a.employeeId === candidate.id)) {
          return proj; // already assigned
        }
        return {
          ...proj,
          assignedEmployees: [
            ...currentAssigned,
            {
              employeeId: candidate.id,
              employeeName: candidate.name,
              role: candidate.role,
              hoursAllocated: 8,
              avatar: candidate.avatar
            }
          ]
        };
      }
      return proj;
    });

    if (!projectFound) {
      // Create new project if it wasn't there
      const newProj = {
        id: Date.now(),
        name: targetProjectName,
        description: `Deployment for resource request: ${targetProjectName}`,
        startDate: request.startDate || new Date().toISOString().split('T')[0],
        endDate: request.endDate || new Date().toISOString().split('T')[0],
        status: 'Active',
        requiredSkills: request.skills,
        manpowerNeeded: request.quantity,
        assignedEmployees: [
          {
            employeeId: candidate.id,
            employeeName: candidate.name,
            role: candidate.role,
            hoursAllocated: 8,
            avatar: candidate.avatar
          }
        ]
      };
      updatedProjects.push(newProj);
    }

    setProjects(updatedProjects);

    // 2. Update Request status to Approved locally
    const updatedRequests = requests.map(req =>
      req.id === request.id ? { ...req, status: 'Approved' } : req
    );
    setRequests(updatedRequests);

    setActiveRequestDetails(null);
    showSuccessAlert(`Allocated ${candidate.name} to ${targetProjectName}.`);
  };

  const hardcodedRecommendations = {
    1: {
      recommended: [
        {
          employee: {
            id: 'EMP-1014',
            name: 'Javier Santos',
            role: 'Senior Cad Drafter & Lighting Designer',
            avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=100'
          },
          score: 100,
          matchedSkills: ['AutoCAD 2D & 3D', 'Dialux Lighting Calculation']
        },
        {
          employee: {
            id: 'EMP-1023',
            name: 'Grace Villanueva',
            role: 'Technical Associate',
            avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100'
          },
          score: 60,
          matchedSkills: ['AutoCAD 2D & 3D', 'Dialux Lighting Calculation']
        },
        {
          employee: {
            id: 'EMP-1025',
            name: 'Jack Forester',
            role: 'Senior Cad Drafter & Lighting Designer',
            avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=100'
          },
          score: 50,
          matchedSkills: ['AutoCAD 2D & 3D', 'Dialux Lighting Calculation']
        }
      ],
      all: [
        {
          employee: {
            id: 'EMP-1014',
            name: 'Javier Santos',
            role: 'Senior Cad Drafter & Lighting Designer',
            avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=100'
          },
          score: 100,
          matchedSkills: ['AutoCAD 2D & 3D', 'Dialux Lighting Calculation']
        },
        {
          employee: {
            id: 'EMP-1023',
            name: 'Grace Villanueva',
            role: 'Technical Associate',
            avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100'
          },
          score: 60,
          matchedSkills: ['AutoCAD 2D & 3D', 'Dialux Lighting Calculation']
        },
        {
          employee: {
            id: 'EMP-1025',
            name: 'Jack Forester',
            role: 'Senior Cad Drafter & Lighting Designer',
            avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=100'
          },
          score: 50,
          matchedSkills: ['AutoCAD 2D & 3D', 'Dialux Lighting Calculation']
        },
        {
          employee: {
            id: 'EMP-1019',
            name: 'Clarisse Valenzuela',
            role: 'Senior Sales Engineer',
            avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=100'
          },
          score: 40,
          matchedSkills: ['Sales', 'Application Engineering']
        }
      ]
    },
    2: {
      recommended: [
        {
          employee: {
            id: 'EMP-1015',
            name: 'Vincent Miguel P. Soriano',
            role: 'Inside Sales / UPS Technical Engineer',
            avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=100'
          },
          score: 95,
          matchedSkills: ['UPS installation and Commissioning', 'Maintenance & Troubleshooting']
        },
        {
          employee: {
            id: 'EMP-1020',
            name: 'David Lim',
            role: 'Sales Engineer',
            avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&q=80&w=100'
          },
          score: 70,
          matchedSkills: ['Sales', 'Client relationship management']
        },
        {
          employee: {
            id: 'EMP-1021',
            name: 'Elena Guerrero',
            role: 'Inside Sales Engineer',
            avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=100'
          },
          score: 55,
          matchedSkills: ['Sales', 'Technical Documentation']
        }
      ],
      all: [
        {
          employee: {
            id: 'EMP-1015',
            name: 'Vincent Miguel P. Soriano',
            role: 'Inside Sales / UPS Technical Engineer',
            avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=100'
          },
          score: 95,
          matchedSkills: ['UPS installation and Commissioning', 'Maintenance & Troubleshooting']
        },
        {
          employee: {
            id: 'EMP-1020',
            name: 'David Lim',
            role: 'Sales Engineer',
            avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&q=80&w=100'
          },
          score: 70,
          matchedSkills: ['Sales', 'Client relationship management']
        },
        {
          employee: {
            id: 'EMP-1021',
            name: 'Elena Guerrero',
            role: 'Inside Sales Engineer',
            avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=100'
          },
          score: 55,
          matchedSkills: ['Sales', 'Technical Documentation']
        },
        {
          employee: {
            id: 'EMP-1022',
            name: 'Francis Tolentino',
            role: 'Design Engineer',
            avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=100'
          },
          score: 45,
          matchedSkills: ['AutoCAD 2D & 3D', 'Lighting Calculation']
        }
      ]
    }
  };

  const recommendationResults = activeRequestDetails ? hardcodedRecommendations[activeRequestDetails.id] || hardcodedRecommendations[1] : { recommended: [], all: [] };
  const displayedRecommendations = recommendationTab === 'View all'
    ? recommendationResults.all
    : recommendationResults.recommended;

  const filteredRequests = requests.filter(req => {
    const matchesSearch = 
      req.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.skills.some(skill => skill.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'All' || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Resource Allocation Requests</h1>
        <p style={styles.subtitle}>Review requested skill sets, analyze system-ranked candidates, and approve deployments.</p>
      </div>

      <div style={styles.mainLayout}>
        {/* Requests List */}
        <div className="glass-card" style={styles.panel}>
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
            </div>
          </div>
          <div style={styles.reqList}>
            {filteredRequests.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center', padding: '24px 0' }}>
                No active allocation requests found.
              </div>
            ) : (
              filteredRequests.map(req => (
                <div
                  key={req.id}
                  style={{
                    ...styles.reqItem,
                    borderColor: activeRequestDetails?.id === req.id ? 'var(--color-primary)' : 'var(--color-border)',
                    boxShadow: activeRequestDetails?.id === req.id ? '0 0 10px rgba(59, 130, 246, 0.15)' : 'none'
                  }}
                >
                  <div style={styles.reqHeader}>
                    <h3 style={styles.projName}>{req.projectName}</h3>
                    <span style={{
                      ...styles.statusBadge,
                      backgroundColor: req.status === 'Approved' ? 'var(--color-primary-light)' : req.status === 'Pending' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: req.status === 'Approved' ? 'var(--color-success)' : req.status === 'Pending' ? 'var(--color-warning)' : 'var(--color-danger)'
                    }}>
                      {req.status}
                    </span>
                  </div>

                  <div style={styles.reqMeta}>
                    <span>Quantity Needed: <strong>{req.quantity}</strong></span>
                    <span>Timeline: <strong>{req.startDate} to {req.endDate}</strong></span>
                  </div>

                  <div style={styles.skillsRow}>
                    {req.skills.map((sk, i) => (
                      <span key={i} style={styles.skillPill}>{sk}</span>
                    ))}
                  </div>

                  <div style={styles.actions}>
                    <button
                      onClick={() => {
                        setActiveRequestDetails(req);
                        setRecommendationTab('Recommended');
                        setSelectedCandidateId(null);
                      }}
                      style={styles.viewRecsBtn}
                      disabled={req.status === 'Approved' || req.status === 'Rejected'}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center', width: '100%' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8"></circle>
                          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        View Recommendations
                      </span>
                    </button>
                    {req.status === 'Pending' && (
                      <button
                        onClick={() => handleReject(req.id)}
                        style={styles.rejectBtn}
                      >
                        Reject
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recommender Panel */}
        <div className="glass-card" style={styles.panel}>
          <h2 style={styles.panelTitle}>Resource Recommendations</h2>

          {!activeRequestDetails ? (
            <div style={styles.emptyPanelState}>
              Select a pending allocation request to see system-ranked candidates.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={styles.tabRow}>
                <button
                  onClick={() => setRecommendationTab('Recommended')}
                  style={{
                    ...styles.subTabBtn,
                    ...(recommendationTab === 'Recommended' ? styles.subTabBtnActive : {})
                  }}
                >
                  Recommended
                </button>
                <button
                  onClick={() => setRecommendationTab('View all')}
                  style={{
                    ...styles.subTabBtn,
                    ...(recommendationTab === 'View all' ? styles.subTabBtnActive : {})
                  }}
                >
                  View all
                </button>
              </div>

              <div style={styles.recommendationsList}>
                {displayedRecommendations.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', padding: '20px 0', textAlign: 'center' }}>
                    No recommended candidates available for this request.
                  </div>
                ) : (
                  displayedRecommendations.map((rec, idx) => {
                    const workloadLabel = idx % 3 === 0 ? 'Available' : idx % 3 === 1 ? 'Limited availability' : 'Fully loaded';
                    const selected = selectedCandidateId === rec.employee.id;
                    return (
                    <div key={rec.employee.id} style={styles.recItemCard}>
                        <button
                          type="button"
                          onClick={() => setSelectedCandidateId(rec.employee.id)}
                          style={{
                            ...styles.checkCircle,
                            ...(selected ? styles.checkCircleSelected : {})
                          }}
                          aria-label={`Select ${rec.employee.name}`}
                        >
                          {selected ? '✓' : ''}
                        </button>

                        <div style={styles.recCardBody}>
                          <div style={styles.recHeaderRow}>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                              <RMAvatar name={rec.employee.name} src={rec.employee.avatar} size={36} />
                              <div>
                                <div style={styles.recName}>{rec.employee.name}</div>
                                <div style={styles.recRole}>{rec.employee.role}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                              <span style={styles.workloadBadge}>{workloadLabel}</span>
                              <div style={{
                                ...styles.matchScore,
                                color: rec.score > 75 ? 'var(--color-success)' : rec.score > 40 ? 'var(--color-warning)' : 'var(--color-danger)'
                              }}>
                                {rec.score}% Match
                              </div>
                            </div>
                          </div>

                          <div style={{ marginTop: '8px' }}>
                            <span style={styles.skillsHeading}>Matching Extracted Skills:</span>
                            <div style={styles.miniSkillsList}>
                              {rec.matchedSkills.length === 0 ? (
                                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>None matched</span>
                              ) : (
                                rec.matchedSkills.map((ms, i) => (
                                  <span key={i} style={styles.matchingSkillPill}>✓ {ms}</span>
                                ))
                              )}
                            </div>
                          </div>

                          <button
                            onClick={() => handleAllocateCandidate(activeRequestDetails, rec.employee)}
                            style={styles.allocateBtn}
                          >
                            Approve & Allocate Resource
                          </button>
                        </div>
                      </div>
                    );
                  }))}
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
  mainLayout: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1.8fr',
    gap: '24px',
  },
  panel: {
    padding: '24px',
  },
  panelTitle: {
    fontSize: '18px',
    fontWeight: '700',
    marginBottom: '16px',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '10px',
    margin: 0,
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '10px',
  },
  controls: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
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
    paddingLeft: '32px',
    padding: '6px 10px 6px 32px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    outline: 'none',
    minWidth: '160px',
  },
  filterSelect: {
    padding: '6px 10px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    outline: 'none',
  },
  reqList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginTop: '16px',
  },
  reqItem: {
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'rgba(255, 255, 255, 0.01)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  reqHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  projName: {
    fontSize: '15px',
    fontWeight: '700',
    margin: 0,
  },
  statusBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '2px 6px',
    borderRadius: '30px',
  },
  reqMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
  },
  skillsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  skillPill: {
    fontSize: '10px',
    background: 'var(--color-bg-card-hover)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    marginTop: '6px',
  },
  viewRecsBtn: {
    flex: 1,
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '8px',
    borderRadius: '6px',
    fontWeight: '700',
    fontSize: '12px',
    cursor: 'pointer',
    '&:disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
    }
  },
  rejectBtn: {
    backgroundColor: 'transparent',
    color: 'var(--color-danger)',
    border: '1px solid var(--color-danger)',
    padding: '8px 12px',
    borderRadius: '6px',
    fontWeight: '600',
    fontSize: '12px',
    cursor: 'pointer',
  },
  emptyPanelState: {
    padding: '60px 20px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '13px',
  },
  recommenderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'var(--color-bg-card-hover)',
    padding: '12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
  },
  matchingTag: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--color-primary)',
  },
  recommendationsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  recItemCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '16px',
    background: 'var(--color-bg-card-hover)',
    borderRadius: '10px',
    border: '1px solid var(--color-border)',
    position: 'relative',
  },
  rankBadge: {
    position: 'absolute',
    top: '12px',
    left: '12px',
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: '700',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recCardBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  recHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
  },
  recAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  recName: {
    fontSize: '13px',
    fontWeight: '700',
  },
  recRole: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  matchScore: {
    fontSize: '13px',
    fontWeight: '800',
  },
  skillsHeading: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--color-text-muted)',
  },
  miniSkillsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '6px',
  },
  matchingSkillPill: {
    fontSize: '10px',
    color: 'var(--color-success)',
    backgroundColor: 'var(--color-primary-light)',
    padding: '1px 6px',
    borderRadius: '4px',
    fontWeight: '600',
  },
  allocateBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '12px 16px',
    borderRadius: '8px',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
    marginTop: '14px',
    width: '100%',
  },
  tabRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '16px',
  },
  subTabBtn: {
    flex: 1,
    padding: '10px 14px',
    borderBottom: '2px solid transparent',
    borderRadius: '0',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontWeight: '700',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    transition: 'color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease',
  },
  subTabBtnActive: {
    color: 'var(--color-primary)',
    borderBottomColor: 'var(--color-primary)',
  },
  tabButton: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: '12px',
    border: '1px solid var(--color-border)',
    background: 'transparent',
    cursor: 'pointer',
    fontWeight: '700',
    fontSize: '12px',
  },
  tabButtonActive: {
    background: 'var(--color-primary)',
    color: '#ffffff',
    borderColor: 'var(--color-primary)',
  },
  checkCircle: {
    width: '26px',
    height: '26px',
    minWidth: '26px',
    borderRadius: '50%',
    border: '2px solid var(--color-border)',
    background: 'transparent',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  checkCircleSelected: {
    borderColor: 'var(--color-primary)',
    background: 'var(--color-primary)',
    color: '#ffffff',
  },
  workloadBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '4px 10px',
    borderRadius: '999px',
    backgroundColor: 'var(--color-bg-root)',
    color: 'var(--color-text-secondary)',
  }
};
