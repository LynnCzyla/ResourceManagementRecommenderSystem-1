import React, { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';
import {
  fetchGlobalFeedbackReport,
  fetchProjectClientRatings,
  updateFeedbackVisibility,
  updateFeedbackBulkVisibility
} from './Rmapi';

const styles = {
  container: { padding: '8px 0' },
  filterBar: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' },
  select: { padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' },
  searchInput: { padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', minWidth: '240px', fontSize: '13px' },
  card: { padding: '20px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '12px 10px', textAlign: 'left', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 600 },
  td: { padding: '12px 10px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: 14 },
  badge: (source) => ({
    padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
    background: source === 'merged'
      ? 'rgba(139, 92, 246, 0.15)'
      : source === 'client'
        ? 'rgba(59,130,246,0.15)'
        : 'rgba(16,185,129,0.15)',
    color: source === 'merged'
      ? '#8b5cf6'
      : source === 'client'
        ? '#3b82f6'
        : '#10b981',
  }),
  expandRow: { background: 'var(--color-bg-secondary)' },
  expandCell: { padding: '14px', fontSize: 13, color: 'var(--color-text-secondary)' },
  emptyNote: { fontSize: '13px', color: 'var(--color-text-muted)', padding: '24px 0', textAlign: 'center' },

  // KPI Metrics Grid for Project Ratings
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
    marginBottom: '20px',
  },
  kpiCard: {
    padding: '18px 20px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    background: 'var(--color-bg-card, #ffffff)',
    border: '1px solid var(--color-border, #e5e7eb)',
    boxShadow: 'var(--shadow-sm)',
    cursor: 'default',
  },
  kpiIconWrapper: {
    width: '46px',
    height: '46px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  kpiValue: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    lineHeight: 1.2,
  },
  kpiLabel: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    marginTop: '2px',
    fontWeight: '500',
  },
};

function StarRatingBadge({ rating }) {
  if (rating == null || isNaN(rating)) {
    return <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>— Not rated yet</span>;
  }
  const num = Number(rating);
  const isHigh = num >= 4.0;
  const isMed = num >= 3.0 && num < 4.0;
  const color = isHigh ? '#10b981' : isMed ? '#f59e0b' : '#ef4444';
  const bg = isHigh ? 'rgba(16, 185, 129, 0.15)' : isMed ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 10px',
        borderRadius: '12px',
        fontWeight: '700',
        fontSize: '13px',
        color,
        backgroundColor: bg,
        border: `1px solid ${color}40`,
      }}
      title={`Overall client project rating: ${num.toFixed(1)} out of 5 stars`}
    >
      <span>★</span>
      <span>{num.toFixed(1)} / 5</span>
    </span>
  );
}

export default function RMFeedbackReportTab() {
  // Navigation: Sub-tab state ('employees' | 'projects')
  const [activeSubTab, setActiveSubTab] = useState('employees');

  // Employee Feedback State
  const [records, setRecords] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [filters, setFilters] = useState({ projectId: '', empId: '', feedbackSource: '' });
  const [selectedRecord, setSelectedRecord] = useState(null);

  // Client Project Ratings State (Exclusive to Resource Manager)
  const [projectRatings, setProjectRatings] = useState([]);
  const [projectSummary, setProjectSummary] = useState(null);
  const [projectRatingsLoading, setProjectRatingsLoading] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectRatingFilter, setProjectRatingFilter] = useState('all');
  const [selectedProjectRating, setSelectedProjectRating] = useState(null);

  // Load employee feedback
  const loadEmployeeFeedback = async (activeFilters = filters) => {
    setLoading(true);
    try {
      const data = await fetchGlobalFeedbackReport(activeFilters);
      const rows = data?.data || [];
      setRecords(rows);
      if (!activeFilters.projectId && !activeFilters.empId && !activeFilters.feedbackSource) {
        setAllRecords(rows);
      }
    } catch (err) {
      console.error('Failed to load global feedback report:', err);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  // Load project ratings by client (RM Exclusive)
  const loadProjectRatings = async () => {
    setProjectRatingsLoading(true);
    try {
      const res = await fetchProjectClientRatings();
      if (res?.success) {
        setProjectRatings(res.data || []);
        setProjectSummary(res.summary || null);
      }
    } catch (err) {
      console.error('Failed to load project client ratings:', err);
      setProjectRatings([]);
    } finally {
      setProjectRatingsLoading(false);
    }
  };

  useEffect(() => {
    loadEmployeeFeedback({ projectId: '', empId: '', feedbackSource: '' });
    loadProjectRatings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const projectOptions = useMemo(() => {
    const source = allRecords.length > 0 ? allRecords : records;
    return [...new Map(source.filter(r => r.projectId).map(r => [r.projectId, r.projectName])).entries()]
      .sort((a, b) => (a[1] || '').localeCompare(b[1] || ''));
  }, [allRecords, records]);

  const employeeOptions = useMemo(() => {
    const source = allRecords.length > 0 ? allRecords : records;
    return [...new Map(source.filter(r => r.subjectId).map(r => [r.subjectId, r.subjectName])).entries()]
      .sort((a, b) => (a[1] || '').localeCompare(b[1] || ''));
  }, [allRecords, records]);

  const handleFilterChange = (field, value) => {
    const updated = { ...filters, [field]: value };
    setFilters(updated);
    loadEmployeeFeedback(updated);
  };

  const handleResetFilters = () => {
    const reset = { projectId: '', empId: '', feedbackSource: '' };
    setFilters(reset);
    loadEmployeeFeedback(reset);
  };

  // Selected project counts
  const selectedProjectRecords = useMemo(() => {
    if (!filters.projectId) return [];
    return records.filter(r => String(r.projectId) === String(filters.projectId));
  }, [records, filters.projectId]);
  const projectPendingCount = selectedProjectRecords.filter(r => !r.isVisible).length;
  const projectVisibleCount = selectedProjectRecords.filter(r => r.isVisible).length;
  const selectedProjectName = projectOptions.find(([id]) => String(id) === String(filters.projectId))?.[1] || 'Selected Project';

  // Selected employee counts
  const selectedEmployeeRecords = useMemo(() => {
    if (!filters.empId) return [];
    return records.filter(r => String(r.subjectId) === String(filters.empId));
  }, [records, filters.empId]);
  const employeePendingCount = selectedEmployeeRecords.filter(r => !r.isVisible).length;
  const employeeVisibleCount = selectedEmployeeRecords.filter(r => r.isVisible).length;
  const selectedEmployeeName = employeeOptions.find(([id]) => String(id) === String(filters.empId))?.[1] || 'Selected Employee';

  // Active view counts across whatever filter is currently active
  const activePendingCount = useMemo(() => {
    if (filters.projectId && !filters.empId) return projectPendingCount;
    if (filters.empId && !filters.projectId) return employeePendingCount;
    return records.filter(r => !r.isVisible).length;
  }, [filters, records, projectPendingCount, employeePendingCount]);

  const activeVisibleCount = useMemo(() => {
    if (filters.projectId && !filters.empId) return projectVisibleCount;
    if (filters.empId && !filters.projectId) return employeeVisibleCount;
    return records.filter(r => r.isVisible).length;
  }, [filters, records, projectVisibleCount, employeeVisibleCount]);

  const activeTargetName = useMemo(() => {
    if (filters.projectId && !filters.empId) return `Project: ${selectedProjectName}`;
    if (filters.empId && !filters.projectId) return `Employee: ${selectedEmployeeName}`;
    if (filters.projectId && filters.empId) return `${selectedEmployeeName} in ${selectedProjectName}`;
    if (filters.feedbackSource) return `${filters.feedbackSource === 'client' ? 'Client' : 'PM'} Feedback`;
    return 'All Filtered Records';
  }, [filters, selectedProjectName, selectedEmployeeName]);

  // Filtered Project Ratings (Tab 2)
  const filteredProjectRatings = useMemo(() => {
    return projectRatings.filter(p => {
      const q = projectSearch.toLowerCase().trim();
      const matchesSearch = !q ||
        (p.projectName && p.projectName.toLowerCase().includes(q)) ||
        (p.projectCode && p.projectCode.toLowerCase().includes(q)) ||
        (p.clientName && p.clientName.toLowerCase().includes(q)) ||
        (p.clientEmail && p.clientEmail.toLowerCase().includes(q));

      let matchesRating = true;
      if (projectRatingFilter === '5') {
        matchesRating = p.projectRating != null && p.projectRating >= 4.75;
      } else if (projectRatingFilter === '4') {
        matchesRating = p.projectRating != null && p.projectRating >= 3.75 && p.projectRating < 4.75;
      } else if (projectRatingFilter === '3') {
        matchesRating = p.projectRating != null && p.projectRating < 3.75;
      }

      return matchesSearch && matchesRating;
    });
  }, [projectRatings, projectSearch, projectRatingFilter]);

  const handleToggleVisibility = async (record) => {
    const isVisible = record.isVisible;
    const actionText = isVisible ? 'Revoke Visibility' : 'Grant Visibility';
    const confirmText = isVisible
      ? `Are you sure you want to hide this feedback from ${record.subjectName}? They will no longer be able to view it.`
      : `Are you sure you want to grant permission for ${record.subjectName} to view their individual performance feedback? It will become visible on their dashboard. (Note: Overall project ratings remain confidential to RM).`;

    const result = await Swal.fire({
      title: `${actionText}?`,
      text: confirmText,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: isVisible ? '#ef4444' : '#10b981',
      cancelButtonColor: '#6b7280',
      confirmButtonText: isVisible ? 'Yes, hide feedback' : 'Yes, grant visibility',
    });

    if (!result.isConfirmed) return;

    setActionLoadingId(record.id);
    try {
      const res = await updateFeedbackVisibility(record.id, !isVisible);
      if (res.success) {
        Swal.fire({
          icon: 'success',
          title: isVisible ? 'Visibility Revoked' : 'Visibility Granted',
          text: res.message || 'Updated successfully.',
          timer: 2000,
          showConfirmButton: false,
        });
        await loadEmployeeFeedback(filters);
        if (selectedRecord && selectedRecord.id === record.id) {
          setSelectedRecord(prev => prev ? { ...prev, isVisible: !isVisible, status: !isVisible ? 'reviewed' : 'submitted' } : null);
        }
      }
    } catch (err) {
      console.error('Failed to update feedback visibility:', err);
      Swal.fire({
        icon: 'error',
        title: 'Update Failed',
        text: err.message || 'Could not update feedback visibility.',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleBulkVisibility = async (visible) => {
    let target = 'ids';
    let targetId = null;
    let targetRecords = records;

    if (filters.projectId && !filters.empId) {
      target = 'project';
      targetId = filters.projectId;
      targetRecords = selectedProjectRecords.length > 0 ? selectedProjectRecords : records;
    } else if (filters.empId && !filters.projectId) {
      target = 'employee';
      targetId = filters.empId;
      targetRecords = selectedEmployeeRecords.length > 0 ? selectedEmployeeRecords : records;
    } else {
      target = 'ids';
      targetRecords = records;
    }

    const actionRecords = visible
      ? targetRecords.filter(r => !r.isVisible)
      : targetRecords.filter(r => r.isVisible);
    const count = actionRecords.length;

    if (count === 0) {
      Swal.fire({
        icon: 'info',
        title: visible ? 'No Pending Records' : 'No Visible Records',
        text: visible
          ? `All records for ${activeTargetName} are already visible.`
          : `All records for ${activeTargetName} are already hidden.`,
      });
      return;
    }

    const actionText = visible ? 'Grant Visibility' : 'Revoke Visibility';
    const confirmMessage = visible
      ? `Are you sure you want to grant visibility for all ${count} rating${count !== 1 ? 's' : ''} for ${activeTargetName}? They will become visible on their dashboard.`
      : `Are you sure you want to hide all ${count} rating${count !== 1 ? 's' : ''} for ${activeTargetName}? They will no longer be visible on their dashboard.`;

    const result = await Swal.fire({
      title: `${actionText}?`,
      html: `
        <div style="text-align: left; font-size: 14px; line-height: 1.6; color: #4b5563;">
          <p>${confirmMessage}</p>
          <div style="margin-top: 12px; padding: 10px 14px; background: #f3f4f6; border-radius: 8px; font-weight: 600; color: #111827;">
            Target: <span style="color: #2563eb;">${activeTargetName}</span><br/>
            Records affected: <span style="color: ${visible ? '#16a34a' : '#dc2626'};">${count} record${count !== 1 ? 's' : ''}</span>
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: visible ? '#10b981' : '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: visible ? `Yes, grant visibility (${count})` : `Yes, revoke visibility (${count})`,
    });

    if (!result.isConfirmed) return;

    setBulkLoading(true);
    try {
      const recordIds = actionRecords.map(r => r.id);
      const res = await updateFeedbackBulkVisibility({
        target,
        id: targetId,
        recordIds,
        visible,
      });

      if (res.success) {
        Swal.fire({
          icon: 'success',
          title: visible ? 'Visibility Granted' : 'Visibility Revoked',
          text: res.message || `Updated ${count} feedback records successfully.`,
          timer: 2000,
          showConfirmButton: false,
        });
        await loadEmployeeFeedback(filters);
      }
    } catch (err) {
      console.error('Failed to update bulk feedback visibility:', err);
      Swal.fire({
        icon: 'error',
        title: 'Bulk Update Failed',
        text: err.message || 'Could not update bulk feedback visibility.',
      });
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* ── Sub-Navigation Bar ── */}
      <div style={{
        display: 'flex',
        gap: '12px',
        borderBottom: '1px solid var(--color-border)',
        paddingBottom: '14px',
        marginBottom: '20px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {/* Tab 1: Employee Feedback */}
        <button
          onClick={() => setActiveSubTab('employees')}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: activeSubTab === 'employees' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
            background: activeSubTab === 'employees' ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
            color: activeSubTab === 'employees' ? '#ffffff' : 'var(--color-text-secondary)',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            boxShadow: activeSubTab === 'employees' ? '0 2px 8px rgba(59, 130, 246, 0.3)' : 'none',
          }}
          title="Manage individual employee and PM 360 feedback reviews and visibility"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <span>Employee Feedback</span>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '12px',
            backgroundColor: activeSubTab === 'employees' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(107, 114, 128, 0.2)',
            color: activeSubTab === 'employees' ? '#ffffff' : 'var(--color-text-muted)'
          }}>
            {records.length}
          </span>
        </button>

        {/* Tab 2: Client Project Ratings (RM Exclusive) */}
        <button
          onClick={() => setActiveSubTab('projects')}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: activeSubTab === 'projects' ? '1px solid #8b5cf6' : '1px solid var(--color-border)',
            background: activeSubTab === 'projects' ? '#8b5cf6' : 'var(--color-bg-secondary)',
            color: activeSubTab === 'projects' ? '#ffffff' : 'var(--color-text-secondary)',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            boxShadow: activeSubTab === 'projects' ? '0 2px 8px rgba(139, 92, 246, 0.3)' : 'none',
          }}
          title="View overall project outcome ratings and deliverables assessment submitted by clients (RM exclusive)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2"></rect>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
          </svg>
          <span>Client Project Ratings</span>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '12px',
            backgroundColor: activeSubTab === 'projects' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(139, 92, 246, 0.2)',
            color: activeSubTab === 'projects' ? '#ffffff' : '#8b5cf6',
            fontWeight: 700
          }}>
            {projectRatings.length}
          </span>
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            {activeSubTab === 'projects' ? 'RM Internal Confidential View' : 'Feedback Controls'}
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 1: EMPLOYEE FEEDBACK VIEW ─────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'employees' && (
        <>
          <div style={styles.filterBar}>
            {/* Project Selector */}
            <select style={styles.select} value={filters.projectId} onChange={(e) => handleFilterChange('projectId', e.target.value)}>
              <option value="" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>All Projects</option>
              {projectOptions.map(([id, name]) => (
                <option key={id} value={id} style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>{name}</option>
              ))}
            </select>

            {/* Employee Selector */}
            <select style={styles.select} value={filters.empId} onChange={(e) => handleFilterChange('empId', e.target.value)}>
              <option value="" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>All Employees</option>
              {employeeOptions.map(([id, name]) => (
                <option key={id} value={id} style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>{name}</option>
              ))}
            </select>

            {/* Feedback Source */}
            <select style={styles.select} value={filters.feedbackSource} onChange={(e) => handleFilterChange('feedbackSource', e.target.value)}>
              <option value="" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>All Sources</option>
              <option value="client" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>Client</option>
              <option value="project_manager" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>Project Manager</option>
            </select>

            <button style={{ ...styles.select, cursor: 'pointer' }} onClick={() => loadEmployeeFeedback(filters)}>Apply Filters</button>

            {(filters.projectId || filters.empId || filters.feedbackSource) && (
              <button
                style={{
                  ...styles.select,
                  cursor: 'pointer',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  borderColor: 'rgba(239, 68, 68, 0.3)',
                  color: '#ef4444'
                }}
                onClick={handleResetFilters}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* ── ⚡ 1-Click Bulk Visibility Action Bar ── */}
          {records.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 18px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              marginBottom: 20,
              flexWrap: 'wrap',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.18)',
            }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginRight: '4px' }}>
                {activeTargetName}
              </span>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Bulk Grant */}
                <button
                  onClick={() => handleBulkVisibility(true)}
                  disabled={activePendingCount === 0 || bulkLoading}
                  style={{
                    padding: '7px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#ffffff',
                    backgroundColor: activePendingCount > 0 ? '#10b981' : 'rgba(107, 114, 128, 0.4)',
                    cursor: activePendingCount > 0 && !bulkLoading ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: activePendingCount > 0 ? '0 2px 6px rgba(16, 185, 129, 0.3)' : 'none',
                    transition: 'all 0.2s',
                  }}
                  title={activePendingCount > 0 ? `Grant visibility to all ${activePendingCount} pending individual reviews for ${activeTargetName}` : 'All records are already visible'}
                >
                  <span>Grant All ({activePendingCount} pending)</span>
                </button>

                {/* Bulk Revoke */}
                <button
                  onClick={() => handleBulkVisibility(false)}
                  disabled={activeVisibleCount === 0 || bulkLoading}
                  style={{
                    padding: '7px 16px',
                    borderRadius: '6px',
                    border: activeVisibleCount > 0 ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(107, 114, 128, 0.2)',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: activeVisibleCount > 0 ? '#ffffff' : 'rgba(255, 255, 255, 0.4)',
                    backgroundColor: activeVisibleCount > 0 ? '#ef4444' : 'rgba(107, 114, 128, 0.3)',
                    cursor: activeVisibleCount > 0 && !bulkLoading ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: activeVisibleCount > 0 ? '0 2px 6px rgba(239, 68, 68, 0.3)' : 'none',
                    transition: 'all 0.2s',
                  }}
                  title={activeVisibleCount > 0 ? `Hide all ${activeVisibleCount} individual reviews for ${activeTargetName}` : 'No visible records to revoke'}
                >
                  <span>Revoke All ({activeVisibleCount} visible)</span>
                </button>
              </div>
            </div>
          )}

          <div className="glass-card" style={styles.card}>
            {loading ? (
              <span style={styles.emptyNote}>Loading feedback records…</span>
            ) : records.length === 0 ? (
              <span style={styles.emptyNote}>No feedback records found.</span>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Employee / PM</th>
                    <th style={styles.th}>Project</th>
                    <th style={styles.th}>Evaluator Source</th>
                    <th style={styles.th}>Rating</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Visibility / Access</th>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id}>
                      <td style={styles.td}>
                        <span
                          style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--color-primary, #3b82f6)' }}
                          onClick={() => handleFilterChange('empId', r.subjectId)}
                          title="Click to filter & manage all ratings for this employee"
                        >
                          {r.subjectName}
                        </span>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.subjectRole}</div>
                      </td>
                      <td style={styles.td}>
                        <span
                          style={{ cursor: 'pointer', color: 'var(--color-text-primary)' }}
                          onClick={() => handleFilterChange('projectId', r.projectId)}
                          title="Click to filter & manage all ratings for this project"
                        >
                          {r.projectName}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.badge(r.evaluatorSource)}>
                          {r.evaluatorSource === 'merged' ? 'PM & Client (Merged)' : r.evaluatorSource === 'client' ? `Client (${r.evaluatorName})` : `PM (${r.evaluatorName})`}
                        </span>
                      </td>
                      <td style={styles.td}>{r.rating ?? '—'}/5</td>
                      <td style={styles.td}>
                        <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>
                          {r.status === 'reviewed' ? 'Reviewed' : 'Submitted'}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {r.isVisible ? (
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 600,
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            ● Visible to User
                          </span>
                        ) : (
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 600,
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#d97706',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            ○ Hidden (Pending Release)
                          </span>
                        )}
                      </td>
                      <td style={styles.td}>{r.ratedAt ? new Date(r.ratedAt).toLocaleDateString() : '—'}</td>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button
                            style={{
                              padding: '6px 12px',
                              fontSize: 12,
                              fontWeight: 600,
                              borderRadius: 6,
                              border: '1px solid var(--color-border)',
                              background: 'var(--color-primary-light)',
                              color: 'var(--color-primary)',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                            onClick={() => setSelectedRecord(r)}
                          >
                            Details
                          </button>
                          <button
                            disabled={actionLoadingId === r.id}
                            style={{
                              padding: '6px 12px',
                              fontSize: 12,
                              fontWeight: 600,
                              borderRadius: 6,
                              border: '1px solid transparent',
                              background: r.isVisible ? 'rgba(239, 68, 68, 0.12)' : '#10b981',
                              color: r.isVisible ? '#ef4444' : '#ffffff',
                              cursor: actionLoadingId === r.id ? 'wait' : 'pointer',
                              opacity: actionLoadingId === r.id ? 0.6 : 1,
                              transition: 'all 0.2s ease',
                            }}
                            onClick={() => handleToggleVisibility(r)}
                            title={r.isVisible ? 'Revoke user visibility' : 'Grant user visibility'}
                          >
                            {actionLoadingId === r.id ? 'Saving…' : (r.isVisible ? 'Revoke' : 'Grant Visibility')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 2: CLIENT PROJECT RATINGS VIEW (RM EXCLUSIVE) ──────────── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'projects' && (
        <>
          {/* KPI Summary Cards */}
          <div style={styles.kpiGrid}>
            <div className="glass-card" style={styles.kpiCard} title="Average overall project score given by clients across all evaluated projects">
              <div style={{ ...styles.kpiIconWrapper, backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <div>
                <div style={styles.kpiValue}>
                  {projectSummary?.averageRating != null ? `${projectSummary.averageRating} / 5.0` : '—'}
                </div>
                <div style={styles.kpiLabel}>Average Client Score</div>
              </div>
            </div>

            <div className="glass-card" style={styles.kpiCard} title="Total projects with client evaluation completed">
              <div style={{ ...styles.kpiIconWrapper, backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2"></rect>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                </svg>
              </div>
              <div>
                <div style={styles.kpiValue}>{projectSummary?.totalProjects || 0}</div>
                <div style={styles.kpiLabel}>Evaluated Projects</div>
              </div>
            </div>

            <div className="glass-card" style={styles.kpiCard} title="Projects rated 4.0 stars or higher by clients">
              <div style={{ ...styles.kpiIconWrapper, backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              </div>
              <div>
                <div style={styles.kpiValue}>{projectSummary?.highRatingCount || 0}</div>
                <div style={styles.kpiLabel}>Highly Satisfied (≥4.0★)</div>
              </div>
            </div>

            <div className="glass-card" style={styles.kpiCard} title="Percentage of clients who would recommend our team for future projects">
              <div style={{ ...styles.kpiIconWrapper, backgroundColor: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
              </div>
              <div>
                <div style={styles.kpiValue}>
                  {projectSummary?.recommendPercent != null ? `${projectSummary.recommendPercent}%` : '—'}
                </div>
                <div style={styles.kpiLabel}>Client Recommendation Rate</div>
              </div>
            </div>
          </div>

          {/* Search & Rating Filter Bar */}
          <div style={styles.filterBar}>
            <input
              type="text"
              placeholder="Search by project name, project code, or client..."
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              style={styles.searchInput}
            />

            <select
              style={styles.select}
              value={projectRatingFilter}
              onChange={(e) => setProjectRatingFilter(e.target.value)}
            >
              <option value="all" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>All Ratings</option>
              <option value="5" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>5 Stars (Exceptional: 4.8 - 5.0)</option>
              <option value="4" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>4 Stars (Good: 3.8 - 4.7)</option>
              <option value="3" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>Under 3.8 Stars (Needs Attention)</option>
            </select>

            <button
              onClick={loadProjectRatings}
              style={{ ...styles.select, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              title="Refresh client project ratings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6"></path>
                <path d="M1 20v-6h6"></path>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
              <span>Refresh</span>
            </button>

            {(projectSearch || projectRatingFilter !== 'all') && (
              <button
                onClick={() => { setProjectSearch(''); setProjectRatingFilter('all'); }}
                style={{
                  ...styles.select,
                  cursor: 'pointer',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  borderColor: 'rgba(239, 68, 68, 0.3)',
                  color: '#ef4444'
                }}
              >
                Clear Search
              </button>
            )}
          </div>

          {/* Client Project Ratings Table */}
          <div className="glass-card" style={styles.card}>
            {projectRatingsLoading ? (
              <div style={styles.emptyNote}>Loading client project ratings…</div>
            ) : filteredProjectRatings.length === 0 ? (
              <div style={styles.emptyNote}>
                {projectRatings.length === 0
                  ? 'No completed client project evaluations found.'
                  : 'No projects match your search or rating filters.'}
              </div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Project</th>
                    <th style={styles.th}>Client Evaluator</th>
                    <th style={styles.th}>Overall Client Rating</th>
                    <th style={styles.th}>Deliverables Assessment</th>
                    <th style={styles.th}>Client Project Feedback</th>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjectRatings.map((p) => (
                    <tr key={p.id}>
                      <td style={styles.td}>
                        <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{p.projectName}</div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                          {p.projectCode && p.projectCode !== '—' && (
                            <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', fontWeight: 600 }}>
                              {p.projectCode}
                            </span>
                          )}
                          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{p.projectStatus}</span>
                        </div>
                      </td>
                      <td style={styles.td}>
                        <div style={{ fontWeight: 500 }}>{p.clientName}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{p.clientEmail}</div>
                      </td>
                      <td style={styles.td}>
                        <StarRatingBadge rating={p.projectRating} />
                      </td>
                      <td style={styles.td}>
                        <div style={{
                          maxWidth: '220px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontSize: '13px',
                          color: p.deliverablesFeedback ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                        }}>
                          {p.deliverablesFeedback || '—'}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <div style={{
                          maxWidth: '220px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontSize: '13px',
                          color: p.projectFeedback ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                        }}>
                          {p.projectFeedback || '—'}
                        </div>
                      </td>
                      <td style={styles.td}>
                        {p.completedAt ? new Date(p.completedAt).toLocaleDateString() : '—'}
                      </td>
                      <td style={styles.td}>
                        <button
                          onClick={() => setSelectedProjectRating(p)}
                          style={{
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: 600,
                            borderRadius: '6px',
                            border: '1px solid rgba(139, 92, 246, 0.4)',
                            background: 'rgba(139, 92, 246, 0.12)',
                            color: '#8b5cf6',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.2s ease',
                          }}
                          title="View full client evaluation for this project"
                        >
                          <span>View Review</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL 1: EMPLOYEE FEEDBACK DETAILS MODAL ───────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {selectedRecord && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setSelectedRecord(null)}
        >
          <div
            className="glass-card"
            style={{
              width: '100%',
              maxWidth: selectedRecord.isMerged ? '800px' : '550px',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '28px',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--color-border)', paddingBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                  Individual Feedback Details
                </h3>
                <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  {selectedRecord.subjectName} ({selectedRecord.subjectRole}) • {selectedRecord.projectName}
                </span>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                style={{ background: 'transparent', border: 'none', fontSize: '24px', color: 'var(--color-text-muted)', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            {selectedRecord.isMerged ? (
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                {/* Client Evaluation */}
                <div style={{ flex: '1 1 320px', padding: '16px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#3b82f6', fontSize: '16px', borderBottom: '1px solid rgba(59, 130, 246, 0.2)', paddingBottom: '8px' }}>
                    Client Evaluation ({selectedRecord.client?.evaluatorName})
                  </h4>
                  <div style={{ marginBottom: '10px', fontSize: '15px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                    Rating: <span style={{ color: '#3b82f6' }}>{selectedRecord.client?.rating}/5</span>
                  </div>
                  {selectedRecord.client?.strengths && (
                    <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                      <strong style={{ color: 'var(--color-text-secondary)' }}>Strengths:</strong>
                      <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.client?.strengths}</p>
                    </div>
                  )}
                  {selectedRecord.client?.areasForImprovement && (
                    <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                      <strong style={{ color: 'var(--color-text-secondary)' }}>Areas for Improvement:</strong>
                      <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.client?.areasForImprovement}</p>
                    </div>
                  )}
                  {selectedRecord.client?.clientFeedback && (
                    <div style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
                      <strong style={{ color: 'var(--color-text-secondary)' }}>Feedback:</strong>
                      <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.client?.clientFeedback}</p>
                    </div>
                  )}
                </div>

                {/* PM Evaluation */}
                <div style={{ flex: '1 1 320px', padding: '16px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#10b981', fontSize: '16px', borderBottom: '1px solid rgba(16, 185, 129, 0.2)', paddingBottom: '8px' }}>
                    PM Evaluation ({selectedRecord.pm?.evaluatorName})
                  </h4>
                  <div style={{ marginBottom: '10px', fontSize: '15px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                    Rating: <span style={{ color: '#10b981' }}>{selectedRecord.pm?.rating}/5</span>
                  </div>
                  {selectedRecord.pm?.strengths && (
                    <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                      <strong style={{ color: 'var(--color-text-secondary)' }}>Strengths:</strong>
                      <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.pm?.strengths}</p>
                    </div>
                  )}
                  {selectedRecord.pm?.areasForImprovement && (
                    <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                      <strong style={{ color: 'var(--color-text-secondary)' }}>Areas for Improvement:</strong>
                      <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.pm?.areasForImprovement}</p>
                    </div>
                  )}
                  {selectedRecord.pm?.pmAssessment && (
                    <div style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
                      <strong style={{ color: 'var(--color-text-secondary)' }}>Assessment:</strong>
                      <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.pm?.pmAssessment}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding: '16px', borderRadius: '12px', background: selectedRecord.evaluatorSource === 'client' ? 'rgba(59, 130, 246, 0.06)' : 'rgba(16, 185, 129, 0.06)', border: `1px solid ${selectedRecord.evaluatorSource === 'client' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)'}` }}>
                <h4 style={{ margin: '0 0 12px 0', color: selectedRecord.evaluatorSource === 'client' ? '#3b82f6' : '#10b981', fontSize: '16px', borderBottom: `1px solid ${selectedRecord.evaluatorSource === 'client' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`, paddingBottom: '8px' }}>
                  {selectedRecord.evaluatorSource === 'client' ? `Client Evaluation (${selectedRecord.evaluatorName})` : `PM Evaluation (${selectedRecord.evaluatorName})`}
                </h4>
                {selectedRecord.client && (
                  <>
                    <div style={{ marginBottom: '10px', fontSize: '15px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                      Rating: <span style={{ color: '#3b82f6' }}>{selectedRecord.client.rating}/5</span>
                    </div>
                    {selectedRecord.client.strengths && (
                      <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        <strong style={{ color: 'var(--color-text-secondary)' }}>Strengths:</strong>
                        <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.client.strengths}</p>
                      </div>
                    )}
                    {selectedRecord.client.areasForImprovement && (
                      <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        <strong style={{ color: 'var(--color-text-secondary)' }}>Areas for Improvement:</strong>
                        <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.client.areasForImprovement}</p>
                      </div>
                    )}
                    {selectedRecord.client.clientFeedback && (
                      <div style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        <strong style={{ color: 'var(--color-text-secondary)' }}>Feedback:</strong>
                        <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.client.clientFeedback}</p>
                      </div>
                    )}
                  </>
                )}
                {selectedRecord.pm && (
                  <>
                    <div style={{ marginBottom: '10px', fontSize: '15px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                      Rating: <span style={{ color: '#10b981' }}>{selectedRecord.pm.rating}/5</span>
                    </div>
                    {selectedRecord.pm.strengths && (
                      <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        <strong style={{ color: 'var(--color-text-secondary)' }}>Strengths:</strong>
                        <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.pm.strengths}</p>
                      </div>
                    )}
                    {selectedRecord.pm.areasForImprovement && (
                      <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        <strong style={{ color: 'var(--color-text-secondary)' }}>Areas for Improvement:</strong>
                        <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.pm.areasForImprovement}</p>
                      </div>
                    )}
                    {selectedRecord.pm.pmAssessment && (
                      <div style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        <strong style={{ color: 'var(--color-text-secondary)' }}>Assessment:</strong>
                        <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.pm.pmAssessment}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Modal Footer */}
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <button
                disabled={actionLoadingId === selectedRecord.id}
                onClick={() => handleToggleVisibility(selectedRecord)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: '1px solid transparent',
                  background: selectedRecord.isVisible ? 'rgba(239, 68, 68, 0.15)' : '#10b981',
                  color: selectedRecord.isVisible ? '#ef4444' : '#ffffff',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: actionLoadingId === selectedRecord.id ? 'wait' : 'pointer',
                  opacity: actionLoadingId === selectedRecord.id ? 0.6 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {actionLoadingId === selectedRecord.id
                  ? 'Saving…'
                  : selectedRecord.isVisible
                    ? 'Revoke Visibility (Hide from User)'
                    : 'Grant Permission (Make Visible to User)'}
              </button>
              <button
                onClick={() => setSelectedRecord(null)}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-primary)',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL 2: FULL CLIENT PROJECT REVIEW MODAL (RM EXCLUSIVE) ───── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {selectedProjectRating && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setSelectedProjectRating(null)}
        >
          <div
            className="glass-card"
            style={{
              width: '100%',
              maxWidth: '680px',
              maxHeight: '88vh',
              overflowY: 'auto',
              padding: '28px',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid var(--color-border)', paddingBottom: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                    {selectedProjectRating.projectName}
                  </h3>
                  {selectedProjectRating.projectCode && selectedProjectRating.projectCode !== '—' && (
                    <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', fontWeight: 600 }}>
                      {selectedProjectRating.projectCode}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  Client: <strong style={{ color: 'var(--color-text-primary)' }}>{selectedProjectRating.clientName}</strong> ({selectedProjectRating.clientEmail})
                  {selectedProjectRating.completedAt && (
                    <span> • Submitted on {new Date(selectedProjectRating.completedAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedProjectRating(null)}
                style={{ background: 'transparent', border: 'none', fontSize: '24px', color: 'var(--color-text-muted)', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Overall Rating & Recommendation Banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              marginBottom: '20px',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                  Client Overall Project Rating
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <span style={{ fontSize: '28px', fontWeight: '800', color: '#8b5cf6' }}>
                    ★ {selectedProjectRating.projectRating != null ? Number(selectedProjectRating.projectRating).toFixed(1) : '—'}
                  </span>
                  <span style={{ fontSize: '16px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                    / 5.0
                  </span>
                </div>
              </div>

              {selectedProjectRating.wouldRecommend !== null && (
                <div style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  backgroundColor: selectedProjectRating.wouldRecommend ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  border: `1px solid ${selectedProjectRating.wouldRecommend ? '#10b981' : '#ef4444'}40`,
                  color: selectedProjectRating.wouldRecommend ? '#10b981' : '#ef4444',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span>{selectedProjectRating.wouldRecommend ? '✓ Client Would Recommend Team' : '✗ Client Would Not Recommend'}</span>
                </div>
              )}
            </div>

            {/* Deliverables Assessment */}
            <div style={{
              padding: '16px',
              borderRadius: '12px',
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              marginBottom: '16px'
            }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: 'var(--color-primary, #3b82f6)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                </svg>
                Deliverables & Quality Assessment
              </h4>
              <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: selectedProjectRating.deliverablesFeedback ? 'var(--color-text-primary)' : 'var(--color-text-muted)', fontStyle: selectedProjectRating.deliverablesFeedback ? 'normal' : 'italic' }}>
                {selectedProjectRating.deliverablesFeedback || 'No specific deliverables commentary provided by the client.'}
              </p>
            </div>

            {/* Overall Project Feedback */}
            <div style={{
              padding: '16px',
              borderRadius: '12px',
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              marginBottom: '16px'
            }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                Client Overall Project Feedback
              </h4>
              <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: selectedProjectRating.projectFeedback ? 'var(--color-text-primary)' : 'var(--color-text-muted)', fontStyle: selectedProjectRating.projectFeedback ? 'normal' : 'italic' }}>
                {selectedProjectRating.projectFeedback || 'No overall commentary provided by the client.'}
              </p>
            </div>

            {/* Additional Comments */}
            {selectedProjectRating.additionalComments && (
              <div style={{
                padding: '16px',
                borderRadius: '12px',
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                marginBottom: '16px'
              }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  Additional Notes & Comments
                </h4>
                <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: 'var(--color-text-primary)' }}>
                  {selectedProjectRating.additionalComments}
                </p>
              </div>
            )}

            {/* Confidentiality Notice */}
            <div style={{
              fontSize: '12px',
              color: 'var(--color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              marginTop: '8px',
              marginBottom: '20px'
            }}>
              <span>🔒 <strong>Confidential to Resource Manager:</strong> This overall project assessment is not disclosed to employees or project managers.</span>
            </div>

            {/* Modal Footer */}
            <div style={{ paddingTop: '14px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedProjectRating(null)}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-primary)',
                  fontWeight: 600,
                  fontSize: '14px',
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