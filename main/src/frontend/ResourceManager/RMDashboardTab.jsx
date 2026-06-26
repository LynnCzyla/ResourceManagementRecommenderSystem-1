import React, { useState, useEffect } from 'react';
import { getEmployees, getProjects } from '../mockState';

export default function RMDashboardTab() {
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showReport, setShowReport] = useState(false);
  const [workloadFilter, setWorkloadFilter] = useState('All');

  useEffect(() => {
    setEmployees(getEmployees());
    setProjects(getProjects());
  }, []);

  // Compute workload allocations
  const totalEmployees = employees.length;
  const activeProjectsCount = projects.filter(p => p.status === 'Active').length;

  // Mock workload categorizations
  const availableCount = employees.filter((_, idx) => idx % 3 === 0).length;
  const limitedCount = employees.filter((_, idx) => idx % 3 === 1).length;
  const fullyLoadedCount = employees.filter((_, idx) => idx % 3 === 2).length;

  const filteredEmployees = employees.filter((emp, idx) => {
    if (workloadFilter === 'All') return true;
    const status = idx % 3 === 0 ? 'Available' : idx % 3 === 1 ? 'Limited availability' : 'Fully loaded';
    return status === workloadFilter;
  });

  const handleGenerateReport = () => {
    setShowReport(true);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Capacity & Productivity Overview</h1>
        <p style={styles.subtitle}>Monitor workforce allocation, utilization metrics, and address resource bottlenecks.</p>
      </div>

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
            <div style={styles.cardVal}>{availableCount}</div>
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
            <div style={styles.cardVal}>{limitedCount}</div>
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
            <div style={styles.cardVal}>{fullyLoadedCount}</div>
            <div style={styles.cardLabel}>Fully loaded</div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={styles.mainGrid}>
        {/* Left Side: Workload Status List */}
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
                {filteredEmployees.map((emp, idx) => {
                  const rate = idx % 3 === 0 ? '25%' : idx % 3 === 1 ? '60%' : '100%';
                  const statusLabel = idx % 3 === 0 ? 'Available' : idx % 3 === 1 ? 'Limited availability' : 'Fully loaded';
                  const statusColor = idx % 3 === 0 ? 'var(--color-success)' : idx % 3 === 1 ? 'var(--color-warning)' : 'var(--color-danger)';
                  const statusBg = idx % 3 === 0 ? 'var(--color-primary-light)' : idx % 3 === 1 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)';
                  return (
                    <tr key={emp.id} style={styles.tr}>
                      <td style={styles.td}>
                        <div style={styles.empInfo}>
                          <img src={emp.avatar} alt={emp.name} style={styles.empAvatar} />
                          <div>
                            <div style={styles.empName}>{emp.name}</div>
                            <div style={styles.empEmail}>{emp.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={styles.td}>{emp.role}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.statusBadge, color: statusColor, backgroundColor: statusBg }}>
                          {statusLabel}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.progressContainer}>
                          <div style={{ ...styles.progressBar, width: rate, backgroundColor: statusColor }}></div>
                          <span style={styles.progressText}>{rate}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
                  <div>
                    <strong>Total Pool Size:</strong> {totalEmployees} Engineering Specialists
                  </div>
                  <div>
                    <strong>Average Utilization Rate:</strong> 61.5%
                  </div>
                  <div>
                    <strong>Available Count:</strong> {availableCount} employees
                  </div>
                  <div>
                    <strong>LOTO/Safety Compliance:</strong> 100% Certified
                  </div>
                </div>
              </div>

              <div style={styles.reportSection}>
                <h3>Resource Distribution by Role</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  <div style={styles.reportRow}><span>Senior Design Engineers</span><span>2 Allocated</span></div>
                  <div style={styles.reportRow}><span>Senior Cad Drafters & Lighting Designers</span><span>2 Allocated</span></div>
                  <div style={styles.reportRow}><span>Proposal & Sales Engineers</span><span>3 Allocated</span></div>
                  <div style={styles.reportRow}><span>Document Controllers</span><span>1 Allocated</span></div>
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
  poolList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  poolItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card-hover)',
  },
  poolAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  poolName: {
    fontSize: '13px',
    fontWeight: '700',
    margin: 0,
  },
  poolRole: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  poolStatus: {
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--color-warning)',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
  },
  skillsSummary: {
    display: 'flex',
    gap: '4px',
    marginTop: '4px',
  },
  miniPill: {
    fontSize: '9px',
    fontWeight: '600',
    background: 'var(--color-bg-root)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-secondary)',
    padding: '1px 4px',
    borderRadius: '3px',
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
