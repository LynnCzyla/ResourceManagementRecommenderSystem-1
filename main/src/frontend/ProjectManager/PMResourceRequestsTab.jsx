import React, { useState, useEffect } from 'react';
import { getResourceRequests, createResourceRequest, getProjects, getSkills } from './pmApi';

export default function PMResourceRequestsTab({ user }) {
  const [requests, setRequests] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('status');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageJumpValue, setPageJumpValue] = useState('');
  const rowsPerPage = 10;

  // Skills state for autocomplete
  const [allSkills, setAllSkills] = useState([]);
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);

  const initialResources = [{
    role: '',
    quantity: 1,
    experience: 'Intermediate',
    assignment: 'Full-Time (40 hours/week)',
    primarySkills: [],
    primarySkillInput: '',
    secondarySkills: [],
    secondarySkillInput: '',
    startDate: '',
    endDate: '',
    justification: ''
  }];

  const [formData, setFormData] = useState({
    projectId: '',
    resources: initialResources
  });

  // ✅ Fetch all skills from database on mount, for autocomplete
  useEffect(() => {
    const fetchSkills = async () => {
      setIsLoadingSkills(true);
      try {
        const data = await getSkills();
        setAllSkills(data || []);
      } catch (error) {
        console.error('Error fetching skills:', error);
        setAllSkills([]);
      } finally {
        setIsLoadingSkills(false);
      }
    };
    fetchSkills();
  }, []);

  const loadData = async () => {
    try {
      const [requestsData, projectsData] = await Promise.all([
        getResourceRequests(),
        getProjects(user?.id),
      ]);
      setRequests(requestsData);
      setProjects(projectsData);
      setLoadError('');
    } catch (err) {
      console.error('Failed to load resource requests:', err);
      setLoadError(err.message || 'Failed to load resource requests');
    }
  };

  useEffect(() => {
    loadData();
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
          assignment: 'Full-Time (40 hours/week)',
          primarySkills: [],
          primarySkillInput: '',
          secondarySkills: [],
          secondarySkillInput: '',
          startDate: '',
          endDate: '',
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
      projectId: '',
      resources: [{
        role: '',
        quantity: 1,
        experience: 'Intermediate',
        assignment: 'Full-Time (40 hours/week)',
        primarySkills: [],
        primarySkillInput: '',
        secondarySkills: [],
        secondarySkillInput: '',
        startDate: '',
        endDate: '',
        justification: ''
      }]
    });
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.projectId || !formData.resources.length) return;

    setSubmitError('');
    try {
      // Convert skill arrays to comma-separated strings for backend
      const resourcesWithSkills = formData.resources.map(res => ({
        ...res,
        primarySkills: res.primarySkills.join(', '),
        secondarySkills: res.secondarySkills.join(', '),
      }));

      await createResourceRequest({
        projectId: formData.projectId,
        resources: resourcesWithSkills,
      });

      await loadData();
      setShowCreateModal(false);
      resetFormData();
    } catch (err) {
      console.error('Failed to create resource request:', err);
      setSubmitError(err.message || 'Failed to create resource request');
    }
  };

  const statusOptions = [...new Set(requests.map(r => r.status).filter(Boolean))];

  // ✅ Search checks both primary and secondary skills (falls back to combined `skills` if present)
  const filteredRequests = requests.filter(req => {
    const allReqSkills = [
      ...(req.primarySkills || req.skills || []),
      ...(req.secondarySkills || [])
    ];
    const matchesSearch =
      req.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      allReqSkills.some(skill => skill.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch && (statusFilter === 'all' || req.status === statusFilter);
  }).sort((a, b) => {
    if (sortBy === 'status') return a.status.localeCompare(b.status);
    if (sortBy === 'project') return a.projectName.localeCompare(b.projectName);
    if (sortBy === 'quantity') return a.quantity - b.quantity;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRequests = filteredRequests.slice(
    (safeCurrentPage - 1) * rowsPerPage,
    safeCurrentPage * rowsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, sortBy]);

  const goToPage = (page) => {
    const clamped = Math.min(Math.max(1, page), totalPages);
    setCurrentPage(clamped);
    setPageJumpValue('');
  };

  const handlePageJumpSubmit = (e) => {
    e.preventDefault();
    const page = parseInt(pageJumpValue, 10);
    if (!isNaN(page)) goToPage(page);
  };

  const totalQuantityNeeded = requests.reduce((sum, r) => sum + (parseInt(r.quantity, 10) || 0), 0);
  const pendingCount = requests.filter(r => r.status === 'Pending').length;
  const filledCount = requests.filter(r => r.status === 'Approved' || r.status === 'Filled').length;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Resource Requests</h1>
          <p style={styles.subtitle}>Track and manage your manpower requests for project allocation.</p>
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
                placeholder="Search requests..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.searchInput}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={styles.sortSelect}
            >
              <option value="all">All Statuses</option>
              {statusOptions.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={styles.sortSelect}
            >
              <option value="status">Sort by Status</option>
              <option value="project">Sort by Project</option>
              <option value="quantity">Sort by Quantity</option>
            </select>
          </div>
          <button onClick={() => setShowCreateModal(true)} style={styles.createBtn}>
            + New Request
          </button>
        </div>
      </div>

      {loadError && (
        <div className="glass-card" style={styles.errorBanner}>{loadError}</div>
      )}

      {/* Metric Cards */}
      <div style={styles.metricsGrid}>
        <div className="glass-card" style={styles.metricCard}>
          <div style={styles.metricValue}>{requests.length}</div>
          <div style={styles.metricLabel}>Total Requests</div>
        </div>
        <div className="glass-card" style={styles.metricCard}>
          <div style={styles.metricValue}>{totalQuantityNeeded}</div>
          <div style={styles.metricLabel}>Employees Needed</div>
        </div>
        <div className="glass-card" style={styles.metricCard}>
          <div style={{ ...styles.metricValue, color: 'var(--color-warning)' }}>{pendingCount}</div>
          <div style={styles.metricLabel}>Pending</div>
        </div>
        <div className="glass-card" style={styles.metricCard}>
          <div style={{ ...styles.metricValue, color: 'var(--color-success)' }}>{filledCount}</div>
          <div style={styles.metricLabel}>Filled</div>
        </div>
      </div>

      {/* Requests Table */}
      <div className="glass-card" style={styles.card}>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.trHeader}>
                <th style={styles.th}>Project</th>
                <th style={styles.th}>Required Skills</th>
                <th style={styles.th}>Duration</th>
                <th style={styles.th}>Dates</th>
                <th style={styles.th}>Qty</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRequests.length === 0 ? (
                <tr>
                  <td colSpan="6" style={styles.emptyRow}>No resource requests found.</td>
                </tr>
              ) : (
                paginatedRequests.map(req => {
                  const primary = req.primarySkills || req.skills || [];
                  const secondary = req.secondarySkills || [];
                  return (
                    <tr key={req.id} style={styles.trRow}>
                      <td style={{ ...styles.td, fontWeight: '700', color: 'var(--color-text-primary)' }}>{req.projectName}</td>
                      <td style={styles.td}>
                        <div style={styles.skillsGroup}>
                          {primary.length > 0 && (
                            <div style={styles.skillsWrapper}>
                              {primary.map((skill, idx) => (
                                <span key={`p-${idx}`} style={styles.skillTagPrimary}>{skill}</span>
                              ))}
                            </div>
                          )}
                          {secondary.length > 0 && (
                            <div style={styles.skillsWrapper}>
                              {secondary.map((skill, idx) => (
                                <span key={`s-${idx}`} style={styles.skillTagSecondary}>{skill}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={styles.td}>{req.duration}</td>
                      <td style={styles.td}>{req.startDate} to {req.endDate}</td>
                      <td style={{ ...styles.td, fontWeight: '600' }}>{req.quantity}</td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.statusBadge,
                          backgroundColor: req.status === 'Approved' ? 'var(--color-primary-light)' : 'rgba(245, 158, 11, 0.1)',
                          color: req.status === 'Approved' ? 'var(--color-success)' : 'var(--color-warning)'
                        }}>
                          {req.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filteredRequests.length > 0 && (
          <div style={styles.paginationBar}>
            <span style={styles.paginationInfo}>
              Showing {(safeCurrentPage - 1) * rowsPerPage + 1}
              -{Math.min(safeCurrentPage * rowsPerPage, filteredRequests.length)} of {filteredRequests.length}
            </span>
            <div style={styles.paginationControls}>
              <button
                type="button"
                onClick={() => goToPage(safeCurrentPage - 1)}
                disabled={safeCurrentPage === 1}
                style={{ ...styles.pageBtn, ...(safeCurrentPage === 1 ? styles.pageBtnDisabled : {}) }}
              >
                &lt;
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  type="button"
                  onClick={() => goToPage(page)}
                  style={{ ...styles.pageBtn, ...(page === safeCurrentPage ? styles.pageBtnActive : {}) }}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => goToPage(safeCurrentPage + 1)}
                disabled={safeCurrentPage === totalPages}
                style={{ ...styles.pageBtn, ...(safeCurrentPage === totalPages ? styles.pageBtnDisabled : {}) }}
              >
                &gt;
              </button>
              <form onSubmit={handlePageJumpSubmit} style={styles.pageJumpForm}>
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  value={pageJumpValue}
                  onChange={(e) => setPageJumpValue(e.target.value)}
                  placeholder="Go to"
                  style={styles.pageJumpInput}
                />
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Create Request Modal */}
      {showCreateModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 18 }}>New Resource Request</h2>
              <button onClick={() => setShowCreateModal(false)} style={styles.closeModalBtn}>&times;</button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ marginTop: 16 }}>
              {submitError && (
                <div style={{ ...styles.errorBanner, marginBottom: 16 }}>{submitError}</div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Project <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                <select
                  value={formData.projectId}
                  onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                  style={styles.modalSelect}
                  required
                >
                  <option value="">Select a project</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Resource Requirements Section */}
              <div style={{ ...styles.sectionContainer, marginTop: '20px' }}>
                <div style={styles.sectionHeader}>
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
                          Resource #{index + 1}
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

                      {/* ✅ Primary Skills — required, tag input with autocomplete */}
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

                      {/* ✅ Secondary Skills — optional, tag input with autocomplete */}
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

                      <div style={styles.formRow}>
                        <div style={{ ...styles.formGroup, flex: 1 }}>
                          <label style={styles.formLabel}>Start Date <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                          <input
                            type="date"
                            value={res.startDate}
                            onChange={(e) => handleResourceChange(index, 'startDate', e.target.value)}
                            style={styles.modalInput}
                            required
                          />
                        </div>
                        <div style={{ ...styles.formGroup, flex: 1 }}>
                          <label style={styles.formLabel}>End Date <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                          <input
                            type="date"
                            value={res.endDate}
                            onChange={(e) => handleResourceChange(index, 'endDate', e.target.value)}
                            style={styles.modalInput}
                            required
                          />
                        </div>
                      </div>

                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>Justification / Requirements</label>
                        <textarea
                          value={res.justification}
                          onChange={(e) => handleResourceChange(index, 'justification', e.target.value)}
                          style={styles.modalTextarea}
                          placeholder="Why do you need this resource? Provide details about the work they will be doing..."
                        />
                      </div>
                    </div>
                  );
                })}

                <button type="button" onClick={handleAddResource} style={styles.addResourceBtn}>
                  + Add Another Resource
                </button>
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowCreateModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.saveBtn}>Submit Request</button>
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
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
  },
  metricCard: {
    padding: '18px 20px',
  },
  metricValue: {
    fontSize: '26px',
    fontWeight: '800',
    color: 'var(--color-text-primary)',
    marginBottom: '4px',
  },
  metricLabel: {
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-text-muted)',
  },
  paginationBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '16px 8px 4px',
    borderTop: '1px solid var(--color-border)',
    marginTop: '12px',
  },
  paginationInfo: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
  },
  paginationControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  pageBtn: {
    minWidth: '32px',
    height: '32px',
    padding: '0 8px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    cursor: 'pointer',
  },
  pageBtnActive: {
    background: 'var(--color-primary)',
    borderColor: 'var(--color-primary)',
    color: '#ffffff',
    fontWeight: '700',
  },
  pageBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  pageJumpForm: {
    marginLeft: '4px',
  },
  pageJumpInput: {
    width: '60px',
    height: '32px',
    padding: '0 8px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    outline: 'none',
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
  errorBanner: {
    padding: '12px 16px',
    color: 'var(--color-danger)',
    fontSize: '13px',
    fontWeight: '600',
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
  card: {
    padding: '24px',
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
    padding: '14px 16px',
    fontSize: '12px',
    fontWeight: '700',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
  },
  trRow: {
    borderBottom: '1px solid var(--color-border)',
  },
  td: {
    padding: '14px 16px',
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
  },
  emptyRow: {
    textAlign: 'center',
    padding: '40px 0',
    color: 'var(--color-text-muted)',
  },
  skillsGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  skillsWrapper: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  skillTagPrimary: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    fontWeight: '600',
  },
  skillTagSecondary: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'rgba(148, 163, 184, 0.15)',
    color: 'var(--color-text-muted)',
    fontWeight: '600',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '4px',
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