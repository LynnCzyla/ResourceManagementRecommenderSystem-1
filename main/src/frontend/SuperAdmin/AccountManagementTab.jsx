import React, { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/superadmin`;

export default function AccountManagementTab() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  // ← UPDATED: Match database values exactly
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [lockedFilter, setLockedFilter] = useState('All');
  const [branchFilter, setBranchFilter] = useState('All');

  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [branches, setBranches] = useState([]);

  // ← UPDATED: Match database values exactly
  const roleOptions = [
    { value: 'All', label: 'All Roles' },
    { value: 'Super Admin', label: 'Super Admin' },
    { value: 'Admin', label: 'Admin' },
    { value: 'Human Resources', label: 'Human Resources' },
    { value: 'Project Manager', label: 'Project Manager' },
    { value: 'Resource Manager', label: 'Resource Manager' },
    { value: 'Employee', label: 'Employee' },
  ];

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const getActingSuperAdminId = () => {
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
    });
  };

  const loadBranches = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/branches?limit=100`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (json.success) {
        setBranches(json.data || []);
      }
    } catch (err) {
      console.error('Error loading branches:', err);
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (roleFilter !== 'All') params.set('role', roleFilter); // ← Now matches database
      if (statusFilter !== 'All') params.set('status', statusFilter);
      if (lockedFilter !== 'All') params.set('locked', lockedFilter === 'Locked' ? 'true' : 'false');
      if (branchFilter !== 'All') params.set('branch_id', branchFilter);

      console.log('Fetching with params:', params.toString()); // Debug

      const res = await fetch(`${API_BASE}/accounts?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();

      console.log('Response:', json); // Debug

      if (!json.success) throw new Error(json.error || 'Failed to load accounts');

      setAccounts(json.data || []);
      setPagination({
        total: json.pagination?.total || 0,
        totalPages: json.pagination?.totalPages || 1,
      });
    } catch (err) {
      console.error('Error fetching accounts:', err);
      setError('Unable to reach the server. Please try again.');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchQuery, roleFilter, statusFilter, lockedFilter, branchFilter]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, roleFilter, statusFilter, lockedFilter, branchFilter]);

  const handleToggleStatus = async (accountId, currentStatus) => {
    const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
    const action = newStatus === 'Active' ? 'Activate' : 'Deactivate';
    
    const result = await showConfirmationAlert(
      `${action} Account`,
      `Are you sure you want to ${action.toLowerCase()} this account?`,
      `Yes, ${action}`
    );
    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`${API_BASE}/accounts/${accountId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || `Failed to ${action.toLowerCase()} account`);

      showSuccessAlert(`Account ${action.toLowerCase()}d successfully!`);
      fetchAccounts();
    } catch (err) {
      showErrorAlert(err.message || `Failed to ${action.toLowerCase()} account`);
    }
  };

  const handleToggleLock = async (accountId, isLocked) => {
    const action = isLocked ? 'Unlock' : 'Lock';
    
    const result = await showConfirmationAlert(
      `${action} Account`,
      `${action === 'Lock' ? 'This will prevent the user from logging in.' : 'This will restore access to the account.'}`,
      `Yes, ${action}`
    );
    if (!result.isConfirmed) return;

    try {
      const endpoint = isLocked 
        ? `${API_BASE}/accounts/${accountId}/unlock`
        : `${API_BASE}/accounts/${accountId}/lock`;

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: isLocked ? {} : JSON.stringify({ locked_by: getActingSuperAdminId() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || `Failed to ${action.toLowerCase()} account`);

      showSuccessAlert(`Account ${action.toLowerCase()}ed successfully!`);
      fetchAccounts();
    } catch (err) {
      showErrorAlert(err.message || `Failed to ${action.toLowerCase()} account`);
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // ← UPDATED: Match database role values for badges
  const getRoleBadgeStyle = (role) => {
    const roleColors = {
      'Super Admin': { bg: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' },
      'Admin': { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' },
      'Human Resources': { bg: 'rgba(236, 72, 153, 0.15)', color: '#ec4899' },
      'Project Manager': { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' },
      'Resource Manager': { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981' },
      'Employee': { bg: 'rgba(107, 114, 128, 0.15)', color: '#6b7280' },
    };
    return roleColors[role] || { bg: 'rgba(107, 114, 128, 0.15)', color: '#6b7280' };
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Account Management</h1>
        <p style={styles.subtitle}>Manage all user accounts across all branches</p>
      </div>

      <div style={styles.controls}>
        <div style={styles.searchWrapper}>
          <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search by name, employee ID, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={styles.filterSelect}
        >
          {roleOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

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

        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="All">All Branches</option>
          {branches.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}

      <div style={styles.tableContainer}>
        <div style={styles.tableHeaderInfo}>
          <span>Showing {accounts.length} of {pagination.total} accounts</span>
        </div>

        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.tableHeaderCell}>Employee ID</th>
              <th style={styles.tableHeaderCell}>Name</th>
              <th style={styles.tableHeaderCell}>Email</th>
              <th style={styles.tableHeaderCell}>Role</th>
              <th style={styles.tableHeaderCell}>Branch</th>
              <th style={styles.tableHeaderCell}>Status</th>
              <th style={styles.tableHeaderCell}>Locked</th>
              <th style={styles.tableHeaderCell}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" style={styles.emptyCell}>Loading accounts...</td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan="8" style={styles.emptyCell}>No accounts found</td>
              </tr>
            ) : (
              accounts.map(account => {
                const roleStyle = getRoleBadgeStyle(account.role);
                return (
                  <tr key={account.id} style={styles.tableRow}>
                    <td style={styles.tableCell}>
                      <span style={styles.employeeIdBadge}>{account.employee_id || '—'}</span>
                    </td>
                    <td style={styles.tableCell}>
                      <span style={styles.fullName}>{account.name}</span>
                    </td>
                    <td style={styles.tableCell}>{account.email || '—'}</td>
                    <td style={styles.tableCell}>
                      <span style={{
                        ...styles.roleBadge,
                        backgroundColor: roleStyle.bg,
                        color: roleStyle.color,
                      }}>
                        {account.role || 'Unknown'}
                      </span>
                    </td>
                    <td style={styles.tableCell}>
                      <span style={styles.branchBadge}>
                        {account.branch?.name || '—'}
                      </span>
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
                    <td style={styles.tableCell}>
                      {account.locked ? (
                        <span style={{ ...styles.statusBadge, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                          🔒 Locked
                        </span>
                      ) : (
                        <span style={{ ...styles.statusBadge, backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>
                          🔓 Unlocked
                        </span>
                      )}
                      {account.failed_attempts > 0 && (
                        <span style={styles.failedAttempts}>
                          ({account.failed_attempts} failed)
                        </span>
                      )}
                    </td>
                    <td style={styles.tableCell}>
                      <div style={styles.actionButtons}>
                        <button
                          onClick={() => handleToggleStatus(account.id, account.status)}
                          style={account.status === 'Active' ? styles.deactivateBtn : styles.activateBtn}
                          title={account.status === 'Active' ? 'Deactivate' : 'Activate'}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {account.status === 'Active' ? (
                              <>
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                              </>
                            ) : (
                              <>
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                              </>
                            )}
                          </svg>
                        </button>

                        <button
                          onClick={() => handleToggleLock(account.id, account.locked)}
                          style={account.locked ? styles.activateBtn : styles.deactivateBtn}
                          title={account.locked ? 'Unlock' : 'Lock'}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {account.locked ? (
                              <>
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                              </>
                            ) : (
                              <>
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                              </>
                            )}
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
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
    minWidth: '200px',
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
  tableHeaderInfo: {
    padding: '12px 16px',
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg-card-hover)',
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
    fontSize: '11px',
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
  employeeIdBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    background: 'rgba(99, 102, 241, 0.1)',
    color: '#6366f1',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  fullName: {
    fontWeight: '600',
  },
  roleBadge: {
    padding: '2px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
    display: 'inline-block',
  },
  branchBadge: {
    padding: '2px 8px',
    background: 'rgba(59, 130, 246, 0.1)',
    color: '#3b82f6',
    borderRadius: '4px',
    fontSize: '12px',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: '600',
    display: 'inline-block',
  },
  failedAttempts: {
    display: 'block',
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    marginTop: '2px',
  },
  actionButtons: {
    display: 'flex',
    gap: '6px',
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
    paddingTop: '16px',
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