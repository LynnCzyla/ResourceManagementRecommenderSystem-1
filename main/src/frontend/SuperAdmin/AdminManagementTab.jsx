import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';

export default function AdminManagementTab() {
  const [admins, setAdmins] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(null);

  const [formData, setFormData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    email: '',
    password: '',
    branch_id: '',
  });

  // Mock data for now (frontend only)
  useEffect(() => {
    loadAdmins();
    loadBranches();
  }, []);

  const loadAdmins = () => {
    // Mock data - replace with actual API call when backend is ready
    setAdmins([
      {
        id: 1,
        first_name: 'John',
        middle_name: 'A',
        last_name: 'Doe',
        email: 'john.doe@wea.com',
        branch_name: 'Main Branch',
        branch_id: 1,
        status: 'Active',
        created_at: '2024-01-15',
      },
      {
        id: 2,
        first_name: 'Jane',
        middle_name: 'B',
        last_name: 'Smith',
        email: 'jane.smith@wea.com',
        branch_name: 'North Branch',
        branch_id: 2,
        status: 'Active',
        created_at: '2024-02-20',
      },
    ]);
  };

  const loadBranches = () => {
    // Mock data - replace with actual API call when backend is ready
    setBranches([
      { id: 1, name: 'Main Branch', location: 'Manila' },
      { id: 2, name: 'North Branch', location: 'Quezon City' },
      { id: 3, name: 'South Branch', location: 'Makati' },
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

  const handleCreate = async (e) => {
    e.preventDefault();
    // Mock implementation - replace with actual API call
    const newAdmin = {
      id: admins.length + 1,
      ...formData,
      branch_name: branches.find(b => b.id === parseInt(formData.branch_id))?.name || 'Unknown',
      status: 'Active',
      created_at: new Date().toISOString().split('T')[0],
    };
    setAdmins([...admins, newAdmin]);
    setShowCreateModal(false);
    setFormData({
      first_name: '',
      middle_name: '',
      last_name: '',
      email: '',
      password: '',
      branch_id: '',
    });
    showSuccessAlert('Admin account created successfully!');
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    // Mock implementation - replace with actual API call
    const updatedAdmins = admins.map(admin =>
      admin.id === selectedAdmin.id
        ? {
            ...admin,
            ...formData,
            branch_name: branches.find(b => b.id === parseInt(formData.branch_id))?.name || admin.branch_name,
          }
        : admin
    );
    setAdmins(updatedAdmins);
    setShowEditModal(false);
    setSelectedAdmin(null);
    setFormData({
      first_name: '',
      middle_name: '',
      last_name: '',
      email: '',
      password: '',
      branch_id: '',
    });
    showSuccessAlert('Admin account updated successfully!');
  };

  const handleDelete = async (adminId) => {
    const result = await showConfirmationAlert(
      'Delete Admin Account',
      'Are you sure you want to delete this admin account? This action cannot be undone.',
      'Yes, Delete'
    );
    if (!result.isConfirmed) return;

    // Mock implementation - replace with actual API call
    setAdmins(admins.filter(admin => admin.id !== adminId));
    showSuccessAlert('Admin account deleted successfully!');
  };

  const openEditModal = (admin) => {
    setSelectedAdmin(admin);
    setFormData({
      first_name: admin.first_name,
      middle_name: admin.middle_name,
      last_name: admin.last_name,
      email: admin.email,
      password: '',
      branch_id: admin.branch_id,
    });
    setShowEditModal(true);
  };

  const filteredAdmins = admins.filter(admin =>
    admin.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    admin.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    admin.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    admin.branch_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Admin Management</h1>
        <p style={styles.subtitle}>Create and manage admin accounts across branches</p>
      </div>

      <div style={styles.controls}>
        <div style={styles.searchWrapper}>
          <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search admins..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        <button onClick={() => setShowCreateModal(true)} style={styles.createBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Create Admin
        </button>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.tableHeaderCell}>Name</th>
              <th style={styles.tableHeaderCell}>Email</th>
              <th style={styles.tableHeaderCell}>Branch</th>
              <th style={styles.tableHeaderCell}>Status</th>
              <th style={styles.tableHeaderCell}>Created</th>
              <th style={styles.tableHeaderCell}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAdmins.length === 0 ? (
              <tr>
                <td colSpan="6" style={styles.emptyCell}>
                  No admin accounts found
                </td>
              </tr>
            ) : (
              filteredAdmins.map(admin => (
                <tr key={admin.id} style={styles.tableRow}>
                  <td style={styles.tableCell}>
                    <div style={styles.nameCell}>
                      <span style={styles.fullName}>{admin.first_name} {admin.middle_name} {admin.last_name}</span>
                    </div>
                  </td>
                  <td style={styles.tableCell}>{admin.email}</td>
                  <td style={styles.tableCell}>{admin.branch_name}</td>
                  <td style={styles.tableCell}>
                    <span style={{
                      ...styles.statusBadge,
                      backgroundColor: admin.status === 'Active' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: admin.status === 'Active' ? '#22c55e' : '#ef4444',
                    }}>
                      {admin.status}
                    </span>
                  </td>
                  <td style={styles.tableCell}>{admin.created_at}</td>
                  <td style={styles.tableCell}>
                    <div style={styles.actionButtons}>
                      <button onClick={() => openEditModal(admin)} style={styles.editBtn} title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(admin.id)} style={styles.deleteBtn} title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Create Admin Account</h2>
              <button onClick={() => setShowCreateModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <form onSubmit={handleCreate} style={styles.modalForm}>
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
                <label style={styles.formLabel}>Password</label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  style={styles.formInput}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Branch</label>
                <select
                  required
                  value={formData.branch_id}
                  onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                  style={styles.formInput}
                >
                  <option value="">Select Branch</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name} - {branch.location}</option>
                  ))}
                </select>
              </div>
              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowCreateModal(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" style={styles.submitBtn}>
                  Create Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Edit Admin Account</h2>
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
                <label style={styles.formLabel}>New Password (leave blank to keep current)</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  style={styles.formInput}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Branch</label>
                <select
                  required
                  value={formData.branch_id}
                  onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                  style={styles.formInput}
                >
                  <option value="">Select Branch</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name} - {branch.location}</option>
                  ))}
                </select>
              </div>
              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowEditModal(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" style={styles.submitBtn}>
                  Update Admin
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
  createBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
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
  deleteBtn: {
    padding: '6px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-danger)',
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
