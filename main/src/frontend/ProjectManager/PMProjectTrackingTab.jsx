import React, { useState, useEffect } from 'react';
import { getEmployees, getTasks, saveTasks, getProjects } from '../mockState';

export default function PMProjectTrackingTab() {
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  
  const [selectedProjectId, setSelectedProjectId] = useState(2); // Default to active project (Inventory Tracker)
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [showEditTaskModal, setShowEditTaskModal] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState(null);
  const [editProjectData, setEditProjectData] = useState({ id: null, name: '', description: '', startDate: '', endDate: '' });
  const [newTaskData, setNewTaskData] = useState({
    title: '',
    description: '',
    employeeId: '',
    priority: 'Medium',
    dueDate: ''
  });
  const [editTaskData, setEditTaskData] = useState({ employeeId: '', status: '', dueDate: '' });
  const [dailyStatusMap] = useState({
    'EMP-1014': 'Present',
    'EMP-1015': 'Absent',
    'EMP-1016': 'On Leave',
    'EMP-1017': 'Present',
    'EMP-1018': 'Present',
    'EMP-1019': 'Absent',
    'EMP-1020': 'Present',
  });

  useEffect(() => {
    setEmployees(getEmployees());
    setTasks(getTasks());
    setProjects(getProjects());
  }, []);

  const handleCreateTask = (e) => {
    e.preventDefault();
    if (!newTaskData.title || !newTaskData.employeeId) return;

    const assignedEmp = employees.find(emp => emp.id === newTaskData.employeeId);
    const selectedProj = projects.find(p => p.id === selectedProjectId) || { name: 'Current Project' };

    const newTask = {
      id: Date.now(),
      projectId: selectedProjectId,
      projectName: selectedProj.name,
      employeeId: newTaskData.employeeId,
      employeeName: assignedEmp ? assignedEmp.name : 'Unassigned',
      title: newTaskData.title,
      description: newTaskData.description,
      priority: newTaskData.priority,
      status: 'Pending',
      dueDate: newTaskData.dueDate || new Date().toISOString().split('T')[0],
      progressLogs: []
    };

    const updatedTasks = [...tasks, newTask];
    setTasks(updatedTasks);
    saveTasks(updatedTasks);

    setShowCreateTaskModal(false);
    setNewTaskData({
      title: '',
      description: '',
      employeeId: '',
      priority: 'Medium',
      dueDate: ''
    });
  };

  const handleProjectClick = (project) => {
    setSelectedProjectId(project.id);
    setEditProjectData({
      id: project.id,
      name: project.name,
      description: project.description,
      startDate: project.startDate,
      endDate: project.endDate
    });
    setShowEditProjectModal(true);
  };

  const handleEditProject = (e) => {
    e.preventDefault();
    const updatedProjects = projects.map(p => p.id === editProjectData.id ? { ...p, ...editProjectData } : p);
    setProjects(updatedProjects);
    saveProjects(updatedProjects);
    setShowEditProjectModal(false);
  };

  const handleOpenEditTask = (task) => {
    setTaskToEdit(task);
    setEditTaskData({
      employeeId: task.employeeId,
      status: task.status,
      dueDate: task.dueDate
    });
    setShowEditTaskModal(true);
  };

  const handleSaveTaskEdit = (e) => {
    e.preventDefault();
    const updatedTasks = tasks.map(t => {
      if (t.id === taskToEdit.id) {
        const assignedEmp = employees.find(emp => emp.id === editTaskData.employeeId);
        return {
          ...t,
          employeeId: editTaskData.employeeId,
          employeeName: assignedEmp ? assignedEmp.name : 'Unassigned',
          status: editTaskData.status,
          dueDate: editTaskData.dueDate
        };
      }
      return t;
    });
    setTasks(updatedTasks);
    saveTasks(updatedTasks);
    setShowEditTaskModal(false);
    setTaskToEdit(null);
  };

  const getDailyStatus = (id) => dailyStatusMap[id] || 'Present';

  const getTaskCount = (id) => tasks.filter(t => t.employeeId === id).length;

  const getReplacementCandidates = (excludedEmployeeId) => {
    return employees
      .filter(emp => emp.id !== excludedEmployeeId && getDailyStatus(emp.id) === 'Present')
      .sort((a, b) => getTaskCount(a.id) - getTaskCount(b.id))
      .slice(0, 3);
  };

  // Filter tasks for current selected project
  const currentProjectTasks = tasks.filter(t => t.projectId === selectedProjectId);
  const currentProjectEmployees = employees; // Simplified: show all engineering pool as mock team members
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Project Tracking</h1>
          <p style={styles.subtitle}>Review assigned employees and manage daily task distribution.</p>
        </div>
        <div style={styles.actions}>
          <select 
            value={selectedProjectId} 
            onChange={(e) => setSelectedProjectId(parseInt(e.target.value))} 
            style={styles.projectSelect}
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button onClick={() => setShowCreateTaskModal(true)} style={styles.createBtn}>
            + Assign Task
          </button>
        </div>
      </div>
      <div style={styles.projectCardStrip}>
        {projects.map(project => (
          <button
            key={project.id}
            onClick={() => handleProjectClick(project)}
            style={{
              ...styles.projectCard,
              borderColor: selectedProjectId === project.id ? 'var(--color-primary)' : 'transparent',
              background: selectedProjectId === project.id ? 'rgba(59, 130, 246, 0.08)' : 'var(--color-bg-card)'
            }}
          >
            <div style={styles.projectCardName}>{project.name}</div>
            <div style={styles.projectCardMeta}>{project.status} • {project.startDate} - {project.endDate}</div>
          </button>
        ))}
      </div>

      <div style={styles.mainGrid}>
        {/* Team Members List */}
        <div className="glass-card" style={styles.teamPanel}>
          <h2 style={styles.sectionTitle}>Assigned Team</h2>
          <p style={styles.sectionSubtitle}>Members allocated to this project.</p>
          
          <div style={styles.teamList}>
            {currentProjectEmployees.map(emp => (
              <div key={emp.id} style={styles.teamItem}>
                <img src={emp.avatar} alt={emp.name} style={styles.teamAvatar} />
                <div style={styles.teamMeta}>
                  <div style={styles.teamName}>{emp.name}</div>
                  <div style={styles.teamRole}>{emp.role}</div>
                  <div style={styles.teamDept}>{emp.department}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Task Columns */}
        <div style={styles.boardContainer}>
          {['Pending', 'In Progress', 'Completed'].map(columnStatus => {
            const colTasks = currentProjectTasks.filter(t => t.status === columnStatus);
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
              <h2 style={{ margin: 0, fontSize: 20 }}>Assign Daily Task</h2>
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

      {/* Edit Project Modal */}
      {showEditProjectModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Edit Project</h2>
              <button onClick={() => setShowEditProjectModal(false)} style={styles.closeModalBtn}>&times;</button>
            </div>
            <form onSubmit={handleEditProject} style={{ marginTop: 16 }}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Project Name</label>
                <input
                  type="text"
                  value={editProjectData.name}
                  onChange={(e) => setEditProjectData(prev => ({ ...prev, name: e.target.value }))}
                  style={styles.modalInput}
                  required
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Description</label>
                <textarea
                  value={editProjectData.description}
                  onChange={(e) => setEditProjectData(prev => ({ ...prev, description: e.target.value }))}
                  style={styles.modalTextarea}
                  required
                />
              </div>
              <div style={styles.formRow}>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>Start Date</label>
                  <input
                    type="date"
                    value={editProjectData.startDate}
                    onChange={(e) => setEditProjectData(prev => ({ ...prev, startDate: e.target.value }))}
                    style={styles.modalInput}
                    required
                  />
                </div>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>End Date</label>
                  <input
                    type="date"
                    value={editProjectData.endDate}
                    onChange={(e) => setEditProjectData(prev => ({ ...prev, endDate: e.target.value }))}
                    style={styles.modalInput}
                    required
                  />
                </div>
              </div>
              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowEditProjectModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.saveBtn}>Save Project</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {showEditTaskModal && taskToEdit && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Edit Assignment</h2>
              <button onClick={() => setShowEditTaskModal(false)} style={styles.closeModalBtn}>&times;</button>
            </div>
            <form onSubmit={handleSaveTaskEdit} style={{ marginTop: 16 }}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Task</label>
                <div style={{ ...styles.modalInput, padding: '12px 14px', background: 'var(--color-bg-card)' }}>
                  {taskToEdit.title}
                </div>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Assign To</label>
                <select
                  value={editTaskData.employeeId}
                  onChange={(e) => setEditTaskData(prev => ({ ...prev, employeeId: e.target.value }))}
                  style={styles.modalSelect}
                  required
                >
                  <option value="">-- Choose replacement --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                  ))}
                </select>
              </div>
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
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Due Date</label>
                <input
                  type="date"
                  value={editTaskData.dueDate}
                  onChange={(e) => setEditTaskData(prev => ({ ...prev, dueDate: e.target.value }))}
                  style={styles.modalInput}
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
                <button type="button" onClick={() => setShowEditTaskModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.saveBtn}>Save Assignment</button>
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
  },
  projectSelect: {
    padding: '10px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    fontWeight: '600',
    outline: 'none',
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
  projectCardStrip: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '24px',
  },
  projectCard: {
    flex: '1 1 260px',
    padding: '18px',
    borderRadius: '18px',
    border: '1px solid transparent',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.2s',
    background: 'var(--color-bg-card)',
  },
  projectCardName: {
    fontSize: '14px',
    fontWeight: '700',
    marginBottom: '6px',
    color: 'var(--color-text-primary)',
  },
  projectCardMeta: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
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
    alignItems: 'center',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '12px',
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
