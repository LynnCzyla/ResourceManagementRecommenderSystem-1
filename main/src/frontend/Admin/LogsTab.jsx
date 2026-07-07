import React, { useState, useEffect } from 'react';

export default function LogsTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [categoriesList, setCategoriesList] = useState([]);
  const [actionsList, setActionsList] = useState([]);

  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchLogs = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const params = new URLSearchParams();
        params.append('limit', '200');
        if (searchQuery.trim()) params.append('search', searchQuery.trim());
        if (categoryFilter) params.append('category', categoryFilter);
        if (actionFilter) params.append('action', actionFilter);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);

        const res = await fetch(`http://localhost:5000/api/admin/audit-logs?${params.toString()}`, { headers });
        const json = await res.json();

        if (isMounted) {
          if (json.success) {
            const logs = json.data || [];
            setAuditLogs(logs);

            // Populate unique category and action filters on initial load when filters are empty
            if (categoriesList.length === 0 && actionsList.length === 0 && logs.length > 0 && !categoryFilter && !actionFilter && !searchQuery && !startDate && !endDate) {
              const uniqueCats = Array.from(new Set(logs.map(log => log.category).filter(Boolean)));
              const uniqueActions = Array.from(new Set(logs.map(log => log.action).filter(Boolean)));
              setCategoriesList(uniqueCats.sort());
              setActionsList(uniqueActions.sort());
            }
          } else {
            setError(json.error || 'Failed to load audit logs.');
          }
        }
      } catch (err) {
        console.error('Error fetching audit logs:', err);
        if (isMounted) {
          setError('Could not connect to the server.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchLogs();
    return () => {
      isMounted = false;
    };
  }, [searchQuery, categoryFilter, actionFilter, startDate, endDate]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (categoryFilter) params.append('category', categoryFilter);
      if (actionFilter) params.append('action', actionFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await fetch(`http://localhost:5000/api/admin/audit-logs/export?${params.toString()}`, { headers });
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit_logs.pdf';
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

  const handleResetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('');
    setActionFilter('');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Activity & Audit Logs</h1>
        <p style={styles.subtitle}>Track user activities and system audit trail.</p>
      </div>

      <div className="glass-card">
        <div style={styles.tableToolbar}>
          <div style={styles.filtersRow}>
            <div style={styles.searchWrapper}>
              <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Search audit trail..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.searchInput}
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={styles.selectInput}
            >
              <option value="">All Categories</option>
              {categoriesList.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              style={styles.selectInput}
            >
              <option value="">All Actions</option>
              {actionsList.map((act) => (
                <option key={act} value={act}>{act}</option>
              ))}
            </select>

            <div style={styles.dateRangeGroup}>
              <div style={styles.dateInputWrapper}>
                <label style={styles.dateLabel}>From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={styles.dateInput}
                />
              </div>
              <div style={styles.dateInputWrapper}>
                <label style={styles.dateLabel}>To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={styles.dateInput}
                />
              </div>
            </div>

            {(searchQuery || categoryFilter || actionFilter || startDate || endDate) && (
              <button style={styles.resetBtn} onClick={handleResetFilters}>
                Reset
              </button>
            )}
          </div>

          <button style={styles.exportBtn} onClick={handleExport} disabled={exporting}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            {exporting ? 'Exporting PDF...' : 'Export Audit Trail'}
          </button>
        </div>

        {loading && <p style={styles.stateText}>Loading audit logs...</p>}
        {!loading && error && <p style={{ ...styles.stateText, color: '#ef4444' }}>{error}</p>}
        {!loading && !error && auditLogs.length === 0 && (
          <p style={styles.stateText}>No audit log entries found.</p>
        )}

        {!loading && !error && auditLogs.length > 0 && (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeaderRow}>
                  <th style={styles.th}>Timestamp</th>
                  <th style={styles.th}>Responsible User</th>
                  <th style={styles.th}>Action</th>
                  <th style={styles.th}>System Category</th>
                  <th style={styles.th}>Log Description</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} style={styles.tableBodyRow}>
                    <td style={styles.td}>{formatTimestamp(log.time || log.date)}</td>
                    <td style={{ ...styles.td, fontWeight: '600', color: 'var(--color-text-primary)' }}>{log.user || 'System'}</td>
                    <td style={styles.td}>{log.action || (log.text ? log.text.split(' - ')[0] : '—')}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.roleBadge,
                          backgroundColor: 'var(--color-accent-light)',
                          color: 'var(--color-accent)',
                        }}
                      >
                        {log.category || (log.text ? log.text.split(' - ')[1] || '—' : '—')}
                      </span>
                    </td>
                    <td style={styles.td}>{log.desc || log.text || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  header: {
    marginBottom: '28px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '800',
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.75px',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '15px',
    color: 'var(--color-text-secondary)',
  },
  tableToolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  filtersRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
    flexWrap: 'wrap',
  },
  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    maxWidth: '300px',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    color: 'var(--color-text-muted)',
  },
  searchInput: {
    width: '100%',
    padding: '10px 12px 10px 36px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  selectInput: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
    minWidth: '140px',
  },
  dateRangeGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  dateInputWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  dateLabel: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dateInput: {
    padding: '9px 10px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    outline: 'none',
  },
  resetBtn: {
    border: 'none',
    background: 'transparent',
    color: 'var(--color-danger)',
    fontWeight: '600',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '8px 12px',
    borderRadius: 'var(--radius-md)',
  },
  exportBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card-hover)',
    padding: '10px 18px',
    borderRadius: 'var(--radius-md)',
    fontWeight: '700',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  stateText: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
    padding: '24px 4px',
    textAlign: 'center',
  },
  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  tableHeaderRow: {
    borderBottom: '2px solid var(--color-border)',
  },
  th: {
    padding: '14px 16px',
    fontSize: '12px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-text-secondary)',
  },
  tableBodyRow: {
    borderBottom: '1px solid var(--color-border)',
    transition: 'background-color 0.2s',
  },
  td: {
    padding: '14px 16px',
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '4px',
  },
  roleBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '4px',
  },
};

function formatTimestamp(value) {
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
}