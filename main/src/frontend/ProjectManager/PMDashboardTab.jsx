import React, { useState, useEffect } from 'react';
import { getProjects, getEmployees, getTasks } from '../mockState';

export default function PMDashboardTab() {
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    setProjects(getProjects());
    setEmployees(getEmployees());
    setTasks(getTasks());
  }, []);

  const activeProjectsCount = projects.filter(p => p.status === 'Active').length;
  const totalTeamMembers = employees.length; // Simplified
  
  // Calculate average utilization
  const teamUtilization = "78%";

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Project Manager Dashboard</h1>
        <p style={styles.subtitle}>Overview of project metrics, team utilization, and resource readiness.</p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid" style={styles.statsGrid}>
        <div className="glass-card" style={styles.statCard}>
          <div style={{ ...styles.iconWrapper, backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>{activeProjectsCount}</div>
            <div style={styles.statLabel}>Active Projects</div>
          </div>
        </div>

        <div className="glass-card" style={styles.statCard}>
          <div style={{ ...styles.iconWrapper, backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>{totalTeamMembers}</div>
            <div style={styles.statLabel}>My Team Members</div>
          </div>
        </div>

        <div className="glass-card" style={styles.statCard}>
          <div style={{ ...styles.iconWrapper, backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>120h</div>
            <div style={styles.statLabel}>Total Hours This Week</div>
          </div>
        </div>

        <div className="glass-card" style={styles.statCard}>
          <div style={{ ...styles.iconWrapper, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>{teamUtilization}</div>
            <div style={styles.statLabel}>Team Utilization</div>
          </div>
        </div>
      </div>

      <div style={styles.gridContainer}>
        {/* Weekly Allocation */}
        <div className="glass-card" style={styles.mainPanel}>
          <h2 style={styles.panelTitle}>My Team Weekly Allocation</h2>
          <p style={styles.panelSubtitle}>Logged hours distribution across current project tasks.</p>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHeader}>
                  <th style={styles.th}>Employee</th>
                  <th style={styles.th}>Mon</th>
                  <th style={styles.th}>Tue</th>
                  <th style={styles.th}>Wed</th>
                  <th style={styles.th}>Thu</th>
                  <th style={styles.th}>Fri</th>
                  <th style={styles.th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const empTasks = tasks.filter(t => t.employeeId === emp.id);
                  const isAssigned = empTasks.length > 0;
                  return (
                    <tr key={emp.id} style={styles.trRow}>
                      <td style={styles.tdEmployee}>
                        <img src={emp.avatar} alt={emp.name} style={styles.empAvatar} />
                        <div>
                          <div style={styles.empName}>{emp.name}</div>
                          <div style={styles.empRole}>{emp.role}</div>
                        </div>
                      </td>
                      <td style={styles.tdVal}>{isAssigned ? '8h' : '0h'}</td>
                      <td style={styles.tdVal}>{isAssigned ? '8h' : '0h'}</td>
                      <td style={styles.tdVal}>{isAssigned ? '8h' : '0h'}</td>
                      <td style={styles.tdVal}>{isAssigned ? '8h' : '0h'}</td>
                      <td style={styles.tdVal}>{isAssigned ? '8h' : '0h'}</td>
                      <td style={{ ...styles.tdVal, fontWeight: '700', color: 'var(--color-primary)' }}>
                        {isAssigned ? '40h' : '0h'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Resource Pool / Available members */}
        <div className="glass-card" style={styles.sidePanel}>
          <h2 style={styles.panelTitle}>Resource Pool Status</h2>
          <p style={styles.panelSubtitle}>Available skills & certs for project assignments.</p>

          <div style={styles.poolList}>
            {employees.map(emp => (
              <div key={emp.id} style={styles.poolItem}>
                <div style={styles.poolHeader}>
                  <img src={emp.avatar} alt={emp.name} style={styles.poolAvatar} />
                  <div>
                    <div style={styles.poolName}>{emp.name}</div>
                    <div style={styles.poolRole}>{emp.role}</div>
                  </div>
                </div>
                <div style={styles.tagContainer}>
                  {emp.skills.slice(0, 3).map((skill, idx) => (
                    <span key={idx} style={styles.skillTag}>{skill}</span>
                  ))}
                  {emp.certifications.length > 0 && (
                    <span style={styles.certBadge}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                          <path d="M4 22h16"></path>
                          <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"></path>
                          <path d="M12 2a15.3 15.3 0 0 1 4 10H8a15.3 15.3 0 0 1 4-10z"></path>
                        </svg>
                        {emp.certifications.length} Certs
                      </span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
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
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '20px',
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
  },
  iconWrapper: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: '800',
    color: 'var(--color-text-primary)',
  },
  statLabel: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    fontWeight: '500',
  },
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '24px',
  },
  mainPanel: {
    padding: '24px',
  },
  sidePanel: {
    padding: '24px',
  },
  panelTitle: {
    fontSize: '18px',
    fontWeight: '700',
    marginBottom: '4px',
  },
  panelSubtitle: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    marginBottom: '20px',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  trHeader: {
    borderBottom: '2px solid var(--color-border)',
  },
  th: {
    padding: '12px 8px',
    fontSize: '12px',
    fontWeight: '700',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
  },
  trRow: {
    borderBottom: '1px solid var(--color-border)',
  },
  tdEmployee: {
    padding: '12px 8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  empAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  empName: {
    fontSize: '14px',
    fontWeight: '600',
  },
  empRole: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  tdVal: {
    padding: '12px 8px',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
  },
  poolList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  poolItem: {
    padding: '12px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    background: 'rgba(255, 255, 255, 0.02)',
  },
  poolHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
  },
  poolAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  poolName: {
    fontSize: '13px',
    fontWeight: '600',
  },
  poolRole: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  tagContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  skillTag: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    fontWeight: '600',
  },
  certBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'rgba(2, 132, 199, 0.1)',
    color: 'var(--color-accent)',
    fontWeight: '600',
  }
};
