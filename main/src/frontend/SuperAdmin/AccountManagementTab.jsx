import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';

export default function AccountManagementTab() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);

  const [formData, setFormData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    email: '',
    role: '',
    status: '',
  });

  // Mock data for now (frontend only)
  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = () => {
    // Mock data - replace with actual API call when backend is ready
    setAccounts([
      {
        id: 1,
        first_name: 'John',
        middle_name: 'A',
        last_name: 'Doe',
        email: 'john.doe@wea.com',
        role: 'Admin',
        branch: 'Main Branch',
        status: 'Active',
        last_login: '2024-08-20 10:30 AM',
        created_at: '2024-01-15',
      },
      {
        id: 2,
        first_name: 'Jane',
        middle_name: 'B',
        last_name: 'Smith',
        email: 'jane.smith@wea.com',
        role: 'HR',
        branch: 'Main Branch',
        status: 'Active',
        last_login: '2024-08-21 09:15 AM',
        created_at: '2024-02-20',
      },
      {
        id: 3,
        first_name: 'Robert',
        middle_name: 'C',
        last_name: 'Johnson',
        email: 'robert.johnson@wea.com',
        role: 'Resource Manager',
        branch: 'North Branch',
        status: 'Active',
        last_login: '2024-08-22 02:45 PM',
        created_at: '2024-03-10',
      },
      {
        id: 4,
        first_name: 'Emily',
        middle_name: 'D',
        last_name: 'Davis',
        email: 'emily.davis@wea.com',
        role: 'Project Manager',
        branch: 'South Branch',
        status: 'Active',
        last_login: '2024-08-19 11:20 AM',
        created_at: '2024-04-05',
      },
      {
        id: 5,
        first_name: 'Michael',
        middle_name: 'E',
        last_name: 'Wilson',
        email: 'michael.wilson@wea.com',
        role: 'Employee',
        branch: 'Main Branch',
        status: 'Active',
        last_login: '2024-08-22 08:00 AM',
        created_at: '2024-05-12',
      },
      {
        id: 6,
        first_name: 'Sarah',
        middle_name: 'F',
        last_name: 'Brown',
        email: 'sarah.brown@wea.com',
        role: 'Applicant',
        branch: 'N/A',
        status: 'Pending',
        last_login: 'Never',
        created_at: '2024-08-22',
      },
    ]);
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

  const handleEdit = async (e) => {
    e.preventDefault();
    // Mock implementation - replace with actual API call
    const updatedAccounts = accounts.map(account =>
      account.id === selectedAccount.id
        ? { ...account, ...formData }
        : account
    );
    setAccounts(updatedAccounts);
    setShowEditModal(false);
    setSelectedAccount(null);
    setFormData({
      first_name: '',
      middle_name: '',
      last_name: '',
      email: '',
      role: '',
      status: '',
    });
    showSuccessAlert('Account updated successfully!');
  };

  const handleDeactivate = async (accountId) => {
    const result = await showConfirmationAlert(
      'Deactivate Account',
      'Are you sure you want to deactivate this account? The user will not be able to log in.',
      'Yes, Deactivate'
    );
    if (!result.isConfirmed) return;

    // Mock implementation - replace with actual API call
    setAccounts(accounts.map(account =>
      account.id === accountId
        ? { ...account, status: 'Inactive' }
        : account
    ));
    showSuccessAlert('Account deactivated successfully!');
  };

  const handleActivate = async (accountId) => {
    const result = await showConfirmationAlert(
      'Activate Account',
      'Are you sure you want to activate this account?',
      'Yes, Activate'
    );
    if (!result.isConfirmed) return;

    // Mock implementation - replace with actual API call
    setAccounts(accounts.map(account =>
      account.id === accountId
        ? { ...account, status: 'Active' }
        : account
    ));
    showSuccessAlert('Account activated successfully!');
  };

  const openEditModal = (account) => {
    setSelectedAccount(account);
    setFormData({
      first_name: account.first_name,
      middle_name: account.middle_name,
      last_name: account.last_name,
      email: account.email,
      role: account.role,
      status: account.status,
    });
    setShowEditModal(true);
  };

  const filteredAccounts = accounts.filter(account => {
    const matchesSearch =
      account.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === 'All' || account.role === roleFilter;
    const matchesStatus = statusFilter === 'All' || account.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  const getRoleColor = (role) => {
    const colors = {
      'Super Admin': '#8b5cf6',
      'Admin': '#3b82f6',
      'HR': '#10b981',
      'Resource Manager': '#f59e0b',
      'Project Manager': '#ef4444',
      'Employee': '#6b7280',
      'Applicant': '#ec4899',
    };
    return colors[role] || '#6b7280';
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Account Management</h1>
        <p style={styles.subtitle}>Manage all user accounts across the system</p>
      </div>

      <div style={styles.controls}>
        <div style={styles.searchWrapper}>
          <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search accounts..."
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
          <option value="All">All Roles</option>
          <option value="Super Admin">Super Admin</option>
          <option value="Admin">Admin</option>
          <option value="HR">HR</option>
          <option value="Resource Manager">Resource Manager</option>
          <option value="Project Manager">Project Manager</option>
          <option value="Employee">Employee</option>
          <option value="Applicant">Applicant</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="All">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Pending">Pending</option>
        </select>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.tableHeaderCell}>Name</th>
              <th style={styles.tableHeaderCell}>Email</th>
              <th style={styles.tableHeaderCell}>Role</th>
              <th style={styles.tableHeaderCell}>Branch</th>
              <th style={styles.tableHeaderCell}>Status</th>
              <th style={styles.tableHeaderCell}>Last Login</th>
              <th style={styles.tableHeaderCell}>Created</th>
              <th style={styles.tableHeaderCell}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAccounts.length === 0 ? (
              <tr>
                <td colSpan="8" style={styles.emptyCell}>
                  No accounts found
                </td>
              </tr>
            ) : (
              filteredAccounts.map(account => (
                <tr key={account.id} style={styles.tableRow}>
                  <td style={styles.tableCell}>
                    <div style={styles.nameCell}>
                      <span style={styles.fullName}>{account.first_name} {account.middle_name} {account.last_name}</span>
                    </div>
                  </td>
                  <td style={styles.tableCell}>{account.email}</td>
                  <td style={styles.tableCell}>
                    <span style={{
                      ...styles.roleBadge,
                      color: getRoleColor(account.role),
                      backgroundColor: `${getRoleColor(account.role)}15`,
                    }}>
                      {account.role}
                    </span>
                  </td>
                  <td style={styles.tableCell}>{account.branch}</td>
                  <td style={styles.tableCell}>
                    <span style={{
                      ...styles.statusBadge,
                      backgroundColor: account.status === 'Active' ? 'rgba(34, 197, 94, 0.15)' : account.status === 'Pending' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: account.status === 'Active' ? '#22c55e' : account.status === 'Pending' ? '#f59e0b' : '#ef4444',
                    }}>
                      {account.status}
                    </span>
                  </td>
                  <td style={styles.tableCell}>{account.last_login}</td>
                  <td style={styles.tableCell}>{account.created_at}</td>
                  <td style={styles.tableCell}>
                    <div style={styles.actionButtons}>
                      <button onClick={() => openEditModal(account)} style={styles.editBtn} title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
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
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Edit Account</h2>
              <button onClick={() => setShowEditModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <form onSubmit={handleEdit} style={styles.modalForm}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>First Name</label>
                <input
                  type="text"
                  required
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  style={styles.formInput}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Middle Name</label>
                <input
                  type="text"
                  value={formData.middle_name}
                  onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
                  style={styles.formInput}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Last Name</label>
                <input
                  type="text"
                  required
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  style={styles.formInput}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={styles.formInput}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Role</label>
                <select
                  required
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  style={styles.formInput}
                >
                  <option value="">Select Role</option>
                  <option value="Super Admin">Super Admin</option>
                  <option value="Admin">Admin</option>
                  <option value="HR">HR</option>
                  <option value="Resource Manager">Resource Manager</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Employee">Employee</option>
                  <option value="Applicant">Applicant</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Status</label>
                <select
                  required
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  style={styles.formInput}
                >
                  <option value="">Select Status</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>
              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowEditModal(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" style={styles.submitBtn}>
                  Update Account
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
  nameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  fullName: {
    fontWeight: '600',
  },
  roleBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
    display: 'inline-block',
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
  editBtn: {
    padding: '6px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.2s',
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
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: 'var(--color-bg-card)',
    borderRadius: 'var(--radius-md)',
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflowY: 'auto',
    border: '1px solid var(--color-border)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid var(--color-border)',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '24px',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: 0,
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalForm: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  formLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
  },
  formInput: {
    padding: '10px 12px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '14px',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    outline: 'none',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '8px',
  },
  cancelBtn: {
    padding: '10px 20px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  submitBtn: {
    padding: '10px 20px',
    background: 'var(--color-primary)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: '14px',
    fontWeight: '600',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};
