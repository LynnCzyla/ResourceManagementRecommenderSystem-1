import React, { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/superadmin`;

const emptyForm = {
  employee_id: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  email: '',
  contact_number: '',
  department_id: '',
  position_id: '',
  join_date: '',
};

export default function AdminManagementTab() {
  const [admins, setAdmins] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const showSuccessAlert = (message, title = 'Success!') => {
    Swal.fire({
      title, text: message, icon: 'success',
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
      title, text: message, icon: 'error',
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
      title, text, icon: 'warning', showCancelButton: true,
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

  const loadOptions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admins/options`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load options');
      setDepartments(json.data.departments);
      setPositions(json.data.positions);
    } catch (err) {
      showErrorAlert(err.message, 'Failed to load departments/positions');
    }
  }, []);

  const loadAdmins = useCallback(async (page = pagination.page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pagination.limit),
      });
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (departmentFilter) params.set('department_id', departmentFilter);

      const res = await fetch(`${API_BASE}/admins?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load admins');
      setAdmins(json.data);
      setPagination(json.pagination);
    } catch (err) {
      showErrorAlert(err.message, 'Failed to load admins');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, departmentFilter, pagination.page, pagination.limit]);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  useEffect(() => {
    const timer = setTimeout(() => loadAdmins(1), 300); // debounce search/filter
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, departmentFilter]);

  const positionsForDepartment = (departmentId) =>
    departmentId ? positions.filter(p => String(p.department_id) === String(departmentId)) : positions;

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to create admin');

      setShowCreateModal(false);
      setFormData(emptyForm);
      loadAdmins(1);
      Swal.fire({
        title: 'Admin Created!',
        html: `The admin account was created.<br/><br/><b>Temporary password:</b><br/><code>${json.tempPassword}</code><br/><br/>Share this with the admin securely — it will not be shown again.`,
        icon: 'success',
        confirmButtonColor: 'var(--color-primary)',
        background: 'var(--color-bg-card)',
        color: 'var(--color-text-primary)',
      });
    } catch (err) {
      showErrorAlert(err.message, 'Failed to create admin');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/admins/${selectedAdmin.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to update admin');

      setShowEditModal(false);
      setSelectedAdmin(null);
      setFormData(emptyForm);
      loadAdmins();
      showSuccessAlert('Admin account updated successfully!');
    } catch (err) {
      showErrorAlert(err.message, 'Failed to update admin');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (admin) => {
    const result = await showConfirmationAlert(
      'Delete Admin Account',
      'Are you sure you want to delete this admin account? This action cannot be undone.',
      'Yes, Delete'
    );
    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`${API_BASE}/admins/${admin.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to delete admin');
      loadAdmins();
      showSuccessAlert('Admin account deleted successfully!');
    } catch (err) {
      showErrorAlert(err.message, 'Failed to delete admin');
    }
  };

  const openEditModal = (admin) => {
    setSelectedAdmin(admin);
    setFormData({
      employee_id: admin.employee_id || '',
      first_name: admin.first_name || '',
      middle_name: admin.middle_name || '',
      last_name: admin.last_name || '',
      email: admin.email || '',
      contact_number: admin.contact_number || '',
      department_id: admin.department_id || '',
      position_id: admin.position_id || '',
      join_date: admin.join_date || '',
    });
    setShowEditModal(true);
  };

  const goToPage = (page) => {
    if (page < 1 || page > pagination.totalPages) return;
    loadAdmins(page);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Admin Management</h1>
        <p style={styles.subtitle}>Create and manage admin accounts</p>
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
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All Departments</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.department_name}</option>
          ))}
        </select>
        <button
          onClick={() => { setFormData(emptyForm); setShowCreateModal(true); }}
          style={styles.createBtn}
        >
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
              <th style={styles.tableHeaderCell}>Employee ID</th>
              <th style={styles.tableHeaderCell}>Name</th>
              <th style={styles.tableHeaderCell}>Email</th>
              <th style={styles.tableHeaderCell}>Department</th>
              <th style={styles.tableHeaderCell}>Position</th>
              <th style={styles.tableHeaderCell}>Status</th>
              <th style={styles.tableHeaderCell}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" style={styles.emptyCell}>Loading...</td></tr>
            ) : admins.length === 0 ? (
              <tr><td colSpan="7" style={styles.emptyCell}>No admin accounts found</td></tr>
            ) : (
              admins.map(admin => (
                <tr key={admin.id} style={styles.tableRow}>
                  <td style={styles.tableCell}>{admin.employee_id}</td>
                  <td style={styles.tableCell}>
                    <span style={styles.fullName}>
                      {admin.first_name} {admin.middle_name} {admin.last_name}
                    </span>
                  </td>
                  <td style={styles.tableCell}>{admin.email}</td>
                  <td style={styles.tableCell}>{admin.departments?.department_name || '—'}</td>
                  <td style={styles.tableCell}>{admin.positions?.position_name || '—'}</td>
                  <td style={styles.tableCell}>
                    <span style={{
                      ...styles.statusBadge,
                      backgroundColor: admin.status === 'Active' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: admin.status === 'Active' ? '#22c55e' : '#ef4444',
                    }}>
                      {admin.status}
                    </span>
                  </td>
                  <td style={styles.tableCell}>
                    <div style={styles.actionButtons}>
                      <button onClick={() => openEditModal(admin)} style={styles.editBtn} title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(admin)} style={styles.deleteBtn} title="Delete">
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

      {/* Create Modal */}
      {showCreateModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Create Admin Account</h2>
              <button onClick={() => setShowCreateModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <form onSubmit={handleCreate} style={styles.modalForm}>
              <FormFields formData={formData} setFormData={setFormData} departments={departments} positions={positionsForDepartment(formData.department_id)} />
              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowCreateModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" disabled={submitting} style={styles.submitBtn}>
                  {submitting ? 'Creating...' : 'Create Admin'}
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
              <FormFields formData={formData} setFormData={setFormData} departments={departments} positions={positionsForDepartment(formData.department_id)} isEdit />
              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowEditModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" disabled={submitting} style={styles.submitBtn}>
                  {submitting ? 'Saving...' : 'Update Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function FormFields({ formData, setFormData, departments, positions, isEdit }) {
  return (
    <>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Employee ID</label>
        <input
          type="text" required disabled={isEdit}
          value={formData.employee_id}
          onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
          style={styles.formInput}
        />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>First Name</label>
        <input
          type="text" required
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
          type="text" required
          value={formData.last_name}
          onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
          style={styles.formInput}
        />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Email</label>
        <input
          type="email" required disabled={isEdit}
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          style={styles.formInput}
        />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Contact Number</label>
        <input
          type="text"
          value={formData.contact_number}
          onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
          style={styles.formInput}
        />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Department</label>
        <select
          value={formData.department_id}
          onChange={(e) => setFormData({ ...formData, department_id: e.target.value, position_id: '' })}
          style={styles.formInput}
        >
          <option value="">Select Department</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.department_name}</option>
          ))}
        </select>
      </div>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Position</label>
        <select
          value={formData.position_id}
          onChange={(e) => setFormData({ ...formData, position_id: e.target.value })}
          style={styles.formInput}
        >
          <option value="">Select Position</option>
          {positions.map(p => (
            <option key={p.id} value={p.id}>{p.position_name}</option>
          ))}
        </select>
      </div>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Join Date</label>
        <input
          type="date"
          value={formData.join_date}
          onChange={(e) => setFormData({ ...formData, join_date: e.target.value })}
          style={styles.formInput}
        />
      </div>
    </>
  );
}

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
  tableCell: { padding: '12px 16px', fontSize: '14px', color: 'var(--color-text-primary)' },
  fullName: { fontWeight: '600' },
  statusBadge: { padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' },
  actionButtons: { display: 'flex', gap: '8px' },
  editBtn: { padding: '6px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer', transition: 'all 0.2s' },
  deleteBtn: { padding: '6px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-danger)', cursor: 'pointer', transition: 'all 0.2s' },
  emptyCell: { padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '16px' },
  pageBtn: { padding: '6px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--color-text-primary)', cursor: 'pointer' },
  pageInfo: { fontSize: '13px', color: 'var(--color-text-secondary)' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'var(--color-bg-card)', borderRadius: 'var(--radius-md)', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--color-border)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--color-border)' },
  modalTitle: { fontSize: '18px', fontWeight: '700', color: 'var(--color-text-primary)', margin: 0 },
  closeBtn: { background: 'transparent', border: 'none', fontSize: '24px', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0, width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalForm: { padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  formLabel: { fontSize: '13px', fontWeight: '600', color: 'var(--color-text-primary)' },
  formInput: { padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '14px', background: 'var(--color-bg-root)', color: 'var(--color-text-primary)', outline: 'none' },
  modalActions: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' },
  cancelBtn: { padding: '10px 20px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)', cursor: 'pointer', transition: 'all 0.2s' },
  submitBtn: { padding: '10px 20px', background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '14px', fontWeight: '600', color: '#ffffff', cursor: 'pointer', transition: 'all 0.2s' },
};