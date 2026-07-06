import React, { useState, useEffect } from 'react';
import { getDashboardStats, getEmployees, getTasks } from './pmApi';

export default function PMDashboardTab({ user }) {
  const [stats, setStats] = useState({
    activeProjectsCount: 0,
    totalProjectsCount: 0,
    totalTeamMembers: 0,
    totalTasksCount: 0,
    tasksByStatus: { Pending: 0, 'In Progress': 0, Completed: 0 },
  });
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');

  const loadDashboard = async () => {
    try {
      const [statsData, employeesData, tasksData] = await Promise.all([
        getDashboardStats(user?.id),
        getEmployees(user?.id),
        getTasks(),
      ]);
      setStats(statsData);
      setEmployees(employeesData);
      setTasks(tasksData);
      setLoadError('');
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      setLoadError(err.message || 'Failed to load dashboard');
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [user]);

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

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.role.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'role') return a.role.localeCompare(b.role);
    if (sortBy === 'completion') {
      const completionA = getTaskCompletion(a.id);
      const completionB = getTaskCompletion(b.id);
      return completionB - completionA; // Highest completion first
    }
    return 0;
  });


  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Project Manager Dashboard</h1>
        <p style={styles.subtitle}>Overview of project metrics, team utilization, and resource readiness.</p>
      </div>

      {loadError && (
        <div className="glass-card" style={styles.errorBanner}>{loadError}</div>
      )}

      {/* Stats Grid */}
      <div className="stats-grid" style={styles.statsGrid}>
        <div className="glass-card" style={styles.statCard}>
          <div style={{ ...styles.iconWrapper, backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>{stats.activeProjectsCount}</div>
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
            <div style={styles.statValue}>{stats.totalTeamMembers}</div>
            <div style={styles.statLabel}>My Team Members</div>
          </div>
        </div>


      </div>

      <div style={styles.gridContainer}>
        {/* Task Assignment Overview */}
        <div className="glass-card" style={styles.mainPanel}>
          <div style={styles.panelHeader}>
            <div>
              <h2 style={styles.panelTitle}>Task Assignment Overview</h2>
              <p style={styles.panelSubtitle}>Review current employee task assignments and progress percentage.</p>
            </div>
            <div style={styles.controls}>
              <div style={styles.searchWrapper}>
                <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  placeholder="Search by name or role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={styles.searchInput}
                />
              </div>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)} 
                style={styles.sortSelect}
              >
                <option value="name">Sort by Name</option>
                <option value="role">Sort by Role</option>
                <option value="completion">Sort by Completion</option>
              </select>
            </div>
          </div>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHeader}>
                  <th style={styles.th}>Employee</th>
                  <th style={styles.th}>Assigned Task</th>
                  <th style={styles.th}>% Complete</th>
                  <th style={styles.th}>Task Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map(emp => {
                  const assignedTasks = getAssignedTasks(emp.id);
                  const completion = getTaskCompletion(emp.id);
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Task Status Breakdown */}
        <div className="glass-card" style={styles.sidePanel}>
          <h2 style={styles.panelTitle}>Task Status Breakdown</h2>
          <p style={styles.panelSubtitle}>How your team's tasks are distributed right now.</p>

          <div style={styles.attendanceStats}>
            <div style={styles.attendanceMetric}>
              <span style={styles.attendanceValue}>{stats.tasksByStatus.Pending}</span>
              <span style={styles.attendanceLabel}>Pending</span>
            </div>
            <div style={styles.attendanceMetric}>
              <span style={styles.attendanceValue}>{stats.tasksByStatus['In Progress']}</span>
              <span style={styles.attendanceLabel}>In Progress</span>
            </div>
            <div style={styles.attendanceMetric}>
              <span style={styles.attendanceValue}>{stats.tasksByStatus.Completed}</span>
              <span style={styles.attendanceLabel}>Completed</span>
            </div>
          </div>

          <div style={styles.attendanceList}>
            {employees.map(emp => (
              <div key={emp.id} style={styles.attendanceRow}>
                <div style={styles.attendanceName}>{emp.name}</div>
                <span style={{ ...styles.attendanceBadge, backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                  {getTaskCompletion(emp.id)}%
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
  errorBanner: {
    padding: '12px 16px',
    color: 'var(--color-danger)',
    fontSize: '13px',
    fontWeight: '600',
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
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '16px',
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
  sortSelect: {
    padding: '8px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    outline: 'none',
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
};