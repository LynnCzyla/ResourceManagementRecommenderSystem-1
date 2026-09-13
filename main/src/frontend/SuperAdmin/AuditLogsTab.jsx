import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config/api';
import { getStoredToken } from '../../lib/supabaseClient';

const API_BASE = `${API_BASE_URL}/api/superadmin`;
const ROWS_PER_PAGE = 10;

export default function SuperAdminAuditLogsTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [roleFilter, setRoleFilter] = useState('All');
  const [branchFilter, setBranchFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('All');

  const [actionsList, setActionsList] = useState([]);
  const [rolesList, setRolesList] = useState([]);
  const [branchesList, setBranchesList] = useState([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [stats, setStats] = useState({ total: 0, today: 0, week: 0 });
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const getAuthHeaders = () => {
    const token = getStoredToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const dateFilterToRange = (filter) => {
    if (filter === 'All') return {};
    const today = new Date();
    const toISODate = (d) => d.toISOString().split('T')[0];

    if (filter === 'Today') {
      const d = toISODate(today);
      return { startDate: d, endDate: d };
    }
    if (filter === 'Yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const d = toISODate(yesterday);
      return { startDate: d, endDate: d };
    }
    if (filter === 'Last 7 Days') {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { startDate: toISODate(weekAgo), endDate: toISODate(today) };
    }
    if (filter === 'Last 30 Days') {
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);
      return { startDate: toISODate(monthAgo), endDate: toISODate(today) };
    }
    return {};
  };

  // Fetch dropdown options
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const res = await fetch(`${API_BASE}/audit-logs/filters`, {
          headers: getAuthHeaders(),
        });
        const json = await res.json();
        
        if (json.success) {
          setActionsList(json.data.actions || []);
          setRolesList(json.data.roles || []);
          setBranchesList(json.data.branches || []);
        }
      } catch (err) {
        console.error('Error fetching filter options:', err);
      }
    };
    fetchFilters();
  }, []);

  // ✅ FIXED: Fetch stats using the API instead of supabase directly
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const headers = getAuthHeaders();

        // Fetch total count
        const totalRes = await fetch(`${API_BASE}/audit-logs?limit=1&page=1`, { headers });
        const totalJson = await totalRes.json();
        const total = totalJson.success ? (totalJson.pagination?.total || 0) : 0;

        // Fetch today's count
        const today = new Date().toISOString().split('T')[0];
        const todayRes = await fetch(
          `${API_BASE}/audit-logs?limit=1&page=1&startDate=${today}&endDate=${today}`,
          { headers }
        );
        const todayJson = await todayRes.json();
        const todayCount = todayJson.success ? (todayJson.pagination?.total || 0) : 0;

        // Fetch this week's count
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];
        const weekRes = await fetch(
          `${API_BASE}/audit-logs?limit=1&page=1&startDate=${weekAgoStr}&endDate=${today}`,
          { headers }
        );
        const weekJson = await weekRes.json();
        const weekCount = weekJson.success ? (weekJson.pagination?.total || 0) : 0;

        setStats({ total, today: todayCount, week: weekCount });
      } catch (err) {
        console.error('Error fetching audit log stats:', err);
        setStats({ total: 0, today: 0, week: 0 });
      }
    };
    fetchStats();
  }, []);

  // Reset to page 1 whenever a filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, actionFilter, roleFilter, branchFilter, dateFilter]);

  // Fetch the actual table data
  useEffect(() => {
    let isMounted = true;

    const fetchLogs = async () => {
      setLoading(true);
      setError('');
      try {
        const { startDate, endDate } = dateFilterToRange(dateFilter);

        const params = new URLSearchParams();
        params.append('limit', String(ROWS_PER_PAGE));
        params.append('page', String(currentPage));
        if (searchQuery.trim()) params.append('search', searchQuery.trim());
        if (actionFilter !== 'All') params.append('action', actionFilter);
        if (roleFilter !== 'All') params.append('role', roleFilter);
        if (branchFilter !== 'All') params.append('branch_id', branchFilter);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);

        const res = await fetch(`${API_BASE}/audit-logs?${params.toString()}`, {
          headers: getAuthHeaders(),
        });
        const json = await res.json();

        if (!isMounted) return;

        if (json.success) {
          setLogs(json.data || []);
          setTotalPages(json.pagination?.totalPages || 1);
          setTotalCount(json.pagination?.total || 0);
        } else {
          setError(json.error || 'Failed to load audit logs.');
          setLogs([]);
        }
      } catch (err) {
        console.error('Error fetching audit logs:', err);
        if (isMounted) {
          setError('Could not connect to the server.');
          setLogs([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const timeoutId = setTimeout(fetchLogs, 400);
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [searchQuery, actionFilter, roleFilter, branchFilter, dateFilter, currentPage]);

  const handleExport = async (format) => {
    const setLoading = format === 'pdf' ? setExportingPdf : setExportingExcel;
    setLoading(true);
    try {
      const { startDate, endDate } = dateFilterToRange(dateFilter);
      const params = new URLSearchParams();
      params.append('format', format);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (actionFilter !== 'All') params.append('action', actionFilter);
      if (roleFilter !== 'All') params.append('role', roleFilter);
      if (branchFilter !== 'All') params.append('branch_id', branchFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await fetch(`${API_BASE}/audit-logs/export?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'pdf' ? `WEA_AuditTrail_${new Date().toISOString().split('T')[0]}.pdf` : `WEA_AuditTrail_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting audit logs:', err);
      alert('Failed to export audit logs.');
    } finally {
      setLoading(false);
    }
  };

  const getActionColor = (action) => {
    const colors = {
      CREATE_ADMIN: '#22c55e',
      UPDATE_BRANCH: '#3b82f6',
      DEACTIVATE_ACCOUNT: '#f59e0b',
      CREATE_BRANCH: '#22c55e',
      DELETE_ADMIN: '#ef4444',
      UPDATE_ACCOUNT: '#3b82f6',
      LOGIN: '#8b5cf6',
      ACTIVATE_ACCOUNT: '#22c55e',
      CREATE_USER: '#22c55e',
      DELETE_USER: '#ef4444',
      LOCK_ACCOUNT: '#f59e0b',
      UNLOCK_ACCOUNT: '#22c55e',
      'Account Locked': '#f59e0b',
      'Account Unlocked': '#22c55e',
      'Failed Login': '#ef4444',
      'Password Reset': '#8b5cf6',
      'Assigned': '#3b82f6',
      'Created': '#22c55e',
      'Deleted': '#ef4444',
      'Updated': '#3b82f6',
      'TEST_LOG': '#6b7280',
    };
    return colors[action] || '#6b7280';
  };

  const getActionIcon = (action) => {
    const style = { marginRight: '6px', verticalAlign: 'middle', display: 'inline-block' };
    return (
      <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
      </svg>
    );
  };

  const formatTimestamp = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRoleBadgeColor = (role) => {
    const colors = {
      'Super Admin': { bg: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' },
      'Admin': { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' },
      'Human Resources': { bg: 'rgba(236, 72, 153, 0.15)', color: '#ec4899' },
      'Project Manager': { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' },
      'Resource Manager': { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981' },
      'Employee': { bg: 'rgba(107, 114, 128, 0.15)', color: '#6b7280' },
    };
    return colors[role] || { bg: 'rgba(107, 114, 128, 0.15)', color: '#6b7280' };
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Audit Logs</h1>
        <p style={styles.subtitle}>Full system audit trail across all branches and roles</p>
      </div>

      <div style={styles.stats}>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Total Logs</span>
          <span style={styles.statValue}>{stats.total}</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Today</span>
          <span style={styles.statValue}>{stats.today}</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>This Week</span>
          <span style={styles.statValue}>{stats.week}</span>
        </div>
      </div>

      <div style={styles.controls}>
        <div style={styles.searchWrapper}>
          <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="All">All Actions</option>
          {actionsList.map((act) => (
            <option key={act} value={act}>{act}</option>
          ))}
        </select>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="All">All Roles</option>
          {rolesList.map((role) => (
            <option key={role} value={role}>{role}</option>
          ))}
        </select>

        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="All">All Branches</option>
          {branchesList.map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </select>

        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="All">All Time</option>
          <option value="Today">Today</option>
          <option value="Yesterday">Yesterday</option>
          <option value="Last 7 Days">Last 7 Days</option>
          <option value="Last 30 Days">Last 30 Days</option>
        </select>

        <button
          id="btn-generate-pdf-superadmin-audit"
          style={{ ...styles.exportBtn, background: 'linear-gradient(135deg, #0b1220 0%, #1e3a5f 100%)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', opacity: exportingPdf ? 0.7 : 1, cursor: exportingPdf ? 'not-allowed' : 'pointer' }}
          onClick={() => handleExport('pdf')}
          disabled={exportingPdf || exportingExcel}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          {exportingPdf ? 'Generating...' : 'Generate PDF'}
        </button>
        <button
          id="btn-export-excel-superadmin-audit"
          style={{ ...styles.exportBtn, background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', opacity: exportingExcel ? 0.7 : 1, cursor: exportingExcel ? 'not-allowed' : 'pointer' }}
          onClick={() => handleExport('excel')}
          disabled={exportingPdf || exportingExcel}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          {exportingExcel ? 'Exporting...' : 'Export Excel'}
        </button>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.tableHeaderCell}>Timestamp</th>
              <th style={styles.tableHeaderCell}>Action</th>
              <th style={styles.tableHeaderCell}>Actor</th>
              <th style={styles.tableHeaderCell}>Role</th>
              <th style={styles.tableHeaderCell}>Branch</th>
              <th style={styles.tableHeaderCell}>Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" style={styles.emptyCell}>Loading audit logs...</td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan="6" style={{ ...styles.emptyCell, color: '#ef4444' }}>{error}</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan="6" style={styles.emptyCell}>No audit logs found</td>
              </tr>
            ) : (
              logs.map(log => {
                const roleStyle = getRoleBadgeColor(log.user_role);
                return (
                  <tr key={log.id} style={styles.tableRow}>
                    <td style={styles.tableCell}>
                      <span style={styles.timestamp}>{formatTimestamp(log.time)}</span>
                    </td>
                    <td style={styles.tableCell}>
                      <span style={{
                        ...styles.actionBadge,
                        color: getActionColor(log.action),
                        backgroundColor: `${getActionColor(log.action)}15`,
                      }}>
                        {getActionIcon(log.action)} {log.action || 'Unknown'}
                      </span>
                    </td>
                    <td style={styles.tableCell}>
                      <span style={styles.actorName}>{log.user}</span>
                    </td>
                    <td style={styles.tableCell}>
                      <span style={{
                        ...styles.roleBadge,
                        backgroundColor: roleStyle.bg,
                        color: roleStyle.color,
                      }}>
                        {log.user_role || 'Unknown'}
                      </span>
                    </td>
                    <td style={styles.tableCell}>
                      <span style={styles.branchName}>
                        {log.branch_name || '—'}
                      </span>
                    </td>
                    <td style={styles.tableCell}>
                      <span style={styles.details}>{log.desc}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {!loading && !error && logs.length > 0 && (
          <div style={styles.pagination}>
            <span style={styles.paginationInfo}>
              Showing {totalCount === 0 ? 0 : (currentPage - 1) * ROWS_PER_PAGE + 1}
              –{Math.min(currentPage * ROWS_PER_PAGE, totalCount)} of {totalCount}
            </span>
            <div style={styles.paginationControls}>
              <button
                style={styles.pageBtn}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                {'<'}
              </button>
              <span style={styles.pageIndicator}>Page {currentPage} of {totalPages}</span>
              <button
                style={styles.pageBtn}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                {'>'}
              </button>
            </div>
          </div>
        )}
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
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
  },
  controls: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  searchWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '8px 12px',
    flex: 1,
    maxWidth: '400px',
  },
  searchIcon: {
    color: 'var(--color-text-muted)',
  },
  searchInput: {
    border: 'none',
    background: 'transparent',
    outline: 'none',
    flex: 1,
    fontSize: '14px',
    color: 'var(--color-text-primary)',
  },
  filterSelect: {
    padding: '8px 12px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    outline: 'none',
    minWidth: '140px',
  },
  exportBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card-hover)',
    color: 'var(--color-text-primary)',
    padding: '9px 16px',
    borderRadius: 'var(--radius-md)',
    fontWeight: '700',
    fontSize: '14px',
    cursor: 'pointer',
  },
  tableContainer: {
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeader: {
    background: 'var(--color-bg-card-hover)',
  },
  tableHeaderCell: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-text-secondary)',
    borderBottom: '1px solid var(--color-border)',
  },
  tableRow: {
    borderBottom: '1px solid var(--color-border)',
    transition: 'background-color 0.2s',
  },
  tableCell: {
    padding: '12px 16px',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    verticalAlign: 'middle',
  },
  timestamp: {
    fontFamily: 'monospace',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
  },
  actionBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: '600',
    display: 'inline-block',
  },
  roleBadge: {
    padding: '2px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
    display: 'inline-block',
  },
  actorName: {
    fontWeight: '600',
  },
  branchName: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
  },
  details: {
    maxWidth: '300px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'inline-block',
  },
  emptyCell: {
    padding: '32px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '14px',
  },
  stats: {
    display: 'flex',
    gap: '16px',
  },
  statCard: {
    flex: 1,
    padding: '16px',
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  statLabel: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--color-primary)',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderTop: '1px solid var(--color-border)',
    flexWrap: 'wrap',
    gap: '12px',
  },
  paginationInfo: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
  },
  paginationControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  pageBtn: {
    minWidth: '34px',
    padding: '8px 10px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card-hover)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  pageIndicator: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    fontWeight: '600',
  },
};