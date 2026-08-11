import React, { useState } from 'react';
import Swal from 'sweetalert2';

export default function BranchesOfficersTab() {
  const [activeTab, setActiveTab] = useState('branches');
  const [branches, setBranches] = useState([
    { id: 1, name: 'Manila Branch', address: '123 Makati Ave, Makati City', manager: 'Juan Dela Cruz', phone: '+63 912 345 6789', email: 'manila@wea.com', status: 'Active' },
    { id: 2, name: 'Cebu Branch', address: '456 Osmeña Blvd, Cebu City', manager: 'Maria Santos', phone: '+63 923 456 7890', email: 'cebu@wea.com', status: 'Active' },
  ]);
  
  const [officers, setOfficers] = useState([
    { id: 1, name: 'Juan Dela Cruz', position: 'Branch Manager', branch: 'Manila Branch', email: 'juan@wea.com', phone: '+63 912 345 6789', status: 'Active' },
    { id: 2, name: 'Maria Santos', position: 'Branch Manager', branch: 'Cebu Branch', email: 'maria@wea.com', phone: '+63 923 456 7890', status: 'Active' },
  ]);

  const [branchForm, setBranchForm] = useState({
    name: '',
    address: '',
    manager: '',
    phone: '',
    email: '',
    status: 'Active',
  });

  const [officerForm, setOfficerForm] = useState({
    name: '',
    position: '',
    branch: '',
    email: '',
    phone: '',
    status: 'Active',
  });

  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showOfficerModal, setShowOfficerModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [editingOfficer, setEditingOfficer] = useState(null);

  const handleBranchSubmit = (e) => {
    e.preventDefault();
    if (editingBranch) {
      setBranches(branches.map(b => b.id === editingBranch.id ? { ...branchForm, id: editingBranch.id } : b));
      Swal.fire({ title: 'Success!', text: 'Branch updated successfully.', icon: 'success', confirmButtonColor: 'var(--color-primary)', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)' });
    } else {
      setBranches([...branches, { ...branchForm, id: Date.now() }]);
      Swal.fire({ title: 'Success!', text: 'Branch created successfully.', icon: 'success', confirmButtonColor: 'var(--color-primary)', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)' });
    }
    setShowBranchModal(false);
    setBranchForm({ name: '', address: '', manager: '', phone: '', email: '', status: 'Active' });
    setEditingBranch(null);
  };

  const handleOfficerSubmit = (e) => {
    e.preventDefault();
    if (editingOfficer) {
      setOfficers(officers.map(o => o.id === editingOfficer.id ? { ...officerForm, id: editingOfficer.id } : o));
      Swal.fire({ title: 'Success!', text: 'Officer updated successfully.', icon: 'success', confirmButtonColor: 'var(--color-primary)', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)' });
    } else {
      setOfficers([...officers, { ...officerForm, id: Date.now() }]);
      Swal.fire({ title: 'Success!', text: 'Officer created successfully.', icon: 'success', confirmButtonColor: 'var(--color-primary)', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)' });
    }
    setShowOfficerModal(false);
    setOfficerForm({ name: '', position: '', branch: '', email: '', phone: '', status: 'Active' });
    setEditingOfficer(null);
  };

  const handleDeleteBranch = (id) => {
    Swal.fire({
      title: 'Are you sure?',
      text: 'This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'var(--color-danger)',
      cancelButtonColor: 'var(--color-text-muted)',
      confirmButtonText: 'Yes, delete it!',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
    }).then((result) => {
      if (result.isConfirmed) {
        setBranches(branches.filter(b => b.id !== id));
        Swal.fire({ title: 'Deleted!', text: 'Branch has been deleted.', icon: 'success', confirmButtonColor: 'var(--color-primary)', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)' });
      }
    });
  };

  const handleDeleteOfficer = (id) => {
    Swal.fire({
      title: 'Are you sure?',
      text: 'This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'var(--color-danger)',
      cancelButtonColor: 'var(--color-text-muted)',
      confirmButtonText: 'Yes, delete it!',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
    }).then((result) => {
      if (result.isConfirmed) {
        setOfficers(officers.filter(o => o.id !== id));
        Swal.fire({ title: 'Deleted!', text: 'Officer has been deleted.', icon: 'success', confirmButtonColor: 'var(--color-primary)', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)' });
      }
    });
  };

  const openBranchModal = (branch = null) => {
    if (branch) {
      setEditingBranch(branch);
      setBranchForm(branch);
    } else {
      setEditingBranch(null);
      setBranchForm({ name: '', address: '', manager: '', phone: '', email: '', status: 'Active' });
    }
    setShowBranchModal(true);
  };

  const openOfficerModal = (officer = null) => {
    if (officer) {
      setEditingOfficer(officer);
      setOfficerForm(officer);
    } else {
      setEditingOfficer(null);
      setOfficerForm({ name: '', position: '', branch: '', email: '', phone: '', status: 'Active' });
    }
    setShowOfficerModal(true);
  };

  const styles = {
    container: { padding: '24px' },
    header: { marginBottom: '32px' },
    title: { fontSize: '28px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' },
    subtitle: { fontSize: '15px', color: 'var(--color-text-secondary)' },
    tabs: { display: 'flex', gap: '8px', marginBottom: '24px' },
    tab: { padding: '12px 24px', borderRadius: '8px', border: 'none', background: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
    tabActive: { background: 'var(--color-primary)', color: 'white' },
    card: { padding: '24px', marginBottom: '24px' },
    toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    button: { padding: '12px 24px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontWeight: '600', fontSize: '13px' },
    td: { padding: '12px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: '14px' },
    statusBadge: { padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' },
    statusActive: { background: 'var(--color-success-light)', color: 'var(--color-success)' },
    statusInactive: { background: 'var(--color-danger-light)', color: 'var(--color-danger)' },
    actionBtn: { padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', marginRight: '4px' },
    editBtn: { background: 'var(--color-primary-light)', color: 'var(--color-primary)' },
    deleteBtn: { background: 'var(--color-danger-light)', color: 'var(--color-danger)' },
    modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modal: { width: '100%', maxWidth: '600px', padding: '28px' },
    modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' },
    modalTitle: { fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)' },
    closeBtn: { background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--color-text-muted)' },
    form: { display: 'flex', flexDirection: 'column', gap: '16px' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
    label: { fontSize: '14px', fontWeight: '600', color: 'var(--color-text-secondary)' },
    input: { padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-bg-root)', color: 'var(--color-text-primary)', fontSize: '14px', outline: 'none' },
    select: { padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-bg-root)', color: 'var(--color-text-primary)', fontSize: '14px', outline: 'none' },
    modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' },
    cancelBtn: { padding: '12px 24px', backgroundColor: 'var(--color-bg-card-hover)', color: 'var(--color-text-primary)', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
    submitBtn: { padding: '12px 24px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Branches & Officers</h1>
        <p style={styles.subtitle}>Manage company branches and officers</p>
      </div>

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(activeTab === 'branches' ? styles.tabActive : {}) }} onClick={() => setActiveTab('branches')}>
          Branches
        </button>
        <button style={{ ...styles.tab, ...(activeTab === 'officers' ? styles.tabActive : {}) }} onClick={() => setActiveTab('officers')}>
          Officers
        </button>
      </div>

      {activeTab === 'branches' && (
        <div className="glass-card" style={styles.card}>
          <div style={styles.toolbar}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--color-text-primary)' }}>Branches ({branches.length})</h3>
            <button style={styles.button} onClick={() => openBranchModal()}>+ Add Branch</button>
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Address</th>
                <th style={styles.th}>Manager</th>
                <th style={styles.th}>Phone</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((branch) => (
                <tr key={branch.id}>
                  <td style={styles.td}>{branch.name}</td>
                  <td style={styles.td}>{branch.address}</td>
                  <td style={styles.td}>{branch.manager}</td>
                  <td style={styles.td}>{branch.phone}</td>
                  <td style={styles.td}>{branch.email}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.statusBadge, ...(branch.status === 'Active' ? styles.statusActive : styles.statusInactive) }}>
                      {branch.status}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <button style={{ ...styles.actionBtn, ...styles.editBtn }} onClick={() => openBranchModal(branch)}>Edit</button>
                    <button style={{ ...styles.actionBtn, ...styles.deleteBtn }} onClick={() => handleDeleteBranch(branch.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'officers' && (
        <div className="glass-card" style={styles.card}>
          <div style={styles.toolbar}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--color-text-primary)' }}>Officers ({officers.length})</h3>
            <button style={styles.button} onClick={() => openOfficerModal()}>+ Add Officer</button>
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Position</th>
                <th style={styles.th}>Branch</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Phone</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {officers.map((officer) => (
                <tr key={officer.id}>
                  <td style={styles.td}>{officer.name}</td>
                  <td style={styles.td}>{officer.position}</td>
                  <td style={styles.td}>{officer.branch}</td>
                  <td style={styles.td}>{officer.email}</td>
                  <td style={styles.td}>{officer.phone}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.statusBadge, ...(officer.status === 'Active' ? styles.statusActive : styles.statusInactive) }}>
                      {officer.status}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <button style={{ ...styles.actionBtn, ...styles.editBtn }} onClick={() => openOfficerModal(officer)}>Edit</button>
                    <button style={{ ...styles.actionBtn, ...styles.deleteBtn }} onClick={() => handleDeleteOfficer(officer.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Branch Modal */}
      {showBranchModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>{editingBranch ? 'Edit Branch' : 'Add Branch'}</h3>
              <button onClick={() => setShowBranchModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <form onSubmit={handleBranchSubmit} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Branch Name *</label>
                <input type="text" required style={styles.input} value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Address *</label>
                <input type="text" required style={styles.input} value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Manager *</label>
                <input type="text" required style={styles.input} value={branchForm.manager} onChange={(e) => setBranchForm({ ...branchForm, manager: e.target.value })} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Phone *</label>
                <input type="text" required style={styles.input} value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Email *</label>
                <input type="email" required style={styles.input} value={branchForm.email} onChange={(e) => setBranchForm({ ...branchForm, email: e.target.value })} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Status *</label>
                <select required style={styles.select} value={branchForm.status} onChange={(e) => setBranchForm({ ...branchForm, status: e.target.value })}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div style={styles.modalFooter}>
                <button type="button" onClick={() => setShowBranchModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.submitBtn}>{editingBranch ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Officer Modal */}
      {showOfficerModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>{editingOfficer ? 'Edit Officer' : 'Add Officer'}</h3>
              <button onClick={() => setShowOfficerModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <form onSubmit={handleOfficerSubmit} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Name *</label>
                <input type="text" required style={styles.input} value={officerForm.name} onChange={(e) => setOfficerForm({ ...officerForm, name: e.target.value })} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Position *</label>
                <input type="text" required style={styles.input} value={officerForm.position} onChange={(e) => setOfficerForm({ ...officerForm, position: e.target.value })} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Branch *</label>
                <select required style={styles.select} value={officerForm.branch} onChange={(e) => setOfficerForm({ ...officerForm, branch: e.target.value })}>
                  <option value="">Select Branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Email *</label>
                <input type="email" required style={styles.input} value={officerForm.email} onChange={(e) => setOfficerForm({ ...officerForm, email: e.target.value })} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Phone *</label>
                <input type="text" required style={styles.input} value={officerForm.phone} onChange={(e) => setOfficerForm({ ...officerForm, phone: e.target.value })} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Status *</label>
                <select required style={styles.select} value={officerForm.status} onChange={(e) => setOfficerForm({ ...officerForm, status: e.target.value })}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div style={styles.modalFooter}>
                <button type="button" onClick={() => setShowOfficerModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.submitBtn}>{editingOfficer ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
