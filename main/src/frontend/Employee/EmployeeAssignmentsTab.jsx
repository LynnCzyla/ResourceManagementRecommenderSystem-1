import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { supabase } from '../../lib/supabaseClient';

// Monday of the current week, in YYYY-MM-DD.
function getWeekStart() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  return monday.toISOString().split('T')[0];
}

// Friday of the current week, in YYYY-MM-DD.
function getWeekEnd() {
  const now = new Date();
  const day = now.getDay() || 7;
  const friday = new Date(now);
  friday.setDate(now.getDate() - day + 5);
  return friday.toISOString().split('T')[0];
}

function cumulativePercentage(logs) {
  return (logs || []).reduce((sum, log) => sum + (parseInt(log.percentage, 10) || 0), 0);
}

function statusColor(status) {
  if (status === 'Completed') return 'var(--color-success)';
  if (status === 'In Progress') return 'var(--color-warning)';
  return 'var(--color-text-muted)';
}

export default function EmployeeAssignmentsTab({ user }) {
  const [subTab, setSubTab] = useState('assignments'); // 'assignments' | 'history'

  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);

  // History data
  const [historyTasks, setHistoryTasks] = useState([]);
  const [historyProjects, setHistoryProjects] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [expandedTaskId, setExpandedTaskId] = useState(null);

  // Weekly Log Progress Form States
  const [logStartDate, setLogStartDate] = useState('');
  const [logEndDate, setLogEndDate] = useState('');
  const [logPercentage, setLogPercentage] = useState('');
  const [logDesc, setLogDesc] = useState('');
  const [activeLogTaskId, setActiveLogTaskId] = useState(null);
  const [logFormError, setLogFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  const fetchHistory = async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const authHeader = await getAuthHeader();
      const res = await axios.get('http://localhost:5000/api/employee/history', { headers: authHeader });
      if (res.data.success) {
        setHistoryTasks(res.data.data.completedTasks || []);
        setHistoryProjects(res.data.data.completedProjects || []);
      }
    } catch (error) {
      console.error('Error fetching employee history:', error);
      setHistoryError('Unable to load your history right now.');
    } finally {
      setHistoryLoading(false);
    }
  };

  // ============ Wait for session to be restored before fetching ============
  useEffect(() => {
    let cancelled = false;

    const setupAuth = async () => {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (cancelled) return;
        if (session || localStorage.getItem('token')) {
          setSessionReady(true);
        }
      });

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

  useEffect(() => {
    if (sessionReady && user?.id) {
      fetchAssignmentsAndTasks();
      fetchHistory();
    }
  }, [sessionReady, user?.id]);

  const handleUpdateStatus = async (taskId, newStatus) => {
    try {
      const authHeader = await getAuthHeader();
      const response = await axios.put(`http://localhost:5000/api/employee/tasks/${taskId}`, { status: newStatus }, { headers: authHeader });
      if (response.data.success) {
        setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
        // Moving a task to Completed sends it straight to the History sub-tab,
        // so refresh history data to pick it up immediately.
        if (newStatus === 'Completed') {
          fetchHistory();
        }
      }
    } catch (error) {
      console.error('Error updating task status:', error);
      alert('Failed to update task status.');
    }
  };

  const openLogForm = (taskId) => {
    if (activeLogTaskId === taskId) {
      setActiveLogTaskId(null);
      return;
    }
    setActiveLogTaskId(taskId);
    setLogStartDate(getWeekStart());
    setLogEndDate(getWeekEnd());
    setLogPercentage('');
    setLogDesc('');
    setLogFormError('');
  };

  const handleLogProgress = async (e, taskId) => {
    e.preventDefault();
    setLogFormError('');

    if (!logStartDate || !logEndDate || !logPercentage || !logDesc) return;

    if (new Date(logEndDate) < new Date(logStartDate)) {
      setLogFormError('End date cannot be before the start date.');
      return;
    }

    const task = tasks.find(t => t.id === taskId);
    let willComplete = false;
    if (task) {
      const currentTotal = cumulativePercentage(task.progressLogs);
      const newPercentageVal = parseInt(logPercentage, 10) || 0;
      if (currentTotal + newPercentageVal > 100) {
        setLogFormError(`Cannot log progress. Total would be ${currentTotal + newPercentageVal}%, which exceeds 100%. Maximum you can log is ${100 - currentTotal}%.`);
        return;
      }
      willComplete = currentTotal + newPercentageVal >= 100;
    }

    setSubmitting(true);
    try {
      const authHeader = await getAuthHeader();
      const response = await axios.post(`http://localhost:5000/api/employee/tasks/${taskId}/progress`, {
        startDate: logStartDate,
        endDate: logEndDate,
        percentage: logPercentage,
        description: logDesc
      }, { headers: authHeader });

      if (response.data.success) {
        setLogStartDate('');
        setLogEndDate('');
        setLogPercentage('');
        setLogDesc('');
        setActiveLogTaskId(null);
        await fetchAssignmentsAndTasks();
        // Reaching 100% auto-completes the task server-side, so pull it into History too.
        if (willComplete) {
          fetchHistory();
        }
      }
    } catch (error) {
      console.error('Error logging task progress:', error);
      setLogFormError(error.response?.data?.error || 'Failed to submit progress log.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div style={{ padding: '24px', color: 'var(--color-text-secondary)' }}>Loading assignments...</div>;

  // Completed tasks live in the History sub-tab, not the active list.
  const activeTasks = tasks.filter(t => t.status !== 'Completed');

  const activeCount = activeTasks.filter(t => t.status === 'In Progress').length;
  const pendingCount = activeTasks.filter(t => t.status === 'Pending').length;
  const completedCount = historyTasks.length;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>My Project Assignments</h1>
        <p style={styles.subtitle}>Check your current allocations and manage status updates for assigned tasks.</p>
      </div>

      {/* Sub-tabs */}
      <div style={styles.subTabBar}>
        <button
          type="button"
          onClick={() => setSubTab('assignments')}
          style={{
            ...styles.subTabBtn,
            ...(subTab === 'assignments' ? styles.subTabBtnActive : {})
          }}
        >
          Assignments
        </button>
        <button
          type="button"
          onClick={() => setSubTab('history')}
          style={{
            ...styles.subTabBtn,
            ...(subTab === 'history' ? styles.subTabBtnActive : {})
          }}
        >
          History
          {completedCount > 0 && <span style={styles.subTabCount}>{completedCount}</span>}
        </button>
      </div>

      {subTab === 'assignments' ? (
        <>
          {/* Summary strip */}
          <div style={styles.summaryGrid}>
            <div className="glass-card" style={styles.summaryCard}>
              <div style={{ ...styles.summaryIcon, backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <div>
                <div style={styles.summaryValue}>{projects.length}</div>
                <div style={styles.summaryLabel}>Assigned Projects</div>
              </div>
            </div>
            <div className="glass-card" style={styles.summaryCard}>
              <div style={{ ...styles.summaryIcon, backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </div>
              <div>
                <div style={styles.summaryValue}>{activeCount + pendingCount}</div>
                <div style={styles.summaryLabel}>Active &amp; Pending Tasks</div>
              </div>
            </div>
            <div className="glass-card" style={styles.summaryCard}>
              <div style={{ ...styles.summaryIcon, backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <div>
                <div style={styles.summaryValue}>{completedCount}</div>
                <div style={styles.summaryLabel}>Completed Tasks</div>
              </div>
            </div>
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

          {/* Weekly Tasks Tracker */}
          <div className="glass-card" style={styles.card}>
            <h2 style={styles.sectionTitle}>Assigned Weekly Tasks</h2>
            <p style={styles.sectionSubtitle}>Log progress for the Monday–Friday workweek and share completion percentage with your Project Manager. Tasks move to History once completed.</p>

            <div style={styles.taskList}>
              {activeTasks.length === 0 ? (
                <p style={styles.emptyText}>No active tasks. Anything you've finished is in the History tab.</p>
              ) : (
                activeTasks.map(task => {
                  const total = cumulativePercentage(task.progressLogs);
                  const remaining = 100 - total;
                  const isLogging = activeLogTaskId === task.id;

                  return (
                    <div key={task.id} style={{ ...styles.taskCard, borderLeft: `3px solid ${statusColor(task.status)}` }}>
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

                      {/* Progress bar */}
                      <div style={styles.progressRow}>
                        <div style={styles.progressTrack}>
                          <div style={{
                            ...styles.progressFill,
                            width: `${Math.min(100, total)}%`,
                            backgroundColor: total >= 100 ? 'var(--color-success)' : 'var(--color-primary)'
                          }}></div>
                        </div>
                        <span style={styles.progressLabel}>{total}%</span>
                      </div>

                      {/* Progress Logs Section */}
                      {task.progressLogs && task.progressLogs.length > 0 && (
                        <div style={styles.logsSection}>
                          <h5 style={styles.logsSectionTitle}>Reported Progress Logs</h5>
                          <div style={styles.logsList}>
                            {task.progressLogs.map((log, idx) => {
                              let cumulative = 0;
                              for (let i = 0; i <= idx; i++) cumulative += (parseInt(task.progressLogs[i].percentage, 10) || 0);
                              return (
                                <div key={log.id} style={styles.logItem}>
                                  <div style={styles.logMetaRow}>
                                    <span style={styles.logWeekBadge}>
                                      {log.startDate && log.endDate ? `${log.startDate} → ${log.endDate}` : (log.week || 'N/A')}
                                    </span>
                                    <span style={styles.logPercentBadge}>{log.percentage}% this period (Total: {cumulative}%)</span>
                                  </div>
                                  <span style={styles.logDescription}>{log.description}</span>
                                </div>
                              );
                            })}
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
                            onClick={() => openLogForm(task.id)}
                            style={styles.toggleLogBtn}
                          >
                            {isLogging ? 'Cancel' : (
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
                              borderColor: statusColor(task.status),
                              color: statusColor(task.status)
                            }}
                          >
                            <option value="Pending">Pending</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                          </select>
                        </div>
                      </div>

                      {/* Collapsible log form */}
                      {isLogging && (
                        <form onSubmit={(e) => handleLogProgress(e, task.id)} style={styles.logForm}>
                          <div style={styles.logFormRow}>
                            <div style={{ width: '160px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={styles.logLabel}>Start Date</label>
                              <input
                                type="date"
                                value={logStartDate}
                                onChange={(e) => setLogStartDate(e.target.value)}
                                style={styles.logInput}
                                required
                              />
                            </div>
                            <div style={{ width: '160px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={styles.logLabel}>End Date</label>
                              <input
                                type="date"
                                value={logEndDate}
                                min={logStartDate || undefined}
                                onChange={(e) => setLogEndDate(e.target.value)}
                                style={styles.logInput}
                                required
                              />
                            </div>
                            <div style={{ width: '130px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={styles.logLabel}>% Complete (Max {remaining}%)</label>
                              <input
                                type="number"
                                step="1"
                                min="1"
                                max={remaining}
                                value={logPercentage}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10) || 0;
                                  if (val > remaining) {
                                    setLogPercentage(remaining);
                                  } else {
                                    setLogPercentage(e.target.value);
                                  }
                                }}
                                placeholder={`e.g. ${Math.min(remaining, 30)}`}
                                style={styles.logInput}
                                disabled={remaining <= 0}
                                required
                              />
                            </div>
                            <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
                            <button
                              type="submit"
                              style={{
                                ...styles.logSubmitBtn,
                                opacity: (remaining <= 0 || submitting) ? 0.5 : 1,
                                cursor: (remaining <= 0 || submitting) ? 'not-allowed' : 'pointer'
                              }}
                              disabled={remaining <= 0 || submitting}
                            >
                              {submitting ? 'Submitting...' : 'Submit Weekly Log'}
                            </button>
                          </div>
                          {logFormError && (
                            <p style={styles.logFormErrorText}>{logFormError}</p>
                          )}
                          {remaining <= 0 && !logFormError && (
                            <p style={styles.logFormSuccessText}>
                              ✓ Task progress is already at 100%. This task will move to History.
                            </p>
                          )}
                        </form>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {historyLoading ? (
            <div style={{ padding: '24px', color: 'var(--color-text-secondary)' }}>Loading history...</div>
          ) : (
            <>
              {historyError && <div style={styles.errorBanner}>{historyError}</div>}

              {/* Completed Projects */}
              <div className="glass-card" style={styles.card}>
                <h2 style={styles.sectionTitle}>Completed Projects</h2>
                <div style={styles.list}>
                  {historyProjects.length === 0 ? (
                    <p style={styles.emptyText}>No completed projects yet.</p>
                  ) : (
                    historyProjects.map(proj => (
                      <div key={proj.id} style={styles.historyItem}>
                        <div style={styles.itemHeader}>
                          <h3 style={styles.itemName}>{proj.name}</h3>
                          <span style={styles.doneBadge}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            Completed
                          </span>
                        </div>
                        <p style={styles.itemDesc}>{proj.description}</p>
                        <div style={styles.itemFooter}>
                          <span>Timeline: <strong>{proj.startDate} to {proj.endDate}</strong></span>
                          <span>Project Manager: <strong>{proj.projectManager}</strong></span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Completed Tasks */}
              <div className="glass-card" style={styles.card}>
                <h2 style={styles.sectionTitle}>Completed Tasks</h2>
                <p style={styles.sectionSubtitle}>Every task you've brought to 100% completion, with its full progress trail.</p>
                <div style={styles.list}>
                  {historyTasks.length === 0 ? (
                    <p style={styles.emptyText}>No completed tasks yet.</p>
                  ) : (
                    historyTasks.map(task => {
                      const isExpanded = expandedTaskId === task.id;
                      return (
                        <div key={task.id} style={styles.historyItem}>
                          <div style={styles.itemHeader}>
                            <div>
                              <h3 style={styles.itemName}>{task.title}</h3>
                              <span style={styles.projectTag}>{task.projectName}</span>
                            </div>
                            <span style={styles.doneBadge}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                              Completed
                            </span>
                          </div>
                          <p style={styles.itemDesc}>{task.description}</p>
                          <div style={styles.itemFooter}>
                            <span>Due Date: <strong>{task.dueDate}</strong></span>
                            <span>Completed On: <strong>{task.completedOn || 'N/A'}</strong></span>
                          </div>

                          {task.progressLogs && task.progressLogs.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                              style={styles.toggleLogBtn}
                            >
                              {isExpanded ? 'Hide progress trail' : `View progress trail (${task.progressLogs.length} logs)`}
                            </button>
                          )}

                          {isExpanded && (
                            <div style={styles.logsSection}>
                              <div style={styles.logsList}>
                                {task.progressLogs.map((log, idx) => {
                                  let cumulative = 0;
                                  for (let i = 0; i <= idx; i++) cumulative += (parseInt(task.progressLogs[i].percentage, 10) || 0);
                                  return (
                                    <div key={log.id} style={styles.logItem}>
                                      <div style={styles.logMetaRow}>
                                        <span style={styles.logWeekBadge}>
                                          {log.startDate && log.endDate ? `${log.startDate} → ${log.endDate}` : (log.week || 'N/A')}
                                        </span>
                                        <span style={styles.logPercentBadge}>{log.percentage}% (Total: {cumulative}%)</span>
                                      </div>
                                      <span style={styles.logDescription}>{log.description}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
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
  subTabBar: {
    display: 'flex',
    gap: '4px',
    padding: '4px',
    borderRadius: '12px',
    background: 'var(--color-bg-card-hover)',
    border: '1px solid var(--color-border)',
    width: 'fit-content',
  },
  subTabBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 18px',
    borderRadius: '9px',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  subTabBtnActive: {
    background: 'var(--color-primary)',
    color: '#ffffff',
  },
  subTabCount: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '1px 6px',
    borderRadius: '20px',
    background: 'rgba(255, 255, 255, 0.25)',
  },
  errorBanner: {
    padding: '12px 16px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-danger-light)',
    color: 'var(--color-danger)',
    fontSize: '13px',
    fontWeight: '600',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
  },
  summaryCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '18px',
  },
  summaryIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  summaryValue: {
    fontSize: '22px',
    fontWeight: '800',
  },
  summaryLabel: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    fontWeight: '500',
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
    flexWrap: 'wrap',
    gap: '8px',
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
    gap: '12px',
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
    whiteSpace: 'nowrap',
  },
  taskDesc: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.5',
    marginBottom: '12px',
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '14px',
  },
  progressTrack: {
    flex: 1,
    height: '8px',
    borderRadius: '10px',
    background: 'var(--color-border)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '10px',
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--color-text-secondary)',
    minWidth: '32px',
    textAlign: 'right',
  },
  taskActionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
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
    flexWrap: 'wrap',
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
    marginTop: '4px',
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
  logFormErrorText: {
    color: 'var(--color-danger)',
    fontSize: '11px',
    marginTop: '8px',
    fontWeight: '600',
  },
  logFormSuccessText: {
    color: 'var(--color-success)',
    fontSize: '11px',
    marginTop: '8px',
    fontWeight: 'bold',
  },
  logsSection: {
    marginTop: '4px',
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
    flexDirection: 'column',
    gap: '2px',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
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
    marginBottom: '4px',
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
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  historyItem: {
    padding: '16px',
    borderRadius: 'var(--radius-md)',
    background: 'rgba(255, 255, 255, 0.01)',
    border: '1px solid var(--color-border)',
    borderLeft: '3px solid var(--color-success)',
    textAlign: 'left',
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px',
    gap: '12px',
  },
  itemName: {
    fontSize: '15px',
    fontWeight: '700',
    marginBottom: '4px',
  },
  projectTag: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    fontWeight: '600',
  },
  doneBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '30px',
    background: 'var(--color-primary-light)',
    color: 'var(--color-success)',
    whiteSpace: 'nowrap',
  },
  itemDesc: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.5',
    marginBottom: '12px',
  },
  itemFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '8px',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    borderTop: '1px solid var(--color-border)',
    paddingTop: '10px',
  },
  emptyText: {
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '13px',
    padding: '20px 0',
  }
};