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

  const dailyStatusMap = {
    'EMP-1014': 'Present',
    'EMP-1015': 'Absent',
    'EMP-1016': 'On Leave',
    'EMP-1017': 'Present',
    'EMP-1018': 'Present',
    'EMP-1019': 'Absent',
    'EMP-1020': 'Present',
  };

  const getDailyStatus = (id) => dailyStatusMap[id] || 'Present';

  const getAssignedTasks = (id) => tasks.filter(task => task.employeeId === id);
  const getTaskCompletion = (id) => {
    const assigned = getAssignedTasks(id);
    if (!assigned.length) return 0;
    const percentages = assigned.map(task => {
      if (task.progressLogs && task.progressLogs.length) {
        return task.progressLogs[task.progressLogs.length - 1].percentage || 0;
      }
      if (task.status === 'Completed') return 100;
      if (task.status === 'In Progress') return 55;
      return 20;
    });
    return Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length);
  };

  const attendanceCounts = employees.reduce((acc, emp) => {
    const status = getDailyStatus(emp.id);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { Present: 0, Absent: 0, 'On Leave': 0 });

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
        {/* Task Assignment Overview */}
        <div className="glass-card" style={styles.mainPanel}>
          <h2 style={styles.panelTitle}>Task Assignment Overview</h2>
          <p style={styles.panelSubtitle}>Review current employee task assignments, progress percentage, and daily availability.</p>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHeader}>
                  <th style={styles.th}>Employee</th>
                  <th style={styles.th}>Assigned Task</th>
                  <th style={styles.th}>% Complete</th>
                  <th style={styles.th}>Task Status</th>
                  <th style={styles.th}>Attendance</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const assignedTasks = getAssignedTasks(emp.id);
                  const completion = getTaskCompletion(emp.id);
                  const attendance = getDailyStatus(emp.id);
                  const taskLabel = assignedTasks.length ? assignedTasks[0].title : 'No task assigned';
                  const taskStatus = assignedTasks.length ? assignedTasks[0].status : 'Idle';

                  return (
                    <tr key={emp.id} style={styles.trRow}>
                      <td style={styles.tdEmployee}>
                        <img src={emp.avatar} alt={emp.name} style={styles.empAvatar} />
                        <div>
                          <div style={styles.empName}>{emp.name}</div>
                          <div style={styles.empRole}>{emp.role}</div>
                        </div>
                      </td>
                      <td style={styles.tdVal}>{taskLabel}</td>
                      <td style={styles.tdVal}>{completion}%</td>
                      <td style={styles.tdVal}>{taskStatus}</td>
                      <td style={styles.tdVal}>
                        <span style={{ ...styles.attendanceBadge, backgroundColor: attendance === 'Present' ? 'rgba(16, 185, 129, 0.12)' : attendance === 'Absent' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)', color: attendance === 'Present' ? 'var(--color-success)' : attendance === 'Absent' ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                          {attendance}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Daily Attendance */}
        <div className="glass-card" style={styles.sidePanel}>
          <h2 style={styles.panelTitle}>Daily Attendance</h2>
          <p style={styles.panelSubtitle}>Today's employee presence and leave status.</p>

          <div style={styles.attendanceStats}>
            <div style={styles.attendanceMetric}>
              <span style={styles.attendanceValue}>{attendanceCounts.Present}</span>
              <span style={styles.attendanceLabel}>Present</span>
            </div>
            <div style={styles.attendanceMetric}>
              <span style={styles.attendanceValue}>{attendanceCounts.Absent}</span>
              <span style={styles.attendanceLabel}>Absent</span>
            </div>
            <div style={styles.attendanceMetric}>
              <span style={styles.attendanceValue}>{attendanceCounts['On Leave']}</span>
              <span style={styles.attendanceLabel}>On Leave</span>
            </div>
          </div>

          <div style={styles.attendanceList}>
            {employees.map(emp => (
              <div key={emp.id} style={styles.attendanceRow}>
                <div style={styles.attendanceName}>{emp.name}</div>
                <span style={{ ...styles.attendanceBadge, backgroundColor: getDailyStatus(emp.id) === 'Present' ? 'rgba(16, 185, 129, 0.12)' : getDailyStatus(emp.id) === 'Absent' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)', color: getDailyStatus(emp.id) === 'Present' ? 'var(--color-success)' : getDailyStatus(emp.id) === 'Absent' ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                  {getDailyStatus(emp.id)}
                </span>
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
  attendanceStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '12px',
    marginBottom: '18px',
  },
  attendanceMetric: {
    padding: '16px',
    borderRadius: '14px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    textAlign: 'center',
  },
  attendanceValue: {
    fontSize: '24px',
    fontWeight: '800',
    color: 'var(--color-text-primary)',
    display: 'block',
    marginBottom: '6px',
  },
  attendanceLabel: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
  },
  attendanceList: {
    display: 'grid',
    gap: '12px',
  },
  attendanceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
  },
  attendanceName: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
  },
  attendanceBadge: {
    padding: '4px 10px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: '700',
  },
  poolList: {
    display: 'none',
  },
  poolItem: {
    display: 'none',
  },
  poolHeader: {
    display: 'none',
  },
  poolAvatar: {
    display: 'none',
  },
  poolName: {
    display: 'none',
  },
  poolRole: {
    display: 'none',
  },
  tagContainer: {
    display: 'none',
  },
  skillTag: {
    display: 'none',
  },
  certBadge: {
    display: 'none',
  }
};
