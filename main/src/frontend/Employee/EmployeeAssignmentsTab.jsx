import React, { useState, useEffect } from 'react';
import { getTasks, saveTasks, getProjects } from '../mockState';

export default function EmployeeAssignmentsTab() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);

  // Log Progress Form States
  const [logHours, setLogHours] = useState('');
  const [logDesc, setLogDesc] = useState('');
  const [activeLogTaskId, setActiveLogTaskId] = useState(null);

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

  const handleLogProgress = (e, taskId) => {
    e.preventDefault();
    if (!logHours || !logDesc) return;

    const allTasks = getTasks();
    const updatedTasks = allTasks.map(t => {
      if (t.id === taskId) {
        const logs = t.progressLogs || [];
        const newLog = {
          id: Date.now(),
          hours: parseFloat(logHours),
          description: logDesc,
          date: new Date().toISOString().split('T')[0]
        };
        return {
          ...t,
          progressLogs: [...logs, newLog]
        };
      }
      return t;
    });

    saveTasks(updatedTasks);
    setLogHours('');
    setLogDesc('');
    setActiveLogTaskId(null);
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

                {/* Progress Logs Section */}
                {task.progressLogs && task.progressLogs.length > 0 && (
                  <div style={styles.logsSection}>
                    <h5 style={styles.logsSectionTitle}>Reported Progress Logs</h5>
                    <div style={styles.logsList}>
                      {task.progressLogs.map(log => (
                        <div key={log.id} style={styles.logItem}>
                          <span style={{ ...styles.logDate, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle' }}>
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                              <line x1="16" y1="2" x2="16" y2="6"></line>
                              <line x1="8" y1="2" x2="8" y2="6"></line>
                              <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                            {log.date}
                          </span>
                          <span style={styles.logHoursBadge}>{log.hours} hrs</span>
                          <span style={styles.logDescription}>{log.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={styles.taskActionRow}>
                  <div style={styles.dueCol}>
                    <span>Due Date: <strong>{task.dueDate}</strong></span>
                  </div>

                  <div style={styles.statusSelectWrapper}>
                    <button
                      type="button"
                      onClick={() => {
                        if (activeLogTaskId === task.id) {
                          setActiveLogTaskId(null);
                        } else {
                          setActiveLogTaskId(task.id);
                          setLogHours('');
                          setLogDesc('');
                        }
                      }}
                      style={styles.toggleLogBtn}
                    >
                      {activeLogTaskId === task.id ? 'Cancel' : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle' }}>
                            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                          </svg>
                          Log Progress
                        </span>
                      )}
                    </button>

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

                {/* Collapsible log form */}
                {activeLogTaskId === task.id && (
                  <form onSubmit={(e) => handleLogProgress(e, task.id)} style={styles.logForm}>
                    <div style={styles.logFormRow}>
                      <div style={{ width: '120px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={styles.logLabel}>Hours Worked</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          max="24"
                          value={logHours}
                          onChange={(e) => setLogHours(e.target.value)}
                          placeholder="e.g. 4.5"
                          style={styles.logInput}
                          required
                        />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={styles.logLabel}>Task Progress Description</label>
                        <input
                          type="text"
                          value={logDesc}
                          onChange={(e) => setLogDesc(e.target.value)}
                          placeholder="Describe what you worked on..."
                          style={styles.logInput}
                          required
                        />
                      </div>
                      <button type="submit" style={styles.logSubmitBtn}>Submit Log</button>
                    </div>
                  </form>
                )}
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
    gap: '12px',
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
  toggleLogBtn: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    color: '#3b82f6',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    fontWeight: '600',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  logForm: {
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px dashed var(--color-border)',
  },
  logFormRow: {
    display: 'flex',
    gap: '16px',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  logLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
  },
  logInput: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
  },
  logSubmitBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    fontWeight: '700',
    fontSize: '12px',
    cursor: 'pointer',
    height: '34px',
  },
  logsSection: {
    marginTop: '12px',
    marginBottom: '16px',
    padding: '12px',
    borderRadius: '6px',
    background: 'var(--color-bg-card-hover)',
    border: '1px solid var(--color-border)',
  },
  logsSectionTitle: {
    fontSize: '12px',
    fontWeight: '700',
    margin: '0 0 8px 0',
    color: 'var(--color-text-primary)',
  },
  logsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  logItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    flexWrap: 'wrap',
  },
  logDate: {
    fontWeight: '600',
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  logHoursBadge: {
    backgroundColor: 'var(--color-primary-light)',
    color: 'var(--color-success)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '700',
  },
  logDescription: {
    flex: 1,
    minWidth: '150px',
  },
  emptyText: {
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '13px',
    padding: '20px 0',
  }
};
