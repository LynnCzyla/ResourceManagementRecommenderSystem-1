import React, { useState, useEffect } from 'react';

const API = 'http://localhost:5000/api/admin';

// ─── Reusable Alert ────────────────────────────────────────────────────────────
function Alert({ type, message, onClose }) {
  if (!message) return null;
  const isSuccess = type === 'success';
  return (
    <div style={{
      ...styles.alert,
      background: isSuccess ? 'var(--color-primary-light)' : '#fee',
      color: isSuccess ? 'var(--color-success)' : '#c00',
      border: `1px solid ${isSuccess ? 'var(--color-primary)' : '#fcc'}`,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8, flexShrink: 0 }}>
        {isSuccess
          ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></>
          : <><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></>
        }
      </svg>
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onClose} style={styles.alertClose}>✕</button>
    </div>
  );
}

// ─── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, onConfirm, confirmLabel, confirmDanger, children }) {
  return (
    <div style={styles.modalOverlay}>
      <div className="glass-card" style={styles.modalBox}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>{title}</h3>
          <button onClick={onClose} style={styles.modalCloseBtn}>✕</button>
        </div>
        <div style={styles.modalBody}>{children}</div>
        <div style={styles.modalFooter}>
          <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
          <button
            onClick={onConfirm}
            style={{ ...styles.primaryBtn, ...(confirmDanger ? styles.dangerBtn : {}) }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ message }) {
  return (
    <div style={styles.emptyState}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text-muted)', marginBottom: 12 }}>
        <rect x="2" y="7" width="20" height="14" rx="2"></rect>
        <path d="M16 7V5a2 2 0 0 0-4 0v2"></path>
        <line x1="12" y1="12" x2="12" y2="16"></line>
        <line x1="10" y1="14" x2="14" y2="14"></line>
      </svg>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14, margin: 0 }}>{message}</p>
    </div>
  );
}

// ─── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={styles.spinnerWrap}>
      <div style={styles.spinner}></div>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 12 }}>Loading records...</p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DEPARTMENTS SUB-TAB
// ══════════════════════════════════════════════════════════════════════════════
function DepartmentsSubTab() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [alert, setAlert] = useState({ type: '', message: '' });

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ department_name: '', description: '' });
  const [addLoading, setAddLoading] = useState(false);

  // Edit modal
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ department_name: '', description: '' });
  const [editLoading, setEditLoading] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert({ type: '', message: '' }), 4000);
  };

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/departments`);
      const data = await res.json();
      if (data.success) setDepartments(data.data);
      else showAlert('error', data.error || 'Failed to load departments.');
    } catch {
      showAlert('error', 'Could not connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDepartments(); }, []);

  const filtered = departments.filter(d =>
    d.department_name.toLowerCase().includes(search.toLowerCase()) ||
    (d.description || '').toLowerCase().includes(search.toLowerCase())
  );

  // ── Add ──
  const openAdd = () => {
    setAddForm({ department_name: '', description: '' });
    setShowAddModal(true);
  };
  const handleAdd = async () => {
    if (!addForm.department_name.trim()) return showAlert('error', 'Department name is required.');
    setAddLoading(true);
    try {
      const res = await fetch(`${API}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (data.success) {
        showAlert('success', `Department "${addForm.department_name}" added successfully.`);
        setShowAddModal(false);
        fetchDepartments();
      } else {
        showAlert('error', data.error || 'Failed to add department.');
      }
    } catch {
      showAlert('error', 'Could not connect to the server.');
    } finally {
      setAddLoading(false);
    }
  };

  // ── Edit ──
  const openEdit = (dept) => {
    setEditTarget(dept);
    setEditForm({ department_name: dept.department_name, description: dept.description || '' });
  };
  const handleEdit = async () => {
    if (!editForm.department_name.trim()) return showAlert('error', 'Department name is required.');
    setEditLoading(true);
    try {
      const res = await fetch(`${API}/departments/${editTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.success) {
        showAlert('success', `Department updated successfully.`);
        setEditTarget(null);
        fetchDepartments();
      } else {
        showAlert('error', data.error || 'Failed to update department.');
      }
    } catch {
      showAlert('error', 'Could not connect to the server.');
    } finally {
      setEditLoading(false);
    }
  };

  // ── Delete ──
  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      const res = await fetch(`${API}/departments/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showAlert('success', `Department "${deleteTarget.department_name}" deleted.`);
        setDeleteTarget(null);
        fetchDepartments();
      } else {
        showAlert('error', data.error || 'Failed to delete. Make sure no positions are linked to this department.');
        setDeleteTarget(null);
      }
    } catch {
      showAlert('error', 'Could not connect to the server.');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div>
      <Alert type={alert.type} message={alert.message} onClose={() => setAlert({ type: '', message: '' })} />

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={styles.toolbar}>
          <div style={styles.searchWrapper}>
            <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search departments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={styles.searchInput}
            />
          </div>
          <button onClick={openAdd} style={styles.primaryBtn} className="glow-primary">
            + Add Department
          </button>
        </div>

        {/* Table */}
        {loading ? <Spinner /> : filtered.length === 0 ? (
          <EmptyState message={search ? 'No departments match your search.' : 'No departments yet. Add one to get started.'} />
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.theadRow}>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>Department Name</th>
                  <th style={styles.th}>Description</th>
                  <th style={styles.th}>Date Added</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((dept, idx) => (
                  <tr key={dept.id} style={styles.tbodyRow}>
                    <td style={{ ...styles.td, color: 'var(--color-text-muted)', width: 40 }}>{idx + 1}</td>
                    <td style={{ ...styles.td, fontWeight: '700', color: 'var(--color-text-primary)' }}>
                      <div style={styles.deptNameCell}>
                        <span style={styles.deptDot}></span>
                        {dept.department_name}
                      </div>
                    </td>
                    <td style={{ ...styles.td, color: 'var(--color-text-secondary)' }}>
                      {dept.description || <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No description</span>}
                    </td>
                    <td style={{ ...styles.td, color: 'var(--color-text-muted)', fontSize: 12 }}>
                      {dept.created_at ? new Date(dept.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      <div style={styles.actionGroup}>
                        <button onClick={() => openEdit(dept)} style={styles.editBtn}>Edit</button>
                        <button onClick={() => setDeleteTarget(dept)} style={styles.deleteBtn}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer count */}
        {!loading && departments.length > 0 && (
          <div style={styles.tableFooter}>
            Showing {filtered.length} of {departments.length} department{departments.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <Modal
          title="Add New Department"
          onClose={() => setShowAddModal(false)}
          onConfirm={handleAdd}
          confirmLabel={addLoading ? 'Saving...' : 'Save Department'}
        >
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Department Name <span style={styles.required}>*</span></label>
            <input
              type="text"
              placeholder="e.g. Electrical Division"
              value={addForm.department_name}
              onChange={(e) => setAddForm(f => ({ ...f, department_name: e.target.value }))}
              style={styles.textInput}
              autoFocus
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Description <span style={styles.optional}>(optional)</span></label>
            <textarea
              placeholder="Brief description of this department..."
              value={addForm.description}
              onChange={(e) => setAddForm(f => ({ ...f, description: e.target.value }))}
              style={styles.textarea}
              rows={3}
            />
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {editTarget && (
        <Modal
          title="Edit Department"
          onClose={() => setEditTarget(null)}
          onConfirm={handleEdit}
          confirmLabel={editLoading ? 'Saving...' : 'Save Changes'}
        >
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Department Name <span style={styles.required}>*</span></label>
            <input
              type="text"
              value={editForm.department_name}
              onChange={(e) => setEditForm(f => ({ ...f, department_name: e.target.value }))}
              style={styles.textInput}
              autoFocus
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Description <span style={styles.optional}>(optional)</span></label>
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
              style={styles.textarea}
              rows={3}
            />
          </div>
        </Modal>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <Modal
          title="Delete Department"
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          confirmLabel={deleteLoading ? 'Deleting...' : 'Yes, Delete'}
          confirmDanger
        >
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            Are you sure you want to delete <strong style={{ color: 'var(--color-text-primary)' }}>{deleteTarget.department_name}</strong>?
          </p>
          <div style={styles.warningNote}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, flexShrink: 0 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            This will fail if any positions are still linked to this department.
          </div>
        </Modal>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// POSITIONS SUB-TAB
// ══════════════════════════════════════════════════════════════════════════════
function PositionsSubTab() {
  const [positions, setPositions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [alert, setAlert] = useState({ type: '', message: '' });

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ position_name: '', department_id: '', description: '' });
  const [addLoading, setAddLoading] = useState(false);

  // Edit modal
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ position_name: '', department_id: '', description: '' });
  const [editLoading, setEditLoading] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert({ type: '', message: '' }), 4000);
  };

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [posRes, deptRes] = await Promise.all([
        fetch(`${API}/positions`),
        fetch(`${API}/departments`),
      ]);
      const posData = await posRes.json();
      const deptData = await deptRes.json();
      if (posData.success) setPositions(posData.data);
      if (deptData.success) setDepartments(deptData.data);
    } catch {
      showAlert('error', 'Could not connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const getDeptName = (id) => departments.find(d => d.id === id)?.department_name || '—';

  const filtered = positions.filter(p => {
    const matchSearch =
      p.position_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(search.toLowerCase());
    const matchDept = filterDept ? String(p.department_id) === String(filterDept) : true;
    return matchSearch && matchDept;
  });

  // ── Add ──
  const openAdd = () => {
    setAddForm({ position_name: '', department_id: departments[0]?.id || '', description: '' });
    setShowAddModal(true);
  };
  const handleAdd = async () => {
    if (!addForm.position_name.trim()) return showAlert('error', 'Position name is required.');
    if (!addForm.department_id) return showAlert('error', 'Please select a department.');
    setAddLoading(true);
    try {
      const res = await fetch(`${API}/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (data.success) {
        showAlert('success', `Position "${addForm.position_name}" added successfully.`);
        setShowAddModal(false);
        fetchAll();
      } else {
        showAlert('error', data.error || 'Failed to add position.');
      }
    } catch {
      showAlert('error', 'Could not connect to the server.');
    } finally {
      setAddLoading(false);
    }
  };

  // ── Edit ──
  const openEdit = (pos) => {
    setEditTarget(pos);
    setEditForm({ position_name: pos.position_name, department_id: pos.department_id, description: pos.description || '' });
  };
  const handleEdit = async () => {
    if (!editForm.position_name.trim()) return showAlert('error', 'Position name is required.');
    setEditLoading(true);
    try {
      const res = await fetch(`${API}/positions/${editTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.success) {
        showAlert('success', 'Position updated successfully.');
        setEditTarget(null);
        fetchAll();
      } else {
        showAlert('error', data.error || 'Failed to update position.');
      }
    } catch {
      showAlert('error', 'Could not connect to the server.');
    } finally {
      setEditLoading(false);
    }
  };

  // ── Delete ──
  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      const res = await fetch(`${API}/positions/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showAlert('success', `Position "${deleteTarget.position_name}" deleted.`);
        setDeleteTarget(null);
        fetchAll();
      } else {
        showAlert('error', data.error || 'Failed to delete. Employees may still be assigned to this position.');
        setDeleteTarget(null);
      }
    } catch {
      showAlert('error', 'Could not connect to the server.');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div>
      <Alert type={alert.type} message={alert.message} onClose={() => setAlert({ type: '', message: '' })} />

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={styles.toolbar}>
          <div style={{ display: 'flex', gap: 12, flex: 1, flexWrap: 'wrap' }}>
            <div style={{ ...styles.searchWrapper, flex: 1, maxWidth: 340 }}>
              <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Search positions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={styles.searchInput}
              />
            </div>
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.department_name}</option>
              ))}
            </select>
          </div>
          <button onClick={openAdd} style={styles.primaryBtn} className="glow-primary">
            + Add Position
          </button>
        </div>

        {/* Table */}
        {loading ? <Spinner /> : filtered.length === 0 ? (
          <EmptyState message={search || filterDept ? 'No positions match your filters.' : 'No positions yet. Add one to get started.'} />
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.theadRow}>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>Position Title</th>
                  <th style={styles.th}>Department</th>
                  <th style={styles.th}>Description</th>
                  <th style={styles.th}>Date Added</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((pos, idx) => (
                  <tr key={pos.id} style={styles.tbodyRow}>
                    <td style={{ ...styles.td, color: 'var(--color-text-muted)', width: 40 }}>{idx + 1}</td>
                    <td style={{ ...styles.td, fontWeight: '700', color: 'var(--color-text-primary)' }}>{pos.position_name}</td>
                    <td style={styles.td}>
                      <span style={styles.deptBadge}>{getDeptName(pos.department_id)}</span>
                    </td>
                    <td style={{ ...styles.td, color: 'var(--color-text-secondary)' }}>
                      {pos.description || <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No description</span>}
                    </td>
                    <td style={{ ...styles.td, color: 'var(--color-text-muted)', fontSize: 12 }}>
                      {pos.created_at ? new Date(pos.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      <div style={styles.actionGroup}>
                        <button onClick={() => openEdit(pos)} style={styles.editBtn}>Edit</button>
                        <button onClick={() => setDeleteTarget(pos)} style={styles.deleteBtn}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer count */}
        {!loading && positions.length > 0 && (
          <div style={styles.tableFooter}>
            Showing {filtered.length} of {positions.length} position{positions.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <Modal
          title="Add New Position"
          onClose={() => setShowAddModal(false)}
          onConfirm={handleAdd}
          confirmLabel={addLoading ? 'Saving...' : 'Save Position'}
        >
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Position Title <span style={styles.required}>*</span></label>
            <input
              type="text"
              placeholder="e.g. Electrical Engineer"
              value={addForm.position_name}
              onChange={(e) => setAddForm(f => ({ ...f, position_name: e.target.value }))}
              style={styles.textInput}
              autoFocus
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Department <span style={styles.required}>*</span></label>
            <select
              value={addForm.department_id}
              onChange={(e) => setAddForm(f => ({ ...f, department_id: e.target.value }))}
              style={styles.textInput}
            >
              <option value="">Select a department</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.department_name}</option>
              ))}
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Description <span style={styles.optional}>(optional)</span></label>
            <textarea
              placeholder="Brief description of this position..."
              value={addForm.description}
              onChange={(e) => setAddForm(f => ({ ...f, description: e.target.value }))}
              style={styles.textarea}
              rows={3}
            />
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {editTarget && (
        <Modal
          title="Edit Position"
          onClose={() => setEditTarget(null)}
          onConfirm={handleEdit}
          confirmLabel={editLoading ? 'Saving...' : 'Save Changes'}
        >
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Position Title <span style={styles.required}>*</span></label>
            <input
              type="text"
              value={editForm.position_name}
              onChange={(e) => setEditForm(f => ({ ...f, position_name: e.target.value }))}
              style={styles.textInput}
              autoFocus
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Department <span style={styles.required}>*</span></label>
            <select
              value={editForm.department_id}
              onChange={(e) => setEditForm(f => ({ ...f, department_id: e.target.value }))}
              style={styles.textInput}
            >
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.department_name}</option>
              ))}
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Description <span style={styles.optional}>(optional)</span></label>
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
              style={styles.textarea}
              rows={3}
            />
          </div>
        </Modal>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <Modal
          title="Delete Position"
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          confirmLabel={deleteLoading ? 'Deleting...' : 'Yes, Delete'}
          confirmDanger
        >
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            Are you sure you want to delete <strong style={{ color: 'var(--color-text-primary)' }}>{deleteTarget.position_name}</strong>?
          </p>
          <div style={styles.warningNote}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, flexShrink: 0 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            This will fail if employees are still assigned to this position.
          </div>
        </Modal>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════════════
export default function DepartmentsTab() {
  const [activeSubTab, setActiveSubTab] = useState('departments');

  return (
    <div>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Departments & Positions</h1>
        <p style={styles.subtitle}>Manage company departments and the job positions assigned under each one.</p>
      </div>

      {/* Sub-tabs */}
      <div style={styles.subTabsContainer}>
        <button
          onClick={() => setActiveSubTab('departments')}
          style={{
            ...styles.subTabBtn,
            borderBottomColor: activeSubTab === 'departments' ? 'var(--color-primary)' : 'transparent',
            color: activeSubTab === 'departments' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'departments' ? '700' : '500',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
            <rect x="2" y="7" width="20" height="14" rx="2"></rect>
            <path d="M16 7V5a2 2 0 0 0-4 0v2"></path>
          </svg>
          Departments
        </button>
        <button
          onClick={() => setActiveSubTab('positions')}
          style={{
            ...styles.subTabBtn,
            borderBottomColor: activeSubTab === 'positions' ? 'var(--color-primary)' : 'transparent',
            color: activeSubTab === 'positions' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'positions' ? '700' : '500',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          Positions
        </button>
      </div>

      {/* Content */}
      {activeSubTab === 'departments' ? <DepartmentsSubTab /> : <PositionsSubTab />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════════════
const styles = {
  header: { marginBottom: 28 },
  title: {
    fontSize: 28,
    fontWeight: 800,
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.75px',
    marginBottom: 4,
  },
  subtitle: { fontSize: 15, color: 'var(--color-text-secondary)' },

  subTabsContainer: {
    display: 'flex',
    gap: 24,
    borderBottom: '1px solid var(--color-border)',
    marginBottom: 28,
  },
  subTabBtn: {
    display: 'flex',
    alignItems: 'center',
    background: 'transparent',
    border: 'none',
    borderBottom: '3px solid transparent',
    padding: '12px 4px',
    fontSize: 15,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  // Toolbar
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    padding: '20px 24px',
    borderBottom: '1px solid var(--color-border)',
    flexWrap: 'wrap',
  },
  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    maxWidth: 400,
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    color: 'var(--color-text-muted)',
  },
  searchInput: {
    width: '100%',
    padding: '10px 12px 10px 36px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: 14,
    outline: 'none',
  },
  filterSelect: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: 14,
    outline: 'none',
    minWidth: 180,
  },

  // Table
  tableWrapper: { width: '100%', overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  theadRow: { borderBottom: '2px solid var(--color-border)' },
  th: {
    padding: '14px 20px',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-text-secondary)',
  },
  tbodyRow: {
    borderBottom: '1px solid var(--color-border)',
    transition: 'background-color 0.15s',
  },
  td: { padding: '14px 20px', fontSize: 14, color: 'var(--color-text-secondary)' },
  tableFooter: {
    padding: '12px 24px',
    fontSize: 12,
    color: 'var(--color-text-muted)',
    borderTop: '1px solid var(--color-border)',
    textAlign: 'right',
  },

  // Badges & Indicators
  deptNameCell: { display: 'flex', alignItems: 'center', gap: 10 },
  deptDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: 'var(--color-primary)',
    flexShrink: 0,
  },
  deptBadge: {
    display: 'inline-block',
    backgroundColor: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    fontSize: 11,
    fontWeight: 700,
    padding: '3px 10px',
    borderRadius: 4,
  },

  // Action buttons
  actionGroup: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
  editBtn: {
    backgroundColor: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    border: '1px solid var(--color-primary)',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  deleteBtn: {
    backgroundColor: 'transparent',
    color: 'var(--color-danger, #ef4444)',
    border: '1px solid var(--color-danger, #ef4444)',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  // Primary & Danger buttons
  primaryBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: 'var(--radius-md)',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.2s',
  },
  cancelBtn: {
    backgroundColor: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
    padding: '10px 20px',
    borderRadius: 'var(--radius-md)',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  dangerBtn: {
    backgroundColor: 'var(--color-danger, #ef4444)',
    color: '#ffffff',
  },

  // Modal
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 16,
  },
  modalBox: {
    width: '100%',
    maxWidth: 480,
    padding: 0,
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid var(--color-border)',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  modalCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    fontSize: 18,
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0 4px',
  },
  modalBody: { padding: '24px' },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    padding: '16px 24px',
    borderTop: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-bg-root)',
  },

  // Form
  formGroup: { marginBottom: 18 },
  formLabel: {
    display: 'block',
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    marginBottom: 6,
  },
  required: { color: 'var(--color-danger, #ef4444)', marginLeft: 2 },
  optional: { color: 'var(--color-text-muted)', fontWeight: 400, fontSize: 11 },
  textInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 6,
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 6,
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: 14,
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },

  // Alert
  alert: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 16px',
    borderRadius: 'var(--radius-md)',
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 20,
  },
  alertClose: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'inherit',
    fontSize: 14,
    marginLeft: 8,
    opacity: 0.7,
  },

  // Warning note
  warningNote: {
    display: 'flex',
    alignItems: 'flex-start',
    backgroundColor: '#fffbeb',
    border: '1px solid #fcd34d',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 12,
    color: '#92400e',
    marginTop: 12,
    lineHeight: 1.5,
  },

  // Empty & Loading
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 24px',
    textAlign: 'center',
  },
  spinnerWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 24px',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid var(--color-border)',
    borderTopColor: 'var(--color-primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};