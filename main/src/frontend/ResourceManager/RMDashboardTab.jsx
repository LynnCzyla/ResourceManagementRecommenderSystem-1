import React, { useState, useEffect } from 'react';
import { fetchDashboard } from './rmApi';
import RMAvatar from './RMAvatar';

export default function RMDashboardTab() {
  const [employees, setEmployees] = useState([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [activeProjectsCount, setActiveProjectsCount] = useState(0);
  const [workloadCounts, setWorkloadCounts] = useState({ available: 0, limited: 0, fullyLoaded: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [workloadFilter, setWorkloadFilter] = useState('All');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboard();
      setEmployees(data.employees || []);
      setTotalEmployees(data.totalEmployees || 0);
      setActiveProjectsCount(data.activeProjectsCount || 0);
      setWorkloadCounts(data.workloadCounts || { available: 0, limited: 0, fullyLoaded: 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    if (workloadFilter === 'All') return true;
    return emp.workloadStatus === workloadFilter;
  });

  // Role distribution for the report modal, computed from live data instead of
  // hardcoded placeholder rows.
  const roleDistribution = employees.reduce((acc, emp) => {
    acc[emp.role] = (acc[emp.role] || 0) + 1;
    return acc;
  }, {});

  const avgUtilization = employees.length
    ? Math.round(employees.reduce((sum, e) => sum + (e.utilizationRate || 0), 0) / employees.length)
    : 0;

  const handleGenerateReport = () => {
    setShowReport(true);
  };

  if (loading) {
    return <div style={styles.container}><p>Loading dashboard…</p></div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Capacity & Productivity Overview</h1>
        <p style={styles.subtitle}>Monitor workforce allocation, utilization metrics, and address resource bottlenecks.</p>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '12px 16px', color: 'var(--color-danger)' }}>
          Couldn't load dashboard data: {error}
        </div>
      )}

      {/* Overview Cards */}
      <div style={styles.cardGrid}>
        <div className="glass-card" style={styles.overviewCard}>
          <div style={{ ...styles.cardIconWrapper, backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-primary)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <div>
            <div style={styles.cardVal}>{totalEmployees}</div>
            <div style={styles.cardLabel}>Total Employees</div>
          </div>
        </div>

        <div className="glass-card" style={styles.overviewCard}>
          <div style={{ ...styles.cardIconWrapper, backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div>
            <div style={styles.cardVal}>{activeProjectsCount}</div>
            <div style={styles.cardLabel}>Active Projects</div>
          </div>
        </div>

        <div className="glass-card" style={styles.overviewCard}>
          <div style={{ ...styles.cardIconWrapper, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" fill="currentColor"></circle>
            </svg>
          </div>
          <div>
            <div style={styles.cardVal}>{workloadCounts.available}</div>
            <div style={styles.cardLabel}>Available</div>
          </div>
        </div>

        <div className="glass-card" style={styles.overviewCard}>
          <div style={{ ...styles.cardIconWrapper, backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" fill="currentColor"></circle>
            </svg>
          </div>
          <div>
            <div style={styles.cardVal}>{workloadCounts.limited}</div>
            <div style={styles.cardLabel}>Limited availability</div>
          </div>
        </div>

        <div className="glass-card" style={styles.overviewCard}>
          <div style={{ ...styles.cardIconWrapper, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" fill="currentColor"></circle>
            </svg>
          </div>
          <div>
            <div style={styles.cardVal}>{workloadCounts.fullyLoaded}</div>
            <div style={styles.cardLabel}>Fully loaded</div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={styles.mainGrid}>
        <div className="glass-card" style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Employee Utilization & Workload</h2>
            <button onClick={handleGenerateReport} style={styles.reportBtn}>Generate Utilization Report</button>
          </div>

          <div style={styles.filterRow}>
            <label style={styles.filterLabel}>Filter by workload:</label>
            <select
              value={workloadFilter}
              onChange={(e) => setWorkloadFilter(e.target.value)}
              style={styles.selectFilterCompact}
            >
              <option value="All">All</option>
              <option value="Available">Available</option>
              <option value="Limited availability">Limited availability</option>
              <option value="Fully loaded">Fully loaded</option>
            </select>
          </div>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Employee</th>
                  <th style={styles.th}>Role/Position</th>
                  <th style={styles.th}>Workload Status</th>
                  <th style={styles.th}>Utilization Rate</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td style={styles.td} colSpan={4}>No employees match this filter.</td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => {
                    const statusColor =
                      emp.workloadStatus === 'Available' ? 'var(--color-success)' :
                      emp.workloadStatus === 'Limited availability' ? 'var(--color-warning)' :
                      'var(--color-danger)';
                    const statusBg =
                      emp.workloadStatus === 'Available' ? 'var(--color-primary-light)' :
                      emp.workloadStatus === 'Limited availability' ? 'rgba(245, 158, 11, 0.1)' :
                      'rgba(239, 68, 68, 0.1)';
                    return (
                      <tr key={emp.id} style={styles.tr}>
                        <td style={styles.td}>
                          <div style={styles.empInfo}>
                            <RMAvatar name={emp.name} src={emp.avatar} size={36} />
                            <div>
                              <div style={styles.empName}>{emp.name}</div>
                              <div style={styles.empEmail}>{emp.department}</div>
                            </div>
                          </div>
                        </td>
                        <td style={styles.td}>{emp.role}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.statusBadge, color: statusColor, backgroundColor: statusBg }}>
                            {emp.workloadStatus}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.progressContainer}>
                            <div style={{ ...styles.progressBar, width: `${emp.utilizationRate}%`, backgroundColor: statusColor }}></div>
                            <span style={styles.progressText}>{emp.utilizationRate}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Workforce Report Modal */}
      {showReport && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: '20px' }}>Workforce Allocation & Utilization Report</h2>
              <button onClick={() => setShowReport(false)} style={styles.closeModalBtn}>&times;</button>
            </div>
            <div style={styles.reportContent}>
              <div style={styles.reportSection}>
                <h3>Summary Metrics</h3>
                <div style={styles.reportMetaGrid}>
                  <div><strong>Total Pool Size:</strong> {totalEmployees} employees</div>
                  <div><strong>Average Utilization Rate:</strong> {avgUtilization}%</div>
                  <div><strong>Available Count:</strong> {workloadCounts.available} employees</div>
                  <div><strong>Fully Loaded:</strong> {workloadCounts.fullyLoaded} employees</div>
                </div>
              </div>

              <div style={styles.reportSection}>
                <h3>Resource Distribution by Role</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  {Object.entries(roleDistribution).length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>No role data available.</div>
                  ) : (
                    Object.entries(roleDistribution).map(([role, count]) => (
                      <div key={role} style={styles.reportRow}><span>{role}</span><span>{count} Allocated</span></div>
                    ))
                  )}
                </div>
              </div>

              <button onClick={() => { alert('Report downloaded successfully!'); setShowReport(false); }} style={{ ...styles.downloadBtn, display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download PDF Report
              </button>
            </div>
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
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '16px',
  },
  overviewCard: {
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  cardIconWrapper: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
  },
  cardVal: {
    fontSize: '24px',
    fontWeight: '800',
  },
  cardLabel: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '24px',
  },
  panel: {
    padding: '24px',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  panelTitle: {
    fontSize: '18px',
    fontWeight: '700',
    margin: 0,
  },
  reportBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: '6px',
    fontWeight: '700',
    fontSize: '12px',
    cursor: 'pointer',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '12px',
    borderBottom: '2px solid var(--color-border)',
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    textAlign: 'left',
  },
  tr: {
    borderBottom: '1px solid var(--color-border)',
  },
  td: {
    padding: '14px 12px',
    fontSize: '13px',
    verticalAlign: 'middle',
  },
  empInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  empAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  empName: {
    fontWeight: '700',
  },
  empEmail: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  statusBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '30px',
    display: 'inline-block',
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
  },
  progressBar: {
    height: '6px',
    borderRadius: '4px',
  },
  progressText: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--color-text-secondary)',
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
    maxWidth: '520px',
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
  reportContent: {
    marginTop: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  reportSection: {
    textAlign: 'left',
  },
  reportMetaGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    fontSize: '13px',
    background: 'var(--color-bg-card-hover)',
    padding: '12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
  },
  filterLabel: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--color-text-secondary)',
    marginRight: '10px',
  },
  selectFilterCompact: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    outline: 'none',
    fontSize: '13px',
  },
  reportRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    borderBottom: '1px dashed var(--color-border)',
    paddingBottom: '4px',
  },
  downloadBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '12px',
    borderRadius: '6px',
    fontWeight: '700',
    fontSize: '14px',
    cursor: 'pointer',
    marginTop: '10px',
  }
};