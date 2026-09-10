import React, { useState, useEffect, useRef } from 'react';
import { getProjects, createProject, updateProject, getSkills, updateProjectStatus, getProjectHistoryDetails } from './pmApi';

// Statuses that count as "done" and belong in the Project History tab.
const COMPLETED_STATUSES = ['Completed', 'Archived', 'Cancelled'];

const calculateDurationDays = (startDate, endDate) => {
  if (!startDate || !endDate) return '';
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return '';
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
};

export default function PMProjectsTab({ user, onNavigate }) {
  const [projects, setProjects] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');

  // ✅ Tabs: "active" (Projects) vs "history" (Project History / completed)
  const [activeTab, setActiveTab] = useState('active');
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [completionNotice, setCompletionNotice] = useState(null); // { projectName, projectId, isCancelled, reason }

  // ✅ Cancel Project Modal state
  const [cancelModal, setCancelModal] = useState({
    isOpen: false,
    project: null,
    reason: '',
    isSubmitting: false,
    error: '',
  });

  // ✅ Custom confirm modal (replaces browser window.confirm) for
  // "Mark as Complete" / "Restore Project" actions.
  const [confirmDialog, setConfirmDialog] = useState(null); // { project, kind: 'complete' | 'restore' }

  // ✅ Project History Details Modal state (view employees, tasks, client feedback)
  const [historyDetailsModal, setHistoryDetailsModal] = useState({
    isOpen: false,
    project: null,
    loading: false,
    data: null,
    error: '',
  });

  // ✅ Edit Project Modal state
  const [editingProject, setEditingProject] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    description: '',
    teamSize: '',
    duration: '',
    startDate: '',
    endDate: '',
    priority: 'Medium',
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');
  const [editNotice, setEditNotice] = useState(null);

  // Expanded skills per project card
  const [expandedSkillsMap, setExpandedSkillsMap] = useState({});

  const toggleSkillsExpanded = (projId) => {
    setExpandedSkillsMap(prev => ({
      ...prev,
      [projId]: !prev[projId]
    }));
  };

  // Dynamic skills search state
  const skillCacheRef = useRef({});
  const debounceTimerRef = useRef(null);
  const [activeSkillFocus, setActiveSkillFocus] = useState(null); // { index, type: 'primary' | 'secondary' }
  const [dynamicSuggestions, setDynamicSuggestions] = useState([]);
  const [isSearchingSkills, setIsSearchingSkills] = useState(false);

  // Initial skills loaded on mount as quick fallback
  const [allSkills, setAllSkills] = useState([]);
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);

  const initialResources = [{
    role: '',
    quantity: 1,
    experience: 'Intermediate',
    assignment: 'Full-time',
    primarySkills: [],
    primarySkillInput: '',
    secondarySkills: [],
    secondarySkillInput: '',
    justification: ''
  }];

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    teamSize: '',
    duration: '',
    startDate: '',
    endDate: '',
    priority: 'Medium',
    resources: initialResources
  });

  // ✅ Fetch initial skills from database on mount
  useEffect(() => {
    const fetchSkills = async () => {
      setIsLoadingSkills(true);
      try {
        const data = await getSkills();
        const list = Array.isArray(data) ? data : (data?.data || []);
        setAllSkills(list);
        skillCacheRef.current[''] = list;
      } catch (error) {
        console.error('Error fetching initial skills:', error);
        setAllSkills([]);
      } finally {
        setIsLoadingSkills(false);
      }
    };
    fetchSkills();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await getProjects(user?.id);
      setProjects(data);
    } catch (err) {
      console.error('Failed to load projects:', err);
      setLoadError(err.message || 'Failed to load projects');
    }
  };

  useEffect(() => {
    loadProjects();
  }, [user]);

  // ── Dynamic Skills Search Helper ────────────────────────────────────
  const searchSkillsDynamic = (query, currentSelected = []) => {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      setDynamicSuggestions([]);
      setIsSearchingSkills(false);
      return;
    }

    const lower = trimmed.toLowerCase();
    if (skillCacheRef.current[lower]) {
      const cached = skillCacheRef.current[lower];
      setDynamicSuggestions(cached.filter(s => !currentSelected.includes(s.skill_name)));
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setIsSearchingSkills(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const data = await getSkills(trimmed);
        const list = Array.isArray(data) ? data : (data?.data || []);
        skillCacheRef.current[lower] = list;
        setDynamicSuggestions(list.filter(s => !currentSelected.includes(s.skill_name)));
      } catch (err) {
        console.error('Error searching skills dynamically:', err);
      } finally {
        setIsSearchingSkills(false);
      }
    }, 150);
  };

  // ── Skill tag helpers ───────────────────────────────────────────────
  // `type` is 'primary' or 'secondary'. Maps to the resource's
  // primarySkills/primarySkillInput or secondarySkills/secondarySkillInput fields.
  const fieldNames = (type) => ({
    skillsField: type === 'primary' ? 'primarySkills' : 'secondarySkills',
    inputField: type === 'primary' ? 'primarySkillInput' : 'secondarySkillInput',
  });

  // ✅ Handle skill input with comma separation
  const handleSkillInputChange = (index, type, value) => {
    const { skillsField, inputField } = fieldNames(type);
    setActiveSkillFocus({ index, type });

    // Check if the last character is a comma
    if (value.endsWith(',')) {
      const skillName = value.slice(0, -1).trim();
      if (skillName) {
        setFormData(prev => {
          const updated = [...prev.resources];
          if (!updated[index][skillsField].includes(skillName)) {
            updated[index] = {
              ...updated[index],
              [skillsField]: [...updated[index][skillsField], skillName],
            };
          }
          updated[index][inputField] = '';
          return { ...prev, resources: updated };
        });
        setDynamicSuggestions([]);
        return;
      }
    }

    // Update the input value
    setFormData(prev => {
      const updated = [...prev.resources];
      updated[index] = { ...updated[index], [inputField]: value };
      return { ...prev, resources: updated };
    });

    const currentSelected = formData.resources[index]?.[skillsField] || [];
    searchSkillsDynamic(value, currentSelected);
  };

  // ✅ Handle Enter key to add skill
  const handleSkillKeyDown = (index, type, e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const { skillsField, inputField } = fieldNames(type);
      const input = formData.resources[index]?.[inputField] || '';
      const trimmed = input.trim();
      if (trimmed) {
        setFormData(prev => {
          const updated = [...prev.resources];
          if (!updated[index][skillsField].includes(trimmed)) {
            updated[index] = {
              ...updated[index],
              [skillsField]: [...updated[index][skillsField], trimmed],
            };
          }
          updated[index][inputField] = '';
          return { ...prev, resources: updated };
        });
        setDynamicSuggestions([]);
        setActiveSkillFocus(null);
      }
    } else if (e.key === 'Escape') {
      setActiveSkillFocus(null);
      setDynamicSuggestions([]);
    }
  };

  // ✅ Select a skill from suggestions (click)
  const handleSelectSkill = (index, type, skillName) => {
    if (!skillName || skillName.trim() === '') return;
    const { skillsField, inputField } = fieldNames(type);

    setFormData(prev => {
      const updated = [...prev.resources];
      if (!updated[index][skillsField].includes(skillName.trim())) {
        updated[index] = {
          ...updated[index],
          [skillsField]: [...updated[index][skillsField], skillName.trim()],
        };
      }
      updated[index][inputField] = '';
      return { ...prev, resources: updated };
    });
    setDynamicSuggestions([]);
    setActiveSkillFocus(null);
  };

  // ✅ Remove a skill from the selected list
  const handleRemoveSkill = (resourceIndex, type, skillToRemove) => {
    const { skillsField } = fieldNames(type);
    setFormData(prev => {
      const updated = [...prev.resources];
      updated[resourceIndex] = {
        ...updated[resourceIndex],
        [skillsField]: updated[resourceIndex][skillsField].filter(s => s !== skillToRemove),
      };
      return { ...prev, resources: updated };
    });
  };

  const handleResourceChange = (index, field, value) => {
    setFormData(prev => {
      const updated = [...prev.resources];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, resources: updated };
    });
  };

  const handleAddResource = () => {
    setFormData(prev => ({
      ...prev,
      resources: [
        ...prev.resources,
        {
          role: '',
          quantity: 1,
          experience: 'Intermediate',
          assignment: 'Full-time',
          primarySkills: [],
          primarySkillInput: '',
          secondarySkills: [],
          secondarySkillInput: '',
          justification: ''
        }
      ]
    }));
  };

  const handleRemoveResource = (index) => {
    if (formData.resources.length <= 1) return;
    setFormData(prev => ({
      ...prev,
      resources: prev.resources.filter((_, i) => i !== index)
    }));
  };

  const resetFormData = () => {
    setFormData({
      name: '',
      description: '',
      teamSize: '',
      duration: '',
      startDate: '',
      endDate: '',
      priority: 'Medium',
      resources: [{
        role: '',
        quantity: 1,
        experience: 'Intermediate',
        assignment: 'Full-time',
        primarySkills: [],
        primarySkillInput: '',
        secondarySkills: [],
        secondarySkillInput: '',
        justification: ''
      }]
    });
    setDynamicSuggestions([]);
    setActiveSkillFocus(null);
  };

  // ✅ Create Project with 1-click protection & loading state
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (isCreatingProject) return;
    if (!formData.name?.trim() || !formData.description?.trim()) return;

    setIsCreatingProject(true);
    setSubmitError('');
    try {
      // Convert skill arrays to comma-separated strings for backend
      const resourcesWithSkills = formData.resources.map(res => ({
        ...res,
        primarySkills: res.primarySkills.join(', '),
        secondarySkills: res.secondarySkills.join(', '),
      }));

      await createProject({
        name: formData.name.trim(),
        description: formData.description.trim(),
        teamSize: formData.teamSize,
        duration: formData.duration,
        startDate: formData.startDate || new Date().toISOString().split('T')[0],
        endDate: formData.endDate || new Date().toISOString().split('T')[0],
        priority: formData.priority,
        resources: resourcesWithSkills,
        createdBy: user?.id,
      });

      await loadProjects();
      setShowCreateModal(false);
      resetFormData();
    } catch (err) {
      console.error('Failed to create project:', err);
      setSubmitError(err.message || 'Failed to create project');
    } finally {
      setIsCreatingProject(false);
    }
  };

  // ✅ Cancel Project Modal Handlers
  const handleOpenCancelModal = (proj) => {
    setCancelModal({
      isOpen: true,
      project: proj,
      reason: '',
      isSubmitting: false,
      error: '',
    });
  };

  const handleCloseCancelModal = () => {
    if (cancelModal.isSubmitting) return;
    setCancelModal({
      isOpen: false,
      project: null,
      reason: '',
      isSubmitting: false,
      error: '',
    });
  };

  const handleConfirmCancelProject = async (e) => {
    if (e) e.preventDefault();
    if (!cancelModal.project) return;
    if (!cancelModal.reason.trim()) {
      setCancelModal(prev => ({ ...prev, error: 'Please enter a reason for cancelling this project.' }));
      return;
    }

    setCancelModal(prev => ({ ...prev, isSubmitting: true, error: '' }));
    try {
      await updateProjectStatus(cancelModal.project.id, 'Cancelled', 'with_previous', cancelModal.reason.trim());
      await loadProjects();
      const cancelledName = cancelModal.project.name;
      const cancelledReason = cancelModal.reason.trim();
      setCancelModal({
        isOpen: false,
        project: null,
        reason: '',
        isSubmitting: false,
        error: '',
      });
      setActiveTab('history');
      setCompletionNotice({
        projectName: cancelledName,
        projectId: cancelModal.project.id,
        isCancelled: true,
        reason: cancelledReason,
      });
    } catch (err) {
      console.error('Failed to cancel project:', err);
      setCancelModal(prev => ({
        ...prev,
        isSubmitting: false,
        error: err.message || 'Failed to cancel project. Please try again.',
      }));
    }
  };

  // ✅ Open Edit Project Modal
  const handleOpenEditModal = (proj) => {
    setEditingProject(proj);
    setEditError('');
    const startDate = proj.startDate || '';
    const endDate = proj.endDate || '';
    const duration = calculateDurationDays(startDate, endDate) || proj.durationDays || '';
    const cleanDesc = (proj.description || '')
      .replace(/<!--\s*RESTORED\s*-->/gi, '')
      .replace(/\[RESTORED\]/gi, '')
      .trim();
    setEditFormData({
      name: proj.name || '',
      description: cleanDesc,
      teamSize: proj.teamSize || proj.manpowerNeeded || '',
      duration: duration,
      startDate: startDate,
      endDate: endDate,
      priority: proj.priority || 'Medium',
    });
  };

  // ✅ Submit Edit Project
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingProject) return;

    if (!editFormData.name.trim()) {
      setEditError('Project name is required');
      return;
    }
    if (!editFormData.startDate || !editFormData.endDate) {
      setEditError('Start date and end date are required');
      return;
    }

    setEditSubmitting(true);
    setEditError('');

    try {
      let finalDescription = editFormData.description.trim();
      if (editingProject.isRestored && !finalDescription.includes('<!-- RESTORED -->')) {
        finalDescription = `${finalDescription} <!-- RESTORED -->`.trim();
      }

      const payload = {
        name: editFormData.name.trim(),
        description: finalDescription,
        teamSize: editFormData.teamSize ? parseInt(editFormData.teamSize, 10) : null,
        duration: editFormData.duration ? parseInt(editFormData.duration, 10) : null,
        startDate: editFormData.startDate,
        endDate: editFormData.endDate,
        priority: editFormData.priority || 'Medium',
      };

      await updateProject(editingProject.id, payload);
      setEditingProject(null);
      setEditNotice(`Project "${editFormData.name.trim()}" updated successfully!`);
      setTimeout(() => setEditNotice(null), 4000);
      await loadProjects();
    } catch (err) {
      console.error('Failed to update project:', err);
      setEditError(err.message || 'Failed to update project');
    } finally {
      setEditSubmitting(false);
    }
  };

  // ✅ Open the styled confirm dialog instead of the native browser confirm()
  const handleCompleteProject = (proj) => {
    setConfirmDialog({ project: proj, kind: 'complete' });
  };

  const handleRestoreProject = (proj) => {
    setConfirmDialog({ project: proj, kind: 'restore', restoreMode: 'with_previous' });
  };

  // ✅ Open Project History details modal (client feedback, assigned employees, tasks)
  const handleOpenHistoryDetails = async (project) => {
    setHistoryDetailsModal({
      isOpen: true,
      project,
      loading: true,
      data: null,
      error: '',
    });
    try {
      const res = await getProjectHistoryDetails(project.id);
      const detailsData = res?.data || res;
      setHistoryDetailsModal(prev => ({
        ...prev,
        loading: false,
        data: detailsData,
      }));
    } catch (err) {
      console.error('Failed to load project history details:', err);
      setHistoryDetailsModal(prev => ({
        ...prev,
        loading: false,
        error: err.message || 'Failed to load project history details',
      }));
    }
  };

  const handleCloseHistoryDetails = () => {
    setHistoryDetailsModal({
      isOpen: false,
      project: null,
      loading: false,
      data: null,
      error: '',
    });
  };

  // ✅ Runs after the user confirms in the custom dialog. Marks a project
  // Complete (-> Project History) or restores it back to Active with chosen mode.
  const runConfirmedStatusChange = async () => {
    if (!confirmDialog) return;
    const { project: proj, kind, restoreMode } = confirmDialog;
    const newStatus = kind === 'complete' ? 'Completed' : 'Active';

    setStatusError('');
    setStatusUpdatingId(proj.id);
    setConfirmDialog(null);
    try {
      await updateProjectStatus(proj.id, newStatus, restoreMode || 'with_previous');
      await loadProjects();
      if (kind === 'complete') {
        setActiveTab('history');
        setCompletionNotice({ projectName: proj.name, projectId: proj.id });
      } else {
        setActiveTab('active');
        setCompletionNotice(null);
      }
    } catch (err) {
      console.error(`Failed to ${kind === 'complete' ? 'complete' : 'restore'} project:`, err);
      setStatusError(err.message || `Failed to ${kind === 'complete' ? 'mark project as complete' : 'restore project'}`);
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const searchedProjects = projects.filter(proj =>
    proj.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    proj.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Split into active (still running) vs history (completed/archived)
  const activeProjects = searchedProjects.filter(proj => !COMPLETED_STATUSES.includes(proj.status));
  const historyProjects = searchedProjects.filter(proj => COMPLETED_STATUSES.includes(proj.status));

  const sortProjects = (list) => [...list].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'status') return a.status.localeCompare(b.status);
    if (sortBy === 'startDate') return new Date(a.startDate) - new Date(b.startDate);
    return 0;
  });

  const filteredProjects = sortProjects(activeTab === 'history' ? historyProjects : activeProjects);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>My Projects</h1>
          <p style={styles.subtitle}>Create and manage projects, define skills requirements, and track approvals.</p>
        </div>
        <div style={styles.headerActions}>
          <div style={styles.controls}>
            <div style={styles.searchWrapper}>
              <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Search projects..."
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
              <option value="status">Sort by Status</option>
              <option value="startDate">Sort by Date</option>
            </select>
          </div>
          <button onClick={() => { resetFormData(); setShowCreateModal(true); }} style={styles.createBtn}>
            + New Project
          </button>
        </div>
      </div>

      {/* ✅ Tabs: Projects (active) / Project History (completed, restorable) */}
      <div style={styles.tabsRow}>
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          style={{ ...styles.tabBtn, ...(activeTab === 'active' ? styles.tabBtnActive : {}) }}
        >
          Projects
          <span style={{ ...styles.tabCount, ...(activeTab === 'active' ? styles.tabCountActive : {}) }}>
            {activeProjects.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          style={{ ...styles.tabBtn, ...(activeTab === 'history' ? styles.tabBtnActive : {}) }}
        >
          Project History
          <span style={{ ...styles.tabCount, ...(activeTab === 'history' ? styles.tabCountActive : {}) }}>
            {historyProjects.length}
          </span>
        </button>
      </div>

      {loadError && (
        <div className="glass-card" style={{ padding: '12px 16px', color: 'var(--color-danger)', fontSize: '13px', fontWeight: '600' }}>{loadError}</div>
      )}
      {statusError && (
        <div className="glass-card" style={{ padding: '12px 16px', color: 'var(--color-danger)', fontSize: '13px', fontWeight: '600' }}>{statusError}</div>
      )}

      {completionNotice && (
        <div className="glass-card" style={{
          padding: '16px 20px',
          marginBottom: '20px',
          borderRadius: '12px',
          backgroundColor: completionNotice.isCancelled ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
          border: completionNotice.isCancelled ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: completionNotice.isCancelled ? 'rgba(239, 68, 68, 0.16)' : 'rgba(16, 185, 129, 0.16)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: completionNotice.isCancelled ? '#ef4444' : '#10b981',
              flexShrink: 0,
            }}>
              {completionNotice.isCancelled ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              )}
            </div>
            <div>
              <div style={{ color: completionNotice.isCancelled ? '#ef4444' : '#10b981', fontWeight: '700', fontSize: '14px' }}>
                {completionNotice.isCancelled
                  ? `Project “${completionNotice.projectName}” has been cancelled.`
                  : `Project “${completionNotice.projectName}” marked as Completed!`}
              </div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginTop: '2px' }}>
                {completionNotice.isCancelled
                  ? `Reason: “${completionNotice.reason || 'No reason specified'}”. The project was moved to Project History and team members were unassigned.`
                  : 'A 100% completion progress report has been created and sent to the Weekly Progress Report page. Team members have been unassigned.'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {!completionNotice.isCancelled && onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('weekly-report')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: 'var(--color-primary)',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                View Weekly Report →
              </button>
            )}
            <button
              type="button"
              onClick={() => setCompletionNotice(null)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                backgroundColor: 'transparent',
                color: 'var(--color-text-secondary)',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Edit Success Notice Banner */}
      {editNotice && (
        <div style={{
          margin: '0 0 16px 0',
          padding: '12px 18px',
          borderRadius: '10px',
          backgroundColor: 'rgba(34, 197, 94, 0.12)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px', color: 'var(--color-success, #16a34a)' }}>✓</span>
            <span style={{ color: 'var(--color-text-primary)', fontSize: '13px', fontWeight: '600' }}>
              {editNotice}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setEditNotice(null)}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--color-text-secondary)',
              fontSize: '16px',
              cursor: 'pointer',
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Projects Grid */}
      <div style={styles.projectsGrid}>
        {filteredProjects.length === 0 ? (
          <div className="glass-card" style={styles.emptyCard}>
            {activeTab === 'history'
              ? 'No completed projects yet. Projects marked as complete will show up here.'
              : (projects.length === 0
                ? 'No projects found. Create one to get started!'
                : 'No active projects match your search.')}
          </div>
        ) : (
          filteredProjects.map(proj => {
            const primary = proj.requiredPrimarySkills || proj.requiredSkills || [];
            const secondary = proj.requiredSecondarySkills || [];
            const isSkillsExpanded = !!expandedSkillsMap[proj.id];
            const totalSkillsCount = primary.length + secondary.length;
            const hasMoreSkills = totalSkillsCount > 5;

            let visiblePrimary = primary;
            let visibleSecondary = secondary;
            if (hasMoreSkills && !isSkillsExpanded) {
              if (primary.length >= 5) {
                visiblePrimary = primary.slice(0, 5);
                visibleSecondary = [];
              } else {
                visiblePrimary = primary;
                visibleSecondary = secondary.slice(0, 5 - primary.length);
              }
            }
            const hiddenCount = totalSkillsCount - 5;

            return (
              <div key={proj.id} className="glass-card" style={styles.projCard}>
                <div style={styles.cardHeader}>
                  <h3 style={styles.projName}>{proj.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{
                      ...styles.statusBadge,
                      backgroundColor: proj.status === 'Active' 
                        ? 'var(--color-primary-light)' 
                        : (proj.status === 'Cancelled'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : (COMPLETED_STATUSES.includes(proj.status) 
                                ? 'rgba(148, 163, 184, 0.15)' 
                                : 'rgba(245, 158, 11, 0.1)')),
                      color: proj.status === 'Active' 
                        ? 'var(--color-success)' 
                        : (proj.status === 'Cancelled'
                            ? '#ef4444'
                            : (COMPLETED_STATUSES.includes(proj.status) 
                                ? 'var(--color-text-secondary)' 
                                : 'var(--color-warning)'))
                    }}>
                      {proj.status}
                    </span>
                    {proj.status === 'Active' && proj.isRestored && (
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: 'rgba(236, 72, 153, 0.15)',
                        color: '#ec4899',
                        fontWeight: '700',
                        letterSpacing: '0.5px',
                        border: '1px solid rgba(236, 72, 153, 0.3)',
                      }}>
                        RESTORED
                      </span>
                    )}
                  </div>
                </div>
                <p style={styles.projDesc}>{proj.description}</p>

                {/* ✅ Cancellation Reason Box in Project History */}
                {activeTab === 'history' && proj.status === 'Cancelled' && (
                  <div style={styles.cancellationReasonBox}>
                    <div style={styles.cancellationReasonHeader}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                      </svg>
                      <span style={styles.cancellationReasonLabel}>CANCELLATION REASON</span>
                    </div>
                    <div style={styles.cancellationReasonText}>
                      &ldquo;{proj.cancellationReason || 'No reason specified'}&rdquo;
                    </div>
                  </div>
                )}

                <div style={styles.metaRow}>
                  <div style={styles.metaCol}>
                    <span style={styles.metaLabel}>TIMELINE</span>
                    <span style={styles.metaVal}>{proj.startDate} to {proj.endDate}</span>
                  </div>
                  <div style={styles.metaCol}>
                    <span style={styles.metaLabel}>MANPOWER NEEDED</span>
                    <span style={styles.metaVal}>{proj.manpowerNeeded} requested</span>
                  </div>
                </div>

                <div style={styles.skillsSection}>
                  <span style={styles.metaLabel}>REQUIRED SKILLS / CERTS</span>
                  {primary.length === 0 && secondary.length === 0 ? (
                    <div style={styles.skillsContainer}>
                      <span style={styles.noSkillsText}>No specific skills defined</span>
                    </div>
                  ) : (
                    <div style={styles.skillsContainer}>
                      {visiblePrimary.map((skill, idx) => (
                        <span key={`p-${idx}`} style={styles.skillTag}>{skill}</span>
                      ))}
                      {visibleSecondary.map((skill, idx) => (
                        <span key={`s-${idx}`} style={styles.skillTagSecondary}>{skill}</span>
                      ))}
                      {hasMoreSkills && !isSkillsExpanded && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSkillsExpanded(proj.id);
                          }}
                          style={styles.moreSkillsBtn}
                          title={`Click to show all ${totalSkillsCount} skills`}
                        >
                          +{hiddenCount} more
                        </button>
                      )}
                      {hasMoreSkills && isSkillsExpanded && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSkillsExpanded(proj.id);
                          }}
                          style={styles.seeLessBtn}
                          title="Click to collapse skills"
                        >
                          See less
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* ✅ Client Feedback preview in Project History */}
                {activeTab === 'history' && (
                  <div style={styles.historyFeedbackCard}>
                    <div style={styles.historyFeedbackHeader}>
                      <span style={styles.metaLabel}>CLIENT FEEDBACK</span>
                      {proj.clientFeedback?.rating ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ color: '#f59e0b', fontSize: '13px', letterSpacing: '1px' }}>
                            {'★'.repeat(Math.min(5, Math.round(proj.clientFeedback.rating)))}
                            {'☆'.repeat(Math.max(0, 5 - Math.round(proj.clientFeedback.rating)))}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--color-text-primary)' }}>
                            {Number(proj.clientFeedback.rating).toFixed(1)} / 5
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                          Pending feedback
                        </span>
                      )}
                    </div>

                    {proj.clientFeedback ? (
                      <div>
                        <p style={styles.feedbackSnippet}>
                          &ldquo;{proj.clientFeedback.projectFeedback || proj.clientFeedback.deliverablesFeedback || 'Client submitted evaluation for this project.'}&rdquo;
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: '600' }}>
                            — {proj.clientFeedback.clientName || 'Client'}
                          </span>
                          {proj.clientFeedback.completedAt && (
                            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                              {new Date(proj.clientFeedback.completedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0, fontStyle: 'italic' }}>
                        No client review submitted yet.
                      </p>
                    )}
                  </div>
                )}

                {/* ✅ Complete / Restore / Edit / View Details action */}
                <div style={{
                  ...styles.cardFooterActions,
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  {activeTab === 'history' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenHistoryDetails(proj)}
                        style={styles.viewDetailsBtn}
                      >
                        👁 View Details
                      </button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(proj)}
                          style={styles.editBtn}
                        >
                          ✏ Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRestoreProject(proj)}
                          disabled={statusUpdatingId === proj.id}
                          style={styles.restoreBtn}
                        >
                          {statusUpdatingId === proj.id ? 'Restoring…' : '↺ Restore Project'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(proj)}
                        style={styles.editBtn}
                      >
                        ✏ Edit Project
                      </button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenCancelModal(proj)}
                          disabled={statusUpdatingId === proj.id}
                          style={styles.cancelProjectBtn}
                          title="Cancel this project"
                        >
                          ✕ Cancel Project
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCompleteProject(proj)}
                          disabled={statusUpdatingId === proj.id}
                          style={styles.completeBtn}
                        >
                          {statusUpdatingId === proj.id ? 'Updating…' : '✓ Mark as Complete'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-flex', alignSelf: 'center', background: 'var(--color-primary)', color: '#fff', borderRadius: '50%', width: '20px', height: '20px', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 'bold' }}>+</span>
                Create New Project
              </h2>
              <button onClick={() => setShowCreateModal(false)} style={styles.closeModalBtn}>&times;</button>
            </div>
            
            <form onSubmit={handleCreateSubmit} style={{ marginTop: 16 }}>
              {submitError && (
                <div style={{ padding: '12px 16px', marginBottom: 16, color: 'var(--color-danger)', fontSize: '13px', fontWeight: '600' }}>{submitError}</div>
              )}

              {/* Project Details Section */}
              <div style={styles.sectionContainer}>
                <div style={styles.sectionHeader}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" style={{ color: 'var(--color-primary)' }}>
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                  <span style={styles.sectionTitle}>Project Details</span>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Project Name <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                  <input 
                    type="text" 
                    value={formData.name} 
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                    style={styles.modalInput} 
                    placeholder="Enter project name"
                    required
                  />
                </div>

                <div style={styles.formRow}>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>Team Size <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                    <input 
                      type="number" 
                      min="1"
                      value={formData.teamSize} 
                      onChange={(e) => setFormData({ ...formData, teamSize: e.target.value })} 
                      style={styles.modalInput} 
                      placeholder="Number of team members"
                      required
                    />
                  </div>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>Duration (Days)</label>
                    <input 
                      type="text" 
                      value={formData.duration ? `${formData.duration} day${formData.duration === 1 ? '' : 's'}` : ''} 
                      readOnly
                      disabled
                      style={{ ...styles.modalInput, cursor: 'not-allowed', color: 'var(--color-text-muted)' }} 
                      placeholder="Auto-filled from start/end date"
                    />
                  </div>
                </div>

                <div style={styles.formRow}>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>Start Date <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                    <input 
                      type="date" 
                      value={formData.startDate} 
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value, duration: calculateDurationDays(e.target.value, formData.endDate) })} 
                      style={styles.modalInput} 
                      required
                    />
                  </div>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>End Date <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                    <input 
                      type="date" 
                      value={formData.endDate} 
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value, duration: calculateDurationDays(formData.startDate, e.target.value) })} 
                      style={styles.modalInput} 
                      required
                    />
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Project Description</label>
                  <textarea 
                    value={formData.description} 
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                    style={styles.modalTextarea} 
                    placeholder="Describe the project objectives and scope..."
                    required
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Priority <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                  <select 
                    value={formData.priority} 
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })} 
                    style={styles.modalSelect}
                    required
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>

              {/* Resource Requirements Section */}
              <div style={{ ...styles.sectionContainer, marginTop: '20px' }}>
                <div style={styles.sectionHeader}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" style={{ color: 'var(--color-success)' }}>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  <span style={styles.sectionTitle}>Resource Requirements</span>
                </div>

                {formData.resources.map((res, index) => {
                  const isPrimaryFocused = activeSkillFocus?.index === index && activeSkillFocus?.type === 'primary';
                  const isSecondaryFocused = activeSkillFocus?.index === index && activeSkillFocus?.type === 'secondary';
                  const showPrimarySuggestions = isPrimaryFocused && Boolean(res.primarySkillInput?.trim());
                  const showSecondarySuggestions = isSecondaryFocused && Boolean(res.secondarySkillInput?.trim());

                  return (
                    <div key={index} style={styles.resourceCard}>
                      <div style={styles.resourceCardHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)', fontWeight: '600', fontSize: '13px' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                          </svg>
                          Resource Requirement #{index + 1}
                        </div>
                        {formData.resources.length > 1 && (
                          <button type="button" onClick={() => handleRemoveResource(index)} style={styles.removeBtn}>Remove</button>
                        )}
                      </div>

                      <div style={styles.formRow}>
                        <div style={{ ...styles.formGroup, flex: 2 }}>
                          <label style={styles.formLabel}>Position/Role <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                          <input 
                            type="text" 
                            value={res.role} 
                            onChange={(e) => handleResourceChange(index, 'role', e.target.value)} 
                            style={styles.modalInput} 
                            placeholder="e.g., Frontend Developer"
                            required
                          />
                        </div>
                        <div style={{ ...styles.formGroup, flex: 1 }}>
                          <label style={styles.formLabel}>Quantity Needed <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                          <input 
                            type="number" 
                            min="1"
                            value={res.quantity} 
                            onChange={(e) => handleResourceChange(index, 'quantity', e.target.value)} 
                            style={styles.modalInput} 
                            required
                          />
                        </div>
                      </div>

                      {/* ✅ Primary Skills — required */}
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>Primary Skills <span style={{ color: 'var(--color-danger)' }}>*</span></label>

                        {res.primarySkills.length > 0 && (
                          <div style={styles.selectedSkillsContainer}>
                            {res.primarySkills.map((skill, idx) => (
                              <span key={idx} style={styles.selectedSkillTag}>
                                {skill}
                                <button 
                                  type="button" 
                                  onClick={() => handleRemoveSkill(index, 'primary', skill)}
                                  style={styles.removeSkillBtn}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        <div style={{ position: 'relative' }}>
                          <input 
                            type="text" 
                            value={res.primarySkillInput || ''}
                            onChange={(e) => handleSkillInputChange(index, 'primary', e.target.value)}
                            onKeyDown={(e) => handleSkillKeyDown(index, 'primary', e)}
                            onFocus={() => {
                              setActiveSkillFocus({ index, type: 'primary' });
                              const val = res.primarySkillInput || '';
                              if (val.trim()) {
                                searchSkillsDynamic(val, res.primarySkills);
                              }
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                setActiveSkillFocus(prev => (prev?.index === index && prev?.type === 'primary' ? null : prev));
                              }, 200);
                            }}
                            style={styles.modalInput}
                            placeholder="Type skill and press comma or Enter..."
                            required={res.primarySkills.length === 0}
                          />

                          {showPrimarySuggestions && (
                            <div style={styles.suggestionsDropdown}>
                              {isSearchingSkills && dynamicSuggestions.length === 0 && (
                                <div style={{ ...styles.suggestionItem, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                                  Searching database skills...
                                </div>
                              )}
                              {!isSearchingSkills && dynamicSuggestions.length === 0 && (
                                <div style={{ ...styles.suggestionItem, color: 'var(--color-text-muted)', fontStyle: 'italic', cursor: 'default' }}>
                                  No database skills found (press comma or Enter to add)
                                </div>
                              )}
                              {dynamicSuggestions.map((skill) => (
                                <div
                                  key={skill.id}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSelectSkill(index, 'primary', skill.skill_name);
                                  }}
                                  style={styles.suggestionItem}
                                >
                                  {skill.skill_name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <span style={styles.inputHelp}>Must-have skills. Type a skill and press <strong>comma ( , )</strong> or <strong>Enter</strong> to add.</span>
                      </div>

                      {/* ✅ Secondary Skills — optional */}
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>Secondary Skills</label>

                        {res.secondarySkills.length > 0 && (
                          <div style={styles.selectedSkillsContainer}>
                            {res.secondarySkills.map((skill, idx) => (
                              <span key={idx} style={styles.selectedSkillTagSecondary}>
                                {skill}
                                <button 
                                  type="button" 
                                  onClick={() => handleRemoveSkill(index, 'secondary', skill)}
                                  style={styles.removeSkillBtnSecondary}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        <div style={{ position: 'relative' }}>
                          <input 
                            type="text" 
                            value={res.secondarySkillInput || ''}
                            onChange={(e) => handleSkillInputChange(index, 'secondary', e.target.value)}
                            onKeyDown={(e) => handleSkillKeyDown(index, 'secondary', e)}
                            onFocus={() => {
                              setActiveSkillFocus({ index, type: 'secondary' });
                              const val = res.secondarySkillInput || '';
                              if (val.trim()) {
                                searchSkillsDynamic(val, res.secondarySkills);
                              }
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                setActiveSkillFocus(prev => (prev?.index === index && prev?.type === 'secondary' ? null : prev));
                              }, 200);
                            }}
                            style={styles.modalInput}
                            placeholder="Type skill and press comma or Enter..."
                          />

                          {showSecondarySuggestions && (
                            <div style={styles.suggestionsDropdown}>
                              {isSearchingSkills && dynamicSuggestions.length === 0 && (
                                <div style={{ ...styles.suggestionItem, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                                  Searching database skills...
                                </div>
                              )}
                              {!isSearchingSkills && dynamicSuggestions.length === 0 && (
                                <div style={{ ...styles.suggestionItem, color: 'var(--color-text-muted)', fontStyle: 'italic', cursor: 'default' }}>
                                  No database skills found (press comma or Enter to add)
                                </div>
                              )}
                              {dynamicSuggestions.map((skill) => (
                                <div
                                  key={skill.id}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSelectSkill(index, 'secondary', skill.skill_name);
                                  }}
                                  style={styles.suggestionItem}
                                >
                                  {skill.skill_name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <span style={styles.inputHelp}>Nice-to-have skills. Type a skill and press <strong>comma ( , )</strong> or <strong>Enter</strong> to add.</span>
                      </div>

                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>Justification / Requirements</label>
                        <textarea 
                          value={res.justification} 
                          onChange={(e) => handleResourceChange(index, 'justification', e.target.value)} 
                          style={styles.modalTextarea} 
                          placeholder="Why is this resource needed? What will they work on?"
                        />
                      </div>
                    </div>
                  );
                })}

                <button type="button" onClick={handleAddResource} style={styles.addResourceBtn}>
                  + Add Another Resource Requirement
                </button>
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isCreatingProject}
                  style={{
                    ...styles.cancelBtn,
                    opacity: isCreatingProject ? 0.6 : 1,
                    cursor: isCreatingProject ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingProject}
                  style={{
                    ...styles.saveBtn,
                    opacity: isCreatingProject ? 0.8 : 1,
                    cursor: isCreatingProject ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    justifyContent: 'center',
                  }}
                >
                  {isCreatingProject ? (
                    <>
                      <span style={{
                        width: '14px',
                        height: '14px',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#ffffff',
                        borderRadius: '50%',
                        display: 'inline-block',
                        animation: 'spin 0.8s linear infinite',
                      }} />
                      Creating Project...
                    </>
                  ) : (
                    'Create Project'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ✅ Edit Project Modal */}
      {editingProject && (
        <div style={styles.modalOverlay} onClick={() => setEditingProject(null)}>
          <div
            className="glass-card"
            style={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-flex', alignSelf: 'center', background: 'var(--color-primary)', color: '#fff', borderRadius: '50%', width: '24px', height: '24px', alignItems: 'center', justifyContent: 'center', fontSize: '13px' }}>
                  ✏
                </span>
                Edit Project — {editingProject.name}
              </h2>
              <button onClick={() => setEditingProject(null)} style={styles.closeModalBtn}>&times;</button>
            </div>

            <form onSubmit={handleEditSubmit} style={{ marginTop: 16 }}>
              {editError && (
                <div style={{ padding: '12px 16px', marginBottom: 16, color: 'var(--color-danger)', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', fontSize: '13px', fontWeight: '600' }}>
                  {editError}
                </div>
              )}

              <div style={styles.sectionContainer}>
                <div style={styles.sectionHeader}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                  <span style={styles.sectionTitle}>Project Information</span>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Project Name <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                  <input 
                    type="text" 
                    value={editFormData.name} 
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} 
                    style={styles.modalInput} 
                    placeholder="Enter project name"
                    required
                  />
                </div>

                <div style={styles.formRow}>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>Team Size <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                    <input 
                      type="number" 
                      min="1"
                      value={editFormData.teamSize} 
                      onChange={(e) => setEditFormData({ ...editFormData, teamSize: e.target.value })} 
                      style={styles.modalInput} 
                      placeholder="Number of team members"
                      required
                    />
                  </div>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>Duration (Days)</label>
                    <input 
                      type="text" 
                      value={editFormData.duration ? `${editFormData.duration} day${editFormData.duration == 1 ? '' : 's'}` : ''} 
                      readOnly
                      disabled
                      style={{ ...styles.modalInput, cursor: 'not-allowed', color: 'var(--color-text-muted)' }} 
                      placeholder="Auto-calculated from timeline"
                    />
                  </div>
                </div>

                <div style={styles.formRow}>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>Start Date <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                    <input 
                      type="date" 
                      value={editFormData.startDate} 
                      onChange={(e) => setEditFormData({ ...editFormData, startDate: e.target.value, duration: calculateDurationDays(e.target.value, editFormData.endDate) })} 
                      style={styles.modalInput} 
                      required
                    />
                  </div>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>End Date <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                    <input 
                      type="date" 
                      value={editFormData.endDate} 
                      onChange={(e) => setEditFormData({ ...editFormData, endDate: e.target.value, duration: calculateDurationDays(editFormData.startDate, e.target.value) })} 
                      style={styles.modalInput} 
                      required
                    />
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Project Description</label>
                  <textarea 
                    value={editFormData.description} 
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })} 
                    style={styles.modalTextarea} 
                    placeholder="Describe the project objectives and scope..."
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Priority <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                  <select 
                    value={editFormData.priority} 
                    onChange={(e) => setEditFormData({ ...editFormData, priority: e.target.value })} 
                    style={styles.modalSelect}
                    required
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>

              <div style={styles.modalActions}>
                <button 
                  type="button" 
                  onClick={() => setEditingProject(null)} 
                  style={styles.cancelBtn}
                  disabled={editSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  style={{ ...styles.saveBtn, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  disabled={editSubmitting}
                >
                  {editSubmitting ? 'Saving Changes…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ✅ Custom Confirm Dialog — replaces native window.confirm() */}
      {confirmDialog && (
        <div style={styles.confirmOverlay} onClick={() => setConfirmDialog(null)}>
          <div
            className="glass-card"
            style={styles.confirmCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                ...styles.confirmIconWrap,
                background: confirmDialog.kind === 'complete' ? 'rgba(34, 197, 94, 0.12)' : 'var(--color-primary-light)',
                color: confirmDialog.kind === 'complete' ? 'var(--color-success)' : 'var(--color-primary)',
              }}
            >
              {confirmDialog.kind === 'complete' ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6 9 17l-5-5"></path>
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 12a9 9 0 1 0 3-6.7"></path>
                  <path d="M3 4v5h5"></path>
                </svg>
              )}
            </div>

            <h3 style={styles.confirmTitle}>
              {confirmDialog.kind === 'complete' ? 'Mark project as complete?' : 'Restore this project?'}
            </h3>
            <p style={styles.confirmMessage}>
              {confirmDialog.kind === 'complete' ? (
                <>Mark <strong>"{confirmDialog.project.name}"</strong> as complete? It will move to Project History and can be restored later.</>
              ) : (
                <>Restore <strong>"{confirmDialog.project.name}"</strong> back to Active projects. Select your restoration option below:</>
              )}
            </p>

            {confirmDialog.kind === 'restore' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', marginTop: '12px', marginBottom: '16px', textAlign: 'left' }}>
                <label 
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: confirmDialog.restoreMode === 'with_previous' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    backgroundColor: confirmDialog.restoreMode === 'with_previous' ? 'rgba(59, 130, 246, 0.08)' : 'var(--color-bg-root)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => setConfirmDialog(prev => ({ ...prev, restoreMode: 'with_previous' }))}
                >
                  <input
                    type="radio"
                    name="restoreMode"
                    value="with_previous"
                    checked={confirmDialog.restoreMode === 'with_previous'}
                    onChange={() => {}}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--color-text-primary)' }}>
                      Restore with Previous Employees & Tasks
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                      Keep previous employee assignments and tasks. Project will resume with existing team members and assignments.
                    </div>
                  </div>
                </label>

                <label 
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: confirmDialog.restoreMode === 'as_new' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    backgroundColor: confirmDialog.restoreMode === 'as_new' ? 'rgba(59, 130, 246, 0.08)' : 'var(--color-bg-root)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => setConfirmDialog(prev => ({ ...prev, restoreMode: 'as_new' }))}
                >
                  <input
                    type="radio"
                    name="restoreMode"
                    value="as_new"
                    checked={confirmDialog.restoreMode === 'as_new'}
                    onChange={() => {}}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--color-text-primary)' }}>
                      Restore as New Project
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                      Archives previous assignments and tasks (preserved for history). You can assign new employees or create a Resource Request for the RM.
                    </div>
                  </div>
                </label>
              </div>
            )}

            <div style={styles.confirmActions}>
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                style={styles.confirmCancelBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runConfirmedStatusChange}
                style={{
                  ...styles.confirmOkBtn,
                  backgroundColor: confirmDialog.kind === 'complete' ? 'var(--color-success)' : 'var(--color-primary)',
                }}
              >
                {confirmDialog.kind === 'complete' ? 'Mark as Complete' : 'Restore Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Project Modal */}
      {cancelModal.isOpen && cancelModal.project && (
        <div style={styles.modalOverlay} onClick={handleCloseCancelModal}>
          <div
            className="glass-card"
            style={{ ...styles.modalCard, maxWidth: '520px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}>
                  ✕
                </span>
                Cancel Project
              </h2>
              <button
                type="button"
                onClick={handleCloseCancelModal}
                disabled={cancelModal.isSubmitting}
                style={styles.closeModalBtn}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleConfirmCancelProject} style={{ marginTop: '16px' }}>
              <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', margin: '0 0 16px 0', lineHeight: '1.5' }}>
                Are you sure you want to cancel <strong style={{ color: 'var(--color-text-primary)' }}>&ldquo;{cancelModal.project.name}&rdquo;</strong>? This project will be marked as <span style={{ color: '#ef4444', fontWeight: '700' }}>Cancelled</span>, unassigned from team members, and moved to the <strong>Project History</strong> tab.
              </p>

              {cancelModal.error && (
                <div style={{
                  padding: '10px 14px',
                  marginBottom: '16px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  fontSize: '13px',
                  fontWeight: '600',
                }}>
                  {cancelModal.error}
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>
                  Reason for Cancellation <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <textarea
                  value={cancelModal.reason}
                  onChange={(e) => setCancelModal(prev => ({ ...prev, reason: e.target.value, error: '' }))}
                  placeholder="e.g., Client postponed the project, Budget constraints, Scope change, etc."
                  rows={4}
                  required
                  disabled={cancelModal.isSubmitting}
                  style={{
                    ...styles.modalTextarea,
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  }}
                  autoFocus
                />
                <span style={styles.inputHelp}>
                  Please provide a clear reason. This will be recorded and displayed in the Project History tab.
                </span>
              </div>

              <div style={{ ...styles.modalActions, marginTop: '24px' }}>
                <button
                  type="button"
                  onClick={handleCloseCancelModal}
                  disabled={cancelModal.isSubmitting}
                  style={{
                    ...styles.cancelBtn,
                    opacity: cancelModal.isSubmitting ? 0.6 : 1,
                    cursor: cancelModal.isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Keep Project
                </button>
                <button
                  type="submit"
                  disabled={cancelModal.isSubmitting || !cancelModal.reason.trim()}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#ef4444',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: (cancelModal.isSubmitting || !cancelModal.reason.trim()) ? 'not-allowed' : 'pointer',
                    opacity: (cancelModal.isSubmitting || !cancelModal.reason.trim()) ? 0.6 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {cancelModal.isSubmitting ? (
                    <>
                      <span style={{
                        width: '14px',
                        height: '14px',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#ffffff',
                        borderRadius: '50%',
                        display: 'inline-block',
                        animation: 'spin 0.8s linear infinite',
                      }} />
                      Cancelling Project...
                    </>
                  ) : (
                    '✕ Confirm Cancellation'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ✅ Project History Details Modal (Client Feedback, Employees & Task Status) */}
      {historyDetailsModal.isOpen && (
        <div style={styles.modalOverlay} onClick={handleCloseHistoryDetails}>
          <div
            className="glass-card"
            style={{
              ...styles.modalCard,
              maxWidth: '840px',
              maxHeight: '88vh',
              padding: '24px 28px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={styles.modalHeader}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800' }}>
                    {historyDetailsModal.project?.name}
                  </h2>
                  <span style={{
                    ...styles.statusBadge,
                    backgroundColor: 'rgba(148, 163, 184, 0.15)',
                    color: 'var(--color-text-secondary)',
                  }}>
                    {historyDetailsModal.project?.status || 'Completed'}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  Project History &bull; Client Feedback &bull; Assigned Personnel &amp; Task Completion Status
                </p>
              </div>
              <button onClick={handleCloseHistoryDetails} style={styles.closeModalBtn}>&times;</button>
            </div>

            {/* Loading state */}
            {historyDetailsModal.loading && (
              <div style={{ padding: '50px 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                <div style={{ fontSize: '28px', marginBottom: '10px' }}>⏳</div>
                <p style={{ fontSize: '14px', fontWeight: '600', margin: 0 }}>
                  Loading project details, client review, and task history...
                </p>
              </div>
            )}

            {/* Error state */}
            {!historyDetailsModal.loading && historyDetailsModal.error && (
              <div style={{
                padding: '14px 18px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: 'var(--color-danger)',
                fontSize: '13px',
                fontWeight: '600',
              }}>
                {historyDetailsModal.error}
              </div>
            )}

            {/* Content */}
            {!historyDetailsModal.loading && historyDetailsModal.data && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', paddingRight: '4px' }}>

                {/* 1. OVERALL CLIENT FEEDBACK */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(245, 158, 11, 0.02) 100%)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: '12px',
                  padding: '18px 20px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '18px' }}>🌟</span>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--color-text-primary)' }}>
                          Overall Client Feedback &amp; Rating
                        </h3>
                      </div>
                      {historyDetailsModal.data.clientFeedback?.clientName && (
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                          Submitted by <strong>{historyDetailsModal.data.clientFeedback.clientName}</strong> ({historyDetailsModal.data.clientFeedback.clientEmail})
                          {historyDetailsModal.data.clientFeedback.completedAt && ` on ${new Date(historyDetailsModal.data.clientFeedback.completedAt).toLocaleDateString()}`}
                        </p>
                      )}
                    </div>

                    {historyDetailsModal.data.clientFeedback?.rating ? (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(245, 158, 11, 0.15)',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                      }}>
                        <span style={{ color: '#f59e0b', fontSize: '17px', letterSpacing: '2px' }}>
                          {'★'.repeat(Math.min(5, Math.round(historyDetailsModal.data.clientFeedback.rating)))}
                          {'☆'.repeat(Math.max(0, 5 - Math.round(historyDetailsModal.data.clientFeedback.rating)))}
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: '800', color: '#b45309' }}>
                          {Number(historyDetailsModal.data.clientFeedback.rating).toFixed(1)} / 5.0
                        </span>
                      </div>
                    ) : (
                      <span style={{
                        fontSize: '12px',
                        color: 'var(--color-text-muted)',
                        fontStyle: 'italic',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        background: 'var(--color-bg-card)',
                      }}>
                        No overall rating recorded
                      </span>
                    )}
                  </div>

                  {historyDetailsModal.data.clientFeedback ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {historyDetailsModal.data.clientFeedback.projectFeedback && (
                        <div style={{
                          background: 'var(--color-bg-card)',
                          padding: '12px 16px',
                          borderRadius: '8px',
                          borderLeft: '4px solid #f59e0b',
                          fontSize: '13px',
                          color: 'var(--color-text-primary)',
                          lineHeight: '1.6',
                          fontStyle: 'italic',
                        }}>
                          &ldquo;{historyDetailsModal.data.clientFeedback.projectFeedback}&rdquo;
                        </div>
                      )}
                      {historyDetailsModal.data.clientFeedback.deliverablesFeedback && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                          <strong>Deliverables Evaluation:</strong> {historyDetailsModal.data.clientFeedback.deliverablesFeedback}
                        </div>
                      )}
                      {historyDetailsModal.data.clientFeedback.additionalComments && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                          <strong>Additional Comments:</strong> {historyDetailsModal.data.clientFeedback.additionalComments}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                      No client feedback has been submitted for this project yet.
                    </p>
                  )}
                </div>

                {/* 2. TASK EXECUTION SUMMARY */}
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '12px', color: 'var(--color-text-primary)' }}>
                    Task Execution Overview
                  </h3>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '12px',
                    marginBottom: '14px',
                  }}>
                    <div className="glass-card" style={{ padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                      <span style={styles.metaLabel}>ASSIGNED PERSONNEL</span>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)', marginTop: '4px' }}>
                        {historyDetailsModal.data.summary?.totalTeamMembers || 0}
                      </div>
                    </div>
                    <div className="glass-card" style={{ padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                      <span style={styles.metaLabel}>TOTAL TASKS</span>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)', marginTop: '4px' }}>
                        {historyDetailsModal.data.summary?.totalTasks || 0}
                      </div>
                    </div>
                    <div className="glass-card" style={{ padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                      <span style={{ ...styles.metaLabel, color: 'var(--color-success)' }}>COMPLETED TASKS</span>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-success)', marginTop: '4px' }}>
                        {historyDetailsModal.data.summary?.completedTasks || 0}
                      </div>
                    </div>
                    <div className="glass-card" style={{ padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                      <span style={{ ...styles.metaLabel, color: '#f59e0b' }}>PENDING WHEN CLOSED</span>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: '#f59e0b', marginTop: '4px' }}>
                        {historyDetailsModal.data.summary?.pendingTasks || 0}
                      </div>
                    </div>
                  </div>

                  {/* Completion Progress Bar */}
                  <div style={{
                    background: 'var(--color-bg-card)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    border: '1px solid var(--color-border)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '700', marginBottom: '6px' }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>Overall Task Completion Rate</span>
                      <span style={{ color: historyDetailsModal.data.summary?.completionPercentage === 100 ? 'var(--color-success)' : 'var(--color-primary)' }}>
                        {historyDetailsModal.data.summary?.completionPercentage || 0}%
                      </span>
                    </div>
                    <div style={{ height: '8px', width: '100%', background: 'rgba(148, 163, 184, 0.2)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${historyDetailsModal.data.summary?.completionPercentage || 0}%`,
                        background: historyDetailsModal.data.summary?.completionPercentage === 100 ? 'var(--color-success)' : 'var(--color-primary)',
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                  </div>
                </div>

                {/* 3. ASSIGNED EMPLOYEES & THEIR TASKS */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: 'var(--color-text-primary)' }}>
                      Assigned Employees &amp; Task Breakdown
                    </h3>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {historyDetailsModal.data.employees?.length || 0} Member{historyDetailsModal.data.employees?.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {(!historyDetailsModal.data.employees || historyDetailsModal.data.employees.length === 0) ? (
                    <div className="glass-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                      No employees were assigned or had tasks recorded for this project.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {historyDetailsModal.data.employees.map((emp) => (
                        <div
                          key={emp.id}
                          className="glass-card"
                          style={{
                            padding: '16px',
                            borderRadius: '10px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-bg-card)',
                          }}
                        >
                          {/* Employee Header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <img
                                src={emp.avatar}
                                alt={emp.name}
                                style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                              />
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                                    {emp.name}
                                  </span>
                                  <span style={{
                                    fontSize: '11px',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    background: 'var(--color-primary-light)',
                                    color: 'var(--color-primary)',
                                    fontWeight: '600',
                                  }}>
                                    {emp.role}
                                  </span>
                                </div>
                                {emp.department && (
                                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                    {emp.department}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Client Rating & Task stats for employee */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {emp.clientRating && (
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  background: 'rgba(245, 158, 11, 0.12)',
                                  padding: '4px 10px',
                                  borderRadius: '16px',
                                }}>
                                  <span style={{ color: '#f59e0b', fontSize: '13px' }}>★</span>
                                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#b45309' }}>
                                    {Number(emp.clientRating).toFixed(1)} / 5
                                  </span>
                                </div>
                              )}
                              <span style={{
                                fontSize: '11px',
                                fontWeight: '700',
                                color: emp.totalTasks === 0
                                  ? 'var(--color-text-muted)'
                                  : (emp.pendingTasks > 0 ? '#d97706' : 'var(--color-success)'),
                                background: emp.totalTasks === 0
                                  ? 'rgba(148, 163, 184, 0.1)'
                                  : (emp.pendingTasks > 0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(34, 197, 94, 0.1)'),
                                padding: '4px 10px',
                                borderRadius: '14px',
                              }}>
                                {emp.totalTasks === 0
                                  ? 'No tasks assigned'
                                  : `${emp.completedTasks} / ${emp.totalTasks} task${emp.totalTasks === 1 ? '' : 's'} completed`}
                              </span>
                            </div>
                          </div>

                          {/* Employee's Task list */}
                          {emp.tasks && emp.tasks.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {emp.tasks.map((task) => (
                                <div
                                  key={task.id}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    background: task.isCompleted ? 'rgba(34, 197, 94, 0.04)' : 'rgba(245, 158, 11, 0.04)',
                                    border: `1px solid ${task.isCompleted ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.25)'}`,
                                    gap: '12px',
                                  }}
                                >
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                      <span style={{
                                        fontSize: '13px',
                                        fontWeight: '700',
                                        color: 'var(--color-text-primary)',
                                      }}>
                                        {task.title}
                                      </span>
                                      {task.priority && (
                                        <span style={{
                                          fontSize: '10px',
                                          fontWeight: '700',
                                          padding: '2px 6px',
                                          borderRadius: '4px',
                                          textTransform: 'uppercase',
                                          background: task.priority === 'High' || task.priority === 'Urgent'
                                            ? 'rgba(239, 68, 68, 0.15)'
                                            : 'rgba(148, 163, 184, 0.15)',
                                          color: task.priority === 'High' || task.priority === 'Urgent'
                                            ? 'var(--color-danger)'
                                            : 'var(--color-text-secondary)',
                                        }}>
                                          {task.priority}
                                        </span>
                                      )}
                                    </div>
                                    {task.description && (
                                      <p style={{
                                        margin: 0,
                                        fontSize: '12px',
                                        color: 'var(--color-text-secondary)',
                                        lineHeight: '1.4',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}>
                                        {task.description}
                                      </p>
                                    )}
                                    {task.dueDate && (
                                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'block', marginTop: '2px' }}>
                                        Due: {task.dueDate}
                                      </span>
                                    )}
                                  </div>

                                  {/* Task Status badge */}
                                  <div>
                                    {task.isCompleted ? (
                                      <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 10px',
                                        borderRadius: '16px',
                                        fontSize: '11px',
                                        fontWeight: '800',
                                        background: 'rgba(34, 197, 94, 0.12)',
                                        color: '#16a34a',
                                        border: '1px solid rgba(34, 197, 94, 0.3)',
                                      }}>
                                        <span>✓</span> Completed
                                      </span>
                                    ) : (
                                      <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 10px',
                                        borderRadius: '16px',
                                        fontSize: '11px',
                                        fontWeight: '800',
                                        background: 'rgba(245, 158, 11, 0.12)',
                                        color: '#d97706',
                                        border: '1px solid rgba(245, 158, 11, 0.3)',
                                      }}>
                                        <span>⏳</span> Pending when closed
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                              No tasks logged for this member under this project.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
              <button
                type="button"
                onClick={handleCloseHistoryDetails}
                style={{
                  background: 'var(--color-bg-card-hover)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  padding: '8px 20px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
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
  },
  headerActions: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  },
  controls: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
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
  tabsRow: {
    display: 'flex',
    gap: '8px',
    borderBottom: '1px solid var(--color-border)',
    marginTop: '-8px',
  },
  tabBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '10px 4px',
    marginRight: '16px',
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  tabBtnActive: {
    color: 'var(--color-primary)',
    borderBottom: '2px solid var(--color-primary)',
  },
  tabCount: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: '30px',
    background: 'var(--color-bg-card-hover)',
    color: 'var(--color-text-muted)',
  },
  tabCountActive: {
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
  },
  projectsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: '24px',
  },
  projCard: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: '260px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '12px',
  },
  projName: {
    fontSize: '18px',
    fontWeight: '700',
    lineHeight: '1.3',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '4px 10px',
    borderRadius: '30px',
    whiteSpace: 'nowrap',
  },
  projDesc: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.6',
    marginBottom: '20px',
  },
  metaRow: {
    display: 'flex',
    gap: '20px',
    marginBottom: '16px',
    borderTop: '1px solid var(--color-border)',
    paddingTop: '16px',
  },
  metaCol: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  metaLabel: {
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  metaVal: {
    fontSize: '12px',
    color: 'var(--color-text-primary)',
    fontWeight: '600',
  },
  skillsSection: {
    borderTop: '1px solid var(--color-border)',
    paddingTop: '16px',
  },
  skillsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '6px',
  },
  skillTag: {
    fontSize: '11px',
    padding: '4px 10px',
    borderRadius: '30px',
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    fontWeight: '600',
  },
  skillTagSecondary: {
    fontSize: '11px',
    padding: '4px 10px',
    borderRadius: '30px',
    background: 'rgba(148, 163, 184, 0.15)',
    color: 'var(--color-text-muted)',
    fontWeight: '600',
  },
  moreSkillsBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-primary, #10b981)',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    padding: '4px 6px',
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '4px',
    transition: 'all 0.15s ease',
    lineHeight: '1',
  },
  seeLessBtn: {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1.5px solid rgba(255, 255, 255, 0.75)',
    borderRadius: '20px',
    color: 'var(--color-primary, #10b981)',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    padding: '3px 12px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    lineHeight: '1.2',
  },
  noSkillsText: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
  },
  cardFooterActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '16px',
    borderTop: '1px solid var(--color-border)',
    paddingTop: '16px',
  },
  completeBtn: {
    backgroundColor: 'var(--color-success)',
    color: '#ffffff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '700',
  },
  editBtn: {
    backgroundColor: 'transparent',
    border: '1px solid var(--color-primary, #2563eb)',
    color: 'var(--color-primary, #2563eb)',
    padding: '8px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '700',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.2s ease',
  },
  restoreBtn: {
    backgroundColor: 'transparent',
    border: '1px solid var(--color-primary)',
    color: 'var(--color-primary)',
    padding: '8px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '700',
  },
  viewDetailsBtn: {
    backgroundColor: 'var(--color-primary-light)',
    border: '1px solid var(--color-primary)',
    color: 'var(--color-primary)',
    padding: '8px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '700',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.2s ease',
  },
  historyFeedbackCard: {
    marginTop: '16px',
    padding: '12px',
    borderRadius: '8px',
    background: 'rgba(245, 158, 11, 0.05)',
    border: '1px solid rgba(245, 158, 11, 0.2)',
  },
  historyFeedbackHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  feedbackSnippet: {
    fontSize: '12px',
    color: 'var(--color-text-primary)',
    fontStyle: 'italic',
    lineHeight: '1.5',
    margin: '4px 0',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  emptyCard: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '40px 0',
    color: 'var(--color-text-muted)',
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
    maxWidth: '760px',
    maxHeight: '85vh',
    overflowY: 'auto',
    padding: '28px',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '12px',
    marginBottom: '20px',
  },
  closeModalBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: 'var(--color-text-muted)',
  },
  // ── Custom confirm dialog ──────────────────────────────────────────
  confirmOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    padding: '16px',
  },
  confirmCard: {
    width: '100%',
    maxWidth: '400px',
    padding: '28px',
    textAlign: 'left',
  },
  confirmIconWrap: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  confirmTitle: {
    fontSize: '17px',
    fontWeight: '800',
    color: 'var(--color-text-primary)',
    marginBottom: '8px',
  },
  confirmMessage: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.6',
    marginBottom: '24px',
  },
  confirmActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
  },
  confirmCancelBtn: {
    background: 'transparent',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    padding: '10px 18px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '700',
  },
  confirmOkBtn: {
    color: '#ffffff',
    border: 'none',
    padding: '10px 18px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '700',
  },
  sectionContainer: {
    backgroundColor: 'var(--color-bg-card-hover)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '20px',
    textAlign: 'left',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '8px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  resourceCard: {
    backgroundColor: 'var(--color-bg-root)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  },
  resourceCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    borderBottom: '1px dotted var(--color-border)',
    paddingBottom: '8px',
  },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-danger)',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  addResourceBtn: {
    width: '100%',
    padding: '12px',
    border: '2px dashed var(--color-primary)',
    background: 'transparent',
    color: 'var(--color-primary)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '700',
    fontSize: '13px',
    transition: 'all 0.2s',
    marginTop: '8px',
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
  modalTextarea: {
    width: '100%',
    height: '100px',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    resize: 'none',
  },
  inputHelp: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    marginTop: '4px',
    display: 'block',
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
  },
  // Autocomplete styles
  suggestionsDropdown: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    maxHeight: '200px',
    overflowY: 'auto',
    zIndex: 1000,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  },
  suggestionItem: {
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '13px',
    color: 'var(--color-text-primary)',
    borderBottom: '1px solid var(--color-border)',
  },
  selectedSkillsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginBottom: '8px',
  },
  selectedSkillTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    padding: '4px 8px',
    borderRadius: '4px',
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    fontWeight: '600',
  },
  removeSkillBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-primary)',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '0 2px',
    display: 'flex',
    alignItems: 'center',
    fontWeight: 'bold',
  },
  selectedSkillTagSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    padding: '4px 8px',
    borderRadius: '4px',
    background: 'rgba(148, 163, 184, 0.15)',
    color: 'var(--color-text-muted)',
    fontWeight: '600',
  },
  removeSkillBtnSecondary: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '0 2px',
    display: 'flex',
    alignItems: 'center',
    fontWeight: 'bold',
  },
  cancelProjectBtn: {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    color: '#ef4444',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  cancellationReasonBox: {
    padding: '10px 14px',
    margin: '12px 0',
    borderRadius: '8px',
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
  },
  cancellationReasonHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  cancellationReasonLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#ef4444',
    letterSpacing: '0.5px',
  },
  cancellationReasonText: {
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
    fontStyle: 'italic',
    marginTop: '4px',
    lineHeight: '1.4',
  },
};