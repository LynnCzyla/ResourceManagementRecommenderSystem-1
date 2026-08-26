import React, { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/superadmin`;

const emptyForm = {
  name: '',
  location: '',
  address: '',
  contact_number: '',
  status: 'Active',
};

export default function BranchManagementTab() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [tableNotConfigured, setTableNotConfigured] = useState(false);

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
      customClass: { popup: 'swal-custom-popup', confirmButton: 'swal-custom-confirm', cancelButton: 'swal-custom-cancel' }
    });
  };

  const loadBranches = useCallback(async (page = pagination.page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pagination.limit),
      });
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (statusFilter && statusFilter !== 'All') params.set('status', statusFilter);

      const res = await fetch(`${API_BASE}/branches?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load branches');
      setTableNotConfigured(!!json.table_not_found);
      setBranches(json.data);
      setPagination(json.pagination);
    } catch (err) {
      showErrorAlert(err.message, 'Failed to load branches');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, pagination.page, pagination.limit]);

  useEffect(() => {
    const timer = setTimeout(() => loadBranches(1), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, statusFilter]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Remove manager_name from form data (it's auto-assigned later)
      const submitData = {
        name: formData.name,
        location: formData.location,
        address: formData.address,
        contact_number: formData.contact_number,
        status: formData.status,
      };

      const res = await fetch(`${API_BASE}/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to create branch');

      setShowCreateModal(false);
      setFormData(emptyForm);
      loadBranches(1);
      showSuccessAlert('Branch created successfully!');
    } catch (err) {
      showErrorAlert(err.message, 'Failed to create branch');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Remove manager_name from form data (it's auto-assigned)
      const submitData = {
        name: formData.name,
        location: formData.location,
        address: formData.address,
        contact_number: formData.contact_number,
        status: formData.status,
      };

      const res = await fetch(`${API_BASE}/branches/${selectedBranch.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to update branch');

      setShowEditModal(false);
      setSelectedBranch(null);
      setFormData(emptyForm);
      loadBranches();
      showSuccessAlert('Branch updated successfully!');
    } catch (err) {
      showErrorAlert(err.message, 'Failed to update branch');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (branch) => {
    const result = await showConfirmationAlert(
      'Delete Branch',
      'Are you sure you want to delete this branch? This action cannot be undone.',
      'Yes, Delete'
    );
    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`${API_BASE}/branches/${branch.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to delete branch');
      loadBranches();
      showSuccessAlert('Branch deleted successfully!');
    } catch (err) {
      showErrorAlert(err.message, 'Failed to delete branch');
    }
  };

  const openEditModal = (branch) => {
    setSelectedBranch(branch);
    setFormData({
      name: branch.name || '',
      location: branch.location || '',
      address: branch.address || '',
      contact_number: branch.contact_number || '',
      status: branch.status || 'Active',
    });
    setShowEditModal(true);
  };

  const goToPage = (page) => {
    if (page < 1 || page > pagination.totalPages) return;
    loadBranches(page);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Branch Management</h1>
        <p style={styles.subtitle}>Create and manage branches across the organization</p>
      </div>

      {tableNotConfigured && (
        <div style={{
          padding: '16px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          color: '#f59e0b',
          fontSize: '14px',
          fontWeight: '600',
          lineHeight: '1.5'
        }}>
          ⚠️ <strong>Branches database table is not configured in Supabase.</strong><br/>
          To enable Branch Management, please create the <code>branches</code> table in your Supabase SQL editor.
        </div>
      )}

      <div style={styles.controls}>
        <div style={styles.searchWrapper}>
          <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search branches..."
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
          <option value="All">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <button
          onClick={() => { setFormData(emptyForm); setShowCreateModal(true); }}
          style={styles.createBtn}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Create Branch
        </button>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.tableHeaderCell}>Branch Name</th>
              <th style={styles.tableHeaderCell}>Location</th>
              <th style={styles.tableHeaderCell}>Address</th>
              <th style={styles.tableHeaderCell}>Contact</th>
              <th style={styles.tableHeaderCell}>Manager</th>
              <th style={styles.tableHeaderCell}>Status</th>
              <th style={styles.tableHeaderCell}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" style={styles.emptyCell}>Loading...</td></tr>
            ) : branches.length === 0 ? (
              <tr><td colSpan="7" style={styles.emptyCell}>No branches found</td></tr>
            ) : (
              branches.map(branch => (
                <tr key={branch.id} style={styles.tableRow}>
                  <td style={styles.tableCell}>
                    <span style={styles.branchName}>{branch.name}</span>
                  </td>
                  <td style={styles.tableCell}>{branch.location}</td>
                  <td style={styles.tableCell}>
                    <span style={styles.addressText}>{branch.address}</span>
                  </td>
                  <td style={styles.tableCell}>{branch.contact_number}</td>
                  <td style={styles.tableCell}>
                    {branch.admin_info ? (
                      <span style={styles.managerBadge}>
                        {branch.admin_info.name}
                        <span style={styles.managerId}>({branch.admin_info.employee_id})</span>
                      </span>
                    ) : (
                      <span style={styles.noManager}>No manager assigned</span>
                    )}
                  </td>
                  <td style={styles.tableCell}>
                    <span style={{
                      ...styles.statusBadge,
                      backgroundColor: branch.status === 'Active' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: branch.status === 'Active' ? '#22c55e' : '#ef4444',
                    }}>
                      {branch.status}
                    </span>
                  </td>
                  <td style={styles.tableCell}>
                    <div style={styles.actionButtons}>
                      <button onClick={() => openEditModal(branch)} style={styles.editBtn} title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(branch)} style={styles.deleteBtn} title="Delete">
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
        {pagination.totalPages > 1 && (
          <div style={styles.pagination}>
            <button
              onClick={() => goToPage(pagination.page - 1)}
              disabled={pagination.page <= 1}
              style={styles.pageBtn}
            >
              Prev
            </button>
            <span style={styles.pageInfo}>Page {pagination.page} of {pagination.totalPages}</span>
            <button
              onClick={() => goToPage(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              style={styles.pageBtn}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Create Modal - Removed Manager Name */}
      {showCreateModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Create Branch</h2>
              <button onClick={() => setShowCreateModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <form onSubmit={handleCreate} style={styles.modalForm}>
              <div style={styles.formSection}>
                <h4 style={styles.sectionTitle}>Branch Information</h4>
                
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>
                    Branch Name <span style={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={styles.formInput}
                    placeholder="e.g., WEA-PHIL, WEA-Singapore"
                  />
                  <span style={styles.helperText}>Format: WEA-Location (e.g., WEA-PHIL)</span>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Location</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    style={styles.formInput}
                    placeholder="e.g., Manila, Singapore"
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    style={styles.formInput}
                    placeholder="Full branch address"
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Contact Number</label>
                  <input
                    type="text"
                    value={formData.contact_number}
                    onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                    style={styles.formInput}
                    placeholder="e.g., 09123456789"
                  />
                </div>
              </div>

              <div style={styles.infoBox}>
                <span style={styles.infoIcon}>💡</span>
                <span style={styles.infoText}>
                  After creating the branch, assign an admin in the <strong>Admin Management</strong> tab. 
                  The assigned admin will automatically become the branch manager.
                </span>
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowCreateModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" disabled={submitting} style={styles.submitBtn}>
                  {submitting ? 'Creating...' : 'Create Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal - Removed Manager Name */}
      {showEditModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Edit Branch</h2>
              <button onClick={() => setShowEditModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <form onSubmit={handleEdit} style={styles.modalForm}>
              <div style={styles.formSection}>
                <h4 style={styles.sectionTitle}>Branch Information</h4>
                
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>
                    Branch Name <span style={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={styles.formInput}
                    placeholder="e.g., WEA-PHIL, WEA-Singapore"
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Location</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    style={styles.formInput}
                    placeholder="e.g., Manila, Singapore"
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    style={styles.formInput}
                    placeholder="Full branch address"
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Contact Number</label>
                  <input
                    type="text"
                    value={formData.contact_number}
                    onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                    style={styles.formInput}
                    placeholder="e.g., 09123456789"
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    style={styles.formInput}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div style={styles.infoBox}>
                <span style={styles.infoIcon}>💡</span>
                <span style={styles.infoText}>
                  To change the branch manager, go to <strong>Admin Management</strong> and update the admin assigned to this branch.
                </span>
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowEditModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" disabled={submitting} style={styles.submitBtn}>
                  {submitting ? 'Saving...' : 'Update Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// STYLES
// ============================================

const styles = {
  container: { display: 'flex', flexDirection: 'column', gap: '24px' },
  header: { marginBottom: '8px' },
  title: { fontSize: '28px', fontWeight: '800', letterSpacing: '-0.75px', marginBottom: '4px', color: 'var(--color-text-primary)' },
  subtitle: { fontSize: '14px', color: 'var(--color-text-secondary)' },

  controls: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' },
  searchWrapper: { display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '8px 12px', flex: 1, maxWidth: '400px' },
  searchIcon: { color: 'var(--color-text-muted)' },
  searchInput: { border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: '14px', color: 'var(--color-text-primary)' },
  filterSelect: { padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', fontSize: '14px' },
  createBtn: { display: 'flex', alignItems: 'center', padding: '8px 16px', backgroundColor: 'var(--color-primary)', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '14px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s' },

  tableContainer: { background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableHeader: { background: 'var(--color-bg-card-hover)' },
  tableHeaderCell: { padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)' },
  tableRow: { borderBottom: '1px solid var(--color-border)', transition: 'background-color 0.2s' },
  tableCell: { padding: '12px 16px', fontSize: '14px', color: 'var(--color-text-primary)', verticalAlign: 'middle' },

  branchName: { fontWeight: '600', color: 'var(--color-primary)' },
  addressText: { fontSize: '13px', color: 'var(--color-text-secondary)' },
  
  managerBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    background: 'rgba(99, 102, 241, 0.1)',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    color: '#6366f1',
  },
  managerId: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    fontWeight: '400',
  },
  noManager: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
  },

  statusBadge: { padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' },
  actionButtons: { display: 'flex', gap: '8px' },
  editBtn: { padding: '6px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer', transition: 'all 0.2s' },
  deleteBtn: { padding: '6px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-danger)', cursor: 'pointer', transition: 'all 0.2s' },
  emptyCell: { padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' },

  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '16px' },
  pageBtn: { padding: '6px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--color-text-primary)', cursor: 'pointer' },
  pageInfo: { fontSize: '13px', color: 'var(--color-text-secondary)' },

  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' },
  modal: { background: 'var(--color-bg-card)', borderRadius: 'var(--radius-md)', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--color-border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--color-border)' },
  modalTitle: { fontSize: '18px', fontWeight: '700', color: 'var(--color-text-primary)', margin: 0 },
  closeBtn: { background: 'transparent', border: 'none', fontSize: '24px', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0, width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  modalForm: { padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  formSection: { display: 'flex', flexDirection: 'column', gap: '14px' },
  sectionTitle: { fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)', margin: '0 0 4px 0' },
  
  formGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  formLabel: { fontSize: '13px', fontWeight: '600', color: 'var(--color-text-primary)' },
  required: { color: 'var(--color-danger)' },
  formInput: { padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '14px', background: 'var(--color-bg-root)', color: 'var(--color-text-primary)', outline: 'none', width: '100%' },
  helperText: { fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' },

  infoBox: {
    display: 'flex',
    gap: '10px',
    padding: '12px 16px',
    background: 'rgba(59, 130, 246, 0.08)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid rgba(59, 130, 246, 0.15)',
    alignItems: 'flex-start',
  },
  infoIcon: { fontSize: '16px', marginTop: '1px' },
  infoText: { fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.5' },

  modalActions: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' },
  cancelBtn: { padding: '10px 20px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)', cursor: 'pointer', transition: 'all 0.2s' },
  submitBtn: { padding: '10px 20px', background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '14px', fontWeight: '600', color: '#ffffff', cursor: 'pointer', transition: 'all 0.2s' },
};