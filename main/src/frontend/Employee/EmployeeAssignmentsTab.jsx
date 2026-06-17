import React, { useState, useEffect } from 'react';
import { getTasks, saveTasks, getProjects } from '../mockState';

export default function EmployeeAssignmentsTab() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    setProjects(getProjects());
    loadEmployeeTasks();
  }, []);

  const loadEmployeeTasks = () => {
    const allTasks = getTasks();
    // Current Employee: Javier Santos (EMP-1014)
    const myTasks = allTasks.filter(t => t.employeeId === 'EMP-1014');
    setTasks(myTasks);
  };

  const handleUpdateStatus = (taskId, newStatus) => {
    const allTasks = getTasks();
    const updatedTasks = allTasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t);
    saveTasks(updatedTasks);
    loadEmployeeTasks();
  };

  // Javier Santos is assigned to "Inventory and Supply Chain Tracker"
  const myAssignedProjects = projects.filter(p => p.id === 2);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>My Project Assignments</h1>
        <p style={styles.subtitle}>Check your current allocations and manage status updates for assigned tasks.</p>
      </div>

      {/* Projects List */}
      <div className="glass-card" style={styles.card}>
        <h2 style={styles.sectionTitle}>Assigned Projects</h2>
        <div style={styles.projList}>
          {myAssignedProjects.map(proj => (
            <div key={proj.id} style={styles.projItem}>
              <div style={styles.projHeader}>
                <h3 style={styles.projName}>{proj.name}</h3>
                <span style={styles.timelineBadge}>Active Assignment</span>
              </div>
              <p style={styles.projDesc}>{proj.description}</p>
              <div style={styles.projFooter}>
                <span>Timeline: <strong>{proj.startDate} to {proj.endDate}</strong></span>
                <span>Project Manager: <strong>Lynn Czyla M. Alpuerto</strong></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Daily Tasks Tracker */}
      <div className="glass-card" style={styles.card}>
        <h2 style={styles.sectionTitle}>Assigned Daily Tasks</h2>
        <p style={styles.sectionSubtitle}>Select task progress status to sync updates with your Project Manager.</p>

        <div style={styles.taskList}>
          {tasks.length === 0 ? (
            <p style={styles.emptyText}>No tasks assigned to you.</p>
          ) : (
            tasks.map(task => (
              <div key={task.id} style={styles.taskCard}>
                <div style={styles.taskHeader}>
                  <h4 style={styles.taskTitle}>{task.title}</h4>
                  <span style={{
                    ...styles.priorityBadge,
                    backgroundColor: task.priority === 'High' ? 'var(--color-danger-light)' : task.priority === 'Medium' ? 'var(--color-warning-light)' : 'var(--color-primary-light)',
                    color: task.priority === 'High' ? 'var(--color-danger)' : task.priority === 'Medium' ? 'var(--color-warning)' : 'var(--color-success)'
                  }}>
                    {task.priority} Priority
                  </span>
                </div>
                
                <p style={styles.taskDesc}>{task.description}</p>

                <div style={styles.taskActionRow}>
                  <div style={styles.dueCol}>
                    <span>Due Date: <strong>{task.dueDate}</strong></span>
                  </div>

                  <div style={styles.statusSelectWrapper}>
                    <label style={styles.statusLabel}>Update Status:</label>
                    <select
                      value={task.status}
                      onChange={(e) => handleUpdateStatus(task.id, e.target.value)}
                      style={{
                        ...styles.statusSelect,
                        borderColor: task.status === 'Completed' ? 'var(--color-primary)' : task.status === 'In Progress' ? 'var(--color-warning)' : 'var(--color-border)',
                        color: task.status === 'Completed' ? 'var(--color-success)' : task.status === 'In Progress' ? 'var(--color-warning)' : 'var(--color-text-primary)'
                      }}
                    >
                      <option value="Pending">Pending</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
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
  card: {
    padding: '24px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '700',
    marginBottom: '16px',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '8px',
  },
  sectionSubtitle: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    marginBottom: '16px',
  },
  projList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  projItem: {
    padding: '16px',
    borderRadius: 'var(--radius-md)',
    background: 'rgba(255, 255, 255, 0.01)',
    border: '1px solid var(--color-border)',
    textAlign: 'left',
  },
  projHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  projName: {
    fontSize: '16px',
    fontWeight: '700',
  },
  timelineBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '30px',
    background: 'var(--color-primary-light)',
    color: 'var(--color-success)',
  },
  projDesc: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.5',
    marginBottom: '12px',
  },
  projFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    borderTop: '1px solid var(--color-border)',
    paddingTop: '10px',
  },
  taskList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  taskCard: {
    padding: '16px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'rgba(255, 255, 255, 0.01)',
    textAlign: 'left',
  },
  taskHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  taskTitle: {
    fontSize: '14px',
    fontWeight: '700',
  },
  priorityBadge: {
    fontSize: '9px',
    fontWeight: '700',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
  },
  taskDesc: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.5',
    marginBottom: '14px',
  },
  taskActionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid var(--color-border)',
    paddingTop: '12px',
  },
  dueCol: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
  },
  statusSelectWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusLabel: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    fontWeight: '600',
  },
  statusSelect: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    fontWeight: '600',
    fontSize: '12px',
    outline: 'none',
  },
  emptyText: {
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '13px',
    padding: '20px 0',
  }
};
