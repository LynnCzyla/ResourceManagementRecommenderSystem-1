// main/src/frontend/ResourceManager/RMRequestsTab.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Swal from 'sweetalert2';
import RMAvatar from './RMAvatar';
import EmployeeProfileModal from './EmployeeProfileModal';
import {
  fetchRequirements,
  fetchEmployees,
  fetchAssignments,
  fetchRecommendations,
  createAssignment,
  updateRequirementStatus
} from './Rmapi';

export default function RMRequestsTab() {
  // ============================================
  // 1. ALL useState hooks
  // ============================================
  const [requests, setRequests] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [activeRequestDetails, setActiveRequestDetails] = useState(null);
  const [recommendations, setRecommendations] = useState({ recommended: [], all: [] });
  const [recommendationTab, setRecommendationTab] = useState('Recommended');
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState(new Set());
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(true);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [sortBy, setSortBy] = useState('score');
  const [sortOrder, setSortOrder] = useState('desc');
  const [isInfoHovered, setIsInfoHovered] = useState(false);

  const hasAutoExpanded = useRef(false);

  // ============================================
  // 2. ALL Helper Functions
  // ============================================

  const formatDate = (dateStr) => {
    if (!dateStr) return 'TBD';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'TBD';
    }
  };

  const getStatusInfo = (status) => {
    const statusMap = {
      'Strongly Recommended': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', label: 'Strongly Recommended' },
      'Recommended': { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', label: 'Recommended' },
      'Consider': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'Consider' },
      'Not Recommended': { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'Not Recommended' },
      'Missing Core Skills': { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)', label: '⚠️ Missing Core Skills' }
    };
    return statusMap[status] || { color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)', label: status || 'Unknown' };
  };

  const renderStars = (rating, hasRating = true) => {
    if (!hasRating || rating === null || rating === undefined || rating === 0) {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          fontSize: '11px',
          fontWeight: '700',
          color: 'var(--color-text-muted, #94a3b8)',
          backgroundColor: 'rgba(148, 163, 184, 0.12)',
          padding: '2px 8px',
          borderRadius: '10px',
          fontStyle: 'italic',
          letterSpacing: '0.2px'
        }}>
          No rating yet
        </span>
      );
    }

    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5 ? 1 : 0;
    const emptyStars = Math.max(0, 5 - fullStars - halfStar);

    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
        {[...Array(fullStars)].map((_, i) => (
          <span key={`full-${i}`} style={{ color: '#f59e0b' }}>★</span>
        ))}
        {halfStar === 1 && <span style={{ color: '#f59e0b' }}>☆</span>}
        {[...Array(emptyStars)].map((_, i) => (
          <span key={`empty-${i}`} style={{ color: '#d1d5db' }}>☆</span>
        ))}
        <span style={{ fontSize: '12px', marginLeft: '4px', color: 'var(--color-text-muted)' }}>
          ({rating.toFixed(1)})
        </span>
      </span>
    );
  };

  const getAssignmentCount = (requestId) => {
    if (!assignments || !Array.isArray(assignments)) {
      return 0;
    }
    return assignments.filter(a => a.requirement_id === requestId).length;
  };

  const getAssignedEmployees = (requestId) => {
    if (!employees || !Array.isArray(employees)) {
      return [];
    }
    if (!assignments || !Array.isArray(assignments)) {
      return [];
    }
    return assignments
      .filter(a => a.requirement_id === requestId)
      .map(a => {
        const employee = employees.find(e => e.id === a.profile_id);
        return employee || { name: 'Unknown', id: a.profile_id };
      });
  };

  const groupRequestsByProject = (requestsList) => {
    const groups = new Map();
    requestsList.forEach(req => {
      const key = req.project_id || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, {
          projectId: key,
          projectName: req.projectName || 'Unnamed Project',
          priority: req.projectPriority || req.priority || 'Medium',
          requirements: [],
          totalNeeded: 0,
          totalFilled: 0,
          isFullyAssigned: true
        });
      }
      const group = groups.get(key);
      const assignedCount = getAssignmentCount(req.id);
      const reqWithCount = { ...req, assignedCount };
      group.requirements.push(reqWithCount);
      group.totalNeeded += req.quantity || 1;
      group.totalFilled += assignedCount;
      group.isFullyAssigned = group.totalFilled >= group.totalNeeded;

      // Update to highest priority among requirements or project if any
      const priorityWeights = { 'high': 3, 'medium': 2, 'low': 1 };
      const currentWeight = priorityWeights[(group.priority || '').toLowerCase()] || 2;
      const reqWeight = priorityWeights[(req.priority || req.projectPriority || '').toLowerCase()] || 2;
      if (reqWeight > currentWeight) {
        group.priority = req.priority || req.projectPriority;
      }
    });

    // Always sort by priority from High to Low (High at the top)
    const priorityWeights = { 'high': 3, 'medium': 2, 'low': 1 };
    return Array.from(groups.values()).sort((a, b) => {
      const weightA = priorityWeights[(a.priority || '').toLowerCase()] || 2;
      const weightB = priorityWeights[(b.priority || '').toLowerCase()] || 2;
      if (weightB !== weightA) {
        return weightB - weightA; // High (3) first, then Medium (2), then Low (1)
      }
      // If priority is the same, unstaffed requests come first
      if (a.isFullyAssigned !== b.isFullyAssigned) {
        return a.isFullyAssigned ? 1 : -1;
      }
      return 0;
    });
  };

  const sortCandidates = (candidates, sortBy, sortOrder) => {
    if (!candidates || candidates.length === 0) return candidates;
    const sorted = [...candidates];
    switch (sortBy) {
      case 'score':
        sorted.sort((a, b) => (a.score || 0) - (b.score || 0));
        break;
      case 'skills':
        sorted.sort((a, b) => {
          const aMatch = a.matchedSkills?.length || 0;
          const bMatch = b.matchedSkills?.length || 0;
          return aMatch - bMatch;
        });
        break;
      case 'availability':
        sorted.sort((a, b) => (a.availabilityFactor || 0) - (b.availabilityFactor || 0));
        break;
      case 'performance':
        sorted.sort((a, b) => (a.historicalPerformance || 0) - (b.historicalPerformance || 0));
        break;
      case 'name':
        sorted.sort((a, b) => a.employee?.name?.localeCompare(b.employee?.name) || 0);
        break;
      default:
        break;
    }
    return sortOrder === 'desc' ? sorted.reverse() : sorted;
  };

  const toggleProjectExpansion = (projectId) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  // ============================================
  // 3. ALL useMemo hooks
  // ============================================

  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      // Exclude requests for completed/archived/cancelled projects
      const projStatusLower = (req.projectStatus || '').toLowerCase();
      if (['completed', 'archived', 'cancelled', 'canceled'].includes(projStatusLower)) {
        return false;
      }
      // Exclude Cancelled / Canceled / Completed / Done / Rejected requests from Resource Allocation Requests
      const statusLower = (req.status || '').toLowerCase();
      if (['cancelled', 'canceled', 'completed', 'done', 'rejected', 'filled', 'fulfilled'].includes(statusLower)) {
        return false;
      }
      const matchesSearch =
        req.projectName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.role_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.skills?.some(skill => skill?.toLowerCase().includes(searchQuery.toLowerCase()));

      const reqPriority = (req.priority || req.projectPriority || 'Medium').toLowerCase();
      const matchesPriority = priorityFilter === 'All' || reqPriority === priorityFilter.toLowerCase();

      const assignedCount = getAssignmentCount(req.id);
      const quantity = req.quantity || 1;
      const isFullyAssigned = assignedCount >= quantity;
      const matchesUnassigned = showUnassignedOnly ? !isFullyAssigned : true;
      return matchesSearch && matchesPriority && matchesUnassigned;
    });
  }, [requests, searchQuery, priorityFilter, showUnassignedOnly, assignments]);

  const groupedProjects = useMemo(
    () => groupRequestsByProject(filteredRequests),
    [filteredRequests]
  );

  const displayedRecommendations = useMemo(() => {
    let candidates = recommendationTab === 'View all'
      ? recommendations.all
      : recommendations.recommended;
    if (!candidates || candidates.length === 0) return [];
    if (recommendationTab === 'Recommended') {
      candidates = candidates.filter(c => c.score >= 40);
    }
    return sortCandidates(candidates, sortBy, sortOrder);
  }, [recommendations, recommendationTab, sortBy, sortOrder]);

  // ============================================
  // 4. ALL useEffect hooks
  // ============================================

  useEffect(() => {
    fetchData();
    const handleUpdate = () => {
      fetchData(true);
    };
    window.addEventListener('rmDataUpdated', handleUpdate);
    return () => {
      window.removeEventListener('rmDataUpdated', handleUpdate);
    };
  }, []);

  useEffect(() => {
    if (groupedProjects.length > 0 && !hasAutoExpanded.current) {
      const newExpanded = new Set();
      groupedProjects.forEach(project => {
        newExpanded.add(project.projectId);
      });
      setExpandedProjects(newExpanded);
      hasAutoExpanded.current = true;
      console.log('✅ Projects expanded:', newExpanded.size);
    }
  }, [groupedProjects]);

  // ============================================
  // 5. Event Handlers and other functions
  // ============================================

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [requestsData, employeesData, assignmentsData] = await Promise.all([
        fetchRequirements(),
        fetchEmployees(),
        fetchAssignments()
      ]);
      setRequests(Array.isArray(requestsData) ? requestsData : (requestsData?.requirements || requestsData?.data || []));
      setEmployees(Array.isArray(employeesData) ? employeesData : (employeesData?.employees || employeesData?.data || []));
      setAssignments(Array.isArray(assignmentsData) ? assignmentsData : (assignmentsData?.assignments || assignmentsData?.data || []));
    } catch (error) {
      console.error('❌ Error fetching data:', error);
      if (!silent) {
        Swal.fire({
          title: 'Error!',
          text: error.message || 'Failed to load data. Please try again.',
          icon: 'error',
          confirmButtonColor: 'var(--color-danger)',
          confirmButtonText: 'OK',
        });
      }
    } finally {
      if (!silent) setLoading(false);
      hasAutoExpanded.current = false;
    }
  };

  const handleAllocateCandidate = async (request, candidate) => {
    try {
      await createAssignment({
        project_id: request.project_id,
        profile_id: candidate.id,
        requirement_id: request.id,
        assigned_role: candidate.role,
        start_date: request.start_date,
        end_date: request.end_date,
        status: 'Assigned'
      });
      await fetchData();
      setActiveRequestDetails(null);
      window.dispatchEvent(new CustomEvent('rmDataUpdated'));
      showSuccessAlert(`Allocated ${candidate.name} to ${request.projectName}`);
    } catch (error) {
      console.error('Error allocating:', error);
      showErrorAlert(error.message || 'Failed to allocate candidate. Please try again.');
    }
  };

  const handleViewProfile = (employee) => {
    const safeEmployees = Array.isArray(employees) ? employees : (employees?.employees || employees?.data || []);
    const recData = displayedRecommendations.find(r => r.employee.id === employee.id);
    const hasPerf = Boolean(
      recData?.hasPerformanceRating ??
      recData?.employee?.hasPerformanceRating ??
      (recData?.performanceRating !== null && recData?.performanceRating !== undefined && recData?.performanceRating > 0) ??
      (recData?.breakdown?.performance?.hasRating) ??
      (recData?.historicalPerformance && recData?.historicalPerformance !== 0.7 && recData?.historicalPerformance > 0)
    );
    const performanceRating = hasPerf
      ? (recData?.performanceRating ?? (recData?.historicalPerformance ? recData.historicalPerformance * 5 : 0))
      : 0;

    const isNew = Boolean(
      (
        recData?.isNewEmployee ||
        recData?.employee?.isNewEmployee ||
        employee.isNewEmployee ||
        (() => {
          const empRecord = safeEmployees.find(e => e.id === employee.id);
          if (!empRecord) return false;
          const jDate = empRecord.join_date || empRecord.created_at;
          return jDate ? (Date.now() - new Date(jDate).getTime() <= 60 * 24 * 60 * 60 * 1000) : false;
        })()
      ) && !hasPerf
    );
    setSelectedEmployee({
      ...employee,
      matchedSkills: recData?.matchedSkills || [],
      missingSkills: recData?.missingSkills || [],
      performanceRating: performanceRating,
      hasPerformanceData: hasPerf,
      status: recData?.status || 'Not Recommended',
      requirementId: activeRequestDetails?.id,
      isNewEmployee: isNew
    });
    setShowProfileModal(true);
  };

  const showConfirmationAlert = (title, text, confirmText = 'Yes, proceed!') => {
    return Swal.fire({
      title,
      text,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'var(--color-primary)',
      cancelButtonColor: 'var(--color-text-muted)',
      confirmButtonText: confirmText,
      cancelButtonText: 'Cancel',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
      iconColor: 'var(--color-warning)',
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm',
        cancelButton: 'swal-custom-cancel'
      }
    });
  };

  const showSuccessAlert = (message) => {
    Swal.fire({
      title: 'Success!',
      text: message,
      icon: 'success',
      confirmButtonColor: 'var(--color-primary)',
      confirmButtonText: 'OK',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
      iconColor: 'var(--color-success)',
      customClass: { popup: 'swal-custom-popup', confirmButton: 'swal-custom-confirm' }
    });
  };

  const showErrorAlert = (message) => {
    Swal.fire({
      title: 'Error!',
      text: message,
      icon: 'error',
      confirmButtonColor: 'var(--color-danger)',
      confirmButtonText: 'OK',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
      iconColor: 'var(--color-danger)',
      customClass: { popup: 'swal-custom-popup', confirmButton: 'swal-custom-confirm' }
    });
  };

  const showClassificationInfo = () => {
    Swal.fire({
      title: 'Candidate Classification',
      html: `
        <div style="text-align: left; line-height: 1.45; font-size: 13px; max-height: 58vh; overflow-y: auto; padding: 0 4px 2px">
          <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 10px 12px; margin-bottom: 10px; border-radius: 8px; background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.25)">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 2px">
              <span style="font-size: 18px; font-weight: 800; color: #60a5fa">60%</span>
              <span style="font-size: 12px; color: var(--color-text-muted)">Skills</span>
            </div>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 2px">
              <span style="font-size: 18px; font-weight: 800; color: #f59e0b">25%</span>
              <span style="font-size: 12px; color: var(--color-text-muted)">Availability</span>
            </div>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 2px">
              <span style="font-size: 18px; font-weight: 800; color: #a78bfa">15%</span>
              <span style="font-size: 12px; color: var(--color-text-muted)">Performance</span>
            </div>
          </div>
          <section style="padding: 10px 12px; margin-bottom: 8px; border-radius: 8px; background: rgba(255, 255, 255, 0.04)">
            <strong style="display: block; margin-bottom: 4px; color: var(--color-text-primary)">Overall Score</strong>
            <span>Combines skill match (60%), availability (25%), and performance history (15%). A higher score means a stronger fit. It turns red when a core skill is missing.</span>
          </section>
          <section style="padding: 10px 12px; margin-bottom: 8px; border-radius: 8px; background: rgba(255, 255, 255, 0.04)">
            <strong style="display: block; margin-bottom: 4px; color: #22c55e">Matching Skills · 60%</strong>
            <span>Core skills count 4x more than secondary skills, so the weighted percentage may differ from the simple count (4/5 is not always 80%).</span>
            <div style="margin-top: 6px"><span style="color: #22c55e; font-weight: 700">Green</span> = matched skills, including aliases.</div>
            <div><span style="color: #ef4444; font-weight: 700">Red</span> = missing skills. <strong>Core: x/y</strong> = primary skills met.</div>
          </section>
          <section style="padding: 10px 12px; margin-bottom: 8px; border-radius: 8px; background: rgba(255, 255, 255, 0.04)">
            <strong style="display: block; margin-bottom: 4px; color: #f59e0b">Availability · 25%</strong>
            <span>Based on workload. Active tasks use priority weights: High 3, Medium 2, Low 1.</span>
            <div style="margin-top: 6px"><strong>Available:</strong> 80% or higher · <strong>Limited:</strong> 50–79% · <strong>Fully Utilized:</strong> below 50%</div>
          </section>
          <section style="padding: 10px 12px; border-radius: 8px; background: rgba(255, 255, 255, 0.04)">
            <strong style="display: block; margin-bottom: 4px; color: #a78bfa">Performance History · 15%</strong>
            <span>Average Project Manager rating out of 5, converted to a percentage. No-rating employees use the neutral 70% default and display 3.5 stars.</span>
          </section>
        </div>
      `,
      width: 'min(620px, calc(100vw - 32px))',
      padding: '24px',
      icon: 'info',
      confirmButtonColor: 'var(--color-primary)',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
      customClass: { popup: 'swal-custom-popup', confirmButton: 'swal-custom-confirm' },
      didOpen: () => {
        const popup = Swal.getPopup();
        if (popup) {
          popup.style.setProperty('width', 'min(900px, calc(100vw - 32px))', 'important');
          popup.style.setProperty('max-width', '900px', 'important');
        }
      }
    });
  };

  const handleReject = async (reqId) => {
    const result = await showConfirmationAlert(
      'Reject Request',
      'Are you sure you want to reject this resource request? This action cannot be undone.',
      'Yes, Reject'
    );
    if (!result.isConfirmed) return;
    try {
      await updateRequirementStatus(reqId, 'Rejected');
      setRequests(prev => prev.filter(r => r.id !== reqId));
      if (activeRequestDetails?.id === reqId) {
        setActiveRequestDetails(null);
        setRecommendations({ recommended: [], all: [] });
      }
      await fetchData();
      showSuccessAlert('Request has been rejected.');
    } catch (error) {
      console.error('Error rejecting request:', error);
      showErrorAlert('Failed to reject request. Please try again.');
    }
  };

  const handleCancelRequest = async (reqId) => {
    const result = await showConfirmationAlert(
      'Cancel Request',
      'Are you sure you want to cancel this resource request? It will be removed from this page.',
      'Yes, Cancel'
    );
    if (!result.isConfirmed) return;
    try {
      await updateRequirementStatus(reqId, 'Cancelled');
      setRequests(prev => prev.filter(r => r.id !== reqId));
      if (activeRequestDetails?.id === reqId) {
        setActiveRequestDetails(null);
        setRecommendations({ recommended: [], all: [] });
      }
      await fetchData();
      showSuccessAlert('Request has been cancelled.');
    } catch (error) {
      console.error('Error cancelling request:', error);
      showErrorAlert('Failed to cancel request. Please try again.');
    }
  };

  const handleCompleteRequest = async (reqId) => {
    const result = await showConfirmationAlert(
      'Complete Request',
      'Are you sure you want to mark this resource request as completed? It will be removed from this page.',
      'Yes, Complete'
    );
    if (!result.isConfirmed) return;
    try {
      await updateRequirementStatus(reqId, 'Completed');
      setRequests(prev => prev.filter(r => r.id !== reqId));
      if (activeRequestDetails?.id === reqId) {
        setActiveRequestDetails(null);
        setRecommendations({ recommended: [], all: [] });
      }
      await fetchData();
      showSuccessAlert('Request has been marked as completed.');
    } catch (error) {
      console.error('Error completing request:', error);
      showErrorAlert('Failed to complete request. Please try again.');
    }
  };

  const fetchRecommendationsData = async (requirementId) => {
    try {
      const data = await fetchRecommendations(requirementId);
      setRecommendations(data.data || data || { recommended: [], all: [] });
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      setRecommendations({ recommended: [], all: [] });
    }
  };

  const handleViewRecommendations = async (req) => {
    console.log('🔍 Viewing recommendations for:', req.role_title);
    console.log('📋 Requirement ID from frontend:', req.id);
    console.log('📋 Skills from frontend:', req.skills);
    console.log('📋 Project ID:', req.project_id);

    setLoadingRecommendations(true);
    setActiveRequestDetails(req);
    setRecommendationTab('Recommended');
    setSelectedCandidateId(null);

    try {
      await fetchRecommendationsData(req.id);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  // ============================================
  // 6. Conditional return (LAST)
  // ============================================
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Resource Allocation Requests</h1>
          <p style={styles.subtitle}>Loading requests...</p>
        </div>
        <div style={styles.loadingContainer}>
          <div style={styles.loadingSpinner}></div>
        </div>
      </div>
    );
  }

  // ============================================
  // 7. Main return with JSX
  // ============================================
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Resource Allocation Requests</h1>
        <p style={styles.subtitle}>Review requested skill sets, analyze system-ranked candidates, and approve deployments.</p>
      </div>

      <div style={styles.mainLayout}>
        {/* Left Panel - Requests List */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Pending Requests</h2>
            <div style={styles.controls}>
              <div style={styles.searchWrapper}>
                <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                style={styles.filterSelect}
              >
                <option value="All">All Priority</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          <div style={styles.requestList}>
            {groupedProjects.length === 0 ? (
              <div style={styles.emptyState}>
                {showUnassignedOnly
                  ? 'No unassigned requests found.'
                  : 'No pending resource requests. All active requirements have been allocated or projects are completed.'}
              </div>
            ) : (
              groupedProjects.map(project => {
                const isExpanded = expandedProjects.has(project.projectId);

                return (
                  <div key={project.projectId} style={styles.projectCard}>
                    <div
                      style={styles.projectHeader}
                      onClick={() => toggleProjectExpansion(project.projectId)}
                    >
                      <div style={styles.projectHeaderLeft}>
                        <span style={styles.expandIcon}>
                          {isExpanded ? '▾' : '▸'}
                        </span>
                        <div style={styles.projectInfo}>
                          <h3 style={styles.projectName}>{project.projectName}</h3>
                          <div style={styles.projectSubtitle}>
                            <span>{project.requirements.length} {project.requirements.length === 1 ? 'role' : 'roles'}</span>
                            <span style={styles.dot}>•</span>
                            <span>{project.totalFilled}/{project.totalNeeded} filled</span>
                          </div>
                        </div>
                      </div>
                      <div style={styles.projectHeaderRight}>
                        <span style={{
                          ...styles.projectStatusBadge,
                          backgroundColor: project.isFullyAssigned ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: project.isFullyAssigned ? '#22c55e' : '#f59e0b',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}>
                          {project.isFullyAssigned ? (
                            <>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                              </svg>
                              Fully Staffed
                            </>
                          ) : (
                            <>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                              </svg>
                              Needs Staff
                            </>
                          )}
                        </span>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: (project.priority || '').toLowerCase() === 'high'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : (project.priority || '').toLowerCase() === 'low'
                              ? 'rgba(59, 130, 246, 0.15)'
                              : 'rgba(245, 158, 11, 0.15)',
                          color: (project.priority || '').toLowerCase() === 'high'
                            ? '#ef4444'
                            : (project.priority || '').toLowerCase() === 'low'
                              ? '#3b82f6'
                              : '#f59e0b',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          whiteSpace: 'nowrap',
                        }}>
                          Priority: {project.priority || 'Medium'}
                        </span>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div style={styles.requirementsContainer}>
                        {project.requirements.length === 0 ? (
                          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                            No requirements for this project
                          </div>
                        ) : (
                          project.requirements.map(req => {
                            const assignedCount = req.assignedCount;
                            const assignedEmployees = getAssignedEmployees(req.id);
                            const isFullyAssigned = assignedCount >= (req.quantity || 1);

                            return (
                              <div key={req.id} style={styles.requirementCard}>
                                <div style={styles.requirementHeader}>
                                  <div style={styles.requirementTitle}>
                                    <span style={styles.requirementRole}>
                                      {req.role_title || 'Role Not Specified'}
                                    </span>
                                    <span style={styles.requirementFillStatus}>
                                      {assignedCount}/{req.quantity || 1} filled
                                      {assignedCount > 0 && assignedCount < (req.quantity || 1) && (
                                        <span style={{ color: '#f59e0b', marginLeft: '4px' }}>
                                          (Partial)
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div style={styles.requirementActions}>
                                    {req.status === 'Pending' && (
                                      <span style={styles.pendingBadge}>Pending</span>
                                    )}
                                    {isFullyAssigned && (
                                      <span style={styles.staffedBadge}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: '2px' }}>
                                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                          <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                        </svg>
                                        Staffed
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div style={styles.requirementTimeline}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.timelineIcon}>
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                  </svg>
                                  <span>
                                    {formatDate(req.start_date)} → {formatDate(req.end_date)}
                                  </span>
                                </div>

                                {assignedCount > 0 && (
                                  <div style={styles.assignedContainer}>
                                    <span style={styles.assignedLabel}>Assigned:</span>
                                    <div style={styles.assignedList}>
                                      {assignedEmployees.map((emp, i) => (
                                        <span key={i} style={styles.assignedPill}>
                                          {emp.name}
                                        </span>
                                      ))}
                                    </div>
                                    {assignedCount < (req.quantity || 1) && (
                                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                        ({req.quantity - assignedCount} more needed)
                                      </span>
                                    )}
                                  </div>
                                )}

                                {req.skills && req.skills.length > 0 && (
                                  <div style={styles.skillsContainer}>
                                    {req.skills.map((skill, i) => (
                                      <span key={i} style={styles.skillPill}>{skill}</span>
                                    ))}
                                  </div>
                                )}

                                <div style={styles.requirementFooter}>
                                  <button
                                    onClick={() => handleViewRecommendations(req)}
                                    style={{
                                      ...styles.viewBtn,
                                      opacity: (req.status === 'Rejected' || isFullyAssigned) ? 0.5 : 1,
                                      cursor: (req.status === 'Rejected' || isFullyAssigned) ? 'not-allowed' : 'pointer'
                                    }}
                                    disabled={req.status === 'Rejected' || isFullyAssigned}
                                  >
                                    {isFullyAssigned ? (
                                      <>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: '4px' }}>
                                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                          <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                        </svg>
                                        Staffed
                                      </>
                                    ) : 'View Candidates'}
                                  </button>
                                  {!isFullyAssigned && (
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      {req.status === 'Pending' && (
                                        <button
                                          onClick={() => handleReject(req.id)}
                                          style={styles.rejectBtn}
                                        >
                                          Reject
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleCancelRequest(req.id)}
                                        style={{
                                          ...styles.rejectBtn,
                                          color: '#ef4444',
                                          borderColor: 'rgba(239, 68, 68, 0.4)',
                                          backgroundColor: 'rgba(239, 68, 68, 0.08)'
                                        }}
                                        title="Cancel this resource request"
                                      >
                                        Cancel
                                      </button>
                                      {req.status === 'Partially Allocated' && (
                                        <button
                                          onClick={() => handleCompleteRequest(req.id)}
                                          style={{
                                            ...styles.rejectBtn,
                                            color: 'var(--color-success)',
                                            borderColor: 'rgba(34, 197, 94, 0.4)',
                                            backgroundColor: 'rgba(34, 197, 94, 0.08)'
                                          }}
                                          title="Mark as completed with current allocations"
                                        >
                                          Complete
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel - Recommendations */}
        <div style={styles.panel}>
          <h2 style={{ ...styles.panelTitle, display: 'flex', alignItems: 'center', gap: '6px' }}>
            Recommendations
            <button
              type="button"
              onClick={showClassificationInfo}
              onMouseEnter={() => setIsInfoHovered(true)}
              onMouseLeave={() => setIsInfoHovered(false)}
              title="View candidate classification details"
              aria-label="Candidate classification information"
              style={{
                color: isInfoHovered ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '15px',
                lineHeight: 1,
                cursor: 'pointer',
                fontWeight: '700',
                border: `1px solid ${isInfoHovered ? 'var(--color-primary)' : 'var(--color-text-muted)'}`,
                borderRadius: '50%',
                background: isInfoHovered ? 'rgba(34, 197, 94, 0.12)' : 'transparent',
                width: '18px',
                height: '18px',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease'
              }}
            >
              ⓘ
            </button>
          </h2>

          {!activeRequestDetails ? (
            <div style={styles.emptyPanelState}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={styles.emptyIcon}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <p>Select a role to see candidates</p>
              <span style={styles.emptySubtext}>Click "View Candidates" on any request</span>
            </div>
          ): loadingRecommendations ? (
            <div style={styles.loadingRecommendationsContainer}>
              <div style={styles.loadingSpinner}></div>
              <p style={styles.loadingText}>Finding the best candidates...</p>
            </div>
          ) : (
            <div>
              <div style={styles.requestInfoBar}>
                <div>
                  <strong style={styles.infoProject}>{activeRequestDetails.projectName}</strong>
                  <span style={styles.infoRole}>{activeRequestDetails.role_title || 'Role'}</span>
                </div>
                <div style={styles.infoStats}>
                  <span>{activeRequestDetails.quantity || 1} position{activeRequestDetails.quantity > 1 ? 's' : ''}</span>
                </div>
              </div>

              <div style={styles.tabs}>
                <button
                  onClick={() => setRecommendationTab('Recommended')}
                  style={{
                    ...styles.tabBtn,
                    ...(recommendationTab === 'Recommended' ? styles.tabActive : {})
                  }}
                >
                  Top Matches
                </button>
                <button
                  onClick={() => setRecommendationTab('View all')}
                  style={{
                    ...styles.tabBtn,
                    ...(recommendationTab === 'View all' ? styles.tabActive : {})
                  }}
                >
                  All Candidates
                </button>
              </div>

              <div style={styles.recommendationList}>
                {displayedRecommendations.length === 0 ? (
                  <div style={styles.emptyRecommendation}>
                    <p>No candidates found</p>
                    <span style={styles.emptySubtext}>Try adjusting the search criteria</span>
                  </div>
                ) : (
                  displayedRecommendations.map((rec) => {
                    const safeAssignments = Array.isArray(assignments) ? assignments : (assignments?.assignments || assignments?.data || []);
                    const safeEmployees = Array.isArray(employees) ? employees : (employees?.employees || employees?.data || []);
                    const isAlreadyAssigned = safeAssignments.some(
                      a => a.requirement_id === activeRequestDetails.id && a.profile_id === rec.employee.id
                    );
                    const statusInfo = getStatusInfo(rec.status);
                    const hasRating = Boolean(
                      rec.hasPerformanceRating ??
                      rec.employee?.hasPerformanceRating ??
                      (rec.performanceRating !== null && rec.performanceRating !== undefined && rec.performanceRating > 0) ??
                      (rec.breakdown?.performance?.hasRating) ??
                      (rec.historicalPerformance && rec.historicalPerformance !== 0.7 && rec.historicalPerformance > 0)
                    );
                    const performanceRating = hasRating
                      ? (rec.performanceRating || (rec.historicalPerformance * 5) || 0)
                      : 0;

                    return (
                      <div key={rec.employee.id} style={styles.recCard}>
                        <div style={styles.recHeader}>
                          <RMAvatar name={rec.employee.name} src={rec.employee.avatar} size={40} />
                          <div style={styles.recInfo}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <div style={styles.recName}>{rec.employee.name}</div>
                              {Boolean(
                                (
                                  rec.isNewEmployee ||
                                  rec.employee?.isNewEmployee ||
                                  (() => {
                                    const empRecord = safeEmployees.find(e => e.id === rec.employee?.id);
                                    if (!empRecord) return false;
                                    const jDate = empRecord.join_date || empRecord.created_at;
                                    return jDate ? (Date.now() - new Date(jDate).getTime() <= 60 * 24 * 60 * 60 * 1000) : false;
                                  })()
                                ) && !hasRating
                              ) && (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(59, 130, 246, 0.2))',
                                  color: '#34d399',
                                  border: '1px solid rgba(52, 211, 153, 0.4)',
                                  boxShadow: '0 0 8px rgba(16, 185, 129, 0.15)',
                                  letterSpacing: '0.2px'
                                }}>
                                  New Employee
                                </span>
                              )}
                            </div>
                            <div style={styles.recRole}>{rec.employee.role || 'Employee'}</div>
                            <div style={styles.recDepartment}>{rec.employee.department || ''}</div>
                            {/* Score & Workload Pills */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                              <span style={{
                                fontSize: '11px',
                                fontWeight: '700',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                backgroundColor: rec.missingCoreSkills
                                  ? 'rgba(239, 68, 68, 0.15)'
                                  : (rec.score >= 70 ? 'rgba(34, 197, 94, 0.15)' : rec.score >= 40 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)'),
                                color: rec.missingCoreSkills
                                  ? '#ef4444'
                                  : (rec.score >= 70 ? '#22c55e' : rec.score >= 40 ? '#3b82f6' : '#f59e0b')
                              }}>
                                {rec.score}% Score
                              </span>
                              <span style={{
                                fontSize: '11px',
                                fontWeight: '700',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                backgroundColor: 'rgba(34, 197, 94, 0.12)',
                                color: '#22c55e'
                              }}>
                                Matching Skills: {rec.breakdown?.skillMatchScore ?? rec.matchingScore ?? 0}%
                              </span>
                              {(() => {
                                const wScore = rec.workloadScore ?? rec.breakdown?.availability?.workloadPoints ?? 0;
                                const rawFactor = rec.availabilityFactor ?? (1 / (1 + Math.exp(0.4 * (wScore - 7))));
                                const availPct = wScore === 0 ? 100 : Math.min(100, Math.max(1, Math.round((rawFactor / 0.94263) * 100)));
                                const statusLabel = rec.availabilityStatus || rec.breakdown?.availability?.status || (availPct >= 80 ? 'Available' : availPct >= 50 ? 'Limited Availability' : 'Fully Utilized');
                                const isHeavy = statusLabel === 'Fully Utilized' || availPct < 50;
                                const isLimited = !isHeavy && (statusLabel === 'Limited Availability' || availPct < 80);

                                return (
                                  <span style={{
                                    fontSize: '11px',
                                    fontWeight: '700',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    backgroundColor: isHeavy
                                      ? 'rgba(239, 68, 68, 0.12)'
                                      : isLimited
                                      ? 'rgba(245, 158, 11, 0.12)'
                                      : 'rgba(34, 197, 94, 0.12)',
                                    color: isHeavy
                                      ? '#ef4444'
                                      : isLimited
                                      ? '#f59e0b'
                                      : '#22c55e'
                                  }}>
                                    {statusLabel} ({availPct}%)
                                  </span>
                                );
                              })()}
                              {rec.breakdown?.primarySkills?.fulfillment && (
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: '700',
                                  padding: '2px 6px',
                                  borderRadius: '8px',
                                  backgroundColor: rec.missingCoreSkills ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                                  color: rec.missingCoreSkills ? '#ef4444' : '#22c55e'
                                }}>
                                  Core: {rec.breakdown.primarySkills.fulfillment}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={styles.recStatus}>
                            <span style={{
                              ...styles.statusBadge,
                              color: statusInfo.color,
                              backgroundColor: statusInfo.bg,
                            }}>
                              {statusInfo.label}
                            </span>
                            <div style={styles.recStars}>
                              {renderStars(performanceRating || 3.5, true)}
                            </div>
                            <span style={styles.performanceHistory}>
                              Performance history: {Math.round((rec.historicalPerformance ?? 0.7) * 100)}%
                            </span>
                          </div>
                        </div>

                        {/* Explainable Skill Breakdown */}
                        {rec.breakdown ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '6px 0' }}>
                            {/* Required / Primary Skills */}
                            {((rec.breakdown.primarySkills?.matched?.length || 0) > 0 || (rec.breakdown.primarySkills?.missing?.length || 0) > 0) && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                                <span style={{ ...styles.skillsLabel, fontWeight: '700', color: 'var(--color-text-primary)' }}>
                                  Required:
                                </span>
                                {rec.breakdown.primarySkills?.matched?.map((skill, i) => {
                                  const md = rec.breakdown?.matchDetails?.find(m => m.required?.toLowerCase() === skill?.toLowerCase());
                                  const tooltip = md ? (md.type === 'alias' ? `Matched via alias: ${md.matchedWith} → ${skill}` : md.type === 'exact' ? 'Exact match' : `Matched via ${md.type}: ${md.matchedWith}`) : 'Primary requirement met';
                                  return (
                                    <span key={`p-m-${i}`} style={styles.matchingSkill} title={tooltip}>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: '3px' }}>
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                      </svg>
                                      {skill}
                                    </span>
                                  );
                                })}
                                {rec.breakdown.primarySkills?.missing?.map((skill, i) => (
                                  <span key={`p-miss-${i}`} style={{
                                    ...styles.missingSkill,
                                    border: '1px dashed #ef4444',
                                    fontWeight: '700'
                                  }} title="Missing mandatory prerequisite">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: '3px' }}>
                                      <line x1="18" y1="6" x2="6" y2="18"></line>
                                      <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                    {skill}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Secondary / Nice-to-Have Skills */}
                            {((rec.breakdown.secondarySkills?.matched?.length || 0) > 0 || (rec.breakdown.secondarySkills?.missing?.length || 0) > 0) && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                                <span style={styles.skillsLabel}>
                                  Bonus:
                                </span>
                                {rec.breakdown.secondarySkills?.matched?.map((skill, i) => {
                                  const md = rec.breakdown?.matchDetails?.find(m => m.required?.toLowerCase() === skill?.toLowerCase());
                                  const tooltip = md ? (md.type === 'alias' ? `Matched via alias: ${md.matchedWith} → ${skill}` : md.type === 'exact' ? 'Exact match' : `Matched via ${md.type}: ${md.matchedWith}`) : 'Secondary skill bonus';
                                  return (
                                    <span key={`s-m-${i}`} style={{
                                      fontSize: '10px',
                                      color: '#3b82f6',
                                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                      padding: '2px 8px',
                                      borderRadius: '4px',
                                      fontWeight: '700'
                                    }} title={tooltip}>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: '3px' }}>
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                      </svg>
                                      {skill}
                                    </span>
                                  );
                                })}
                                {rec.breakdown.secondarySkills?.missing?.slice(0, 3).map((skill, i) => (
                                  <span key={`s-miss-${i}`} style={{
                                    fontSize: '10px',
                                    color: 'var(--color-text-muted)',
                                    backgroundColor: 'rgba(107, 114, 128, 0.08)',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontWeight: '700'
                                  }} title="Optional skill not possessed">
                                    {skill}
                                  </span>
                                ))}
                                {(rec.breakdown.secondarySkills?.missing?.length || 0) > 3 && (
                                  <span style={styles.moreSkills}>+{(rec.breakdown.secondarySkills.missing.length - 3)} more</span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          /* Fallback when breakdown is absent */
                          <>
                            {rec.matchedSkills && rec.matchedSkills.length > 0 && (
                              <div style={styles.recSkills}>
                                <span style={styles.skillsLabel}>Matched Skills:</span>
                                {rec.matchedSkills.slice(0, 4).map((skill, i) => (
                                  <span key={i} style={styles.matchingSkill}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: '4px' }}>
                                      <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                    {skill}
                                  </span>
                                ))}
                                {rec.matchedSkills.length > 4 && (
                                  <span style={styles.moreSkills}>+{rec.matchedSkills.length - 4} more</span>
                                )}
                              </div>
                            )}

                            {rec.missingSkills && rec.missingSkills.length > 0 && (
                              <div style={styles.missingSkillsContainer}>
                                <span style={styles.skillsLabel}>Missing Skills:</span>
                                {rec.missingSkills.slice(0, 3).map((skill, i) => (
                                  <span key={i} style={styles.missingSkill}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: '4px' }}>
                                      <line x1="18" y1="6" x2="6" y2="18"></line>
                                      <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                    {typeof skill === 'object' ? skill.skill : skill}
                                  </span>
                                ))}
                                {rec.missingSkills.length > 3 && (
                                  <span style={styles.moreSkills}>+{rec.missingSkills.length - 3} more</span>
                                )}
                              </div>
                            )}
                          </>
                        )}

                        <div style={styles.recActions}>
                          <button
                            onClick={() => handleViewProfile(rec.employee)}
                            style={styles.viewProfileBtn}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}>
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            View Profile
                          </button>
                          <button
                            onClick={() => handleAllocateCandidate(activeRequestDetails, rec.employee)}
                            style={{
                              ...styles.allocateBtn,
                              opacity: isAlreadyAssigned ? 0.5 : 1,
                              cursor: isAlreadyAssigned ? 'not-allowed' : 'pointer',
                              backgroundColor: isAlreadyAssigned ? 'var(--color-text-muted)' : 'var(--color-primary)',
                            }}
                            disabled={isAlreadyAssigned}
                          >
                            {isAlreadyAssigned ? (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: '4px' }}>
                                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                </svg>
                                Already Assigned
                              </>
                            ) : 'Allocate Resource'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Employee Profile Modal */}
      {showProfileModal && selectedEmployee && (
        <EmployeeProfileModal
          employee={selectedEmployee}
          onClose={() => setShowProfileModal(false)}
          matchedSkills={activeRequestDetails ? recommendations.recommended.find(r => r.employee.id === selectedEmployee.id)?.matchedSkills || [] : []}
          missingSkills={activeRequestDetails ? recommendations.recommended.find(r => r.employee.id === selectedEmployee.id)?.missingSkills || [] : []}
          performanceRating={activeRequestDetails ? recommendations.recommended.find(r => r.employee.id === selectedEmployee.id)?.historicalPerformance * 5 || 0 : 0}
          status={activeRequestDetails ? recommendations.recommended.find(r => r.employee.id === selectedEmployee.id)?.status || 'Not Recommended' : 'Not Recommended'}
        />
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
  mainLayout: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1.8fr',
    gap: '24px',
  },
  panel: {
    background: 'var(--color-bg-card)',
    borderRadius: '12px',
    padding: '24px',
    border: '1px solid var(--color-border)',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '16px',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '12px',
  },
  panelTitle: {
    fontSize: '18px',
    fontWeight: '700',
    margin: 0,
    color: 'var(--color-text-primary)',
  },
  controls: {
    display: 'flex',
    gap: '10px',
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
    left: '10px',
    color: 'var(--color-text-muted)',
  },
  searchInput: {
    padding: '6px 10px 6px 32px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    outline: 'none',
    minWidth: '180px',
  },
  filterSelect: {
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    outline: 'none',
  },
  unassignedBtn: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
  },
  requestList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxHeight: '600px',
    overflowY: 'auto',
    paddingRight: '4px',
  },
  projectCard: {
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    overflow: 'visible',
    display: 'block',
  },
  projectHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    cursor: 'pointer',
    backgroundColor: 'var(--color-bg-card-hover)',
    borderBottom: '1px solid var(--color-border)',
    transition: 'all 0.2s ease',
  },
  projectHeaderLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    flex: 1,
    minWidth: 0,
  },
  projectInfo: {
    flex: 1,
    minWidth: 0,
  },
  expandIcon: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
    flexShrink: 0,
    marginTop: '2px',
  },
  projectName: {
    fontSize: '15px',
    fontWeight: '700',
    margin: 0,
    color: 'var(--color-text-primary)',
    wordBreak: 'break-word',
    lineHeight: 1.3,
  },
  projectSubtitle: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    display: 'flex',
    gap: '6px',
    marginTop: '2px',
    flexWrap: 'wrap',
  },
  dot: {
    color: 'var(--color-border)',
  },
  projectHeaderRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '6px',
    flexShrink: 0,
    marginLeft: '12px',
  },
  projectStatusBadge: {
    fontSize: '11px',
    fontWeight: '600',
    padding: '4px 12px',
    borderRadius: '20px',
    whiteSpace: 'nowrap',
  },
  requirementsContainer: {
    padding: '16px',
    backgroundColor: 'var(--color-bg-root)',
    borderTop: '1px solid var(--color-border)',
  },
  requirementCard: {
    padding: '16px',
    borderRadius: '8px',
    backgroundColor: 'var(--color-bg-card)',
    marginBottom: '12px',
    border: '1px solid var(--color-border)',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  requirementHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    flexWrap: 'wrap',
    gap: '8px',
  },
  requirementTitle: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  requirementRole: {
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    wordBreak: 'break-word',
    lineHeight: 1.3,
  },
  requirementFillStatus: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-bg-card-hover)',
    padding: '2px 8px',
    borderRadius: '12px',
  },
  requirementActions: {
    display: 'flex',
    gap: '8px',
  },
  pendingBadge: {
    fontSize: '10px',
    fontWeight: '600',
    padding: '2px 10px',
    borderRadius: '12px',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    color: '#f59e0b',
  },
  staffedBadge: {
    fontSize: '10px',
    fontWeight: '600',
    padding: '2px 10px',
    borderRadius: '12px',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    color: '#22c55e',
  },
  requirementTimeline: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    marginBottom: '8px',
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  timelineIcon: {
    flexShrink: 0,
    color: 'var(--color-text-muted)',
  },
  assignedContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '8px',
  },
  assignedLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
  },
  assignedList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  assignedPill: {
    fontSize: '10px',
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    padding: '2px 8px',
    borderRadius: '12px',
    fontWeight: '500',
  },
  skillsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginBottom: '10px',
  },
  skillPill: {
    fontSize: '10px',
    background: 'var(--color-bg-card-hover)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    padding: '3px 10px',
    borderRadius: '4px',
    maxWidth: '100%',
    wordBreak: 'break-word',
  },
  requirementFooter: {
    display: 'flex',
    gap: '10px',
    marginTop: '4px',
  },
  viewBtn: {
    flex: 1,
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    fontWeight: '600',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minWidth: '120px',
  },
  rejectBtn: {
    backgroundColor: 'transparent',
    color: 'var(--color-danger)',
    border: '1px solid var(--color-danger)',
    padding: '8px 16px',
    borderRadius: '6px',
    fontWeight: '600',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  emptyState: {
    padding: '40px 20px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '13px',
  },
  emptyPanelState: {
    padding: '60px 20px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '8px',
  },
  emptySubtext: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  tabs: {
    display: 'flex',
    gap: '0',
    marginBottom: '16px',
    borderBottom: '1px solid var(--color-border)',
  },
  tabBtn: {
    padding: '8px 16px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    borderBottom: '2px solid transparent',
    transition: 'all 0.2s',
  },
  tabActive: {
    color: 'var(--color-primary)',
    borderBottomColor: 'var(--color-primary)',
  },
  requestInfoBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'var(--color-bg-card-hover)',
    borderRadius: '8px',
    marginBottom: '16px',
    border: '1px solid var(--color-border)',
  },
  infoProject: {
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    marginRight: '8px',
  },
  infoRole: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
  },
  infoStats: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
  },
  recommendationList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxHeight: '500px',
    overflowY: 'auto',
    paddingRight: '4px',
  },
  recCard: {
    padding: '14px 16px',
    background: 'var(--color-bg-card-hover)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  recHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  recInfo: {
    flex: 1,
    minWidth: 0,
  },
  recName: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  recRole: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  recDepartment: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    opacity: 0.7,
  },
  recStatus: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '4px',
    flexShrink: 0,
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: '600',
    padding: '4px 10px',
    borderRadius: '12px',
    whiteSpace: 'nowrap',
  },
  recStars: {
    fontSize: '12px',
    fontWeight: '700',
  },
  performanceHistory: {
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap',
  },
  recSkills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    alignItems: 'center',
  },
  missingSkillsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    alignItems: 'center',
  },
  skillsLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--color-text-muted)',
    marginRight: '4px',
  },
  matchingSkill: {
    fontSize: '10px',
    color: '#22c55e',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: '700',
  },
  missingSkill: {
    fontSize: '10px',
    color: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: '700',
  },
  moreSkills: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    padding: '2px 4px',
  },
  recActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '4px',
  },
  viewProfileBtn: {
    flex: 1,
    backgroundColor: 'var(--color-bg-card-hover)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    padding: '6px 12px',
    borderRadius: '6px',
    fontWeight: '500',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  allocateBtn: {
    flex: 2,
    padding: '6px 12px',
    borderRadius: '6px',
    fontWeight: '600',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    color: '#ffffff',
    border: 'none',
  },
  emptyRecommendation: {
    padding: '40px 20px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '400px',
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid var(--color-border)',
    borderTop: '4px solid var(--color-primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingRecommendationsContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '400px',
    gap: '16px',
  },
  loadingText: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    margin: '0',
  },
};