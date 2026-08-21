import React, { useState, useEffect } from 'react';
import { getEmployees, getTasks, createTask, updateTask, getProjects, updateProject, assignEmployeeToProject } from './pmApi';

// Employees are only guaranteed a formal `project_assignments` row when
// they were added to a project through the assignment flow. Tasks are
// assigned directly via `profile_id` and don't always have a matching
// assignment row, so a real assignee can be completely missing from an
// `employees` fetch even though they clearly have work on the project.
// This merges in anyone we can identify from their tasks (name/role/avatar
// come embedded on each task from the API) so they're never dropped from
// team lists or "assign to" dropdowns.
function mergeEmployeesFromTasks(employeesList, tasksList) {
  const map = new Map();
  (employeesList || []).forEach(emp => map.set(emp.id, emp));
  (tasksList || []).forEach(t => {
    if (!t.employeeId || map.has(t.employeeId)) return;
    const name = t.employeeName || 'Unnamed Employee';
    map.set(t.employeeId, {
      id: t.employeeId,
      name,
      role: t.employeeRole || '',
      avatar: t.employeeAvatar || `https://ui-avatars.com/api/?background=3b82f6&color=fff&name=${encodeURIComponent(name)}`,
      assignments: [],
    });
  });
  return Array.from(map.values());
}

export default function PMProjectTrackingTab({ user }) {
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState('');

  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showEditTaskModal, setShowEditTaskModal] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState(null);
  const [isRedoMode, setIsRedoMode] = useState(false);
  // Employees assigned to the SPECIFIC project a task belongs to — used only
  // for the Edit/Redo Assignment modal, so the dropdown is correct even when
  // the header filter is set to "All Projects" (where `employees` is scoped
  // differently, or empty).
  const [taskModalEmployees, setTaskModalEmployees] = useState([]);
  const [newTaskData, setNewTaskData] = useState({
    title: '',
    description: '',
    employeeId: '',
    priority: 'Medium',
    dueDate: ''
  });
  const [editTaskData, setEditTaskData] = useState({ 
    title: '', 
    description: '', 
    employeeId: '', 
    status: '', 
    dueDate: '' 
  });
  const [dailyStatusMap] = useState({
    'EMP-1014': 'Present',
    'EMP-1015': 'Absent',
    'EMP-1016': 'On Leave',
    'EMP-1017': 'Present',
    'EMP-1018': 'Present',
    'EMP-1019': 'Absent',
    'EMP-1020': 'Present',
  });

 const loadEmployees = async (projectId) => {
  try {
    if (projectId === 'all') {
      setEmployees(await getEmployees(user?.id, undefined, undefined));
    } else if (projectId) {
      setEmployees(await getEmployees(user?.id, undefined, projectId));
    } else {
      setEmployees([]);
    }
  } catch (err) {
    console.error('Failed to load employees:', err);
    setLoadError(err.message || 'Failed to load employees');
  }
};

  const loadProjects = async () => {
    try {
      const data = await getProjects(user?.id);
      setProjects(data);
      setSelectedProjectId(prev => prev ?? 'all');
    } catch (err) {
      console.error('Failed to load projects:', err);
      setLoadError(err.message || 'Failed to load projects');
    }
  };

  const loadTasks = async (projectId) => {
    try {
      let result;
      if (projectId === 'all') {
        result = await getTasks();
      } else if (projectId) {
        result = await getTasks({ projectId });
      } else {
        return;
      }
      setTasks(result || []);
    } catch (err) {
      console.error('❌ loadTasks: Failed to fetch tasks:', err);
      setLoadError(err.message || 'Failed to load tasks');
    }
  };

  useEffect(() => {
    loadProjects();
  }, [user]);

  useEffect(() => {
    loadEmployees(selectedProjectId);
    loadTasks(selectedProjectId);
  }, [selectedProjectId]);

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTaskData.title || !newTaskData.employeeId) return;

    setFormError('');
    try {
      await createTask({
        projectId: selectedProjectId,
        employeeId: newTaskData.employeeId,
        title: newTaskData.title,
        description: newTaskData.description,
        priority: newTaskData.priority,
        dueDate: newTaskData.dueDate || new Date().toISOString().split('T')[0],
        createdBy: user?.id,
      });

      await loadTasks(selectedProjectId);
      setShowCreateTaskModal(false);
      setNewTaskData({
        title: '',
        description: '',
        employeeId: '',
        priority: 'Medium',
        dueDate: ''
      });
    } catch (err) {
      console.error('Failed to create task:', err);
      setFormError(err.message || 'Failed to create task');
    }
  };

  // Load the employees assigned to a task's own project, regardless of what
  // the header "All Projects"/project filter is currently set to. This is
  // what actually populates the Assign/Reassign To dropdown.
  const loadTaskModalEmployees = async (task) => {
    if (!task?.projectId) {
      setTaskModalEmployees([]);
      return;
    }
    try {
      const data = await getEmployees(user?.id, undefined, task.projectId);
      setTaskModalEmployees(data || []);
    } catch (err) {
      console.error('Failed to load employees for task project:', err);
      setTaskModalEmployees([]);
    }
  };

  const handleOpenEditTask = (task) => {
    setTaskToEdit(task);
    setEditTaskData({
      title: task.title,
      description: task.description,
      priority: task.priority,
      employeeId: task.employeeId,
      status: task.status,
      dueDate: task.dueDate
    });
    setIsRedoMode(false);
    setShowEditTaskModal(true);
    loadTaskModalEmployees(task);
  };

  const handleOpenRedoTask = (task) => {
    setTaskToEdit(task);
    setEditTaskData({
      title: task.title,
      description: task.description,
      priority: task.priority,
      employeeId: task.employeeId,
      status: 'Pending',
      dueDate: ''
    });
    setIsRedoMode(true);
    setShowEditTaskModal(true);
    loadTaskModalEmployees(task);
  };

  const handleCloseEditModal = () => {
    setShowEditTaskModal(false);
    setTaskToEdit(null);
    setIsRedoMode(false);
    setTaskModalEmployees([]);
  };

  const handleSaveTaskEdit = async (e) => {
    e.preventDefault();
    setFormError('');
    try {
      if (isRedoMode) {
        // Reopen the SAME task (reset to 0% / Pending) instead of creating a
        // new one. This avoids the project showing the work twice after a redo.
        await updateTask(taskToEdit.id, {
          title: editTaskData.title,
          description: editTaskData.description,
          priority: editTaskData.priority,
          employeeId: editTaskData.employeeId,
          status: 'Pending',
          dueDate: editTaskData.dueDate,
          progressLogs: [],
        });

        // Outstanding work exists again, so the project goes back to Pending
        await updateProject(taskToEdit.projectId, { status: 'Pending' });
        await loadProjects();
      } else {
        await updateTask(taskToEdit.id, {
          title: editTaskData.title,
          description: editTaskData.description,
          priority: editTaskData.priority,
          employeeId: editTaskData.employeeId,
          status: editTaskData.status,
          dueDate: editTaskData.dueDate,
        });
      }

      await loadTasks(selectedProjectId);
      handleCloseEditModal();
    } catch (err) {
      console.error('Failed to save assignment:', err);
      setFormError(err.message || 'Failed to save assignment');
    }
  };

  // Placeholder — there's no attendance table in the schema yet, so this
  // always falls back to 'Present'. Swap in a real lookup once that exists.
  const getDailyStatus = (id) => dailyStatusMap[id] || 'Present';

  const getTaskCount = (id) => tasks.filter(t => t.employeeId === id).length;

  // Employees on the task's own project — merges the fetched list with
  // anyone identifiable only from that project's tasks (see
  // mergeEmployeesFromTasks above), so reassignment options aren't
  // silently dropped just because they're missing a project_assignments row.
  const getModalProjectEmployees = () => {
    if (!taskToEdit) return [];
    const projectTasksForModal = tasks.filter(t => t.projectId === taskToEdit.projectId);
    return mergeEmployeesFromTasks(taskModalEmployees, projectTasksForModal);
  };

  const getReplacementCandidates = (excludedEmployeeId) => {
    // Scoped to the task's own project, not the header filter, so
    // suggestions are always people actually on this project.
    return getModalProjectEmployees()
      .filter(emp => emp.id !== excludedEmployeeId && getDailyStatus(emp.id) === 'Present')
      .sort((a, b) => getTaskCount(a.id) - getTaskCount(b.id))
      .slice(0, 3);
  };

  // The dropdown should list employees assigned to the task's project, and
  // must always include whoever is currently assigned to the task itself
  // (even if, for some reason, they're missing from that project fetch) so
  // the PM can see/keep the current assignee and not just replacements.
  const getModalAssignableEmployees = () => {
    const list = getModalProjectEmployees();
    if (taskToEdit && taskToEdit.employeeId && !list.some(e => e.id === taskToEdit.employeeId)) {
      list.unshift({
        id: taskToEdit.employeeId,
        name: taskToEdit.employeeName || 'Currently assigned',
        role: '',
      });
    }
    return list;
  };

  // Format an ISO / date-like value into a short, readable label (e.g. "Aug 15, 2026")
  const formatDeadline = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return value; // fall back to raw string if unparsable
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDeadlineUrgency = (value) => {
    if (!value) return 'neutral';
    const d = new Date(value);
    if (isNaN(d.getTime())) return 'neutral';
    const daysLeft = Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return 'overdue';
    if (daysLeft <= 7) return 'urgent';
    if (daysLeft <= 30) return 'soon';
    return 'neutral';
  };

  // NOTE: status is checked FIRST. If a PM manually sets a task's status to
  // "Completed" via the edit form, that should always read as 100% — even
  // if the logged progress entries happen to sum to less than 100 (or
  // there simply aren't any logs yet). Previously this checked
  // progressLogs first, so a task with partial logs that got manually
  // marked Completed would land in the Completed column (grouped by
  // `status`) but never cross the >=100 threshold that shows the
  // Done/Redo button — leaving it stuck with no action available.
  const getTaskProgress = (task) => {
    if (task.status === 'Completed' || task.status === 'Completed-Hidden') return 100;
    if (task.progressLogs && task.progressLogs.length) {
      return Math.min(100, task.progressLogs.reduce((sum, log) => sum + (parseInt(log.percentage, 10) || 0), 0));
    }
    if (task.status === 'In Progress') return 50;
    return 0;
  };

  const handleMarkTaskDone = async (task) => {
  try {
    await updateTask(task.id, { status: 'Completed-Hidden' });
    loadTasks(selectedProjectId);
  } catch (err) {
    console.error('Failed to mark task as done:', err);
    alert(err.message || 'Failed to mark task as done');
  }
};

  // Filter tasks for current selected project
  const currentProjectTasks = selectedProjectId === 'all'
    ? tasks.filter(t => projects.some(p => p.id === t.projectId))
    : tasks.filter(t => t.projectId === selectedProjectId);
  // `employees` only contains people with a formal project_assignments row.
  // Merge in anyone we can identify from their tasks too, so a real
  // assignee never disappears from "All Team Members" just because that
  // row doesn't exist (see mergeEmployeesFromTasks above).
  const currentProjectEmployees = mergeEmployeesFromTasks(employees, currentProjectTasks);
  const selectedProject = projects.find(p => p.id === selectedProjectId);
  // When viewing "All Projects" the dropdown has no single selected project,
  // but each task still belongs to a real project — use that for the deadline.
  const taskProject = taskToEdit ? projects.find(p => p.id === taskToEdit.projectId) : null;
  const modalProject = selectedProject || taskProject;
  const modalAssignableEmployees = showEditTaskModal && taskToEdit ? getModalAssignableEmployees() : [];

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(projectSearchQuery.toLowerCase())
  );

  const deadlineUrgency = getDeadlineUrgency(selectedProject?.endDate);
  const deadlineBadgeStyle = {
    ...styles.deadlineBadge,
    ...(deadlineUrgency === 'overdue' ? styles.deadlineBadgeOverdue :
        deadlineUrgency === 'urgent' ? styles.deadlineBadgeUrgent :
        deadlineUrgency === 'soon' ? styles.deadlineBadgeSoon :
        styles.deadlineBadgeNeutral),
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Project Tracking</h1>
          <p style={styles.subtitle}>Review assigned employees and manage daily task distribution.</p>
        </div>
        <div style={styles.actions}>
          <div style={styles.controls}>
            <div style={styles.projectDropdownWrapper}>
              <div 
                style={styles.projectDropdownTrigger}
                onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
              >
                <span style={styles.projectDropdownValue}>
                  {selectedProjectId === 'all' ? 'All Projects' : selectedProject ? selectedProject.name : 'Select a project'}
                </span>
                <svg style={styles.dropdownArrow} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
              {projectDropdownOpen && (
                <div style={styles.projectDropdownMenu}>
                  <div style={styles.projectDropdownSearch}>
                    <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                      type="text"
                      placeholder="Search projects..."
                      value={projectSearchQuery}
                      onChange={(e) => setProjectSearchQuery(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={styles.projectDropdownInput}
                    />
                  </div>
                  <div style={styles.projectDropdownList}>
                    {projectSearchQuery === '' && (
                      <div
                        style={{
                          ...styles.projectDropdownItem,
                          backgroundColor: selectedProjectId === 'all' ? 'var(--color-primary-light)' : 'transparent',
                          color: selectedProjectId === 'all' ? 'var(--color-primary)' : 'var(--color-text-primary)',
                        }}
                        onClick={() => {
                          setSelectedProjectId('all');
                          setProjectDropdownOpen(false);
                        }}
                      >
                        All Projects
                      </div>
                    )}
                    {filteredProjects.length === 0 && projectSearchQuery !== '' ? (
                      <div style={styles.noProjectsText}>No projects found</div>
                    ) : (
                      filteredProjects.map(p => (
                        <div
                          key={p.id}
                          style={{
                            ...styles.projectDropdownItem,
                            backgroundColor: selectedProjectId === p.id ? 'var(--color-primary-light)' : 'transparent',
                            color: selectedProjectId === p.id ? 'var(--color-primary)' : 'var(--color-text-primary)',
                          }}
                          onClick={() => {
                            setSelectedProjectId(p.id);
                            setProjectDropdownOpen(false);
                            setProjectSearchQuery('');
                          }}
                        >
                          {p.name}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          {selectedProjectId !== 'all' && (
            <button onClick={() => setShowCreateTaskModal(true)} style={styles.createBtn}>
              + Assign Task
            </button>
          )}
        </div>
      </div>

      <div style={styles.mainGrid}>
        {/* Team Members List */}
        <div className="glass-card" style={styles.teamPanel}>
          <h2 style={styles.sectionTitle}>
            {selectedProjectId === 'all' ? 'All Team Members' : 'Assigned Team'}
          </h2>
          <p style={styles.sectionSubtitle}>
            {selectedProjectId === 'all' ? 'Active employees in the system.' : 'Members allocated to this project.'}
          </p>
          
          <div style={styles.teamList}>
           {currentProjectEmployees.map(emp => {
            const isAssigned = !!(emp.assignments && emp.assignments.length > 0) ||
              currentProjectTasks.some(t => t.employeeId === emp.id);
            return (
              <div key={emp.id} style={styles.teamItem}>
                <img src={emp.avatar} alt={emp.name} style={styles.teamAvatar} />
                <div style={styles.teamMeta}>
                  <div style={styles.teamName}>{emp.name}</div>
                  <div style={styles.teamRole}>
                    {isAssigned ? 'Assigned' : 'Unassigned'}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>

        {/* Task Columns */}
        <div style={styles.boardContainer}>
          {['Pending', 'In Progress', 'Completed'].map(columnStatus => {
            const colTasks = currentProjectTasks.filter(t => {
              if (columnStatus === 'Completed') {
                return t.status === 'Completed' || t.status === 'Completed-Hidden';
              }
              return t.status === columnStatus;
            });
            return (
              <div key={columnStatus} className="glass-card" style={styles.boardColumn}>
                <div style={styles.colHeader}>
                  <h3 style={styles.colTitle}>{columnStatus}</h3>
                  <span style={styles.colCount}>{colTasks.length}</span>
                </div>
 
                <div style={styles.cardList}>
                  {colTasks.length === 0 ? (
                    <div style={styles.emptyColText}>No tasks</div>
                  ) : (
                    colTasks.map(task => (
                      <div key={task.id} style={styles.taskCard}>
                        <div style={styles.taskCardHeader}>
                          <span style={{
                            ...styles.priorityBadge,
                            backgroundColor: task.priority === 'High' ? 'var(--color-danger-light)' : task.priority === 'Medium' ? 'var(--color-warning-light)' : 'var(--color-primary-light)',
                            color: task.priority === 'High' ? 'var(--color-danger)' : task.priority === 'Medium' ? 'var(--color-warning)' : 'var(--color-success)'
                          }}>
                            {task.priority} Priority
                          </span>
                        </div>
                        <h4 style={styles.taskTitle}>{task.title}</h4>
                        <p style={styles.taskDesc}>{task.description}</p>
                        
                        <div style={styles.taskFooter}>
                          <span style={{ ...styles.assignee, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle' }}>
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                              <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                            {task.employeeName.split(' ')[0]}
                          </span>
                          <span style={{ ...styles.dueDate, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle' }}>
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                              <line x1="16" y1="2" x2="16" y2="6"></line>
                              <line x1="8" y1="2" x2="8" y2="6"></line>
                              <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                            {task.dueDate}
                          </span>
                        </div>
                        <button style={styles.editTaskBtn} onClick={() => handleOpenEditTask(task)}>Edit Assignment</button>
                        {getTaskProgress(task) >= 100 && (
                          task.status === 'Completed-Hidden' ? (
                            <button 
                              style={styles.redoTaskBtn} 
                              onClick={() => handleOpenRedoTask(task)}
                            >
                              Redo
                            </button>
                          ) : (
                            <button 
                              style={styles.doneTaskBtn} 
                              onClick={() => handleMarkTaskDone(task)}
                            >
                              Done
                            </button>
                          )
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Assign Task Modal */}
      {showCreateTaskModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <div style={styles.modalHeaderLeft}>
                <h2 style={{ margin: 0, fontSize: 20 }}>Assign Daily Task</h2>
                {selectedProject && (
                  <span style={deadlineBadgeStyle}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    {selectedProject.endDate
                      ? `Project Deadline: ${formatDeadline(selectedProject.endDate)}`
                      : 'No deadline set'}
                  </span>
                )}
              </div>
              <button onClick={() => setShowCreateTaskModal(false)} style={styles.closeModalBtn}>&times;</button>
            </div>
            <form onSubmit={handleCreateTask} style={{ marginTop: 16 }}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Task Title</label>
                <input 
                  type="text" 
                  value={newTaskData.title} 
                  onChange={(e) => setNewTaskData({ ...newTaskData, title: e.target.value })} 
                  style={styles.modalInput} 
                  placeholder="e.g. Design OCR schema architecture"
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Description</label>
                <textarea 
                  value={newTaskData.description} 
                  onChange={(e) => setNewTaskData({ ...newTaskData, description: e.target.value })} 
                  style={styles.modalTextarea} 
                  placeholder="Task details and deliverables..."
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Assign To</label>
                <select 
                  value={newTaskData.employeeId} 
                  onChange={(e) => setNewTaskData({ ...newTaskData, employeeId: e.target.value })} 
                  style={styles.modalSelect}
                  required
                >
                  <option value="">-- Choose Developer --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                  ))}
                </select>
              </div>

              <div style={styles.formRow}>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>Priority</label>
                  <select 
                    value={newTaskData.priority} 
                    onChange={(e) => setNewTaskData({ ...newTaskData, priority: e.target.value })} 
                    style={styles.modalSelect}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>

                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>Due Date</label>
                  <input 
                    type="date" 
                    value={newTaskData.dueDate} 
                    onChange={(e) => setNewTaskData({ ...newTaskData, dueDate: e.target.value })} 
                    style={styles.modalInput} 
                    max={selectedProject?.endDate ? String(selectedProject.endDate).slice(0, 10) : undefined}
                    required
                  />
                </div>
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowCreateTaskModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.saveBtn}>Assign Task</button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Edit / Redo Task Modal */}
      {showEditTaskModal && taskToEdit && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <div style={styles.modalHeaderLeft}>
                <h2 style={{ margin: 0, fontSize: 20 }}>
                  {isRedoMode ? 'Redo Task' : 'Edit Assignment'}
                </h2>
                {modalProject && (
                  <span style={deadlineBadgeStyle}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    {modalProject.endDate
                      ? `Project Deadline: ${formatDeadline(modalProject.endDate)}`
                      : 'No deadline set'}
                  </span>
                )}
              </div>
              <button onClick={handleCloseEditModal} style={styles.closeModalBtn}>&times;</button>
            </div>
            <form onSubmit={handleSaveTaskEdit} style={{ marginTop: 16 }}>
              {formError && (
                <div style={{ color: 'var(--color-danger)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                  {formError}
                </div>
              )}
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Task Title</label>
                <input
                  type="text"
                  value={editTaskData.title}
                  onChange={(e) => setEditTaskData(prev => ({ ...prev, title: e.target.value }))}
                  style={styles.modalInput}
                  placeholder="e.g. Design OCR schema architecture"
                  required
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Description</label>
                <textarea
                  value={editTaskData.description}
                  onChange={(e) => setEditTaskData(prev => ({ ...prev, description: e.target.value }))}
                  style={styles.modalTextarea}
                  placeholder="Task details and deliverables..."
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Priority</label>
                <select
                  value={editTaskData.priority}
                  onChange={(e) => setEditTaskData(prev => ({ ...prev, priority: e.target.value }))}
                  style={styles.modalSelect}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>{isRedoMode ? 'Reassign To' : 'Assign To'}</label>
                <select
                  value={editTaskData.employeeId}
                  onChange={(e) => setEditTaskData(prev => ({ ...prev, employeeId: e.target.value }))}
                  style={styles.modalSelect}
                  required
                >
                  <option value="">-- Choose replacement --</option>
                  {modalAssignableEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}{emp.role ? ` (${emp.role})` : ''}</option>
                  ))}
                </select>
                {modalAssignableEmployees.length <= 1 && (
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
                    No other employees are assigned to this project yet — assign them from Project Tracking first.
                  </p>
                )}
              </div>

              {!isRedoMode && (
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Status</label>
                  <select
                    value={editTaskData.status}
                    onChange={(e) => setEditTaskData(prev => ({ ...prev, status: e.target.value }))}
                    style={styles.modalSelect}
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              )}

              {isRedoMode && (
                <div style={{ ...styles.formGroup, fontSize: 12, color: 'var(--color-text-muted)' }}>
                  This reopens the same task at 0% progress with status <strong>Pending</strong>,
                  replacing the completed record so the project's work isn't shown twice.
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Due Date</label>
                <input
                  type="date"
                  value={editTaskData.dueDate}
                  onChange={(e) => setEditTaskData(prev => ({ ...prev, dueDate: e.target.value }))}
                  style={styles.modalInput}
                  max={selectedProject?.endDate ? String(selectedProject.endDate).slice(0, 10) : undefined}
                  required
                />
              </div>
              <div style={styles.suggestionPanel}>
                <div style={styles.suggestionHeader}>Suggested Temporary Replacements</div>
                <div style={styles.suggestionList}>
                  {getReplacementCandidates(taskToEdit.employeeId).map(emp => (
                    <div key={emp.id} style={styles.suggestionItem}>
                      <div>
                        <div style={styles.suggestionName}>{emp.name}</div>
                        <div style={styles.suggestionMeta}>{emp.role} • {getTaskCount(emp.id)} tasks</div>
                      </div>
                      <button
                        type="button"
                        style={styles.useSuggestionBtn}
                        onClick={() => setEditTaskData(prev => ({ ...prev, employeeId: emp.id }))}
                      >
                        Use
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div style={styles.modalActions}>
                <button type="button" onClick={handleCloseEditModal} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.saveBtn}>
                  {isRedoMode ? 'Confirm Redo' : 'Save Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
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
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    flexWrap: 'wrap',
    gap: '12px',
  },

  redoTaskBtn: {
  width: '100%',
  border: 'none',
  background: 'var(--color-warning)',
  color: '#ffffff',
  padding: '10px 12px',
  borderRadius: '10px',
  fontSize: '12px',
  fontWeight: '700',
  cursor: 'pointer',
  marginTop: '6px',
  transition: 'background-color 0.2s',
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
  actions: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  projectDropdownWrapper: {
    position: 'relative',
  },
  projectDropdownTrigger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    fontWeight: '600',
    cursor: 'pointer',
    minWidth: '250px',
  },
  projectDropdownValue: {
    fontSize: '14px',
  },
  dropdownArrow: {
    transition: 'transform 0.2s',
  },
  projectDropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '4px',
    backgroundColor: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-md)',
    zIndex: 100,
    maxHeight: '300px',
    overflow: 'hidden',
  },
  projectDropdownSearch: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    borderBottom: '1px solid var(--color-border)',
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: '16px',
    color: 'var(--color-text-muted)',
  },
  projectDropdownInput: {
    paddingLeft: '36px',
    padding: '6px 8px 6px 36px',
    borderRadius: '4px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
  },
  projectDropdownList: {
    maxHeight: '200px',
    overflowY: 'auto',
  },
  projectDropdownItem: {
    padding: '10px 14px',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'background-color 0.2s',
    '&:hover': {
      backgroundColor: 'var(--color-bg-card-hover)',
    }
  },
  noProjectsText: {
    padding: '12px 14px',
    color: 'var(--color-text-muted)',
    fontSize: '13px',
    fontStyle: 'italic',
  },
  createBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '10px 18px',
    borderRadius: 'var(--radius-md)',
    fontWeight: '700',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '280px 1fr',
    gap: '24px',
  },
  teamPanel: {
    padding: '20px',
    maxHeight: '600px',
    overflowY: 'auto',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '700',
    marginBottom: '4px',
  },
  sectionSubtitle: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    marginBottom: '16px',
  },
  teamList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  teamItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    paddingBottom: '12px',
    borderBottom: '1px solid var(--color-border)',
  },
  teamAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  teamMeta: {
    display: 'flex',
    flexDirection: 'column',
  },
  teamName: {
    fontSize: '13px',
    fontWeight: '700',
  },
  teamRole: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
  },
  teamDept: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
  },
  unassignedBadge: {
    display: 'inline-block',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    color: '#ef4444',
    fontSize: '9px',
    fontWeight: '700',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
    marginTop: '4px',
  },
  assignedBadge: {
    display: 'block',
    color: '#10b981',
    fontSize: '9px',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: '4px',
  },
  inlineAssignSelect: {
    display: 'block',
    width: '100%',
    padding: '4px 6px',
    fontSize: '11px',
    borderRadius: '4px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    outline: 'none',
    marginTop: '4px',
    cursor: 'pointer',
    maxWidth: '220px',
  },
  assignedProjects: {
    marginTop: '4px',
  },
  projectNameList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    marginTop: '2px',
  },
  assignedProjectName: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '220px',
  },
  boardContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
  },
  boardColumn: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    background: 'rgba(255, 255, 255, 0.01)',
  },
  colHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '2px solid var(--color-border)',
    paddingBottom: '8px',
  },
  colTitle: {
    fontSize: '15px',
    fontWeight: '700',
  },
  colCount: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: '10px',
    background: 'var(--color-bg-card-hover)',
    color: 'var(--color-text-secondary)',
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    minHeight: '400px',
  },
  emptyColText: {
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '12px',
    padding: '30px 0',
  },
  taskCard: {
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    boxShadow: 'var(--shadow-sm)',
  },
  taskCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  priorityBadge: {
    fontSize: '9px',
    fontWeight: '700',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
  },
  taskTitle: {
    fontSize: '13px',
    fontWeight: '700',
  },
  taskDesc: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.4',
  },
  taskFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    marginTop: '6px',
    borderTop: '1px solid var(--color-border)',
    paddingTop: '8px',
    gap: '10px',
  },
  assignee: {
    fontWeight: '600',
  },
  dueDate: {},
  editTaskBtn: {
    width: '100%',
    border: '1px solid var(--color-border)',
    background: 'transparent',
    color: 'var(--color-text-primary)',
    padding: '10px 12px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '8px',
    transition: 'background-color 0.2s',
  },
  doneTaskBtn: {
    width: '100%',
    border: 'none',
    background: 'var(--color-success)',
    color: '#ffffff',
    padding: '10px 12px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '6px',
    transition: 'background-color 0.2s',
  },
  suggestionPanel: {
    borderTop: '1px solid var(--color-border)',
    marginTop: '20px',
    paddingTop: '16px',
  },
  suggestionHeader: {
    fontSize: '12px',
    fontWeight: '700',
    marginBottom: '12px',
  },
  suggestionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  suggestionItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
  },
  suggestionName: {
    fontSize: '13px',
    fontWeight: '700',
  },
  suggestionMeta: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  useSuggestionBtn: {
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  modalCard: {
    width: '100%',
    maxWidth: '480px',
    padding: '28px',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '12px',
    gap: '12px',
  },
  modalHeaderLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  deadlineBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    fontWeight: '700',
    padding: '4px 10px',
    borderRadius: '999px',
    width: 'fit-content',
    letterSpacing: '0.2px',
  },
  deadlineBadgeNeutral: {
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
  },
  deadlineBadgeSoon: {
    background: 'var(--color-warning-light)',
    color: 'var(--color-warning)',
  },
  deadlineBadgeUrgent: {
    background: 'var(--color-danger-light)',
    color: 'var(--color-danger)',
  },
  deadlineBadgeOverdue: {
    background: 'var(--color-danger)',
    color: '#ffffff',
  },
  closeModalBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: 'var(--color-text-muted)',
  },
  formGroup: {
    marginBottom: '16px',
    textAlign: 'left',
  },
  formRow: {
    display: 'flex',
    gap: '16px',
  },
  formLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
    marginBottom: '6px',
  },
  modalInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  modalSelect: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  modalTextarea: {
    width: '100%',
    height: '80px',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    resize: 'none',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '24px',
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid var(--color-border)',
    padding: '10px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '700',
  }
};