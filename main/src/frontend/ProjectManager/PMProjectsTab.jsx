import React, { useState, useEffect } from 'react';
import { getProjects, createProject, getSkills, updateProjectStatus } from './pmApi';

// Statuses that count as "done" and belong in the Project History tab.
const COMPLETED_STATUSES = ['Completed', 'Archived'];

const calculateDurationDays = (startDate, endDate) => {
  if (!startDate || !endDate) return '';
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return '';
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
};

export default function PMProjectsTab({ user }) {
  const [projects, setProjects] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');

  // ✅ Tabs: "active" (Projects) vs "history" (Project History / completed)
  const [activeTab, setActiveTab] = useState('active');
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [statusError, setStatusError] = useState('');

  // ✅ Custom confirm modal (replaces browser window.confirm) for
  // "Mark as Complete" / "Restore Project" actions.
  const [confirmDialog, setConfirmDialog] = useState(null); // { project, kind: 'complete' | 'restore' }

  // Skills state for autocomplete
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

  // ✅ Fetch all skills from database on mount - using getSkills from pmApi
  useEffect(() => {
    const fetchSkills = async () => {
      setIsLoadingSkills(true);
      try {
        const data = await getSkills();
        if (data) {
          setAllSkills(data || []);
          console.log('✅ Skills loaded:', data.length);
        }
      } catch (error) {
        console.error('Error fetching skills:', error);
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
        return;
      }
    }

    // Update the input value
    setFormData(prev => {
      const updated = [...prev.resources];
      updated[index] = { ...updated[index], [inputField]: value };
      return { ...prev, resources: updated };
    });
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
      }
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
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.description) return;

    setSubmitError('');
    try {
      // Convert skill arrays to comma-separated strings for backend
      const resourcesWithSkills = formData.resources.map(res => ({
        ...res,
        primarySkills: res.primarySkills.join(', '),
        secondarySkills: res.secondarySkills.join(', '),
      }));

      await createProject({
        name: formData.name,
        description: formData.description,
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
    }
  };

  // ✅ Open the styled confirm dialog instead of the native browser confirm()
  const handleCompleteProject = (proj) => {
    setConfirmDialog({ project: proj, kind: 'complete' });
  };

  const handleRestoreProject = (proj) => {
    setConfirmDialog({ project: proj, kind: 'restore' });
  };

  // ✅ Runs after the user confirms in the custom dialog. Marks a project
  // Complete (-> Project History) or restores it back to Active.
  const runConfirmedStatusChange = async () => {
    if (!confirmDialog) return;
    const { project: proj, kind } = confirmDialog;
    const newStatus = kind === 'complete' ? 'Completed' : 'Active';

    setStatusError('');
    setStatusUpdatingId(proj.id);
    setConfirmDialog(null);
    try {
      await updateProjectStatus(proj.id, newStatus);
      await loadProjects();
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
            return (
              <div key={proj.id} className="glass-card" style={styles.projCard}>
                <div style={styles.cardHeader}>
                  <h3 style={styles.projName}>{proj.name}</h3>
                  <span style={{
                    ...styles.statusBadge,
                    backgroundColor: proj.status === 'Active' ? 'var(--color-primary-light)' : (COMPLETED_STATUSES.includes(proj.status) ? 'rgba(148, 163, 184, 0.15)' : 'rgba(245, 158, 11, 0.1)'),
                    color: proj.status === 'Active' ? 'var(--color-success)' : (COMPLETED_STATUSES.includes(proj.status) ? 'var(--color-text-secondary)' : 'var(--color-warning)')
                  }}>
                    {proj.status}
                  </span>
                </div>
                <p style={styles.projDesc}>{proj.description}</p>

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
                    <>
                      {primary.length > 0 && (
                        <div style={styles.skillsContainer}>
                          {primary.map((skill, idx) => (
                            <span key={`p-${idx}`} style={styles.skillTag}>{skill}</span>
                          ))}
                        </div>
                      )}
                      {secondary.length > 0 && (
                        <div style={{ ...styles.skillsContainer, marginTop: '4px' }}>
                          {secondary.map((skill, idx) => (
                            <span key={`s-${idx}`} style={styles.skillTagSecondary}>{skill}</span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* ✅ Complete / Restore action */}
                <div style={styles.cardFooterActions}>
                  {activeTab === 'history' ? (
                    <button
                      type="button"
                      onClick={() => handleRestoreProject(proj)}
                      disabled={statusUpdatingId === proj.id}
                      style={styles.restoreBtn}
                    >
                      {statusUpdatingId === proj.id ? 'Restoring…' : '↺ Restore Project'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCompleteProject(proj)}
                      disabled={statusUpdatingId === proj.id}
                      style={styles.completeBtn}
                    >
                      {statusUpdatingId === proj.id ? 'Updating…' : '✓ Mark as Complete'}
                    </button>
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
                  const primarySuggestions = allSkills.filter(skill => 
                    skill.skill_name.toLowerCase().includes((res.primarySkillInput || '').toLowerCase()) &&
                    !res.primarySkills.includes(skill.skill_name)
                  ).slice(0, 10);
                  const showPrimarySuggestions = res.primarySkillInput && res.primarySkillInput.length > 0 && primarySuggestions.length > 0;

                  const secondarySuggestions = allSkills.filter(skill => 
                    skill.skill_name.toLowerCase().includes((res.secondarySkillInput || '').toLowerCase()) &&
                    !res.secondarySkills.includes(skill.skill_name)
                  ).slice(0, 10);
                  const showSecondarySuggestions = res.secondarySkillInput && res.secondarySkillInput.length > 0 && secondarySuggestions.length > 0;

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
                            style={styles.modalInput}
                            placeholder="Type skill and press comma or Enter..."
                            required={res.primarySkills.length === 0}
                          />

                          {showPrimarySuggestions && (
                            <div style={styles.suggestionsDropdown}>
                              {primarySuggestions.map((skill) => (
                                <div
                                  key={skill.id}
                                  onMouseDown={() => handleSelectSkill(index, 'primary', skill.skill_name)}
                                  style={styles.suggestionItem}
                                >
                                  {skill.skill_name}
                                </div>
                              ))}
                              {isLoadingSkills && (
                                <div style={styles.suggestionItem}>Loading skills...</div>
                              )}
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
                            style={styles.modalInput}
                            placeholder="Type skill and press comma or Enter..."
                          />

                          {showSecondarySuggestions && (
                            <div style={styles.suggestionsDropdown}>
                              {secondarySuggestions.map((skill) => (
                                <div
                                  key={skill.id}
                                  onMouseDown={() => handleSelectSkill(index, 'secondary', skill.skill_name)}
                                  style={styles.suggestionItem}
                                >
                                  {skill.skill_name}
                                </div>
                              ))}
                              {isLoadingSkills && (
                                <div style={styles.suggestionItem}>Loading skills...</div>
                              )}
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
                <button type="button" onClick={() => setShowCreateModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.saveBtn}>Create Project</button>
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
                <>Restore <strong>"{confirmDialog.project.name}"</strong> back to active projects?</>
              )}
            </p>

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
};