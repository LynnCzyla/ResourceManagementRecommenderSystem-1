import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

export default function UserManagementTab({ activeSubTab: initialSubTab }) {
  const [subTab, setSubTab] = useState(initialSubTab || 'accounts');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  const [formData, setFormData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    email: '',
    role: 'Employee',
  });

  const [users, setUsers] = useState([]);

  const [contactRequests, setContactRequests] = useState([
    { id: 1, email: 'john.smith@wea-external.com', message: 'Hello, I am a new hiring specialist. I need an Admin/Resource Manager account to assist with scheduling.', date: '2026-06-18' },
    { id: 2, email: 'sarah.jones@wea.com', message: 'Hi! I lost access to my Project Manager credentials. Can you reset them or grant me a new account?', date: '2026-06-17' },
    { id: 3, email: 'robert.davis@wea-partner.com', message: 'Requesting access to the dashboard to monitor system performance reports.', date: '2026-06-15' },
  ]);

  // Custom SweetAlert design configuration
  const showSuccessAlert = (message, title = 'Success!') => {
    Swal.fire({
      title: title,
      text: message,
      icon: 'success',
      confirmButtonColor: 'var(--color-primary)',
      confirmButtonText: 'OK',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
      iconColor: 'var(--color-success)',
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm'
      }
    });
  };

  const showErrorAlert = (message, title = 'Error!') => {
    Swal.fire({
      title: title,
      text: message,
      icon: 'error',
      confirmButtonColor: 'var(--color-danger)',
      confirmButtonText: 'OK',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
      iconColor: 'var(--color-danger)',
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm'
      }
    });
  };

  const showConfirmationAlert = (title, text, confirmText = 'Yes, proceed!') => {
    return Swal.fire({
      title: title,
      text: text,
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

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch('http://localhost:5000/api/users', { headers });
      const data = await response.json();

      if (data.success) {
        const transformedUsers = data.users.map(profile => ({
          id: profile.id,
          name: `${profile.first_name} ${profile.middle_name ? profile.middle_name + ' ' : ''}${profile.last_name}`,
          email: profile.email || '',
          role: profile.role,
          status: profile.status,
          created: profile.created_at ? new Date(profile.created_at).toISOString().split('T')[0] : '',
          first_name: profile.first_name,
          middle_name: profile.middle_name,
          last_name: profile.last_name,
        }));
        
        setUsers(transformedUsers);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch users');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const deleteRequest = (id) => {
    setContactRequests(contactRequests.filter(req => req.id !== id));
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const headers = getAuthHeaders();
      const response = await fetch('http://localhost:5000/api/users/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          first_name: formData.first_name,
          middle_name: formData.middle_name,
          last_name: formData.last_name,
          email: formData.email,
          role: formData.role,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setShowCreateModal(false);
        resetForm();
        setError(null);
        await fetchUsers();
        
        // Success alert
        showSuccessAlert(
          `User ${formData.first_name} ${formData.last_name} has been created successfully!`,
          'Account Created!'
        );
      } else {
        const errorMsg = data.error || 'Failed to create user';
        setError(errorMsg);
        showErrorAlert(errorMsg);
      }
    } catch (error) {
      console.error('Error creating user:', error);
      setError(error.message);
      showErrorAlert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    
    // Show confirmation before saving
    const result = await showConfirmationAlert(
      'Confirm Changes',
      `Are you sure you want to update ${formData.first_name} ${formData.last_name}'s information?`,
      'Yes, Save Changes'
    );

    if (!result.isConfirmed) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const headers = getAuthHeaders();
      const response = await fetch(`http://localhost:5000/api/users/${selectedUser.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          first_name: formData.first_name,
          middle_name: formData.middle_name,
          last_name: formData.last_name,
          role: formData.role,
          email: formData.email
        }),
      });

      const data = await response.json();

      if (data.success) {
        setShowEditModal(false);
        resetForm();
        setError(null);
        await fetchUsers();
        
        // Success alert
        showSuccessAlert(
          `User ${formData.first_name} ${formData.last_name} has been updated successfully!`,
          'Changes Saved!'
        );
      } else {
        const errorMsg = data.error || 'Failed to update user';
        setError(errorMsg);
        showErrorAlert(errorMsg);
      }
    } catch (error) {
      console.error('Error updating user:', error);
      setError(error.message);
      showErrorAlert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (userId) => {
    const user = users.find(u => u.id === userId);
    const action = user.status === 'Active' ? 'lock' : 'unlock';
    const actionDisplay = user.status === 'Active' ? 'Lock' : 'Unlock';

    // Show confirmation
    const result = await showConfirmationAlert(
      `Confirm ${actionDisplay}`,
      `Are you sure you want to ${action} ${user.name}'s account?`,
      `Yes, ${actionDisplay} Account`
    );

    if (!result.isConfirmed) {
      return;
    }

    const newStatus = user.status === 'Active' ? 'Deactivated' : 'Active';

    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch(`http://localhost:5000/api/users/${userId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await response.json();

      if (data.success) {
        setUsers(users.map(u => {
          if (u.id === userId) {
            return { ...u, status: newStatus };
          }
          return u;
        }));
        setError(null);

        // Success alert
        showSuccessAlert(
          `User ${user.name} has been ${action}ed successfully!`,
          `Account ${actionDisplay}ed!`
        );
      } else {
        const errorMsg = data.error || 'Failed to update user status';
        setError(errorMsg);
        showErrorAlert(errorMsg);
      }
    } catch (error) {
      console.error('Error updating user status:', error);
      setError(error.message);
      showErrorAlert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (user) => {
    setSelectedUser(user);
    setFormData({
      first_name: user.first_name || '',
      middle_name: user.middle_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      role: user.role || 'Employee',
      password: ''
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      first_name: '',
      middle_name: '',
      last_name: '',
      email: '',
      role: 'Employee',
    });
    setSelectedUser(null);
    setError(null);
  };

  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.role?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      {error && (
        <div style={{
          backgroundColor: 'var(--color-danger-light)',
          color: 'var(--color-danger)',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>❌ {error}</span>
          <button 
            onClick={() => setError(null)}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: 'var(--color-danger)'
            }}
          >
            ×
          </button>
        </div>
      )}

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
          User Accounts {loading && '...'}
        </button>
        <button 
          onClick={() => setSubTab('requests')} 
          style={{
            ...styles.subTabButton,
            borderBottomColor: subTab === 'requests' ? 'var(--color-primary)' : 'transparent',
            color: subTab === 'requests' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: subTab === 'requests' ? '700' : '500'
          }}
        >
          Contact Requests
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
            <button 
              onClick={() => { resetForm(); setShowCreateModal(true); }} 
              style={styles.createBtn}
              disabled={loading}
            >
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
                {loading && filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={styles.emptyRow}>Loading users...</td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
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
                              ...styles.lockIconBtn,
                              color: u.status === 'Active' ? 'var(--color-warning)' : 'var(--color-success)',
                              background: u.status === 'Active' ? 'rgba(245, 158, 11, 0.1)' : 'var(--color-primary-light)'
                            }}
                            title={u.status === 'Active' ? 'Lock account' : 'Unlock account'}
                            disabled={loading}
                          >
                            {u.status === 'Active' ? (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                              </svg>
                            ) : (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                              </svg>
                            )}
                          </button>
                          <button 
                            onClick={() => toggleUserStatus(u.id)} 
                            style={{
                              ...styles.statusToggleBtn,
                              color: u.status === 'Active' ? 'var(--color-danger)' : 'var(--color-success)',
                              background: u.status === 'Active' ? 'var(--color-danger-light)' : 'var(--color-primary-light)'
                            }}
                            title={u.status === 'Active' ? 'Deactivate account' : 'Activate account'}
                            disabled={loading}
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

      {subTab === 'requests' && (
        <div className="glass-card">
          <h2 style={styles.tabSectionTitle}>Contact Administrator Requests</h2>
          <p style={styles.tabSectionSubtitle}>Incoming messages and account requests from the login portal.</p>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeaderRow}>
                  <th style={styles.th}>Email Address</th>
                  <th style={styles.th}>Message / Request Detail</th>
                  <th style={styles.th}>Date Received</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contactRequests.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={styles.emptyRow}>No contact requests found.</td>
                  </tr>
                ) : (
                  contactRequests.map(req => (
                    <tr key={req.id} style={styles.tableBodyRow}>
                      <td style={{ ...styles.td, fontWeight: '600', color: 'var(--color-text-primary)' }}>{req.email}</td>
                      <td style={{ ...styles.td, maxWidth: '400px', whiteSpace: 'normal', lineHeight: '1.4' }}>{req.message}</td>
                      <td style={styles.td}>{req.date}</td>
                      <td style={styles.td}>
                        <div style={styles.actionCell}>
                          <button 
                            onClick={() => {
                              resetForm();
                              setFormData({ 
                                ...formData, 
                                first_name: '',
                                middle_name: '',
                                last_name: '',
                                email: req.email, 
                                role: 'Employee', 
                                password: '' 
                              });
                              setShowCreateModal(true);
                            }}
                            style={styles.createBtn}
                          >
                            Create Account
                          </button>
                          <button 
                            onClick={() => deleteRequest(req.id)} 
                            style={{
                              ...styles.statusToggleBtn,
                              color: 'var(--color-danger)',
                              background: 'var(--color-danger-light)'
                            }}
                          >
                            Dismiss
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

      {showCreateModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Create User Account</h2>
              <button onClick={() => setShowCreateModal(false)} style={styles.closeModalBtn}>&times;</button>
            </div>
            <form onSubmit={handleCreateSubmit} style={{ marginTop: 16 }}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>First Name *</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      first_name: e.target.value
                    })
                  }
                  style={styles.modalInput}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Middle Name</label>
                <input
                  type="text"
                  value={formData.middle_name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      middle_name: e.target.value
                    })
                  }
                  style={styles.modalInput}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Last Name *</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      last_name: e.target.value
                    })
                  }
                  style={styles.modalInput}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Email Address *</label>
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
                <label style={styles.formLabel}>Assign Role *</label>
                <select 
                  value={formData.role} 
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })} 
                  style={styles.modalSelect}
                  required
                >
                  <option value="Admin">Admin</option>
                  <option value="Resource Manager">Resource Manager</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Employee">Employee</option>
                </select>
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowCreateModal(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" style={styles.saveBtn} disabled={loading}>
                  {loading ? 'Creating...' : 'Create Account'}
                </button>
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
                <label style={styles.formLabel}>First Name *</label>
                <input 
                  type="text" 
                  value={formData.first_name} 
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} 
                  style={styles.modalInput} 
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Middle Name</label>
                <input 
                  type="text" 
                  value={formData.middle_name} 
                  onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })} 
                  style={styles.modalInput} 
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Last Name *</label>
                <input 
                  type="text" 
                  value={formData.last_name} 
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} 
                  style={styles.modalInput} 
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Email Address *</label>
                <input 
                  type="email" 
                  value={formData.email} 
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })} 
                  style={styles.modalInput} 
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>System Role *</label>
                <select 
                  value={formData.role} 
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })} 
                  style={styles.modalSelect}
                  required
                >
                  <option value="Admin">Admin</option>
                  <option value="Resource Manager">Resource Manager</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Employee">Employee</option>
                </select>
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowEditModal(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" style={styles.saveBtn} disabled={loading}>
                  {loading ? 'Saving...' : 'Save Changes'}
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
  lockIconBtn: {
    background: 'var(--color-warning-light)',
    color: 'var(--color-warning)',
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
