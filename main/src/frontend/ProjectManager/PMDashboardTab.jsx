import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getDashboardStats, getEmployees, getTasks, getProjects } from './pmApi';

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
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [isLoading, setIsLoading] = useState(true);
  
  // Use refs to track if data is already loaded for this user
  const loadedUserIdRef = useRef(null);
  const isLoadingRef = useRef(false);
  // Add this ref near your other refs
  const abortControllerRef = useRef(null);

  // SINGLE load function - not two separate ones
  const loadDashboard = useCallback(async (userId, forceRefresh = false) => {
    // Prevent duplicate loads for the same user
    if (!forceRefresh && loadedUserIdRef.current === userId && employees.length > 0) {
      console.log('📦 Using cached dashboard data');
      return;
    }

    // Prevent concurrent loads
    if (isLoadingRef.current) {
      console.log('⏳ Load already in progress, skipping');
      return;
    }

    if (!userId) {
      console.warn('No user ID provided, skipping load');
      return;
    }

      // ✅ NEW: Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // ✅ NEW: Create new abort controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      isLoadingRef.current = true;
      setIsLoading(true);
      setLoadError('');

      console.log('🚀 Loading dashboard data for user:', userId);
      
      // Only fetch employees ONCE - we'll filter client-side
        // ✅ NEW: Pass signal to all API calls
      const [statsData, employeesData, tasksData, projectsData] = await Promise.all([
        getDashboardStats(userId, controller.signal),
        getEmployees(userId, null, null, controller.signal),
        getTasks({}, controller.signal),
        getProjects(userId, controller.signal),
      ]);

      console.log('✅ Dashboard data loaded:', {
        stats: statsData,
        employees: employeesData?.length,
        tasks: tasksData?.length,
        projects: projectsData?.length,
      });

      setStats(statsData);
      setEmployees(employeesData || []);
      setTasks(tasksData || []);
      setProjects(projectsData || []);
      
      // Mark as loaded for this user
      loadedUserIdRef.current = userId;
      
    } catch (err) {
       // ✅ NEW: Handle aborted requests gracefully
      if (err.name === 'AbortError') {
        console.log('🛑 Request was cancelled');
        return;
      }

      console.error('❌ Failed to load dashboard:', err);
      setLoadError(err.message || 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [employees.length]); // ✅ FIX: Added employees.length dependency

  // ✅ NEW: Add cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Initial load - only when user changes
  useEffect(() => {
    if (user?.id) {
      // Only reload if user changed
      if (loadedUserIdRef.current !== user.id) {
        loadDashboard(user.id);
      }
    }
  }, [user?.id, loadDashboard]);

  // ✅ FIX: Add isMounted check
  useEffect(() => {
    let isMounted = true;
    
    const loadData = async () => {
      if (!isMounted) return;
      if (user?.id && loadedUserIdRef.current !== user.id) {
        await loadDashboard(user.id);
      }
    };
    
    loadData();
    
    return () => {
      isMounted = false;
      // Cancel any pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [user?.id, loadDashboard]);

    // REMOVED: Separate loadProjectEmployees useEffect - we filter client-side now

    // Client-side filtering of employees by project (no API call needed)
    const filteredByProjectEmployees = useMemo(() => {
      if (selectedProjectId === 'all') {
        return employees;
      }
      
      // Filter employees who have tasks in the selected project
      const employeesWithTasksInProject = new Set();
      tasks.forEach(task => {
        if (String(task.projectId) === String(selectedProjectId) && task.employeeId) {
          employeesWithTasksInProject.add(task.employeeId);
        }
      });
      
      return employees.filter(emp => employeesWithTasksInProject.has(emp.id));
    }, [employees, tasks, selectedProjectId]);

  // Pre-group tasks by employee once so per-row / per-employee lookups are
  // O(1) instead of re-scanning the entire task list on every render.
  const tasksByEmployee = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      if (!t.employeeId || t.status === 'Completed-Hidden') continue;
      if (!map.has(t.employeeId)) map.set(t.employeeId, []);
      map.get(t.employeeId).push(t);
    }
    return map;
  }, [tasks]);

  const getAssignedTasks = useCallback(
    (id) => tasksByEmployee.get(id) || [],
    [tasksByEmployee]
  );
  
  const calculateSingleTaskCompletion = useCallback((task) => {
    if (task.progressLogs && task.progressLogs.length) {
      return Math.min(100, task.progressLogs.reduce((sum, log) => sum + (parseInt(log.percentage, 10) || 0), 0));
    }
    if (task.status === 'Completed' || task.status === 'Completed-Hidden') return 100;
    if (task.status === 'In Progress') return 50;
    return 0;
  }, []);

  const getTaskCompletion = useCallback((id) => {
    const assigned = getAssignedTasks(id);
    if (!assigned.length) return 0;
    const percentages = assigned.map(task => calculateSingleTaskCompletion(task));
    return Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length);
  }, [getAssignedTasks, calculateSingleTaskCompletion]);

  const getEmployeeProjectBreakdown = useCallback((empId) => {
    const empTasks = getAssignedTasks(empId);
    if (!empTasks.length) {
      return {
        projects: [],
        overall: 0
      };
    }
    
    const projectGroups = {};
    empTasks.forEach(task => {
      const projName = task.projectName || 'Unassigned Project';
      const projId = task.projectId || 'unassigned';
      if (!projectGroups[projId]) {
        projectGroups[projId] = {
          id: projId,
          name: projName,
          taskCompletions: []
        };
      }
      
      const taskCompletion = calculateSingleTaskCompletion(task);
      projectGroups[projId].taskCompletions.push(taskCompletion);
    });
    
    const projectList = Object.values(projectGroups).map(group => {
      const avg = Math.round(group.taskCompletions.reduce((s, c) => s + c, 0) / group.taskCompletions.length);
      return {
        id: group.id,
        name: group.name,
        completion: avg,
        remaining: 100 - avg
      };
    });
    
    const overall = Math.round(projectList.reduce((s, p) => s + p.completion, 0) / projectList.length);
    
    return {
      projects: projectList,
      overall
    };
  }, [getAssignedTasks, calculateSingleTaskCompletion]);

  const filteredEmployees = useMemo(() => {
    return filteredByProjectEmployees.filter(emp => 
      emp.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.role?.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => {
      if (sortBy === 'name') return a.name?.localeCompare(b.name || '') || 0;
      if (sortBy === 'role') return a.role?.localeCompare(b.role || '') || 0;
      if (sortBy === 'completion') {
        return getTaskCompletion(b.id) - getTaskCompletion(a.id); // Highest completion first
      }
      return 0;
    });
  }, [filteredByProjectEmployees, searchQuery, sortBy, getTaskCompletion]);

  const projectTasks = useMemo(() => 
    selectedProjectId === 'all' 
      ? tasks 
      : tasks.filter(t => String(t.projectId) === String(selectedProjectId)),
    [tasks, selectedProjectId]
  );

  // ✅ NEW: Memoize task status counts
  const taskStatusCounts = useMemo(() => ({
    Pending: projectTasks.filter(t => t.status === 'Pending').length,
    'In Progress': projectTasks.filter(t => t.status === 'In Progress').length,
    Completed: projectTasks.filter(t => t.status === 'Completed').length,
  }), [projectTasks]);

  // Compute unassigned tasks
  const unassignedTasks = useMemo(() => 
    projectTasks.filter(task => !task.employeeId || !employees.some(emp => emp.id === task.employeeId)),
    [projectTasks, employees]
  );

  // Loading state
  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Project Manager Dashboard</h1>
          <p style={styles.subtitle}>Loading dashboard data...</p>
        </div>
        <div style={styles.loadingContainer}>
          <div style={styles.loadingSpinner}></div>
          <p>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

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
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                style={styles.sortSelect}
              >
                <option value="all">All Projects</option>
                {projects.map(proj => (
                  <option key={proj.id} value={proj.id}>{proj.name}</option>
                ))}
              </select>
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
                  <th style={styles.th}>No. of Tasks</th>
                  <th style={styles.th}>% Complete</th>
                  <th style={styles.th}>Task Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map(emp => {
                  const allAssigned = getAssignedTasks(emp.id);
                  const assignedTasks = selectedProjectId === 'all'
                    ? allAssigned
                    : allAssigned.filter(t => String(t.projectId) === String(selectedProjectId));
                  
                  const completion = assignedTasks.length 
                    ? Math.round(assignedTasks.map(task => calculateSingleTaskCompletion(task)).reduce((sum, val) => sum + val, 0) / assignedTasks.length)
                    : 0;

                  const taskStatus = assignedTasks.length ? assignedTasks[0].status : 'Idle';

                  const assignedProjects = [...new Set(allAssigned.map(t => t.projectName).filter(Boolean))];
                  const projectSubtitle = assignedProjects.length ? 'Assigned' : 'Unassigned';

                  return (
                    <tr key={emp.id} style={styles.trRow}>
                      <td style={styles.tdEmployee}>
                        <img src={emp.avatar} alt={emp.name} style={styles.empAvatar} />
                        <div>
                          <div style={styles.empName}>{emp.name}</div>
                          <div style={styles.empRole}>{projectSubtitle}</div>
                        </div>
                      </td>
                      <td style={styles.tdVal}>
                        {assignedTasks.length ? (
                          <ul style={styles.taskList}>
                            {assignedTasks.map(t => (
                              <li key={t.id} style={styles.taskListItem}>{t.title}</li>
                            ))}
                          </ul>
                        ) : 'No task assigned'}
                      </td>
                      <td style={styles.tdVal}>{assignedTasks.length}</td>
                      <td style={styles.tdVal}>{completion}%</td>
                      <td style={styles.tdVal}>{taskStatus}</td>
                    </tr>
                  );
                })}

                {/* Unassigned Tasks */}
                {unassignedTasks.map(task => {
                  const completion = calculateSingleTaskCompletion(task);
                  
                  return (
                    <tr key={`unassigned-${task.id}`} style={styles.trRow}>
                      <td style={styles.tdEmployee}>
                        <div style={styles.unassignedAvatar}>?</div>
                        <div>
                          <div style={styles.empName}>Unassigned</div>
                          <div style={styles.empRole}>No Assignee</div>
                        </div>
                      </td>
                      <td style={styles.tdVal}>{task.title}</td>
                      <td style={styles.tdVal}>1</td>
                      <td style={styles.tdVal}>{completion}%</td>
                      <td style={styles.tdVal}>{task.status}</td>
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

          {/* ✅ CHANGE: Use taskStatusCounts instead of filtering */}
          <div style={styles.attendanceStats}>
            <div style={styles.attendanceMetric}>
              <span style={styles.attendanceValue}>{taskStatusCounts.Pending}</span>
              <span style={styles.attendanceLabel}>Pending</span>
            </div>
            <div style={styles.attendanceMetric}>
              <span style={styles.attendanceValue}>{taskStatusCounts['In Progress']}</span>
              <span style={styles.attendanceLabel}>In Progress</span>
            </div>
            <div style={styles.attendanceMetric}>
              <span style={styles.attendanceValue}>{taskStatusCounts.Completed}</span>
              <span style={styles.attendanceLabel}>Completed</span>
            </div>
          </div>

          <div style={styles.attendanceList}>
            {filteredEmployees.map(emp => {
              const breakdown = getEmployeeProjectBreakdown(emp.id);
              return (
                <div key={emp.id} style={styles.breakdownCard}>
                  <div style={styles.breakdownHeader}>
                    <span style={styles.breakdownName}>{emp.name}</span>
                    <span style={{
                      ...styles.attendanceBadge,
                      backgroundColor: breakdown.overall === 100 
                        ? 'rgba(16, 185, 129, 0.12)' 
                        : breakdown.overall > 0 
                          ? 'rgba(2, 132, 199, 0.12)' 
                          : 'var(--color-bg-root)',
                      color: breakdown.overall === 100 
                        ? 'var(--color-success)' 
                        : breakdown.overall > 0 
                          ? 'var(--color-accent)' 
                          : 'var(--color-text-muted)'
                    }}>
                      {breakdown.overall}% Complete
                    </span>
                  </div>
                  
                  {breakdown.projects.length === 0 ? (
                    <div style={styles.breakdownEmpty}>No active projects or tasks.</div>
                  ) : (
                    <div style={styles.breakdownDetails}>
                      <div style={styles.breakdownSummaryTitle}>Status Summary:</div>
                      {breakdown.projects.map(proj => (
                        <div key={proj.id} style={styles.breakdownProjLine}>
                          <span style={styles.breakdownProjName}>• {proj.name}:</span>
                          <span style={styles.breakdownProjVal}>{proj.completion}% complete ({proj.remaining}% remaining)</span>
                        </div>
                      ))}
                      <div style={styles.breakdownOverallSummary}>
                        <strong>Overall progress:</strong> {breakdown.overall}% complete ({100 - breakdown.overall}% remaining)
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ... styles remain the same as your original file ...
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
  lastUpdated: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    marginTop: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  refreshButton: {
    padding: '4px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    fontSize: '12px',
    '&:hover': {
      background: 'var(--color-bg-card-hover)',
    },
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    gap: '16px',
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '3px solid var(--color-border)',
    borderTop: '3px solid var(--color-primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
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
    flexWrap: 'wrap',
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
  taskList: {
    margin: 0,
    paddingLeft: '18px',
    listStyleType: 'disc',
  },
  taskListItem: {
    lineHeight: '1.6',
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
  unassignedAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: '#64748b',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '15px',
    marginRight: '12px',
  },
  breakdownCard: {
    padding: '12px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card-hover)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  breakdownHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownName: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  breakdownEmpty: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
    padding: '4px 0',
  },
  breakdownDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    borderTop: '1px dashed var(--color-border)',
    paddingTop: '6px',
  },
  breakdownSummaryTitle: {
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '2px',
    textTransform: 'uppercase',
    fontSize: '9px',
    letterSpacing: '0.5px',
  },
  breakdownProjLine: {
    display: 'flex',
    justifyContent: 'space-between',
    lineHeight: '1.4',
  },
  breakdownProjName: {
    fontWeight: '500',
  },
  breakdownProjVal: {
    fontFamily: 'monospace',
    color: 'var(--color-text-muted)',
  },
  breakdownOverallSummary: {
    borderTop: '1px solid var(--color-border)',
    paddingTop: '4px',
    marginTop: '2px',
    fontSize: '11px',
    color: 'var(--color-text-primary)',
  },
};