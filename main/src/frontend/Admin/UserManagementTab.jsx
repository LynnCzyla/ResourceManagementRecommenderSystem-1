import React, { useState } from 'react';

export default function UserManagementTab({ activeSubTab: initialSubTab }) {
  const [subTab, setSubTab] = useState(initialSubTab || 'accounts');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  const [formData, setFormData] = useState({ name: '', email: '', role: 'Employee', password: '' });

  const [users, setUsers] = useState([
    { id: 1, name: 'Rodolfo Mirabel Jr.', email: 'admin@wea.com', role: 'Admin', status: 'Active', created: '2026-01-10' },
    { id: 2, name: 'Romell J. Ebuen', email: 'romell.ebuen@wea.com', role: 'Resource Manager', status: 'Active', created: '2026-02-15' },
    { id: 3, name: 'Lynn Czyla M. Alpuerto', email: 'lynn.alpuerto@wea.com', role: 'Project Manager', status: 'Active', created: '2026-03-01' },
    { id: 4, name: 'Vincent Miguel P. Soriano', email: 'miguel.soriano@wea.com', role: 'Employee', status: 'Active', created: '2026-03-05' },
    { id: 5, name: 'Engr. Juan Dela Cruz', email: 'juan.cruz@wea.com', role: 'Employee', status: 'Deactivated', created: '2026-04-12' },
  ]);

  const [permissions, setPermissions] = useState({
    'Admin': { readOCR: true, runOCR: true, assignResource: true, editSettings: true, viewAudit: true, exportReports: true },
    'Resource Manager': { readOCR: true, runOCR: true, assignResource: true, editSettings: false, viewAudit: true, exportReports: true },
    'Project Manager': { readOCR: true, runOCR: false, assignResource: false, editSettings: false, viewAudit: false, exportReports: true },
    'Employee': { readOCR: false, runOCR: false, assignResource: false, editSettings: false, viewAudit: false, exportReports: false }
  });

  const handlePermissionChange = (role, permissionKey) => {
    setPermissions(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [permissionKey]: !prev[role][permissionKey]
      }
    }));
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    const newUser = {
      id: Date.now(),
      name: formData.name,
      email: formData.email,
      role: formData.role,
      status: 'Active',
      created: new Date().toISOString().split('T')[0]
    };

    setUsers([...users, newUser]);
    setShowCreateModal(false);
    resetForm();
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    setUsers(users.map(u => u.id === selectedUser.id ? { ...u, name: formData.name, email: formData.email, role: formData.role } : u));
    setShowEditModal(false);
    resetForm();
  };

  const toggleUserStatus = (userId) => {
    setUsers(users.map(u => {
      if (u.id === userId) {
        const newStatus = u.status === 'Active' ? 'Deactivated' : 'Active';
        return { ...u, status: newStatus };
      }
      return u;
    }));
  };

  const openEditModal = (user) => {
    setSelectedUser(user);
    setFormData({ name: user.name, email: user.email, role: user.role, password: '' });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({ name: '', email: '', role: 'Employee', password: '' });
    setSelectedUser(null);
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>User Management</h1>
        <p style={styles.subtitle}>Configure user accounts, roles permissions, and credentials.</p>
      </div>

      <div style={styles.subTabsContainer}>
        <button 
          onClick={() => setSubTab('accounts')} 
          style={{
            ...styles.subTabButton,
            borderBottomColor: subTab === 'accounts' ? 'var(--color-primary)' : 'transparent',
            color: subTab === 'accounts' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: subTab === 'accounts' ? '700' : '500'
          }}
        >
          User Accounts
        </button>
        <button 
          onClick={() => setSubTab('roles')} 
          style={{
            ...styles.subTabButton,
            borderBottomColor: subTab === 'roles' ? 'var(--color-primary)' : 'transparent',
            color: subTab === 'roles' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: subTab === 'roles' ? '700' : '500'
          }}
        >
          User Roles
        </button>
      </div>

      {subTab === 'accounts' && (
        <div className="glass-card">
          <div style={styles.tableToolbar}>
            <div style={styles.searchWrapper}>
              <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Search accounts by name, role or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.searchInput}
              />
            </div>
            <button onClick={() => { resetForm(); setShowCreateModal(true); }} style={styles.createBtn}>
              + Create User Account
            </button>
          </div>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeaderRow}>
                  <th style={styles.th}>Full Name</th>
                  <th style={styles.th}>Email Address</th>
                  <th style={styles.th}>System Role</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Created Date</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={styles.emptyRow}>No user accounts found.</td>
                  </tr>
                ) : (
                  filteredUsers.map(u => (
                    <tr key={u.id} style={styles.tableBodyRow}>
                      <td style={{ ...styles.td, fontWeight: '600', color: 'var(--color-text-primary)' }}>{u.name}</td>
                      <td style={styles.td}>{u.email}</td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.roleBadge,
                          backgroundColor: u.role === 'Admin' ? 'rgba(239, 68, 68, 0.1)' : u.role === 'Resource Manager' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(2, 132, 199, 0.1)',
                          color: u.role === 'Admin' ? 'var(--color-danger)' : u.role === 'Resource Manager' ? 'var(--color-primary)' : 'var(--color-accent)'
                        }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.statusBadge,
                          backgroundColor: u.status === 'Active' ? 'var(--color-primary-light)' : 'var(--color-danger-light)',
                          color: u.status === 'Active' ? 'var(--color-success)' : 'var(--color-danger)'
                        }}>
                          {u.status}
                        </span>
                      </td>
                      <td style={styles.td}>{u.created}</td>
                      <td style={styles.td}>
                        <div style={styles.actionCell}>
                          <button onClick={() => openEditModal(u)} style={styles.editIconBtn} title="Edit User">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </button>
                          <button 
                            onClick={() => toggleUserStatus(u.id)} 
                            style={{
                              ...styles.statusToggleBtn,
                              color: u.status === 'Active' ? 'var(--color-danger)' : 'var(--color-success)',
                              background: u.status === 'Active' ? 'var(--color-danger-light)' : 'var(--color-primary-light)'
                            }}
                            title={u.status === 'Active' ? 'Deactivate account' : 'Activate account'}
                          >
                            {u.status === 'Active' ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'roles' && (
        <div className="glass-card" style={styles.rolesContainer}>
          <h2 style={styles.tabSectionTitle}>Role Permissions Mapping Matrix</h2>
          <p style={styles.tabSectionSubtitle}>Assign functional privileges across the system categories.</p>

          <div style={styles.matrixWrapper}>
            {Object.keys(permissions).map(role => (
              <div key={role} style={styles.roleColumn} className="glass-card">
                <h3 style={{
                  ...styles.roleTitle,
                  color: role === 'Admin' ? 'var(--color-danger)' : role === 'Resource Manager' ? 'var(--color-primary)' : 'var(--color-text-primary)'
                }}>{role} Role</h3>
                
                <div style={styles.permissionList}>
                  <div style={styles.permissionItem}>
                    <label style={styles.checkboxLabel}>
                      <input 
                        type="checkbox" 
                        checked={permissions[role].readOCR} 
                        onChange={() => handlePermissionChange(role, 'readOCR')}
                        style={styles.checkbox}
                        disabled={role === 'Admin'}
                      />
                      Read Resumes & CVs
                    </label>
                  </div>

                  <div style={styles.permissionItem}>
                    <label style={styles.checkboxLabel}>
                      <input 
                        type="checkbox" 
                        checked={permissions[role].runOCR} 
                        onChange={() => handlePermissionChange(role, 'runOCR')}
                        style={styles.checkbox}
                        disabled={role === 'Admin'}
                      />
                      Execute OCR Scanning
                    </label>
                  </div>

                  <div style={styles.permissionItem}>
                    <label style={styles.checkboxLabel}>
                      <input 
                        type="checkbox" 
                        checked={permissions[role].assignResource} 
                        onChange={() => handlePermissionChange(role, 'assignResource')}
                        style={styles.checkbox}
                        disabled={role === 'Admin'}
                      />
                      Assign Resources to Projects
                    </label>
                  </div>

                  <div style={styles.permissionItem}>
                    <label style={styles.checkboxLabel}>
                      <input 
                        type="checkbox" 
                        checked={permissions[role].editSettings} 
                        onChange={() => handlePermissionChange(role, 'editSettings')}
                        style={styles.checkbox}
                        disabled={role === 'Admin'}
                      />
                      Manage System Configurations
                    </label>
                  </div>

                  <div style={styles.permissionItem}>
                    <label style={styles.checkboxLabel}>
                      <input 
                        type="checkbox" 
                        checked={permissions[role].viewAudit} 
                        onChange={() => handlePermissionChange(role, 'viewAudit')}
                        style={styles.checkbox}
                        disabled={role === 'Admin'}
                      />
                      View Audit & Activity Logs
                    </label>
                  </div>

                  <div style={styles.permissionItem}>
                    <label style={styles.checkboxLabel}>
                      <input 
                        type="checkbox" 
                        checked={permissions[role].exportReports} 
                        onChange={() => handlePermissionChange(role, 'exportReports')}
                        style={styles.checkbox}
                        disabled={role === 'Admin'}
                      />
                      Generate & Export Reports
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCreateModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Create User Account</h2>
              <button onClick={() => setShowCreateModal(false)} style={styles.closeModalBtn}>&times;</button>
            </div>
            <form onSubmit={handleCreateSubmit} style={{ marginTop: 16 }}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Full Name</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                  style={styles.modalInput} 
                  placeholder="Romell J. Ebuen"
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Email Address</label>
                <input 
                  type="email" 
                  value={formData.email} 
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })} 
                  style={styles.modalInput} 
                  placeholder="romell.ebuen@wea.com"
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Assign Role</label>
                <select 
                  value={formData.role} 
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })} 
                  style={styles.modalSelect}
                >
                  <option value="Admin">Admin</option>
                  <option value="Resource Manager">Resource Manager</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Employee">Employee</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Initial Password</label>
                <input 
                  type="password" 
                  value={formData.password} 
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })} 
                  style={styles.modalInput} 
                  placeholder="••••••••"
                  required
                />
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowCreateModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.saveBtn}>Create Account</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Edit User Account</h2>
              <button onClick={() => setShowEditModal(false)} style={styles.closeModalBtn}>&times;</button>
            </div>
            <form onSubmit={handleEditSubmit} style={{ marginTop: 16 }}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Full Name</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                  style={styles.modalInput} 
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Email Address</label>
                <input 
                  type="email" 
                  value={formData.email} 
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })} 
                  style={styles.modalInput} 
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>System Role</label>
                <select 
                  value={formData.role} 
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })} 
                  style={styles.modalSelect}
                >
                  <option value="Admin">Admin</option>
                  <option value="Resource Manager">Resource Manager</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Employee">Employee</option>
                </select>
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowEditModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.saveBtn}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
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
  subTabsContainer: {
    display: 'flex',
    gap: '24px',
    borderBottom: '1px solid var(--color-border)',
    marginBottom: '28px',
  },
  subTabButton: {
    background: 'transparent',
    border: 'none',
    borderBottom: '3px solid transparent',
    padding: '12px 4px',
    fontSize: '15px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tableToolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    maxWidth: '480px',
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
    '&:focus': {
      borderColor: 'var(--color-primary)',
    }
  },
  createBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '10px 18px',
    borderRadius: 'var(--radius-md)',
    fontWeight: '700',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    '&:hover': {
      backgroundColor: 'var(--color-primary-hover)',
    }
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
    '&:hover': {
      backgroundColor: 'var(--color-bg-card-hover)',
    }
  },
  td: {
    padding: '14px 16px',
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
  },
  emptyRow: {
    textAlign: 'center',
    padding: '40px 0',
    color: 'var(--color-text-muted)',
  },
  roleBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '4px',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '4px',
  },
  actionCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  editIconBtn: {
    background: 'var(--color-accent-light)',
    color: 'var(--color-accent)',
    border: 'none',
    width: '30px',
    height: '30px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  statusToggleBtn: {
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tabSectionTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '4px',
  },
  tabSectionSubtitle: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    marginBottom: '24px',
  },
  matrixWrapper: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '24px',
  },
  roleColumn: {
    padding: '24px',
  },
  roleTitle: {
    fontSize: '16px',
    fontWeight: '700',
    marginBottom: '16px',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '8px',
  },
  permissionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  permissionItem: {
    display: 'flex',
    alignItems: 'center',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    lineHeight: '1.4',
  },
  checkbox: {
    marginRight: '10px',
    width: '16px',
    height: '16px',
    accentColor: 'var(--color-primary)',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  modalCard: {
    width: '100%',
    maxWidth: '460px',
    padding: '28px',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '12px',
  },
  closeModalBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: 'var(--color-text-muted)',
    '&:hover': {
      color: 'var(--color-danger)',
    }
  },
  formGroup: {
    marginBottom: '16px',
    textAlign: 'left',
  },
  formLabel: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
    marginBottom: '6px',
  },
  modalInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    '&:focus': {
      borderColor: 'var(--color-primary)',
    }
  },
  modalSelect: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '24px',
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid var(--color-border)',
    padding: '10px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '700',
  }
};
