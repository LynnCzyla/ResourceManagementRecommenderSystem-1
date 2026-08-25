import React, { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/superadmin`;

export default function AccountManagementTab() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [lockedFilter, setLockedFilter] = useState('All');

  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const getActingSuperAdminId = () => {
    // Adjust the key to whatever you actually store on login.
    return localStorage.getItem('userId') || null;
  };

  const showSuccessAlert = (message, title = 'Success!') => {
    Swal.fire({
      title,
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

  const showErrorAlert = (message, title = 'Error!') => {
    Swal.fire({
      title,
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

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (statusFilter !== 'All') params.set('status', statusFilter);
      if (lockedFilter !== 'All') params.set('locked', lockedFilter === 'Locked' ? 'true' : 'false');

      const res = await fetch(`${API_BASE}/accounts?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();

      if (!json.success) throw new Error(json.error || 'Failed to load accounts');

      setAccounts(json.data || []);
      setPagination({
        total: json.pagination?.total || 0,
        totalPages: json.pagination?.totalPages || 1,
      });
    } catch (err) {
      console.error('Error fetching admin accounts:', err);
      setError('Unable to reach the server. Please try again.');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchQuery, statusFilter, lockedFilter]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Reset to page 1 whenever a filter changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, lockedFilter]);

  const handleDeactivate = async (accountId) => {
    const result = await showConfirmationAlert(
      'Deactivate Account',
      'Are you sure you want to deactivate this account? The user will not be able to log in.',
      'Yes, Deactivate'
    );
    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`${API_BASE}/accounts/${accountId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ status: 'Inactive' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to deactivate account');

      showSuccessAlert('Account deactivated successfully!');
      fetchAccounts();
    } catch (err) {
      showErrorAlert(err.message || 'Failed to deactivate account');
    }
  };

  const handleActivate = async (accountId) => {
    const result = await showConfirmationAlert(
      'Activate Account',
      'Are you sure you want to activate this account?',
      'Yes, Activate'
    );
    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`${API_BASE}/accounts/${accountId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ status: 'Active' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to activate account');

      showSuccessAlert('Account activated successfully!');
      fetchAccounts();
    } catch (err) {
      showErrorAlert(err.message || 'Failed to activate account');
    }
  };

  const handleUnlock = async (accountId) => {
    const result = await showConfirmationAlert(
      'Unlock Account',
      'This will reset failed login attempts and unlock the account.',
      'Yes, Unlock'
    );
    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`${API_BASE}/accounts/${accountId}/unlock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to unlock account');

      showSuccessAlert('Account unlocked successfully!');
      fetchAccounts();
    } catch (err) {
      showErrorAlert(err.message || 'Failed to unlock account');
    }
  };

  const handleLock = async (accountId) => {
    const result = await showConfirmationAlert(
      'Lock Account',
      'This will prevent the user from logging in until unlocked.',
      'Yes, Lock'
    );
    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`${API_BASE}/accounts/${accountId}/lock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ locked_by: getActingSuperAdminId() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to lock account');

      showSuccessAlert('Account locked successfully!');
      fetchAccounts();
    } catch (err) {
      showErrorAlert(err.message || 'Failed to lock account');
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Account Management</h1>
        <p style={styles.subtitle}>Manage Admin account status and login locks</p>
      </div>

      <div style={styles.controls}>
        <div style={styles.searchWrapper}>
          <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search by name or employee ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="All">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <select
          value={lockedFilter}
          onChange={(e) => setLockedFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="All">All Accounts</option>
          <option value="Locked">Locked Only</option>
          <option value="Unlocked">Unlocked Only</option>
        </select>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.tableHeaderCell}>Employee ID</th>
              <th style={styles.tableHeaderCell}>Name</th>
              <th style={styles.tableHeaderCell}>Status</th>
              <th style={styles.tableHeaderCell}>Login Attempts</th>
              <th style={styles.tableHeaderCell}>Locked</th>
              <th style={styles.tableHeaderCell}>Created</th>
              <th style={styles.tableHeaderCell}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" style={styles.emptyCell}>Loading accounts...</td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan="7" style={styles.emptyCell}>No accounts found</td>
              </tr>
            ) : (
              accounts.map(account => (
                <tr key={account.id} style={styles.tableRow}>
                  <td style={styles.tableCell}>{account.employee_id || '—'}</td>
                  <td style={styles.tableCell}>
                    <span style={styles.fullName}>{account.name}</span>
                  </td>
                  <td style={styles.tableCell}>
                    <span style={{
                      ...styles.statusBadge,
                      backgroundColor: account.status === 'Active' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: account.status === 'Active' ? '#22c55e' : '#ef4444',
                    }}>
                      {account.status}
                    </span>
                  </td>
                  <td style={styles.tableCell}>{account.failedAttempts}</td>
                  <td style={styles.tableCell}>
                    {account.locked ? (
                      <span style={{ ...styles.statusBadge, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                        Locked
                      </span>
                    ) : (
                      <span style={{ ...styles.statusBadge, backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>
                        Unlocked
                      </span>
                    )}
                  </td>
                  <td style={styles.tableCell}>{formatDate(account.createdAt)}</td>
                  <td style={styles.tableCell}>
                    <div style={styles.actionButtons}>
                      {account.status === 'Active' ? (
                        <button onClick={() => handleDeactivate(account.id)} style={styles.deactivateBtn} title="Deactivate">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                          </svg>
                        </button>
                      ) : (
                        <button onClick={() => handleActivate(account.id)} style={styles.activateBtn} title="Activate">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                          </svg>
                        </button>
                      )}
                      {account.locked ? (
                        <button onClick={() => handleUnlock(account.id)} style={styles.activateBtn} title="Unlock">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                          </svg>
                        </button>
                      ) : (
                        <button onClick={() => handleLock(account.id)} style={styles.deactivateBtn} title="Lock">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && pagination.totalPages > 1 && (
        <div style={styles.pagination}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{ ...styles.pageBtn, opacity: page <= 1 ? 0.5 : 1 }}
          >
            Previous
          </button>
          <span style={styles.pageInfo}>
            Page {page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <button
            onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
            disabled={page >= pagination.totalPages}
            style={{ ...styles.pageBtn, opacity: page >= pagination.totalPages ? 0.5 : 1 }}
          >
            Next
          </button>
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
  errorBanner: {
    padding: '12px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 'var(--radius-md)',
    color: '#ef4444',
    fontSize: '14px',
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
  fullName: {
    fontWeight: '600',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: '600',
  },
  actionButtons: {
    display: 'flex',
    gap: '8px',
  },
  deactivateBtn: {
    padding: '6px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: '#f59e0b',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  activateBtn: {
    padding: '6px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: '#22c55e',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  emptyCell: {
    padding: '32px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '14px',
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
  },
  pageBtn: {
    padding: '8px 16px',
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
  },
  pageInfo: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
  },
};