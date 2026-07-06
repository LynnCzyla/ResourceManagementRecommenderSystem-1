import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { supabase } from '../../lib/supabaseClient';

export default function EmployeeAssignmentsTab({ user }) {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);

  // Weekly Log Progress Form States
  const [logWeek, setLogWeek] = useState('');
  const [logPercentage, setLogPercentage] = useState('');
  const [logDesc, setLogDesc] = useState('');
  const [activeLogTaskId, setActiveLogTaskId] = useState(null);

  const getCurrentWeek = () => {
    const now = new Date();
    const target = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
    return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  };

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
    const storedToken = localStorage.getItem('token') || localStorage.getItem('access_token');
    if (storedToken) return { Authorization: `Bearer ${storedToken}` };
    return {};
  };

  const fetchAssignmentsAndTasks = async () => {
    setLoading(true);
    try {
      const authHeader = await getAuthHeader();
      
      const projRes = await axios.get('http://localhost:5000/api/employee/assignments', { headers: authHeader });
      if (projRes.data.success) {
        setProjects(projRes.data.data || []);
      }

      const tasksRes = await axios.get('http://localhost:5000/api/employee/tasks', { headers: authHeader });
      if (tasksRes.data.success) {
        setTasks(tasksRes.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching assignments or tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  // ============ FIX: Wait for session to be restored before fetching ============
  useEffect(() => {
    let cancelled = false;

    const setupAuth = async () => {
      // Listen for auth state changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (cancelled) return;
        
        console.log(`🔐 Auth state changed: ${event}`, session ? 'Session exists' : 'No session');
        
        // Only fetch when we have a valid session or are already authenticated
        if (session || localStorage.getItem('token')) {
          setSessionReady(true);
        }
      });

      // Always attempt to restore session
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      
      if (session || localStorage.getItem('token')) {
        setSessionReady(true);
      }

      return () => {
        subscription?.unsubscribe();
      };
    };

    setupAuth();
    
    return () => {
      cancelled = true;
    };
  }, []);

  // ============ Fetch when session is ready ============
  useEffect(() => {
    if (sessionReady && user?.id) {
      fetchAssignmentsAndTasks();
    }
  }, [sessionReady, user?.id]);

  const handleUpdateStatus = async (taskId, newStatus) => {
    try {
      const authHeader = await getAuthHeader();
      const response = await axios.put(`http://localhost:5000/api/employee/tasks/${taskId}`, { status: newStatus }, { headers: authHeader });
      if (response.data.success) {
        setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
      }
    } catch (error) {
      console.error('Error updating task status:', error);
      alert('Failed to update task status.');
    }
  };

  const handleLogProgress = async (e, taskId) => {
    e.preventDefault();
    if (!logWeek || !logPercentage || !logDesc) return;

    try {
      const authHeader = await getAuthHeader();
      const response = await axios.post(`http://localhost:5000/api/employee/tasks/${taskId}/progress`, {
        week: logWeek,
        percentage: logPercentage,
        description: logDesc
      }, { headers: authHeader });

      if (response.data.success) {
        setLogWeek('');
        setLogPercentage('');
        setLogDesc('');
        setActiveLogTaskId(null);
        await fetchAssignmentsAndTasks();
      }
    } catch (error) {
      console.error('Error logging task progress:', error);
      alert('Failed to submit progress log.');
    }
  };

  if (loading) return <div style={{ padding: '24px', color: 'var(--color-text-secondary)' }}>Loading assignments...</div>;

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
          {projects.length === 0 ? (
            <p style={styles.emptyText}>No project assignments.</p>
          ) : (
            projects.map(proj => (
              <div key={proj.id} style={styles.projItem}>
                <div style={styles.projHeader}>
                  <h3 style={styles.projName}>{proj.name}</h3>
                  <span style={styles.timelineBadge}>Active Assignment</span>
                </div>
                <p style={styles.projDesc}>{proj.description}</p>
                <div style={styles.projFooter}>
                  <span>Timeline: <strong>{proj.startDate} to {proj.endDate}</strong></span>
                  <span>Project Manager: <strong>{proj.projectManager}</strong></span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Daily Tasks Tracker */}
      <div className="glass-card" style={styles.card}>
        <h2 style={styles.sectionTitle}>Assigned Weekly Tasks</h2>
        <p style={styles.sectionSubtitle}>Log progress for the Monday–Friday workweek and share completion percentage with your Project Manager.</p>

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
                          <div style={styles.logMetaRow}>
                            <span style={styles.logWeekBadge}>{log.week || 'N/A'}</span>
                            <span style={styles.logPercentBadge}>{log.percentage}% complete</span>
                            <span style={styles.logDate}>{log.date}</span>
                          </div>
                          <span style={styles.logPercentBadge}>{log.percentage}% complete</span>
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
                          setLogWeek(getCurrentWeek());
                          setLogPercentage('');
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
                          Log Weekly Progress
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

                {/* Collapsible weekly log form */}
                {activeLogTaskId === task.id && (
                  <form onSubmit={(e) => handleLogProgress(e, task.id)} style={styles.logForm}>
                    <div style={styles.logFormRow}>
                      <div style={{ width: '180px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={styles.logLabel}>Week</label>
                        <input
                          type="week"
                          value={logWeek}
                          onChange={(e) => setLogWeek(e.target.value)}
                          style={styles.logInput}
                          required
                        />
                      </div>
                      <div style={{ width: '130px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={styles.logLabel}>% Complete</label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          max="100"
                          value={logPercentage}
                          onChange={(e) => setLogPercentage(e.target.value)}
                          placeholder="e.g. 65"
                          style={styles.logInput}
                          required
                        />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={styles.logLabel}>Weekly Summary</label>
                        <input
                          type="text"
                          value={logDesc}
                          onChange={(e) => setLogDesc(e.target.value)}
                          placeholder="Summarize this week's work..."
                          style={styles.logInput}
                          required
                        />
                      </div>
                      <button type="submit" style={styles.logSubmitBtn}>Submit Weekly Log</button>
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
  logDescription: {
    flex: 1,
    minWidth: '150px',
  },
  logMetaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    alignItems: 'center',
    marginBottom: '6px',
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  logWeekBadge: {
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  logPercentBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    color: 'var(--color-primary)',
    padding: '2px 6px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '13px',
    padding: '20px 0',
  }
};
