import React, { useState, useEffect } from 'react';
import { getTasks, getEmployees } from '../mockState';

export default function EmployeeDashboardTab() {
  const [tasks, setTasks] = useState([]);
  const [employeeInfo, setEmployeeInfo] = useState(null);

  useEffect(() => {
    const allTasks = getTasks();
    const emps = getEmployees();
    // In demo, current employee is Javier Santos (EMP-1014)
    const currentEmp = emps.find(e => e.id === 'EMP-1014') || emps[0];
    setEmployeeInfo(currentEmp);
    setTasks(allTasks.filter(t => t.employeeId === currentEmp.id));
  }, []);

  if (!employeeInfo) return <div>Loading dashboard...</div>;

  const activeTasks = tasks.filter(t => t.status === 'In Progress').length;
  const pendingTasks = tasks.filter(t => t.status === 'Pending').length;
  const completedTasks = tasks.filter(t => t.status === 'Completed').length;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Employee Portal</h1>
        <p style={styles.subtitle}>Welcome back! Track your assignments, tasks, and update your CV/skills portfolio.</p>
      </div>

      {/* Mini Profile Summary */}
      <div className="glass-card" style={styles.profileSummaryCard}>
        <img src={employeeInfo.avatar} alt={employeeInfo.name} style={styles.profileAvatar} />
        <div style={styles.profileDetails}>
          <h2 style={styles.profileName}>{employeeInfo.name}</h2>
          <span style={styles.profileRolePill}>{employeeInfo.role}</span>
          <p style={styles.profileMetaText}>🆔 {employeeInfo.id} | 🏢 {employeeInfo.department} | ✉️ {employeeInfo.email}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid" style={styles.statsGrid}>
        <div className="glass-card" style={styles.statCard}>
          <div style={{ ...styles.iconWrapper, backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>1</div>
            <div style={styles.statLabel}>Assigned Project</div>
          </div>
        </div>

        <div className="glass-card" style={styles.statCard}>
          <div style={{ ...styles.iconWrapper, backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>{activeTasks + pendingTasks}</div>
            <div style={styles.statLabel}>Active & Pending Tasks</div>
          </div>
        </div>

        <div className="glass-card" style={styles.statCard}>
          <div style={{ ...styles.iconWrapper, backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>{completedTasks}</div>
            <div style={styles.statLabel}>Completed Tasks</div>
          </div>
        </div>

        <div className="glass-card" style={styles.statCard}>
          <div style={{ ...styles.iconWrapper, backgroundColor: 'rgba(2, 132, 199, 0.1)', color: 'var(--color-accent)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>{employeeInfo.certifications.length}</div>
            <div style={styles.statLabel}>Certifications</div>
          </div>
        </div>
      </div>

      {/* Task Summary List */}
      <div className="glass-card" style={styles.taskPanel}>
        <h3 style={styles.panelTitle}>Daily Task Assignment Summary</h3>
        <p style={styles.panelSubtitle}>Tasks allocated to you by your Project Manager.</p>

        <div style={styles.taskList}>
          {tasks.length === 0 ? (
            <p style={styles.emptyText}>No tasks assigned yet.</p>
          ) : (
            tasks.map(task => (
              <div key={task.id} style={styles.taskItem}>
                <div style={styles.taskMeta}>
                  <span style={{
                    ...styles.statusBadge,
                    backgroundColor: task.status === 'Completed' ? 'var(--color-primary-light)' : task.status === 'In Progress' ? 'rgba(245, 158, 11, 0.1)' : 'var(--color-border)',
                    color: task.status === 'Completed' ? 'var(--color-success)' : task.status === 'In Progress' ? 'var(--color-warning)' : 'var(--color-text-secondary)'
                  }}>
                    {task.status}
                  </span>
                  <span style={styles.taskProjectName}>{task.projectName}</span>
                </div>
                <h4 style={styles.taskTitle}>{task.title}</h4>
                <p style={styles.taskDesc}>{task.description}</p>
                <div style={styles.taskFooter}>
                  <span>Priority: <strong>{task.priority}</strong></span>
                  <span>Due: {task.dueDate}</span>
                </div>
              </div>
            ))
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
  profileSummaryCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    padding: '24px',
  },
  profileAvatar: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '2px solid var(--color-primary)',
  },
  profileDetails: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '6px',
  },
  profileName: {
    fontSize: '22px',
    fontWeight: '700',
    margin: 0,
  },
  profileRolePill: {
    fontSize: '12px',
    fontWeight: '600',
    padding: '4px 12px',
    borderRadius: '30px',
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
  },
  profileMetaText: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    margin: 0,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
  },
  iconWrapper: {
    width: '44px',
    height: '44px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: '800',
  },
  statLabel: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    fontWeight: '500',
  },
  taskPanel: {
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
  taskList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  taskItem: {
    padding: '16px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'rgba(255, 255, 255, 0.01)',
    textAlign: 'left',
  },
  taskMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '8px',
  },
  statusBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '4px',
  },
  taskProjectName: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontWeight: '600',
  },
  taskTitle: {
    fontSize: '14px',
    fontWeight: '700',
    marginBottom: '6px',
  },
  taskDesc: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.5',
    marginBottom: '12px',
  },
  taskFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    borderTop: '1px solid var(--color-border)',
    paddingTop: '10px',
  },
  emptyText: {
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '13px',
    padding: '24px 0',
  }
};
