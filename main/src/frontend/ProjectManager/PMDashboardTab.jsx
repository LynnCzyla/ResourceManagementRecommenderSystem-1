import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getDashboardStats, getEmployees, getTasks, getProjects } from './pmApi';
import { supabase } from '../../lib/supabaseClient';

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
  const abortControllerRef = useRef(null);

  // SINGLE load function
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

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      isLoadingRef.current = true;
      setIsLoading(true);
      setLoadError('');

      console.log('🚀 Loading dashboard data for user:', userId);
      
      // ✅ STEP 1: Get projects created by this PM
      const projectsData = await getProjects(userId, controller.signal);
      setProjects(projectsData || []);
      
      // ✅ STEP 2: Get tasks ONLY for this PM's projects with employee data joined
      let tasksData = [];
      let employeeIdsFromTasks = new Set();
      
      if (projectsData && projectsData.length > 0) {
        const projectIds = projectsData.map(p => p.id);
        console.log(`📋 Fetching tasks for ${projectIds.length} projects:`, projectIds);
        
        // Fetch tasks for these projects with employee info
        const { data, error } = await supabase
          .from('project_tasks')
          .select(`
            *,
            projects:project_id (
              project_name
            ),
            profiles:profile_id (
              id,
              first_name,
              last_name,
              employee_id,
              role,
              avatar_url,
              position_id,
              positions:position_id (
                position_name,
                description
              )
            )
          `)
          .in('project_id', projectIds);
        
        if (error) {
          console.error('❌ Error fetching tasks:', error);
        } else {
          // Transform tasks to include employee info from joined data
          tasksData = (data || []).map(task => ({
            ...task,
            employeeId: task.profiles?.id || null,
            employeeName: task.profiles 
              ? `${task.profiles.first_name || ''} ${task.profiles.last_name || ''}`.trim() || 'Unnamed'
              : null,
            employeePosition: task.profiles?.positions?.position_name || null,
            employeeRole: task.profiles?.role || null,
            employeeAvatar: task.profiles?.avatar_url || null,
            projectName: task.projects?.project_name || null,
          }));
          
          console.log(`✅ Found ${tasksData.length} tasks for PM's projects`);
          
          // Extract employee IDs strictly from tasks belonging to ACTIVE projects
          const activeIds = new Set(projectsData.filter(p => p.status === 'Active').map(p => p.id));
          tasksData.forEach(task => {
            if (task.profile_id && activeIds.has(task.project_id)) {
              employeeIdsFromTasks.add(task.profile_id);
            }
          });
        }
      } else {
        console.log('📋 No projects found for this PM');
      }
      setTasks(tasksData || []);
      
      // ✅ STEP 3: ALSO get employees from project assignments for active projects
      if (projectsData && projectsData.length > 0) {
        const projectIds = projectsData.map(p => p.id);
        const activeIds = new Set(projectsData.filter(p => p.status === 'Active').map(p => p.id));
        console.log(`📋 Fetching assignments for ${projectIds.length} projects`);
        
        const { data: assignments, error: assignError } = await supabase
          .from('project_assignments')
          .select(`
            project_id,
            profile_id,
            status,
            projects:project_id (
              project_name
            )
          `)
          .in('project_id', projectIds);
        
        if (!assignError && assignments) {
          console.log(`✅ Found ${assignments.length} assignments`);
          assignments.forEach(a => {
            if (a.profile_id && (a.status === 'Assigned' || !a.status)) {
              if (activeIds.has(a.project_id)) {
                employeeIdsFromTasks.add(a.profile_id);
              }
            }
          });
        }
      }

      console.log(`📋 Found ${employeeIdsFromTasks.size} active unique employee IDs for active projects`);

      // ✅ STEP 4: Fetch employees from active sources with position data
      let employeesData = [];
      if (employeeIdsFromTasks.size > 0) {
        const employeeIds = Array.from(employeeIdsFromTasks);
        const { data: empData, error: empError } = await supabase
          .from('profiles')
          .select(`
            id, 
            employee_id, 
            first_name, 
            last_name, 
            role, 
            avatar_url, 
            branch_id,
            position_id,
            departments:department_id (
              department_name
            ),
            positions:position_id (
              position_name,
              description
            )
          `)
          .in('id', employeeIds)
          .eq('status', 'Active');
        
        if (!empError && empData) {
          // Filter by branch (non-super admin)
          let filteredData = empData;
          if (!user?.is_super_admin && user?.branch_id) {
            filteredData = empData.filter(emp => emp.branch_id === user.branch_id);
          }
          
          // Transform to match frontend expectations
          employeesData = filteredData.map(emp => ({
            id: emp.id,
            employeeId: emp.employee_id,
            name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Unnamed',
            position: emp.positions?.position_name || 'No position set',
            department: emp.departments?.department_name || '',
            role: emp.role || 'Employee',
            avatar: emp.avatar_url || `https://ui-avatars.com/api/?background=3b82f6&color=fff&name=${encodeURIComponent(`${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Unnamed')}`,
            branchId: emp.branch_id,
          }));
        }
      }

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
  }, [user]);

  // Cleanup on unmount
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
      if (loadedUserIdRef.current !== user.id) {
        loadDashboard(user.id);
      }
    }
  }, [user?.id, loadDashboard]);

  // Mounted check
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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [user?.id, loadDashboard]);

  // Merge employees from tasks (client-side)
  const allEmployees = useMemo(() => {
    const map = new Map();
    
    // Add all employees from state
    employees.forEach(emp => {
      map.set(emp.id, emp);
    });

    // Also add employees from tasks using profile_id
    tasks.forEach(task => {
      if (!task.profile_id) return; // Skip unassigned tasks
      
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
        if (activeIds.has(String(task.project_id)) && task.profile_id) {
          employeesInActiveProjects.add(task.profile_id);
        }
      });
      return allEmployees.filter(emp => 
        employeesInActiveProjects.has(emp.id) || 
        employees.some(e => e.id === emp.id && (!e.project_id || activeIds.has(String(e.project_id))))
      );
    }
    
    // Filter employees who have tasks in the selected project
    const employeesWithTasksInProject = new Set();
    tasks.forEach(task => {
      if (String(task.project_id) === String(selectedProjectId) && task.profile_id) {
        employeesWithTasksInProject.add(task.profile_id);
      }
    });
    
    return allEmployees.filter(emp => employeesWithTasksInProject.has(emp.id));
  }, [allEmployees, tasks, selectedProjectId, projects, employees]);

  // Pre-group tasks by employee using profile_id
  const tasksByEmployee = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      const empId = t.profile_id;
      if (!empId || t.status === 'Completed-Hidden') continue;
      if (!map.has(empId)) map.set(empId, []);
      map.get(empId).push(t);
    }
    return map;
  }, [tasks]);

  const getAssignedTasks = useCallback(
    (id) => {
      const all = tasksByEmployee.get(id) || [];
      if (selectedProjectId === 'all') {
        const activeIds = new Set(projects.filter(p => p.status === 'Active').map(p => String(p.id)));
        return all.filter(t => activeIds.has(String(t.project_id)));
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
        <div className="glass-card" style={styles.statCard}>
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

        <div className="glass-card" style={styles.statCard}>
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

        <div className="glass-card" style={styles.statCard}>
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
        <div className="glass-card" style={styles.statCard}>
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
                    <option key={proj.id} value={proj.id}>{proj.project_name}</option>
                  ))}
                </optgroup>
                {projects.some(p => p.status === 'Completed') && (
                  <optgroup label="Completed Projects">
                    {projects.filter(p => p.status === 'Completed').map(proj => (
                      <option key={proj.id} value={proj.id}>{proj.project_name} (Completed)</option>
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
            {filteredEmployees.length === 0 && unassignedTasks.length === 0 ? (
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
            )}
          </div>
        </div>

        {/* Task Status Breakdown */}
        <div className="glass-card" style={styles.sidePanel}>
          <h2 style={styles.panelTitle}>Task Status Breakdown</h2>
          <p style={styles.panelSubtitle}>How your team's tasks are distributed right now.</p>

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
              })
            )}
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
};