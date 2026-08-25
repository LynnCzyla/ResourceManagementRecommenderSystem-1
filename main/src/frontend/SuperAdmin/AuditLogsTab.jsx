import React, { useState, useEffect } from 'react';

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/admin`;
const ROWS_PER_PAGE = 10;

// This tab is scoped to Admin-level activity only — Super Admin should not
// see every role's logs here (that's the full audit trail on the Admin side).
const ROLE_SCOPE = 'Admin';

export default function AuditLogsTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('All');

  const [actionsList, setActionsList] = useState([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [stats, setStats] = useState({ total: 0, today: 0, week: 0 });
  const [exporting, setExporting] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
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
    return {};
  };

  // Fetch dropdown options once, scoped to Admin role activity
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const params = new URLSearchParams({ role: ROLE_SCOPE });
        const res = await fetch(`${API_BASE}/audit-logs/filters?${params.toString()}`, {
          headers: getAuthHeaders(),
        });
        const json = await res.json();
        if (json.success) {
          setActionsList(json.data.actions || []);
        }
      } catch (err) {
        console.error('Error fetching filter options:', err);
      }
    };
    fetchFilters();
  }, []);

  // Fetch top-level stat cards (independent of the table's own filters)
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const headers = getAuthHeaders();

        const fetchCount = async (extraParams = {}) => {
          const params = new URLSearchParams({ role: ROLE_SCOPE, limit: '1', page: '1', ...extraParams });
          const res = await fetch(`${API_BASE}/audit-logs?${params.toString()}`, { headers });
          const json = await res.json();
          return json.success ? (json.pagination?.total || 0) : 0;
        };

        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];

        const [total, todayCount, weekCount] = await Promise.all([
          fetchCount(),
          fetchCount({ startDate: today, endDate: today }),
          fetchCount({ startDate: weekAgoStr, endDate: today }),
        ]);

        setStats({ total, today: todayCount, week: weekCount });
      } catch (err) {
        console.error('Error fetching audit log stats:', err);
      }
    };
    fetchStats();
  }, []);

  // Reset to page 1 whenever a filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, actionFilter, dateFilter]);

  // Fetch the actual table data
  useEffect(() => {
    let isMounted = true;

    const fetchLogs = async () => {
      setLoading(true);
      setError('');
      try {
        const { startDate, endDate } = dateFilterToRange(dateFilter);

        const params = new URLSearchParams();
        params.append('role', ROLE_SCOPE);
        params.append('limit', String(ROWS_PER_PAGE));
        params.append('page', String(currentPage));
        if (searchQuery.trim()) params.append('search', searchQuery.trim());
        if (actionFilter !== 'All') params.append('action', actionFilter);
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
  }, [searchQuery, actionFilter, dateFilter, currentPage]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { startDate, endDate } = dateFilterToRange(dateFilter);
      const params = new URLSearchParams();
      params.append('role', ROLE_SCOPE);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (actionFilter !== 'All') params.append('action', actionFilter);
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
      a.download = 'admin_audit_logs.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting audit logs:', err);
      alert('Failed to export audit logs.');
    } finally {
      setExporting(false);
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
    };
    return colors[action] || '#6b7280';
  };

  const getActionIcon = (action) => {
    const style = { marginRight: '6px', verticalAlign: 'middle', display: 'inline-block' };
    const icons = {
      CREATE_ADMIN: (
        <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      ),
      UPDATE_BRANCH: (
        <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      ),
      DEACTIVATE_ACCOUNT: (
        <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      ),
      CREATE_BRANCH: (
        <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
          <line x1="9" y1="22" x2="9" y2="16"></line>
          <line x1="15" y1="22" x2="15" y2="16"></line>
          <line x1="9" y1="16" x2="15" y2="16"></line>
          <path d="M8 6h2v2H8V6zm4 0h2v2h-2V6zm4 0h2v2h-2V6zM8 10h2v2H8v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z"></path>
        </svg>
      ),
      DELETE_ADMIN: (
        <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      ),
      UPDATE_ACCOUNT: (
        <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      ),
      LOGIN: (
        <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
        </svg>
      ),
      ACTIVATE_ACCOUNT: (
        <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
        </svg>
      ),
    };
    return icons[action] || (
      <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
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

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Admin Audit Logs</h1>
        <p style={styles.subtitle}>Track actions performed by Admin accounts across the system</p>
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
            <option key={act} value={act}>{act.replace(/_/g, ' ')}</option>
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
        </select>
        <button style={styles.exportBtn} onClick={handleExport} disabled={exporting}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          {exporting ? 'Exporting...' : 'Export PDF'}
        </button>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.tableHeaderCell}>Timestamp</th>
              <th style={styles.tableHeaderCell}>Action</th>
              <th style={styles.tableHeaderCell}>Actor</th>
              <th style={styles.tableHeaderCell}>Category</th>
              <th style={styles.tableHeaderCell}>Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" style={styles.emptyCell}>Loading audit logs...</td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan="5" style={{ ...styles.emptyCell, color: '#ef4444' }}>{error}</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan="5" style={styles.emptyCell}>No audit logs found</td>
              </tr>
            ) : (
              logs.map(log => (
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
                      {getActionIcon(log.action)} {(log.action || '').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={styles.tableCell}>
                    <div style={styles.actorCell}>
                      <span style={styles.actorName}>{log.user}</span>
                      <span style={styles.actorRole}>{log.user_role}</span>
                    </div>
                  </td>
                  <td style={styles.tableCell}>{log.category || '—'}</td>
                  <td style={styles.tableCell}>
                    <span style={styles.details}>{log.desc}</span>
                  </td>
                </tr>
              ))
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
  },
  actorCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  actorName: {
    fontWeight: '600',
  },
  actorRole: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
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