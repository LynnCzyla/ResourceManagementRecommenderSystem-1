import React, { useState, useEffect } from 'react';
import { getRequests, saveRequests, getEmployees, getProjects, saveProjects } from '../mockState';

export default function RMRequestsTab() {
  const [requests, setRequests] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeRequestDetails, setActiveRequestDetails] = useState(null);

  useEffect(() => {
    setRequests(getRequests());
    setEmployees(getEmployees());
    setProjects(getProjects());
  }, []);

  const handleReject = (reqId) => {
    const updated = requests.map(req => req.id === reqId ? { ...req, status: 'Rejected' } : req);
    setRequests(updated);
    saveRequests(updated);
    alert('Request rejected.');
  };

  const handleAllocateCandidate = (request, candidate) => {
    // 1. Update Project assigned employees
    const targetProjectName = request.projectName;
    const allProjects = getProjects();
    let projectFound = false;

    const updatedProjects = allProjects.map(proj => {
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

    saveProjects(updatedProjects);
    setProjects(updatedProjects);

    // 2. Update Request status to Approved
    const updatedRequests = requests.map(req =>
      req.id === request.id ? { ...req, status: 'Approved' } : req
    );
    setRequests(updatedRequests);
    saveRequests(updatedRequests);

    setActiveRequestDetails(null);
    alert(`Success! Allocated ${candidate.name} to ${targetProjectName}.`);
  };

  // Recommender Engine: dynamically rank candidates based on requested skills overlap
  const getRankedRecommendations = (reqSkills) => {
    if (!reqSkills || reqSkills.length === 0) return [];

    const scored = employees.map(emp => {
      // Find matches: checking if emp skills matches reqSkills (fuzzy check)
      const matchingSkills = emp.skills.filter(es =>
        reqSkills.some(rs => es.toLowerCase().includes(rs.toLowerCase()) || rs.toLowerCase().includes(es.toLowerCase()))
      );

      const matchRate = Math.round((matchingSkills.length / reqSkills.length) * 100);

      return {
        employee: emp,
        score: matchRate,
        matchedSkills: matchingSkills
      };
    });

    // Sort by score descending
    return scored.sort((a, b) => b.score - a.score);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Resource Allocation Requests</h1>
        <p style={styles.subtitle}>Review requested skill sets, analyze system-ranked candidates, and approve deployments.</p>
      </div>

      <div style={styles.mainLayout}>
        {/* Requests List */}
        <div className="glass-card" style={styles.panel}>
          <h2 style={styles.panelTitle}>Pending Requests</h2>
          <div style={styles.reqList}>
            {requests.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center', padding: '24px 0' }}>
                No active allocation requests found.
              </div>
            ) : (
              requests.map(req => (
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
                      onClick={() => setActiveRequestDetails(req)}
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
              <div style={styles.recommenderHeader}>
                <h3 style={{ margin: 0, fontSize: '15px' }}>Ranked Candidates for: {activeRequestDetails.projectName}</h3>
                <span style={styles.matchingTag}>Skills Required: {activeRequestDetails.skills.length}</span>
              </div>

              <div style={styles.recommendationsList}>
                {getRankedRecommendations(activeRequestDetails.skills).map((rec, idx) => (
                  <div key={rec.employee.id} style={styles.recItemCard}>
                    <div style={styles.rankBadge}>#{idx + 1}</div>

                    <div style={styles.recCardBody}>
                      <div style={styles.recHeaderRow}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <img src={rec.employee.avatar} alt={rec.employee.name} style={styles.recAvatar} />
                          <div>
                            <div style={styles.recName}>{rec.employee.name}</div>
                            <div style={styles.recRole}>{rec.employee.role}</div>
                          </div>
                        </div>
                        <div style={{
                          ...styles.matchScore,
                          color: rec.score > 75 ? 'var(--color-success)' : rec.score > 40 ? 'var(--color-warning)' : 'var(--color-danger)'
                        }}>
                          {rec.score}% Match
                        </div>
                      </div>

                      {/* Matching skills check */}
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
                ))}
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
    gap: '16px',
    padding: '16px',
    background: 'var(--color-bg-card-hover)',
    borderRadius: '8px',
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
    paddingLeft: '16px',
  },
  recHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  recAvatar: {
    width: '32px',
    height: '32px',
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
    gap: '4px',
    marginTop: '4px',
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
    padding: '8px 16px',
    borderRadius: '6px',
    fontWeight: '700',
    fontSize: '12px',
    cursor: 'pointer',
    marginTop: '12px',
    width: '100%',
  }
};
