import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config/api';

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
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const ROWS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [jumpPage, setJumpPage] = useState('');

  // Fetch filter dropdown options once — not tied to pagination
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${API_BASE_URL}/api/admin/audit-logs/filters`, { headers });
        const json = await res.json();
        if (json.success) {
          setCategoriesList(json.data.categories || []);
          setActionsList(json.data.actions || []);
        }
      } catch (err) {
        console.error('Error fetching filter options:', err);
      }
    };
    fetchFilters();
  }, []);

  // Reset to page 1 whenever a filter changes (not when the page itself changes)
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, actionFilter, startDate, endDate]);

  useEffect(() => {
    let isMounted = true;
    const fetchLogs = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const params = new URLSearchParams();
        params.append('limit', String(ROWS_PER_PAGE));
        params.append('page', String(currentPage));
        if (searchQuery.trim()) params.append('search', searchQuery.trim());
        if (categoryFilter) params.append('category', categoryFilter);
        if (actionFilter) params.append('action', actionFilter);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);

        const res = await fetch(`${API_BASE_URL}/api/admin/audit-logs?${params.toString()}`, { headers });
        const json = await res.json();

        if (isMounted) {
          if (json.success) {
            setAuditLogs(json.data || []);
            setTotalPages(json.pagination?.totalPages || 1);
            setTotalCount(json.pagination?.total || 0);
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

    // Wait 500ms after the user stops typing/changing filters before firing
    // the request — this is what stops a fresh request from firing on every
    // single keystroke while searching (was the main egress driver here).
    // Page changes (Prev/Next/number click) fire immediately since they're
    // deliberate clicks, not typing.
    const timeoutId = setTimeout(fetchLogs, 500);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [searchQuery, categoryFilter, actionFilter, startDate, endDate, currentPage]);

  const handleExport = async (format) => {
    const setLoading = format === 'pdf' ? setExportingPdf : setExportingExcel;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const params = new URLSearchParams();
      params.append('format', format);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (categoryFilter) params.append('category', categoryFilter);
      if (actionFilter) params.append('action', actionFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await fetch(`${API_BASE_URL}/api/admin/audit-logs/export?${params.toString()}`, { headers });
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

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              id="btn-generate-pdf-audit"
              style={{ ...styles.exportBtn, background: 'linear-gradient(135deg, #0b1220 0%, #1e3a5f 100%)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', opacity: exportingPdf ? 0.7 : 1, cursor: exportingPdf ? 'not-allowed' : 'pointer' }}
              onClick={() => handleExport('pdf')}
              disabled={exportingPdf || exportingExcel}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              {exportingPdf ? 'Generating...' : 'Generate PDF'}
            </button>
            <button
              id="btn-export-excel-audit"
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
                {(() => {
                  const pages = [];
                  const maxVisible = 3;
                  let start = Math.max(1, currentPage - 1);
                  let end = Math.min(totalPages, start + maxVisible - 1);
                  if (end - start + 1 < maxVisible) {
                    start = Math.max(1, end - maxVisible + 1);
                  }
                  if (start > 1) {
                    pages.push(1);
                    if (start > 2) pages.push('...');
                  }
                  for (let i = start; i <= end; i++) {
                    pages.push(i);
                  }
                  if (end < totalPages) {
                    if (end < totalPages - 1) pages.push('...');
                    pages.push(totalPages);
                  }
                  return pages.map((page, idx) =>
                    page === '...' ? (
                      <span key={`ellipsis-${idx}`} style={styles.ellipsis}>…</span>
                    ) : (
                      <button
                        key={page}
                        style={{
                          ...styles.pageBtn,
                          ...(page === currentPage ? styles.pageBtnActive : {}),
                        }}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    )
                  );
                })()}
                <button
                  style={styles.pageBtn}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  {'>'}
                </button>

                <span style={styles.pageJumpWrap}>
                  <input
                    type="number"
                    min="1"
                    max={totalPages}
                    placeholder="Page"
                    value={jumpPage}
                    onChange={(e) => setJumpPage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const p = parseInt(jumpPage, 10);
                        if (!Number.isNaN(p)) {
                          setCurrentPage(Math.min(Math.max(1, p), totalPages));
                        }
                        setJumpPage('');
                      }
                    }}
                    style={styles.pageJumpInput}
                  />
                  <button
                    style={styles.pageBtn}
                    onClick={() => {
                      const p = parseInt(jumpPage, 10);
                      if (!Number.isNaN(p)) {
                        setCurrentPage(Math.min(Math.max(1, p), totalPages));
                      }
                      setJumpPage('');
                    }}
                  >
                    Go
                  </button>
                </span>
              </div>
            </div>
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
  pagination: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    marginTop: '20px',
  },
  paginationInfo: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
  },
  paginationControls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    flex: 1,
    flexWrap: 'wrap',
  },
  pageBtn: {
    minWidth: '34px',
    padding: '8px 10px',
    borderRadius: 'var(--radius-md)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    background: 'var(--color-bg-card-hover)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s, border-color 0.2s',
  },
  pageBtnActive: {
    background: 'var(--color-primary)',
    borderColor: 'var(--color-primary)',
    color: '#fff',
  },
  pageJumpWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginLeft: '4px',
  },
  pageJumpInput: {
    width: '64px',
    padding: '8px 10px',
    borderRadius: 'var(--radius-md)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    background: 'var(--color-bg-card-hover)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    fontWeight: '600',
    outline: 'none',
  },
  ellipsis: {
    padding: '8px 6px',
    color: 'var(--color-text-muted)',
    fontSize: '13px',
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