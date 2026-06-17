import React, { useState, useEffect } from 'react';
import { getEmployees, getTasks, saveTasks, getProjects } from '../mockState';

export default function PMProjectTrackingTab() {
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  
  const [selectedProjectId, setSelectedProjectId] = useState(2); // Default to active project (Inventory Tracker)
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [newTaskData, setNewTaskData] = useState({
    title: '',
    description: '',
    employeeId: '',
    priority: 'Medium',
    dueDate: ''
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
      dueDate: newTaskData.dueDate || new Date().toISOString().split('T')[0]
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

  // Filter tasks for current selected project
  const currentProjectTasks = tasks.filter(t => t.projectId === selectedProjectId);
  const currentProjectEmployees = employees; // Simplified: show all engineering pool as mock team members

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
                          <span style={styles.assignee}>👤 {task.employeeName.split(' ')[0]}</span>
                          <span style={styles.dueDate}>📅 {task.dueDate}</span>
                        </div>
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
  },
  assignee: {
    fontWeight: '600',
  },
  dueDate: {},
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
