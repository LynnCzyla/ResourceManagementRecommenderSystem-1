import React, { useState, useEffect, useRef } from 'react';
import Swal from 'sweetalert2';
import { getResourceRequests, createResourceRequest, getProjects, getSkills, cancelResourceRequest, updateResourceRequest } from './pmApi';
import { blockInvalidNumberKeys } from '../../utils/numberInput';

// Helpers to format date range and dynamic duration nicely
const formatDateRange = (startDate, endDate) => {
  if (!startDate && !endDate) return 'N/A';
  const formatSingle = (dStr) => {
    if (!dStr) return '';
    const d = new Date(dStr);
    return isNaN(d.getTime()) ? dStr : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  if (startDate && endDate) return `${formatSingle(startDate)} to ${formatSingle(endDate)}`;
  if (startDate) return formatSingle(startDate);
  if (endDate) return formatSingle(endDate);
  return 'N/A';
};

const formatDurationDisplay = (duration, startDate, endDate) => {
  if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && e >= s) {
      const diffDays = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
      if (diffDays <= 0) return 'N/A';
      if (diffDays === 1) return '1 Day';
      if (diffDays < 7) return `${diffDays} Days`;
      const weeks = Math.round(diffDays / 7);
      if (diffDays < 30) return `${weeks} ${weeks === 1 ? 'Week' : 'Weeks'}`;
      if (diffDays >= 30 && diffDays <= 55) return `${weeks} Weeks`;
      const months = (diffDays / 30.4375).toFixed(1);
      return months.endsWith('.0') ? `${parseInt(months, 10)} Months` : `~${months} Months`;
    }
  }
  if (duration && duration !== '—' && duration !== '-' && duration !== 'null' && duration !== 'undefined') {
    return duration;
  }
  return 'N/A';
};

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
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'history'
  const [cancellingId, setCancellingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null); // req object being edited
  const [editFormData, setEditFormData] = useState(null);    // form state for edit modal
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');
  const rowsPerPage = 10;

  // Skills dynamic database search state
  const skillCacheRef = useRef({});
  const debounceTimerRef = useRef(null);
  const [activeSkillFocus, setActiveSkillFocus] = useState(null); // { index, type: 'primary' | 'secondary' }
  const [dynamicSuggestions, setDynamicSuggestions] = useState([]);
  const [isSearchingSkills, setIsSearchingSkills] = useState(false);

  // Initial skills loaded on mount as fallback
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
    setDynamicSuggestions([]);
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
    if (isSubmitting) return;

    setIsSubmitting(true);
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
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to determine if a request belongs to History (filled/allocated, cancelled, rejected, or completed)
  const isHistoryRequest = (status) => {
    const s = String(status || '').trim().toLowerCase();
    return ['filled', 'allocated', 'fulfilled', 'approved', 'completed', 'done', 'closed', 'cancelled', 'canceled', 'rejected'].includes(s);
  };

  const activeRequests = requests.filter(r => !isHistoryRequest(r.status));
  const historyRequests = requests.filter(r => isHistoryRequest(r.status));
  const currentTabRequests = activeTab === 'history' ? historyRequests : activeRequests;

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setStatusFilter('all');
    setSearchQuery('');
  };

  // ── Edit Request Modal Handlers ─────────────────────────────────────
  const openEditModal = (req) => {
    const extractDateInput = (val) => {
      if (!val) return '';
      if (typeof val === 'string') {
        return val.includes('T') ? val.split('T')[0] : val.slice(0, 10);
      }
      const d = new Date(val);
      return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
    };

    const primary = Array.isArray(req.primarySkills)
      ? [...req.primarySkills]
      : (typeof req.primarySkills === 'string' && req.primarySkills
        ? req.primarySkills.split(',').map(s => s.trim()).filter(Boolean)
        : (Array.isArray(req.skills) ? [...req.skills] : []));

    const secondary = Array.isArray(req.secondarySkills)
      ? [...req.secondarySkills]
      : (typeof req.secondarySkills === 'string' && req.secondarySkills
        ? req.secondarySkills.split(',').map(s => s.trim()).filter(Boolean)
        : []);

    setEditingRequest(req);
    setEditFormData({
      role: req.role || '',
      quantity: req.quantity || 1,
      primarySkills: primary,
      primarySkillInput: '',
      secondarySkills: secondary,
      secondarySkillInput: '',
      startDate: extractDateInput(req.startDate),
      endDate: extractDateInput(req.endDate),
      justification: req.justification || '',
    });
    setEditError('');
  };

  const closeEditModal = () => {
    setEditingRequest(null);
    setEditFormData(null);
    setEditError('');
    setDynamicSuggestions([]);
    setActiveSkillFocus(null);
  };

  const handleEditSkillInputChange = (type, value) => {
    const skillsField = type === 'primary' ? 'primarySkills' : 'secondarySkills';
    const inputField = type === 'primary' ? 'primarySkillInput' : 'secondarySkillInput';
    setActiveSkillFocus({ index: 'edit', type });

    if (value.endsWith(',')) {
      const skillName = value.slice(0, -1).trim();
      if (skillName) {
        setEditFormData(prev => {
          if (!prev[skillsField].includes(skillName)) {
            return {
              ...prev,
              [skillsField]: [...prev[skillsField], skillName],
              [inputField]: '',
            };
          }
          return { ...prev, [inputField]: '' };
        });
        setDynamicSuggestions([]);
        return;
      }
    }

    setEditFormData(prev => ({ ...prev, [inputField]: value }));
    const currentSelected = editFormData?.[skillsField] || [];
    searchSkillsDynamic(value, currentSelected);
  };

  const handleEditSkillKeyDown = (type, e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const skillsField = type === 'primary' ? 'primarySkills' : 'secondarySkills';
      const inputField = type === 'primary' ? 'primarySkillInput' : 'secondarySkillInput';
      const trimmed = (editFormData?.[inputField] || '').trim();
      if (trimmed) {
        setEditFormData(prev => ({
          ...prev,
          [skillsField]: prev[skillsField].includes(trimmed) ? prev[skillsField] : [...prev[skillsField], trimmed],
          [inputField]: '',
        }));
        setDynamicSuggestions([]);
      }
    }
  };

  const handleEditSelectSkill = (type, skillName) => {
    if (!skillName || !skillName.trim()) return;
    const skillsField = type === 'primary' ? 'primarySkills' : 'secondarySkills';
    const inputField = type === 'primary' ? 'primarySkillInput' : 'secondarySkillInput';
    setEditFormData(prev => ({
      ...prev,
      [skillsField]: prev[skillsField].includes(skillName.trim()) ? prev[skillsField] : [...prev[skillsField], skillName.trim()],
      [inputField]: '',
    }));
    setDynamicSuggestions([]);
  };

  const handleEditRemoveSkill = (type, skillToRemove) => {
    const skillsField = type === 'primary' ? 'primarySkills' : 'secondarySkills';
    setEditFormData(prev => ({
      ...prev,
      [skillsField]: prev[skillsField].filter(s => s !== skillToRemove),
    }));
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingRequest || !editFormData) return;
    if (isEditSubmitting) return;

    if (!editFormData.role.trim()) {
      setEditError('Position/Role is required');
      return;
    }
    const qty = parseInt(editFormData.quantity, 10);
    if (!editFormData.quantity || isNaN(qty) || qty < 1) {
      setEditError('Quantity must be at least 1');
      return;
    }
    if (editFormData.primarySkills.length === 0) {
      setEditError('At least one primary skill is required');
      return;
    }
    if (!editFormData.startDate || !editFormData.endDate) {
      setEditError('Start and End dates are required');
      return;
    }
    if (new Date(editFormData.startDate) > new Date(editFormData.endDate)) {
      setEditError('Start date cannot be after end date');
      return;
    }

    setIsEditSubmitting(true);
    setEditError('');

    try {
      await updateResourceRequest(editingRequest.id, {
        role: editFormData.role.trim(),
        quantity: qty,
        primarySkills: editFormData.primarySkills.join(', '),
        secondarySkills: editFormData.secondarySkills.join(', '),
        startDate: editFormData.startDate,
        endDate: editFormData.endDate,
        justification: (editFormData.justification || '').trim(),
      });

      await loadData();
      closeEditModal();

      Swal.fire({
        title: 'Request Updated',
        text: 'The resource request has been updated successfully.',
        icon: 'success',
        confirmButtonColor: 'var(--color-primary, #2563eb)',
        timer: 2000,
        showConfirmButton: false,
        background: 'var(--color-bg-card, #ffffff)',
        color: 'var(--color-text-primary, #1e293b)',
      });
    } catch (err) {
      console.error('Failed to update resource request:', err);
      setEditError(err.message || 'Failed to update resource request');
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleCancelRequest = async (req) => {
    const roleText = req.role ? `"${req.role}"` : 'this resource request';
    const projectText = req.projectName ? ` on project "${req.projectName}"` : '';

    const result = await Swal.fire({
      title: 'Cancel Resource Request?',
      text: `Are you sure you want to cancel the request for ${roleText}${projectText}? It will be moved to the Request History tab.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, cancel request',
      cancelButtonText: 'No, keep it',
      background: 'var(--color-bg-card, #ffffff)',
      color: 'var(--color-text-primary, #1e293b)',
    });

    if (!result.isConfirmed) return;

    setCancellingId(req.id);
    try {
      await cancelResourceRequest(req.id);
      await loadData();
      setActiveTab('history');
      Swal.fire({
        title: 'Request Canceled',
        text: 'The resource request has been marked as Canceled and moved to Request History.',
        icon: 'success',
        confirmButtonColor: 'var(--color-primary, #2563eb)',
        timer: 2400,
        showConfirmButton: false,
        background: 'var(--color-bg-card, #ffffff)',
        color: 'var(--color-text-primary, #1e293b)',
      });
    } catch (err) {
      console.error('Failed to cancel resource request:', err);
      Swal.fire({
        title: 'Error',
        text: err.message || 'Failed to cancel resource request.',
        icon: 'error',
        confirmButtonColor: 'var(--color-primary, #2563eb)',
        background: 'var(--color-bg-card, #ffffff)',
        color: 'var(--color-text-primary, #1e293b)',
      });
    } finally {
      setCancellingId(null);
    }
  };

  const getStatusBadgeStyle = (status) => {
    const s = String(status || '').toLowerCase();
    if (['approved', 'filled', 'fulfilled', 'completed', 'done'].includes(s)) {
      return {
        backgroundColor: 'rgba(34, 197, 94, 0.12)',
        color: 'var(--color-success, #16a34a)',
        border: '1px solid rgba(34, 197, 94, 0.25)',
      };
    }
    if (['cancelled', 'canceled'].includes(s)) {
      return {
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
        color: 'var(--color-danger, #ef4444)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
      };
    }
    if (s === 'rejected') {
      return {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        color: 'var(--color-danger, #ef4444)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
      };
    }
    // Pending, Open, In Progress
    return {
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
      color: 'var(--color-warning, #d97706)',
      border: '1px solid rgba(245, 158, 11, 0.25)',
    };
  };

  const statusOptions = [...new Set(currentTabRequests.map(r => r.status).filter(Boolean))];

  // ✅ Search checks project name, role, and primary/secondary skills
  const filteredRequests = currentTabRequests.filter(req => {
    const allReqSkills = [
      ...(req.primarySkills || req.skills || []),
      ...(req.secondarySkills || [])
    ];
    const matchesSearch =
      (req.projectName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (req.role || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      allReqSkills.some(skill => skill.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch && (statusFilter === 'all' || req.status === statusFilter);
  }).sort((a, b) => {
    if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
    if (sortBy === 'project') return (a.projectName || '').localeCompare(b.projectName || '');
    if (sortBy === 'quantity') return (a.quantity || 0) - (b.quantity || 0);
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
  }, [searchQuery, statusFilter, sortBy, activeTab]);

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

  const activeQuantityNeeded = activeRequests.reduce((sum, r) => sum + (parseInt(r.quantity, 10) || 0), 0);
  const pendingCount = activeRequests.filter(r => r.status === 'Pending').length;
  const historyCount = historyRequests.length;

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
                placeholder={activeTab === 'history' ? "Search history..." : "Search requests..."}
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
          <button
            onClick={() => {
              loadData();
              setShowCreateModal(true);
            }}
            style={styles.createBtn}
          >
            + New Request
          </button>
        </div>
      </div>

      {/* ✅ Sub-tabs: Active Requests / Request History */}
      <div style={styles.tabsRow}>
        <button
          type="button"
          onClick={() => handleTabChange('active')}
          style={{ ...styles.tabBtn, ...(activeTab === 'active' ? styles.tabBtnActive : {}) }}
        >
          Active Requests
          <span style={{ ...styles.tabCount, ...(activeTab === 'active' ? styles.tabCountActive : {}) }}>
            {activeRequests.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('history')}
          style={{ ...styles.tabBtn, ...(activeTab === 'history' ? styles.tabBtnActive : {}) }}
        >
          Request History
          <span style={{ ...styles.tabCount, ...(activeTab === 'history' ? styles.tabCountActive : {}) }}>
            {historyRequests.length}
          </span>
        </button>
      </div>

      {loadError && (
        <div className="glass-card" style={styles.errorBanner}>{loadError}</div>
      )}

      {/* Metric Cards */}
      <div style={styles.metricsGrid}>
        <div className="glass-card" style={styles.metricCard} title="Total currently active resource requests for your projects">
          <div style={styles.metricValue}>{activeRequests.length}</div>
          <div style={styles.metricLabel}>Active Requests</div>
        </div>
        <div className="glass-card" style={styles.metricCard} title="Total headcount needed across active requests">
          <div style={styles.metricValue}>{activeQuantityNeeded}</div>
          <div style={styles.metricLabel}>Employees Needed</div>
        </div>
        <div className="glass-card" style={styles.metricCard} title="Requests awaiting review by the Resource Manager">
          <div style={{ ...styles.metricValue, color: 'var(--color-warning)' }}>{pendingCount}</div>
          <div style={styles.metricLabel}>Pending Approval</div>
        </div>
        <div className="glass-card" style={styles.metricCard} title="Completed, fulfilled, or closed resource requests in history">
          <div style={{ ...styles.metricValue, color: 'var(--color-primary)' }}>{historyCount}</div>
          <div style={styles.metricLabel}>In History</div>
        </div>
      </div>

      {/* Requests Table */}
      <div className="glass-card" style={styles.card}>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.trHeader}>
                <th style={styles.th}>Project / Role</th>
                <th style={styles.th}>Required Skills</th>
                <th style={styles.th}>Duration</th>
                <th style={styles.th}>Dates</th>
                <th style={styles.th}>Qty</th>
                <th style={styles.th}>Status</th>
                <th style={{ ...styles.th, textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRequests.length === 0 ? (
                <tr>
                  <td colSpan="7" style={styles.emptyRow}>
                    {activeTab === 'history'
                      ? 'No request history found. Completed or cancelled requests will appear here.'
                      : (searchQuery || statusFilter !== 'all'
                        ? 'No active requests match your filters.'
                        : 'No active resource requests found. Click "+ New Request" to create one.')}
                  </td>
                </tr>
              ) : (
                paginatedRequests.map(req => {
                  const primary = req.primarySkills || req.skills || [];
                  const secondary = req.secondarySkills || [];
                  const isCancellable = activeTab === 'active' && (req.status === 'Pending' || req.status === 'Open' || req.status === 'Partially Allocated');
                  const isEditable = activeTab === 'active' && (req.status === 'Pending' || req.status === 'Open');
                  return (
                    <tr key={req.id} style={styles.trRow}>
                      <td style={styles.td}>
                        <div style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{req.projectName}</div>
                        {req.role && (
                          <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                            {req.role}
                          </div>
                        )}
                      </td>
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
                      <td style={styles.td}>{formatDurationDisplay(req.duration, req.startDate, req.endDate)}</td>
                      <td style={styles.td}>{formatDateRange(req.startDate, req.endDate)}</td>
                      <td style={{ ...styles.td, fontWeight: '600' }}>{req.quantity}</td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.statusBadge,
                          ...getStatusBadgeStyle(req.status),
                        }}>
                          {req.status}
                        </span>
                      </td>
                      <td style={{ ...styles.td, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                          {isEditable && (
                            <button
                              type="button"
                              onClick={() => openEditModal(req)}
                              style={styles.editBtn}
                              title="Edit this resource request"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                              Edit
                            </button>
                          )}
                          {isCancellable ? (
                            <button
                              type="button"
                              onClick={() => handleCancelRequest(req)}
                              disabled={cancellingId === req.id}
                              style={{
                                ...styles.cancelRequestBtn,
                                ...(cancellingId === req.id ? styles.cancelRequestBtnDisabled : {})
                              }}
                              title="Cancel this resource request"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                              {cancellingId === req.id ? 'Cancelling...' : 'Cancel'}
                            </button>
                          ) : (
                            <span style={{
                              ...styles.historyActionText,
                              color: ['filled', 'allocated', 'completed', 'done'].includes(String(req.status || '').toLowerCase())
                                ? 'var(--color-success, #16a34a)'
                                : (['cancelled', 'canceled', 'rejected'].includes(String(req.status || '').toLowerCase())
                                  ? 'var(--color-danger, #ef4444)'
                                  : undefined),
                              fontWeight: '600',
                            }}>
                              {['filled', 'allocated'].includes(String(req.status || '').toLowerCase())
                                ? 'Allocated'
                                : (['completed', 'done'].includes(String(req.status || '').toLowerCase())
                                  ? 'Completed'
                                  : (['cancelled', 'canceled'].includes(String(req.status || '').toLowerCase())
                                    ? 'Cancelled'
                                    : (String(req.status || '').toLowerCase() === 'rejected' ? 'Rejected' : 'Stored')))}
                            </span>
                          )}
                        </div>
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
              Showing {filteredRequests.length === 0 ? 0 : (safeCurrentPage - 1) * rowsPerPage + 1}
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

      {/* Edit Request Modal */}
      {editingRequest && editFormData && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 18 }}>
                Edit Request — <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{editingRequest.projectName}</span>
              </h2>
              <button onClick={closeEditModal} style={styles.closeModalBtn}>&times;</button>
            </div>

            <form onSubmit={handleEditSubmit} style={{ marginTop: 16 }}>
              {editError && (
                <div style={{ ...styles.errorBanner, marginBottom: 16 }}>{editError}</div>
              )}

              {/* Role & Quantity */}
              <div style={styles.formRow}>
                <div style={{ ...styles.formGroup, flex: 2 }}>
                  <label style={styles.formLabel}>Position/Role <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                  <input
                    type="text"
                    value={editFormData.role}
                    onChange={e => handleEditFieldChange('role', e.target.value)}
                    style={styles.modalInput}
                    placeholder="e.g., Design Engineer, CAD Operator"
                    required
                  />
                </div>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>Quantity Needed <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                  <input
                    type="number" onKeyDown={blockInvalidNumberKeys}
                    min="1"
                    value={editFormData.quantity}
                    onChange={e => handleEditFieldChange('quantity', e.target.value)}
                    style={styles.modalInput}
                    required
                  />
                </div>
              </div>

              {/* Primary Skills */}
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Primary Skills <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                {editFormData.primarySkills.length > 0 && (
                  <div style={styles.selectedSkillsContainer}>
                    {editFormData.primarySkills.map((skill, idx) => (
                      <span key={idx} style={styles.selectedSkillTag}>
                        {skill}
                        <button type="button" onClick={() => handleEditRemoveSkill('primary', skill)} style={styles.removeSkillBtn}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={editFormData.primarySkillInput || ''}
                    onChange={e => handleEditSkillInputChange('primary', e.target.value)}
                    onKeyDown={e => handleEditSkillKeyDown('primary', e)}
                    onFocus={() => { setActiveSkillFocus({ index: 'edit', type: 'primary' }); if (editFormData.primarySkillInput?.trim()) searchSkillsDynamic(editFormData.primarySkillInput, editFormData.primarySkills); }}
                    onBlur={() => setTimeout(() => setActiveSkillFocus(prev => (prev?.index === 'edit' && prev?.type === 'primary' ? null : prev)), 200)}
                    style={styles.modalInput}
                    placeholder="Type skill and press comma or Enter..."
                  />
                  {activeSkillFocus?.index === 'edit' && activeSkillFocus?.type === 'primary' && (editFormData.primarySkillInput || '').trim().length > 0 && (
                    <div style={styles.suggestionsDropdown}>
                      {isSearchingSkills && dynamicSuggestions.length === 0 && <div style={{ ...styles.suggestionItem, fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>Searching...</div>}
                      {!isSearchingSkills && dynamicSuggestions.length === 0 && <div style={{ ...styles.suggestionItem, fontStyle: 'italic', color: 'var(--color-text-muted)', cursor: 'default' }}>No matches (press comma or Enter to add)</div>}
                      {dynamicSuggestions.map(s => (
                        <div key={s.id} onMouseDown={e => { e.preventDefault(); handleEditSelectSkill('primary', s.skill_name); }} style={styles.suggestionItem}>{s.skill_name}</div>
                      ))}
                    </div>
                  )}
                </div>
                <span style={styles.inputHelp}>Must-have skills. Press <strong>comma ( , )</strong> or <strong>Enter</strong> to add.</span>
              </div>

              {/* Secondary Skills */}
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Secondary Skills</label>
                {editFormData.secondarySkills.length > 0 && (
                  <div style={styles.selectedSkillsContainer}>
                    {editFormData.secondarySkills.map((skill, idx) => (
                      <span key={idx} style={styles.selectedSkillTagSecondary}>
                        {skill}
                        <button type="button" onClick={() => handleEditRemoveSkill('secondary', skill)} style={styles.removeSkillBtnSecondary}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={editFormData.secondarySkillInput || ''}
                    onChange={e => handleEditSkillInputChange('secondary', e.target.value)}
                    onKeyDown={e => handleEditSkillKeyDown('secondary', e)}
                    onFocus={() => { setActiveSkillFocus({ index: 'edit', type: 'secondary' }); if (editFormData.secondarySkillInput?.trim()) searchSkillsDynamic(editFormData.secondarySkillInput, editFormData.secondarySkills); }}
                    onBlur={() => setTimeout(() => setActiveSkillFocus(prev => (prev?.index === 'edit' && prev?.type === 'secondary' ? null : prev)), 200)}
                    style={styles.modalInput}
                    placeholder="Type skill and press comma or Enter..."
                  />
                  {activeSkillFocus?.index === 'edit' && activeSkillFocus?.type === 'secondary' && (editFormData.secondarySkillInput || '').trim().length > 0 && (
                    <div style={styles.suggestionsDropdown}>
                      {isSearchingSkills && dynamicSuggestions.length === 0 && <div style={{ ...styles.suggestionItem, fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>Searching...</div>}
                      {!isSearchingSkills && dynamicSuggestions.length === 0 && <div style={{ ...styles.suggestionItem, fontStyle: 'italic', color: 'var(--color-text-muted)', cursor: 'default' }}>No matches (press comma or Enter to add)</div>}
                      {dynamicSuggestions.map(s => (
                        <div key={s.id} onMouseDown={e => { e.preventDefault(); handleEditSelectSkill('secondary', s.skill_name); }} style={styles.suggestionItem}>{s.skill_name}</div>
                      ))}
                    </div>
                  )}
                </div>
                <span style={styles.inputHelp}>Nice-to-have skills. Press <strong>comma ( , )</strong> or <strong>Enter</strong> to add.</span>
              </div>

              {/* Dates */}
              <div style={styles.formRow}>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>Start Date <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                  <input type="date" value={editFormData.startDate} onChange={e => handleEditFieldChange('startDate', e.target.value)} style={styles.modalInput} required />
                </div>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>End Date <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                  <input type="date" value={editFormData.endDate} onChange={e => handleEditFieldChange('endDate', e.target.value)} style={styles.modalInput} required />
                </div>
              </div>

              {/* Justification */}
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Justification / Requirements</label>
                <textarea
                  value={editFormData.justification}
                  onChange={e => handleEditFieldChange('justification', e.target.value)}
                  style={styles.modalTextarea}
                  placeholder="Why do you need this resource? Provide context..."
                />
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={closeEditModal} disabled={isEditSubmitting} style={{ ...styles.cancelBtn, opacity: isEditSubmitting ? 0.6 : 1 }}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditSubmitting}
                  style={{ ...styles.saveBtn, opacity: isEditSubmitting ? 0.8 : 1, cursor: isEditSubmitting ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}
                >
                  {isEditSubmitting ? (
                    <><span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} /> Saving...</>
                  ) : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  <option value="">Select an active project</option>
                  {projects
                    .filter(p => !['Completed', 'Archived', 'Cancelled', 'Cancelled-Hidden'].includes(p.status))
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.isRestored ? ' (Restored)' : ''}
                      </option>
                    ))}
                </select>
                {projects.filter(p => !['Completed', 'Archived', 'Cancelled', 'Cancelled-Hidden'].includes(p.status)).length === 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--color-warning)', marginTop: '4px', display: 'block' }}>
                    No active projects available. Create or restore a project first.
                  </span>
                )}
              </div>

              {/* Resource Requirements Section */}
              <div style={{ ...styles.sectionContainer, marginTop: '20px' }}>
                <div style={styles.sectionHeader}>
                  <span style={styles.sectionTitle}>Resource Requirements</span>
                </div>

                {formData.resources.map((res, index) => {
                  const isPrimaryActive = activeSkillFocus?.index === index && activeSkillFocus?.type === 'primary';
                  const showPrimarySuggestions = isPrimaryActive && (res.primarySkillInput || '').trim().length > 0;

                  const isSecondaryActive = activeSkillFocus?.index === index && activeSkillFocus?.type === 'secondary';
                  const showSecondarySuggestions = isSecondaryActive && (res.secondarySkillInput || '').trim().length > 0;

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
                            placeholder="e.g., Design Engineer, Project Engineer, CAD Operator"
                            required
                          />
                        </div>
                        <div style={{ ...styles.formGroup, flex: 1 }}>
                          <label style={styles.formLabel}>Quantity Needed <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                          <input
                            type="number" onKeyDown={blockInvalidNumberKeys}
                            min="1"
                            value={res.quantity}
                            onChange={(e) => handleResourceChange(index, 'quantity', e.target.value)}
                            style={styles.modalInput}
                            required
                          />
                        </div>
                      </div>

                      {/* ✅ Primary Skills — required, tag input with dynamic database autocomplete */}
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

                      {/* ✅ Secondary Skills — optional, tag input with dynamic database autocomplete */}
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
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isSubmitting}
                  style={{
                    ...styles.cancelBtn,
                    opacity: isSubmitting ? 0.6 : 1,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    ...styles.saveBtn,
                    opacity: isSubmitting ? 0.8 : 1,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    justifyContent: 'center',
                  }}
                >
                  {isSubmitting ? (
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
                      Submitting Request...
                    </>
                  ) : (
                    'Submit Request'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Request Modal */}
      {editingRequest && editFormData && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: 'var(--color-text-primary)' }}>Edit Resource Request</h2>
                <div style={{ fontSize: '13px', color: 'var(--color-primary)', marginTop: '4px', fontWeight: '600' }}>
                  {editingRequest.projectName}
                </div>
              </div>
              <button onClick={closeEditModal} style={styles.closeModalBtn}>&times;</button>
            </div>

            <form onSubmit={handleEditSubmit} style={{ marginTop: 16 }}>
              {editError && (
                <div style={{ ...styles.errorBanner, marginBottom: 16 }}>{editError}</div>
              )}

              <div style={styles.sectionContainer}>
                <div style={styles.formRow}>
                  <div style={{ ...styles.formGroup, flex: 2 }}>
                    <label style={styles.formLabel}>Position/Role <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                    <input
                      type="text"
                      value={editFormData.role}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, role: e.target.value }))}
                      style={styles.modalInput}
                      placeholder="e.g., Design Engineer, Project Engineer, CAD Operator"
                      required
                    />
                  </div>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>Quantity Needed <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                    <input
                      type="number"
                      onKeyDown={blockInvalidNumberKeys}
                      min="1"
                      value={editFormData.quantity}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, quantity: e.target.value }))}
                      style={styles.modalInput}
                      required
                    />
                  </div>
                </div>

                {/* Primary Skills */}
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Primary Skills <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                  {editFormData.primarySkills.length > 0 && (
                    <div style={styles.selectedSkillsContainer}>
                      {editFormData.primarySkills.map((skill, idx) => (
                        <span key={idx} style={styles.selectedSkillTag}>
                          {skill}
                          <button
                            type="button"
                            onClick={() => handleEditRemoveSkill('primary', skill)}
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
                      value={editFormData.primarySkillInput || ''}
                      onChange={(e) => handleEditSkillInputChange('primary', e.target.value)}
                      onKeyDown={(e) => handleEditSkillKeyDown('primary', e)}
                      onFocus={() => {
                        setActiveSkillFocus({ index: 'edit', type: 'primary' });
                        const val = editFormData.primarySkillInput || '';
                        if (val.trim()) {
                          searchSkillsDynamic(val, editFormData.primarySkills);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setActiveSkillFocus(prev => (prev?.index === 'edit' && prev?.type === 'primary' ? null : prev));
                        }, 200);
                      }}
                      style={styles.modalInput}
                      placeholder="Type skill and press comma or Enter..."
                      required={editFormData.primarySkills.length === 0}
                    />

                    {activeSkillFocus?.index === 'edit' && activeSkillFocus?.type === 'primary' && (editFormData.primarySkillInput || '').trim().length > 0 && (
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
                              handleEditSelectSkill('primary', skill.skill_name);
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

                {/* Secondary Skills */}
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Secondary Skills</label>
                  {editFormData.secondarySkills.length > 0 && (
                    <div style={styles.selectedSkillsContainer}>
                      {editFormData.secondarySkills.map((skill, idx) => (
                        <span key={idx} style={styles.selectedSkillTagSecondary}>
                          {skill}
                          <button
                            type="button"
                            onClick={() => handleEditRemoveSkill('secondary', skill)}
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
                      value={editFormData.secondarySkillInput || ''}
                      onChange={(e) => handleEditSkillInputChange('secondary', e.target.value)}
                      onKeyDown={(e) => handleEditSkillKeyDown('secondary', e)}
                      onFocus={() => {
                        setActiveSkillFocus({ index: 'edit', type: 'secondary' });
                        const val = editFormData.secondarySkillInput || '';
                        if (val.trim()) {
                          searchSkillsDynamic(val, editFormData.secondarySkills);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setActiveSkillFocus(prev => (prev?.index === 'edit' && prev?.type === 'secondary' ? null : prev));
                        }, 200);
                      }}
                      style={styles.modalInput}
                      placeholder="Type skill and press comma or Enter..."
                    />

                    {activeSkillFocus?.index === 'edit' && activeSkillFocus?.type === 'secondary' && (editFormData.secondarySkillInput || '').trim().length > 0 && (
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
                              handleEditSelectSkill('secondary', skill.skill_name);
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

                {/* Dates */}
                <div style={styles.formRow}>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>Start Date <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                    <input
                      type="date"
                      value={editFormData.startDate}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, startDate: e.target.value }))}
                      style={styles.modalInput}
                      required
                    />
                  </div>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>End Date <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                    <input
                      type="date"
                      value={editFormData.endDate}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, endDate: e.target.value }))}
                      style={styles.modalInput}
                      required
                    />
                  </div>
                </div>

                {/* Justification */}
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Justification / Requirements</label>
                  <textarea
                    value={editFormData.justification}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, justification: e.target.value }))}
                    style={styles.modalTextarea}
                    placeholder="Why do you need this resource? Provide details about the work they will be doing..."
                  />
                </div>
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={isEditSubmitting}
                  style={{
                    ...styles.cancelBtn,
                    opacity: isEditSubmitting ? 0.6 : 1,
                    cursor: isEditSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditSubmitting}
                  style={{
                    ...styles.saveBtn,
                    opacity: isEditSubmitting ? 0.8 : 1,
                    cursor: isEditSubmitting ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    justifyContent: 'center',
                  }}
                >
                  {isEditSubmitting ? (
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
                      Saving Changes...
                    </>
                  ) : (
                    'Save Changes'
                  )}
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
    gap: '20px',
  },
  tabsRow: {
    display: 'flex',
    gap: '8px',
    borderBottom: '1px solid var(--color-border)',
    marginTop: '-4px',
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
    transition: 'all 0.2s',
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
  editBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    color: 'var(--color-primary, #2563eb)',
    border: '1px solid rgba(59, 130, 246, 0.25)',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  cancelRequestBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    color: 'var(--color-danger, #ef4444)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  cancelRequestBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  historyActionText: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontWeight: '500',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
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
    cursor: 'default',
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
    border: '1px solid var(--color-primary)',
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