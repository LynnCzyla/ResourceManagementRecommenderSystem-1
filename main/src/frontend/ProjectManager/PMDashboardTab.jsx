import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getEmployees, getTasks, getProjects } from './pmApi';

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
  const [viewEmployee, setViewEmployee] = useState(null); // employee to show in modal
  
  // Use refs to track if data is already loaded for this user
  const loadedUserIdRef = useRef(null);
  const isLoadingRef = useRef(false);
  const abortControllerRef = useRef(null);

  // SINGLE load function
  const loadDashboard = useCallback(async (userId, forceRefresh = false) => {
    // Prevent concurrent loads

    // Prevent concurrent loads
    if (isLoadingRef.current) {
      console.log('⏳ Load already in progress, skipping');
      return;
    }

    if (!userId) {
      console.warn('No user ID provided, skipping load');
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      isLoadingRef.current = true;
      if (!loadedUserIdRef.current) {
        setIsLoading(true);
      }
      setLoadError('');

      console.log('🚀 Loading dashboard data for user:', userId);
      
      // ✅ STEP 1: Get projects created by this PM
      const projectsData = await getProjects(userId, controller.signal);
      setProjects(projectsData || []);
      
      // ✅ STEP 2: Load only server-authorized PM tasks and employees.
      const [apiTasks, employeesData] = await Promise.all([
        getTasks({}, controller.signal),
        getEmployees(userId, undefined, undefined, controller.signal),
      ]);
      const tasksData = (apiTasks || []).map(task => ({
        ...task,
        project_id: task.projectId,
        profile_id: task.employeeId,
        employeeName: task.employeeName || 'Unassigned',
      })).filter(task => task.status !== 'Cancelled'); // exclude cancelled tasks
      const employeeIdsFromTasks = new Set(
        (employeesData || []).filter(employee => !employee.isMasked && (!employee.status || employee.status === 'Active')).map(employee => employee.id)
      );
      setTasks(tasksData || []);
      console.log(`📋 Found ${employeeIdsFromTasks.size} active team members for active projects`);

      // ✅ STEP 5: Calculate stats from actual active data
      console.log('📊 Calculating stats from projects:', projectsData.length);
      
      // Count ALL projects
      const totalProjects = projectsData.length;
      
      // Count active projects (status = 'Active')
      const activeProjects = projectsData.filter(p => p.status === 'Active');
      const activeProjectIdsSet = new Set(activeProjects.map(p => p.id));
      
      // Count completed projects
      const completedProjects = projectsData.filter(p => p.status === 'Completed');
      
      // Count pending projects
      const pendingProjects = projectsData.filter(p => p.status === 'Pending' || p.status === 'Pending Approval');
      
      // Active project task stats
      const activeTasks = tasksData.filter(t => activeProjectIdsSet.has(t.project_id));
      const totalActiveTasks = activeTasks.length;
      const completedTasks = activeTasks.filter(t => t.status === 'Completed' || t.status === 'Completed-Hidden').length;
      const pendingTasks = activeTasks.filter(t => t.status === 'Pending' || t.status === 'Pending Approval').length;
      const inProgressTasks = activeTasks.filter(t => t.status === 'In Progress' || t.status === 'Active').length;

      console.log('📊 Calculated stats for active workload:', {
        totalProjects: totalProjects,
        activeProjects: activeProjects.length,
        completedProjects: completedProjects.length,
        pendingProjects: pendingProjects.length,
        totalTasks: totalActiveTasks,
        uniqueEmployees: employeeIdsFromTasks.size,
        pendingTasks: pendingTasks,
        inProgressTasks: inProgressTasks,
        completedTasks: completedTasks,
      });

      setStats({
        activeProjectsCount: activeProjects.length,
        totalProjectsCount: totalProjects,
        totalTeamMembers: employeeIdsFromTasks.size,
        totalTasksCount: totalActiveTasks,
        tasksByStatus: {
          Pending: pendingTasks,
          'In Progress': inProgressTasks,
          Completed: completedTasks,
        },
      });
      setEmployees(employeesData || []);
      
      // Mark as loaded for this user
      loadedUserIdRef.current = userId;
      
    } catch (err) {
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
  }, []);

  // Cleanup on unmount — reset the load guard so next tab visit re-fetches fresh data
  // (picks up new employees/assignments added while on another tab, no auto-refresh needed)
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      loadedUserIdRef.current = null;
    };
  }, []);

  // Initial load - only when user changes or first mounts
  useEffect(() => {
    if (!user?.id) return;
    if (loadedUserIdRef.current !== user.id) {
      loadDashboard(user.id);
    }
  }, [user?.id, loadDashboard]);

  // Merge employees from tasks (client-side)
  const allEmployees = useMemo(() => {
    const map = new Map();
    
    // Add all employees from state (only active employees)
    (employees || []).forEach(emp => {
      if (emp.status && emp.status !== 'Active') return;
      map.set(emp.id, emp);
    });

    // Also add employees from tasks using profile_id
    (tasks || []).forEach(task => {
      if (!task.profile_id || task.employeeDeactivated) return; // Skip unassigned or deactivated tasks
      if (task.profiles?.status && task.profiles.status !== 'Active') return;
      
      const employeeId = task.profile_id;
      
      if (!map.has(employeeId)) {
        // Try to get employee info from task's joined data
        const firstName = task.profiles?.first_name || '';
        const lastName = task.profiles?.last_name || '';
        const name = `${firstName} ${lastName}`.trim() || task.employeeName || 'Unnamed Employee';
        const position = task.employeePosition || task.profiles?.positions?.position_name || 'No position set';
        
        map.set(employeeId, {
          id: employeeId,
          name: name,
          position: position,
          role: task.profiles?.role || 'Employee',
          department: '',
          avatar: task.employeeAvatar || task.profiles?.avatar_url || 
            `https://ui-avatars.com/api/?background=3b82f6&color=fff&name=${encodeURIComponent(name)}`,
        });
      }
    });

    return Array.from(map.values());
  }, [employees, tasks]);

  // Client-side filtering of employees by project
  const filteredByProjectEmployees = useMemo(() => {
    const activeProjects = projects.filter(p => p.status === 'Active');
    const activeIds = new Set(activeProjects.map(p => String(p.id)));

    if (selectedProjectId === 'all') {
      if (activeIds.size === 0) return [];
      const employeesInActiveProjects = new Set();
      tasks.forEach(task => {
        if (!task.employeeDeactivated && activeIds.has(String(task.project_id)) && task.profile_id) {
          employeesInActiveProjects.add(String(task.profile_id));
        }
      });

      return allEmployees.filter(emp => {
        if (emp.status && emp.status !== 'Active') return false;
        if (emp.employeeDeactivated) return false;
        if (emp.isMasked) return true;
        // Has a task in an active project
        if (employeesInActiveProjects.has(String(emp.id))) return true;
        // Is assigned to an active project
        const empProjIds = emp.projectIds || (emp.projectId ? [emp.projectId] : []);
        if (empProjIds.some(pid => activeIds.has(String(pid)))) return true;
        // Also check if any employee record has an active project match
        return employees.some(e => String(e.id) === String(emp.id) && (
          (e.projectIds && e.projectIds.some(pid => activeIds.has(String(pid)))) ||
          (e.projectId && activeIds.has(String(e.projectId)))
        ));
      });
    }
    
    // Filter employees assigned to or who have tasks in the selected project
    const employeesWithTasksInProject = new Set();
    tasks.forEach(task => {
      if (!task.employeeDeactivated && String(task.project_id) === String(selectedProjectId) && task.profile_id) {
        employeesWithTasksInProject.add(String(task.profile_id));
      }
    });
    
    return allEmployees.filter(emp => {
      if (emp.status && emp.status !== 'Active') return false;
      if (emp.employeeDeactivated) return false;
      if (emp.isMasked && String(emp.projectId) === String(selectedProjectId)) return true;
      if (employeesWithTasksInProject.has(String(emp.id))) return true;
      const empProjIds = emp.projectIds || (emp.projectId ? [emp.projectId] : []);
      if (empProjIds.some(pid => String(pid) === String(selectedProjectId))) return true;
      return employees.some(e => String(e.id) === String(emp.id) && (
        (e.projectIds && e.projectIds.some(pid => String(pid) === String(selectedProjectId))) ||
        (e.projectId && String(e.projectId) === String(selectedProjectId))
      ));
    });
  }, [allEmployees, tasks, selectedProjectId, projects, employees]);

  // Pre-group tasks by employee using profile_id
  const tasksByEmployee = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      const empId = t.profile_id;
      if (!empId || t.status === 'Completed-Hidden' || t.status === 'Cancelled') continue;
      if (!map.has(empId)) map.set(empId, []);
      map.get(empId).push(t);
    }
    return map;
  }, [tasks]);

  const getAssignedTasks = useCallback(
    (id) => {
      const all = tasksByEmployee.get(id) || [];
      const activeIds = new Set(projects.filter(p => p.status === 'Active').map(p => String(p.id)));
      if (selectedProjectId === 'all') {
        return all.filter(t => activeIds.has(String(t.project_id)));
      }
      // If the selected project is completed or cancelled, do not include its task count
      if (!activeIds.has(String(selectedProjectId))) {
        return [];
      }
      return all.filter(t => String(t.project_id) === String(selectedProjectId));
    },
    [tasksByEmployee, selectedProjectId, projects]
  );
  
  const calculateSingleTaskCompletion = useCallback((task) => {
    if (!task) return 0;
    if (task.status === 'Completed' || task.status === 'Completed-Hidden') return 100;
    
    // Check progress_logs array for actual reported completion percentage
    const logs = Array.isArray(task.progress_logs)
      ? task.progress_logs
      : Array.isArray(task.progressLogs)
        ? task.progressLogs
        : [];
    if (logs.length > 0) {
      const total = logs.reduce((sum, log) => sum + (parseInt(log.percentage, 10) || 0), 0);
      return Math.min(100, Math.max(0, total));
    }

    if (typeof task.progress === 'number' && !isNaN(task.progress)) {
      return Math.min(100, Math.max(0, Math.round(task.progress)));
    }
    if (task.status === 'In Progress' || task.status === 'Active') return 50;
    return 0;
  }, []);

  const getTaskCompletion = useCallback((employeeId) => {
    const assignedTasks = getAssignedTasks(employeeId);
    if (!assignedTasks || assignedTasks.length === 0) return 0;
    
    const totalCompletion = assignedTasks.reduce((sum, task) => {
      return sum + calculateSingleTaskCompletion(task);
    }, 0);
    
    return Math.round(totalCompletion / assignedTasks.length);
  }, [getAssignedTasks, calculateSingleTaskCompletion]);

  // Comprehensive breakdown for the right-hand panel
  const getEmployeeProjectBreakdown = useCallback((employeeId) => {
    const assigned = getAssignedTasks(employeeId);
    if (assigned.length === 0) return { projects: [], overall: 0 };

    const byProj = new Map();
    assigned.forEach(t => {
      const pId = t.project_id;
      if (!byProj.has(pId)) {
        const projObj = projects.find(p => String(p.id) === String(pId));
        byProj.set(pId, {
          name: projObj ? projObj.project_name : (t.projects?.project_name || 'Assigned Project'),
          tasks: []
        });
      }
      byProj.get(pId).tasks.push(t);
    });

    const projectBreakdowns = Array.from(byProj.entries()).map(([pId, data]) => {
      const completion = Math.round(
        data.tasks.reduce((sum, task) => sum + calculateSingleTaskCompletion(task), 0) / data.tasks.length
      );
      return {
        id: pId,
        name: data.name,
        completion,
        remaining: 100 - completion,
        taskCount: data.tasks.length
      };
    });

    const overall = Math.round(
      assigned.reduce((sum, task) => sum + calculateSingleTaskCompletion(task), 0) / assigned.length
    );

    return { projects: projectBreakdowns, overall };
  }, [getAssignedTasks, calculateSingleTaskCompletion, projects]);

  // Filter employees - SHOW ALL employees (with and without tasks)
  const filteredEmployees = useMemo(() => {
    return filteredByProjectEmployees
      .filter(emp => {
        const name = (emp.name || '').toLowerCase();
        const role = (emp.position || emp.role || '').toLowerCase();
        const query = searchQuery.toLowerCase();
        return name.includes(query) || role.includes(query);
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name?.localeCompare(b.name || '') || 0;
        if (sortBy === 'role') return (a.position || a.role || '').localeCompare(b.position || b.role || '') || 0;
        if (sortBy === 'completion') {
          return getTaskCompletion(b.id) - getTaskCompletion(a.id);
        }
        return 0;
      });
  }, [filteredByProjectEmployees, searchQuery, sortBy, getTaskCompletion]);

  const projectTasks = useMemo(() => {
    if (selectedProjectId === 'all') {
      const activeIds = new Set(projects.filter(p => p.status === 'Active').map(p => String(p.id)));
      return tasks.filter(t => activeIds.has(String(t.project_id)));
    }
    return tasks.filter(t => String(t.project_id) === String(selectedProjectId));
  }, [tasks, selectedProjectId, projects]);

  const taskStatusCounts = useMemo(() => ({
    Pending: projectTasks.filter(t => t.status === 'Pending' || t.status === 'Pending Approval').length,
    'In Progress': projectTasks.filter(t => t.status === 'In Progress' || t.status === 'Active').length,
    Completed: projectTasks.filter(t => t.status === 'Completed' || t.status === 'Completed-Hidden').length,
  }), [projectTasks]);

  const unassignedTasks = useMemo(() => 
    projectTasks.filter(task => !task.profile_id),
    [projectTasks]
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

  // Always show the full dashboard - even with no data
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
        <div className="glass-card" style={styles.statCard} title="Current ongoing and active projects assigned to you">
          <div style={{ ...styles.iconWrapper, backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>{stats.activeProjectsCount || 0}</div>
            <div style={styles.statLabel}>Active Projects</div>
          </div>
        </div>

        <div className="glass-card" style={styles.statCard} title="Total unique team members allocated to your active projects">
          <div style={{ ...styles.iconWrapper, backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>{stats.totalTeamMembers || 0}</div>
            <div style={styles.statLabel}>Team Members</div>
          </div>
        </div>

        <div className="glass-card" style={styles.statCard} title="Total tasks scheduled across all your active projects">
          <div style={{ ...styles.iconWrapper, backgroundColor: 'var(--color-success-light)', color: 'var(--color-success)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 6v6l4 2"></path>
              <circle cx="12" cy="12" r="10"></circle>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>{stats.totalTasksCount || 0}</div>
            <div style={styles.statLabel}>Total Tasks</div>
          </div>
        </div>

        {/* Total Projects Card */}
        <div className="glass-card" style={styles.statCard} title="All projects created under your account">
          <div style={{ ...styles.iconWrapper, backgroundColor: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>{stats.totalProjectsCount || 0}</div>
            <div style={styles.statLabel}>Total Projects</div>
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
                <option value="all">All Active Projects</option>
                <optgroup label="Active Projects">
                  {projects.filter(p => p.status === 'Active').map(proj => (
                    <option key={proj.id} value={proj.id}>{proj.name}</option>
                  ))}
                </optgroup>
                {projects.some(p => p.status === 'Completed') && (
                  <optgroup label="Completed Projects">
                    {projects.filter(p => p.status === 'Completed').map(proj => (
                      <option key={proj.id} value={proj.id}>{proj.name} (Completed)</option>
                    ))}
                  </optgroup>
                )}
                {projects.length === 0 && (
                  <option value="" disabled>No projects available</option>
                )}
              </select>
              <div style={styles.searchWrapper}>
                <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  placeholder="Search by name or position..."
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
                <option value="role">Sort by Position</option>
                <option value="completion">Sort by Completion</option>
              </select>
            </div>
          </div>

          <div style={styles.tableWrapper}>
            {filteredEmployees.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyTitle}>No Active Team Members or Tasks</div>
                <div style={styles.emptyDescription}>
                  {projects.filter(p => p.status === 'Active').length === 0 
                    ? "All projects are completed or no active projects exist. Active team members and tasks will appear here once an active project is started or restored."
                    : "Start assigning tasks to team members to see them here."}
                </div>
              </div>
            ) : (
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
                      : allAssigned.filter(t => String(t.project_id) === String(selectedProjectId));
                    
                    const completion = assignedTasks.length 
                      ? Math.round(assignedTasks.map(task => calculateSingleTaskCompletion(task)).reduce((sum, val) => sum + val, 0) / assignedTasks.length)
                      : 0;

                    const taskStatus = assignedTasks.length ? assignedTasks[0].status : 'Idle';

                    return (
                      <tr key={emp.id} style={styles.trRow}>
                        <td style={styles.tdEmployee}>
                          <img src={emp.avatar} alt={emp.name} style={styles.empAvatar} />
                          <div>
                            <div style={styles.empName}>{emp.name}</div>
                            <div style={styles.empRole}>{emp.position || emp.role || 'No position set'}</div>
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
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Task Status Breakdown */}
        <div className="glass-card" style={styles.sidePanel}>
          <h2 style={styles.panelTitle}>Task Status Breakdown</h2>
          <p style={styles.panelSubtitle}>How your team's tasks are distributed right now.</p>

          <div style={styles.attendanceStats}>
            <div style={styles.attendanceMetric} title="Tasks waiting to be started">
              <span style={styles.attendanceValue}>{taskStatusCounts.Pending}</span>
              <span style={styles.attendanceLabel}>Pending</span>
            </div>
            <div style={styles.attendanceMetric} title="Tasks currently in progress by team members">
              <span style={styles.attendanceValue}>{taskStatusCounts['In Progress']}</span>
              <span style={styles.attendanceLabel}>In Progress</span>
            </div>
            <div style={styles.attendanceMetric} title="Tasks successfully completed">
              <span style={styles.attendanceValue}>{taskStatusCounts.Completed}</span>
              <span style={styles.attendanceLabel}>Completed</span>
            </div>
          </div>

          <div style={styles.attendanceList}>
            {filteredEmployees.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyTitle}>No Task Data</div>
                <div style={styles.emptyDescription}>
                  Once you have team members and tasks, their progress will appear here.
                </div>
              </div>
            ) : (
              filteredEmployees.map(emp => {
                const breakdown = getEmployeeProjectBreakdown(emp.id);
                const taskCount = getAssignedTasks(emp.id).length;
                return (
                  <div key={emp.id} style={styles.breakdownCard}>
                    <div style={styles.breakdownHeader}>
                      <div style={styles.breakdownLeft}>
                        <span style={styles.breakdownName}>{emp.name}</span>
                        <span style={styles.taskCountBadge} title={`${taskCount} task${taskCount !== 1 ? 's' : ''} assigned`}>
                          {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
                        </span>
                      </div>
                      <div style={styles.breakdownRight}>
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
                          {breakdown.overall}%
                        </span>
                        <button
                          style={styles.viewIconBtn}
                          title={`View projects assigned to ${emp.name}`}
                          onClick={() => setViewEmployee({ emp, breakdown })}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {breakdown.projects.length === 0 ? (
                      <div style={styles.breakdownEmpty}>No active projects or tasks.</div>
                    ) : (
                      <div style={styles.breakdownDetails}>
                        <div style={styles.breakdownSummaryTitle}>Status Summary:</div>
                        {breakdown.projects.map(proj => (
                          <div key={proj.id} style={styles.breakdownProjLine}>
                            <span style={styles.breakdownProjName}>• {proj.name}:</span>
                            <span style={styles.breakdownProjVal}>{proj.completion}% ({proj.taskCount} tasks)</span>
                          </div>
                        ))}
                        <div style={styles.breakdownOverallSummary}>
                          <strong>Overall:</strong> {breakdown.overall}% complete ({100 - breakdown.overall}% remaining)
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Employee Projects Modal */}
      {viewEmployee && createPortal(
        <div style={styles.modalOverlay} onClick={() => setViewEmployee(null)}>
          <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={styles.modalHeader}>
              <div style={styles.modalEmpInfo}>
                <img
                  src={viewEmployee.emp.avatar}
                  alt={viewEmployee.emp.name}
                  style={styles.modalAvatar}
                />
                <div>
                  <div style={styles.modalEmpName}>{viewEmployee.emp.name}</div>
                  <div style={styles.modalEmpRole}>{viewEmployee.emp.position || viewEmployee.emp.role || 'No position set'}</div>
                </div>
              </div>
              <button style={styles.modalCloseBtn} onClick={() => setViewEmployee(null)} title="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Summary strip */}
            <div style={styles.modalSummaryStrip}>
              <div style={styles.modalStat}>
                <span style={styles.modalStatVal}>{getAssignedTasks(viewEmployee.emp.id).length}</span>
                <span style={styles.modalStatLabel}>Total Tasks</span>
              </div>
              <div style={styles.modalStat}>
                <span style={styles.modalStatVal}>{viewEmployee.breakdown.projects.length}</span>
                <span style={styles.modalStatLabel}>Projects</span>
              </div>
              <div style={styles.modalStat}>
                <span style={{ ...styles.modalStatVal, color: viewEmployee.breakdown.overall === 100 ? 'var(--color-success)' : 'var(--color-accent)' }}>
                  {viewEmployee.breakdown.overall}%
                </span>
                <span style={styles.modalStatLabel}>Overall</span>
              </div>
            </div>

            {/* Project List */}
            <div style={styles.modalBody}>
              <div style={styles.modalSectionTitle}>Assigned Projects</div>
              {viewEmployee.breakdown.projects.length === 0 ? (
                <div style={styles.modalEmpty}>No projects assigned yet.</div>
              ) : (
                <div style={styles.modalProjList}>
                  {viewEmployee.breakdown.projects.map(proj => {
                    const pct = proj.completion;
                    const barColor = pct === 100
                      ? 'var(--color-success)'
                      : pct > 50
                        ? 'var(--color-accent)'
                        : pct > 0
                          ? 'var(--color-warning)'
                          : 'var(--color-border)';
                    return (
                      <div key={proj.id} style={styles.modalProjCard}>
                        <div style={styles.modalProjTop}>
                          <span style={styles.modalProjName}>{proj.name}</span>
                          <span style={styles.modalProjTaskCount}>
                            {proj.taskCount} {proj.taskCount === 1 ? 'task' : 'tasks'}
                          </span>
                        </div>
                        <div style={styles.modalProgressTrack}>
                          <div style={{ ...styles.modalProgressBar, width: `${pct}%`, backgroundColor: barColor }} />
                        </div>
                        <div style={styles.modalProjPct}>{pct}% complete</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
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
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    fontSize: '15px',
    color: 'var(--color-text-secondary)',
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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
    cursor: 'default',
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
    color: 'var(--color-text-primary)',
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
    color: 'var(--color-text-primary)',
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
    cursor: 'default',
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
  emptyState: {
    padding: '40px 20px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    marginBottom: '8px',
  },
  emptyDescription: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    maxWidth: '400px',
    margin: '0 auto',
  },

  // breakdownCard left/right groups
  breakdownLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
  },
  breakdownRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },

  // Task count badge on breakdownCard
  taskCountBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '2px 7px',
    borderRadius: '999px',
    background: 'rgba(99, 102, 241, 0.12)',
    color: 'var(--color-primary)',
    letterSpacing: '0.3px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },

  // Eye view button
  viewIconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
    flexShrink: 0,
    padding: 0,
  },

  // Modal overlay
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '24px',
  },
  modalBox: {
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: '18px',
    width: '100%',
    maxWidth: '480px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 20px 16px',
    borderBottom: '1px solid var(--color-border)',
    gap: '12px',
  },
  modalEmpInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  modalAvatar: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '2px solid var(--color-border)',
  },
  modalEmpName: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  modalEmpRole: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    marginTop: '2px',
  },
  modalCloseBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'transparent',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    flexShrink: 0,
    padding: 0,
  },
  modalSummaryStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
  },
  modalStat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '14px 8px',
    gap: '2px',
  },
  modalStatVal: {
    fontSize: '22px',
    fontWeight: '800',
    color: 'var(--color-text-primary)',
  },
  modalStatLabel: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.7px',
  },
  modalBody: {
    overflowY: 'auto',
    padding: '18px 20px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  modalSectionTitle: {
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.7px',
    color: 'var(--color-text-muted)',
    marginBottom: '4px',
  },
  modalEmpty: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '20px 0',
  },
  modalProjList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  modalProjCard: {
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card-hover)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  modalProjTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  modalProjName: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  modalProjTaskCount: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--color-primary)',
    background: 'rgba(99,102,241,0.1)',
    padding: '2px 8px',
    borderRadius: '999px',
    flexShrink: 0,
  },
  modalProgressTrack: {
    height: '6px',
    borderRadius: '999px',
    background: 'var(--color-border)',
    overflow: 'hidden',
  },
  modalProgressBar: {
    height: '100%',
    borderRadius: '999px',
    transition: 'width 0.4s ease',
  },
  modalProjPct: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    textAlign: 'right',
  },
};