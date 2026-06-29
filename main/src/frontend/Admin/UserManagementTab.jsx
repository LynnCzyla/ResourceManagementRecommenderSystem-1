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
  const [lockedAccounts, setLockedAccounts] = useState([]);
  const [loadingLocked, setLoadingLocked] = useState(false);
  const [unlockingId, setUnlockingId] = useState(null);

  // ── Contact Requests — real data from Supabase ──────────────────────────────
  const [contactRequests, setContactRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // ── SweetAlert helpers ───────────────────────────────────────────────────────
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

  // ── Fetch users ──────────────────────────────────────────────────────────────
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
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Fetch locked accounts ────────────────────────────────────────────────────
  const fetchLockedAccounts = async () => {
    try {
      setLoadingLocked(true);
      const headers = getAuthHeaders();
      const response = await fetch('http://localhost:5000/api/admin/locked-users', { headers });
      const data = await response.json();

      if (data.success) {
        const transformedLocked = data.data.map(account => {
          const user = account.user || {};
          return {
            id: account.userId,
            user_id: account.userId,
            name: user.first_name && user.last_name
              ? `${user.first_name} ${user.last_name}`
              : 'Unknown User',
            email: user.email || 'N/A',
            role: user.role || 'Employee',
            failedAttempts: account.failedAttempts || 0,
            lockedAt: account.lockedAt,
            lockedBy: account.lockedBy || 'System',
            timeSinceLocked: account.timeSinceLocked || 'N/A',
          };
        });
        setLockedAccounts(transformedLocked);
        setError(null);
      } else {
        setError(data.message || 'Failed to fetch locked accounts');
      }
    } catch (err) {
      console.error('Error fetching locked accounts:', err);
      setError('Failed to load locked accounts. Please try again.');
    } finally {
      setLoadingLocked(false);
    }
  };

  // ── Fetch contact requests from Supabase via backend ────────────────────────
  const fetchContactRequests = async () => {
    try {
      setLoadingRequests(true);
      const headers = getAuthHeaders();
      const response = await fetch('http://localhost:5000/api/admin/contact-requests', { headers });
      const data = await response.json();

      if (data.success) {
        const transformed = data.requests.map(req => ({
          id: req.id,
          email: req.email,
          name: [req.first_name, req.middle_name, req.last_name].filter(Boolean).join(' '),
          message: req.message,
          date: req.created_at ? new Date(req.created_at).toISOString().split('T')[0] : '',
          requestType: req.request_type || 'Account Request',
          status: req.status
            ? req.status.charAt(0).toUpperCase() + req.status.slice(1)
            : 'Pending',
          phone: req.phone || '',
        }));
        setContactRequests(transformed);
      } else {
        console.error('Failed to fetch contact requests:', data.error);
      }
    } catch (err) {
      console.error('Error fetching contact requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  // ── Delete a contact request ─────────────────────────────────────────────────
  const deleteRequest = async (id) => {
    const result = await showConfirmationAlert(
      'Delete Request',
      'Are you sure you want to permanently delete this contact request?',
      'Yes, Delete'
    );
    if (!result.isConfirmed) return;

    try {
      const headers = getAuthHeaders();
      await fetch(`http://localhost:5000/api/admin/contact-requests/${id}`, {
        method: 'DELETE',
        headers,
      });
      setContactRequests(prev => prev.filter(req => req.id !== id));
      showSuccessAlert('Contact request deleted successfully.', 'Deleted!');
    } catch (err) {
      console.error('Error deleting request:', err);
      showErrorAlert('Failed to delete request. Please try again.');
    }
  };

  // ── Update contact request status ────────────────────────────────────────────
  const updateRequestStatus = async (id, newStatus) => {
  try {
    const headers = getAuthHeaders();
    const userString = localStorage.getItem('user');
    const user = userString ? JSON.parse(userString) : null;
    const adminId = user?.id || null; // current logged-in admin

    await fetch(`http://localhost:5000/api/admin/contact-requests/${id}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        status: newStatus.toLowerCase(),
        processed_by: adminId,
        processed_at: new Date().toISOString(),
      }),
    });

    setContactRequests(prev =>
      prev.map(req => req.id === id ? { ...req, status: newStatus } : req)
    );
  } catch (err) {
    console.error('Error updating request status:', err);
    showErrorAlert('Failed to update status. Please try again.');
  }
};

  // ── Unlock account ───────────────────────────────────────────────────────────
  const handleUnlockAccount = async (userId) => {
    const result = await showConfirmationAlert(
      'Unlock Account',
      'Are you sure you want to unlock this account? The user will be able to login again.',
      'Yes, Unlock'
    );
    if (!result.isConfirmed) return;

    try {
      setUnlockingId(userId);
      const headers = getAuthHeaders();
      const response = await fetch('http://localhost:5000/api/admin/unlock/unlock-user', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId }),
      });
      const data = await response.json();

      if (data.success) {
        showSuccessAlert('Account unlocked successfully! The user can now login.', 'Account Unlocked!');
        await fetchLockedAccounts();
      } else {
        showErrorAlert(data.message || 'Failed to unlock account');
      }
    } catch (err) {
      console.error('Error unlocking account:', err);
      showErrorAlert('Failed to unlock account. Please try again.');
    } finally {
      setUnlockingId(null);
    }
  };

  // ── Lock account ─────────────────────────────────────────────────────────────
  const handleLockAccount = async (userId) => {
    const result = await showConfirmationAlert(
      'Lock Account',
      'Are you sure you want to lock this account? The user will not be able to login until unlocked.',
      'Yes, Lock Account'
    );
    if (!result.isConfirmed) return;

    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const adminId = localStorage.getItem('userId');
      const response = await fetch('http://localhost:5000/api/admin/lock-user', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, adminId }),
      });
      const data = await response.json();

      if (data.success) {
        showSuccessAlert('Account locked successfully! The user cannot login until unlocked.', 'Account Locked!');
        await fetchUsers();
        await fetchLockedAccounts();
      } else {
        showErrorAlert(data.message || 'Failed to lock account');
      }
    } catch (err) {
      console.error('Error locking account:', err);
      showErrorAlert('Failed to lock account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchLockedAccounts();
    fetchContactRequests();
  }, []);

  useEffect(() => {
    if (initialSubTab) setSubTab(initialSubTab);
  }, [initialSubTab]);

  // ── Create user ──────────────────────────────────────────────────────────────
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
        showSuccessAlert(
          `User ${formData.first_name} ${formData.last_name} has been created successfully! The temporary password is ${data.temporary_password}`,
          'Account Created!'
        );
      } else {
        const errorMsg = data.error || 'Failed to create user';
        setError(errorMsg);
        showErrorAlert(errorMsg);
      }
    } catch (err) {
      console.error('Error creating user:', err);
      setError(err.message);
      showErrorAlert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Edit user ────────────────────────────────────────────────────────────────
  const handleEditSubmit = async (e) => {
    e.preventDefault();

    const result = await showConfirmationAlert(
      'Confirm Changes',
      `Are you sure you want to update ${formData.first_name} ${formData.last_name}'s information?`,
      'Yes, Save Changes'
    );
    if (!result.isConfirmed) return;

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
          email: formData.email,
        }),
      });
      const data = await response.json();

      if (data.success) {
        setShowEditModal(false);
        resetForm();
        setError(null);
        await fetchUsers();
        showSuccessAlert(
          `User ${formData.first_name} ${formData.last_name} has been updated successfully!`,
          'Changes Saved!'
        );
      } else {
        const errorMsg = data.error || 'Failed to update user';
        setError(errorMsg);
        showErrorAlert(errorMsg);
      }
    } catch (err) {
      console.error('Error updating user:', err);
      setError(err.message);
      showErrorAlert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Toggle user status ───────────────────────────────────────────────────────
  const toggleUserStatus = async (userId) => {
    const user = users.find(u => u.id === userId);
    const action = user.status === 'Active' ? 'lock' : 'unlock';
    const actionDisplay = user.status === 'Active' ? 'Lock' : 'Unlock';

    const result = await showConfirmationAlert(
      `Confirm ${actionDisplay}`,
      `Are you sure you want to ${action} ${user.name}'s account?`,
      `Yes, ${actionDisplay} Account`
    );
    if (!result.isConfirmed) return;

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
        setUsers(users.map(u => u.id === userId ? { ...u, status: newStatus } : u));
        setError(null);
        showSuccessAlert(
          `User ${user.name} has been ${action}ed successfully!`,
          `Account ${actionDisplay}ed!`
        );
      } else {
        const errorMsg = data.error || 'Failed to update user status';
        setError(errorMsg);
        showErrorAlert(errorMsg);
      }
    } catch (err) {
      console.error('Error updating user status:', err);
      setError(err.message);
      showErrorAlert(err.message);
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
    setFormData({ first_name: '', middle_name: '', last_name: '', email: '', role: 'Employee' });
    setSelectedUser(null);
    setError(null);
  };

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.role?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getTimeSinceLocked = (lockedAt) => {
    if (!lockedAt) return 'N/A';
    const diffMs = new Date() - new Date(lockedAt);
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

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
          <button onClick={() => setError(null)} style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--color-danger)' }}>×</button>
        </div>
      )}

      <div style={styles.header}>
        <h1 style={styles.title}>User Management</h1>
        <p style={styles.subtitle}>Configure user accounts, roles permissions, and credentials.</p>
      </div>

      <div style={styles.subTabsContainer}>
        <button onClick={() => setSubTab('accounts')} style={{ ...styles.subTabButton, borderBottomColor: subTab === 'accounts' ? 'var(--color-primary)' : 'transparent', color: subTab === 'accounts' ? 'var(--color-primary)' : 'var(--color-text-secondary)', fontWeight: subTab === 'accounts' ? '700' : '500' }}>
          User Accounts {loading && '...'}
        </button>
        <button onClick={() => setSubTab('requests')} style={{ ...styles.subTabButton, borderBottomColor: subTab === 'requests' ? 'var(--color-primary)' : 'transparent', color: subTab === 'requests' ? 'var(--color-primary)' : 'var(--color-text-secondary)', fontWeight: subTab === 'requests' ? '700' : '500' }}>
          Contact Requests
          {!loadingRequests && contactRequests.filter(r => r.status === 'Pending').length > 0 && (
            <span style={{ marginLeft: '8px', backgroundColor: 'var(--color-danger)', color: 'white', borderRadius: '50%', padding: '2px 8px', fontSize: '11px', fontWeight: '700' }}>
              {contactRequests.filter(r => r.status === 'Pending').length}
            </span>
          )}
        </button>
        <button onClick={() => setSubTab('locked')} style={{ ...styles.subTabButton, borderBottomColor: subTab === 'locked' ? 'var(--color-primary)' : 'transparent', color: subTab === 'locked' ? 'var(--color-primary)' : 'var(--color-text-secondary)', fontWeight: subTab === 'locked' ? '700' : '500' }}>
          Locked Accounts
          {loadingLocked && '...'}
          {!loadingLocked && lockedAccounts.length > 0 && (
            <span style={{ marginLeft: '8px', backgroundColor: 'var(--color-danger)', color: 'white', borderRadius: '50%', padding: '2px 8px', fontSize: '11px', fontWeight: '700' }}>
              {lockedAccounts.length}
            </span>
          )}
        </button>
      </div>

      {/* ── User Accounts Tab ── */}
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
            <button onClick={() => { resetForm(); setShowCreateModal(true); }} style={styles.createBtn} disabled={loading}>
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
                  <tr><td colSpan="6" style={styles.emptyRow}>Loading users...</td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan="6" style={styles.emptyRow}>No user accounts found.</td></tr>
                ) : (
                  filteredUsers.map(u => (
                    <tr key={u.id} style={styles.tableBodyRow}>
                      <td style={{ ...styles.td, fontWeight: '600', color: 'var(--color-text-primary)' }}>{u.name}</td>
                      <td style={styles.td}>{u.email}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.roleBadge, backgroundColor: u.role === 'Admin' ? 'rgba(239, 68, 68, 0.1)' : u.role === 'Resource Manager' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(2, 132, 199, 0.1)', color: u.role === 'Admin' ? 'var(--color-danger)' : u.role === 'Resource Manager' ? 'var(--color-primary)' : 'var(--color-accent)' }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.statusBadge, backgroundColor: u.status === 'Active' ? 'var(--color-primary-light)' : 'var(--color-danger-light)', color: u.status === 'Active' ? 'var(--color-success)' : 'var(--color-danger)' }}>
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
                          <button onClick={() => toggleUserStatus(u.id)} style={{ ...styles.lockIconBtn, color: u.status === 'Active' ? 'var(--color-warning)' : 'var(--color-success)', background: u.status === 'Active' ? 'rgba(245, 158, 11, 0.1)' : 'var(--color-primary-light)' }} title={u.status === 'Active' ? 'Lock account' : 'Unlock account'} disabled={loading}>
                            {u.status === 'Active' ? (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            ) : (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
                            )}
                          </button>
                          <button onClick={() => toggleUserStatus(u.id)} style={{ ...styles.statusToggleBtn, color: u.status === 'Active' ? 'var(--color-danger)' : 'var(--color-success)', background: u.status === 'Active' ? 'var(--color-danger-light)' : 'var(--color-primary-light)' }} disabled={loading}>
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

      {/* ── Contact Requests Tab ── */}
      {subTab === 'requests' && (
        <div className="glass-card">
          <h2 style={styles.tabSectionTitle}>Contact Administrator Requests</h2>
          <p style={styles.tabSectionSubtitle}>Incoming messages and account requests from the login portal.</p>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeaderRow}>
                  <th style={styles.th}>Email Address</th>
                  <th style={styles.th}>Request Type</th>
                  <th style={styles.th}>Message / Request Detail</th>
                  <th style={styles.th}>Date Received</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingRequests ? (
                  <tr><td colSpan="6" style={styles.emptyRow}>Loading contact requests...</td></tr>
                ) : contactRequests.length === 0 ? (
                  <tr><td colSpan="6" style={styles.emptyRow}>No contact requests found.</td></tr>
                ) : (
                  contactRequests.map(req => (
                    <tr key={req.id} style={styles.tableBodyRow}>
                      <td style={{ ...styles.td, fontWeight: '600', color: 'var(--color-text-primary)' }}>
                        <div>{req.email}</div>
                        {req.name && <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{req.name}</div>}
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.requestTypeBadge, backgroundColor: req.requestType === 'Account Request' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: req.requestType === 'Account Request' ? 'var(--color-primary)' : 'var(--color-warning)' }}>
                          {req.requestType}
                        </span>
                      </td>
                      <td style={{ ...styles.td, maxWidth: '400px', whiteSpace: 'normal', lineHeight: '1.4' }}>{req.message}</td>
                      <td style={styles.td}>{req.date}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.statusBadge, backgroundColor: req.status === 'Pending' ? 'var(--color-warning-light)' : req.status === 'Approved' ? 'var(--color-primary-light)' : req.status === 'Rejected' ? 'var(--color-danger-light)' : 'rgba(107,114,128,0.1)', color: req.status === 'Pending' ? 'var(--color-warning)' : req.status === 'Approved' ? 'var(--color-success)' : req.status === 'Rejected' ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
                          {req.status}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actionCell}>
                          {req.status === 'Pending' && (
                            <>
                              <button
                                onClick={() => {
                                  resetForm();
                                  setFormData(prev => ({ ...prev, email: req.email, role: 'Employee' }));
                                  setShowCreateModal(true);
                                }}
                                style={{ ...styles.statusToggleBtn, color: 'var(--color-primary)', background: 'var(--color-primary-light)' }}
                              >
                                Create Account
                              </button>
                              <button onClick={() => updateRequestStatus(req.id, 'Approved')} style={{ ...styles.statusToggleBtn, color: 'var(--color-success)', background: 'var(--color-primary-light)' }}>
                                Approve
                              </button>
                              <button onClick={() => updateRequestStatus(req.id, 'Rejected')} style={{ ...styles.statusToggleBtn, color: 'var(--color-danger)', background: 'var(--color-danger-light)' }}>
                                Reject
                              </button>
                            </>
                          )}
                          {req.status === 'Approved' && (
                            <button onClick={() => updateRequestStatus(req.id, 'Closed')} style={{ ...styles.statusToggleBtn, color: 'var(--color-text-secondary)', background: 'var(--color-bg-card-hover)' }}>
                              Close
                            </button>
                          )}
                          {req.status === 'Rejected' && (
                            <>
                              <button onClick={() => updateRequestStatus(req.id, 'Pending')} style={{ ...styles.statusToggleBtn, color: 'var(--color-warning)', background: 'var(--color-warning-light)' }}>
                                Reopen
                              </button>
                              <button onClick={() => deleteRequest(req.id)} style={{ ...styles.statusToggleBtn, color: 'var(--color-danger)', background: 'var(--color-danger-light)' }}>
                                Delete
                              </button>
                            </>
                          )}
                          {req.status === 'Closed' && (
                            <button onClick={() => deleteRequest(req.id)} style={{ ...styles.statusToggleBtn, color: 'var(--color-danger)', background: 'var(--color-danger-light)' }}>
                              Delete
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
        </div>
      )}

      {/* ── Locked Accounts Tab ── */}
      {subTab === 'locked' && (
        <div className="glass-card">
          <div style={styles.tableToolbar}>
            <h2 style={{ ...styles.tabSectionTitle, marginBottom: 0 }}>Locked Accounts</h2>
          </div>
          <p style={styles.tabSectionSubtitle}>View and manage accounts locked due to failed login attempts or manual admin action.</p>

          <div style={styles.statsBar}>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Total Locked Accounts</span>
              <span style={styles.statValue}>{lockedAccounts.length}</span>
            </div>
          </div>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeaderRow}>
                  <th style={styles.th}>Full Name</th>
                  <th style={styles.th}>Email Address</th>
                  <th style={styles.th}>System Role</th>
                  <th style={styles.th}>Failed Attempts</th>
                  <th style={styles.th}>Locked At</th>
                  <th style={styles.th}>Time Since Locked</th>
                  <th style={styles.th}>Locked By</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingLocked ? (
                  <tr><td colSpan="8" style={styles.emptyRow}>Loading locked accounts...</td></tr>
                ) : lockedAccounts.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={styles.emptyRow}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                        <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-text-primary)' }}>No locked accounts</span>
                        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>All user accounts are currently unlocked</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  lockedAccounts.map(acc => (
                    <tr key={acc.id} style={styles.tableBodyRow}>
                      <td style={{ ...styles.td, fontWeight: '600', color: 'var(--color-text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--color-primary-light)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700' }}>
                            {acc.name.charAt(0).toUpperCase()}
                          </div>
                          {acc.name}
                        </div>
                      </td>
                      <td style={styles.td}><a href={`mailto:${acc.email}`} style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}>{acc.email}</a></td>
                      <td style={styles.td}>
                        <span style={{ ...styles.roleBadge, backgroundColor: acc.role === 'Admin' ? 'rgba(239, 68, 68, 0.1)' : acc.role === 'Resource Manager' ? 'rgba(16, 185, 129, 0.1)' : acc.role === 'Project Manager' ? 'rgba(2, 132, 199, 0.1)' : 'rgba(107, 114, 128, 0.1)', color: acc.role === 'Admin' ? 'var(--color-danger)' : acc.role === 'Resource Manager' ? 'var(--color-primary)' : acc.role === 'Project Manager' ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                          {acc.role}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.attemptsBadge, backgroundColor: acc.failedAttempts >= 5 ? 'var(--color-danger-light)' : 'var(--color-warning-light)', color: acc.failedAttempts >= 5 ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                          {acc.failedAttempts} attempts
                        </span>
                      </td>
                      <td style={styles.td}>{formatDate(acc.lockedAt)}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.timeBadge, backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)' }}>
                          {getTimeSinceLocked(acc.lockedAt)}
                        </span>
                      </td>
                      <td style={styles.td}>{acc.lockedBy && acc.lockedBy !== 'System' ? 'Admin' : 'System (Auto-lock)'}</td>
                      <td style={styles.td}>
                        <div style={styles.actionCell}>
                          <button
                            onClick={() => handleUnlockAccount(acc.user_id || acc.id)}
                            style={{ ...styles.unlockBtn, opacity: unlockingId === (acc.user_id || acc.id) ? 0.7 : 1 }}
                            disabled={unlockingId === (acc.user_id || acc.id)}
                          >
                            {unlockingId === (acc.user_id || acc.id) ? (
                              <><span style={styles.spinnerSmall}></span>Unlocking...</>
                            ) : 'Unlock Account'}
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

      {/* ── Create Modal ── */}
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
                <input type="text" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} style={styles.modalInput} required />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Middle Name</label>
                <input type="text" value={formData.middle_name} onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })} style={styles.modalInput} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Last Name *</label>
                <input type="text" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} style={styles.modalInput} required />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Email Address *</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} style={styles.modalInput} placeholder="romell.ebuen@wea.com" required />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Assign Role *</label>
                <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} style={styles.modalSelect} required>
                  <option value="Admin">Admin</option>
                  <option value="Resource Manager">Resource Manager</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Employee">Employee</option>
                </select>
              </div>
              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowCreateModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.saveBtn} disabled={loading}>{loading ? 'Creating...' : 'Create Account'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
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
                <input type="text" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} style={styles.modalInput} required />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Middle Name</label>
                <input type="text" value={formData.middle_name} onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })} style={styles.modalInput} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Last Name *</label>
                <input type="text" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} style={styles.modalInput} required />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Email Address *</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} style={styles.modalInput} required />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>System Role *</label>
                <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} style={styles.modalSelect} required>
                  <option value="Admin">Admin</option>
                  <option value="Resource Manager">Resource Manager</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Employee">Employee</option>
                </select>
              </div>
              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowEditModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.saveBtn} disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
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
    display: 'flex',
    alignItems: 'center',
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
    },
    '&:disabled': {
      opacity: 0.6,
      cursor: 'not-allowed',
    }
  },
  refreshBtn: {
    backgroundColor: 'var(--color-bg-root)',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
    padding: '8px 16px',
    borderRadius: 'var(--radius-md)',
    fontWeight: '600',
    fontSize: '13px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s',
    '&:hover': {
      backgroundColor: 'var(--color-bg-hover)',
      borderColor: 'var(--color-text-muted)',
    },
    '&:disabled': {
      opacity: 0.6,
      cursor: 'not-allowed',
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
    whiteSpace: 'nowrap',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
  },
  requestTypeBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
  },
  attemptsBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
  },
  timeBadge: {
    fontSize: '11px',
    fontWeight: '600',
    padding: '3px 8px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
  },
  actionCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
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
    '&:disabled': {
      opacity: 0.6,
      cursor: 'not-allowed',
    }
  },
  statusToggleBtn: {
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    '&:disabled': {
      opacity: 0.6,
      cursor: 'not-allowed',
    }
  },
  unlockBtn: {
    backgroundColor: 'var(--color-success)',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    '&:hover': {
      backgroundColor: 'var(--color-success-hover)',
    },
    '&:disabled': {
      opacity: 0.6,
      cursor: 'not-allowed',
    }
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
  statsBar: {
    display: 'flex',
    gap: '24px',
    marginBottom: '20px',
    padding: '16px 20px',
    background: 'var(--color-bg-root)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
  },
  statLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: '800',
    color: 'var(--color-text-primary)',
    marginTop: '4px',
  },
  spinnerSmall: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    border: '2px solid #ffffff',
    borderTop: '2px solid transparent',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    marginRight: '6px',
    verticalAlign: 'middle',
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
    color: 'var(--color-text-secondary)',
    '&:hover': {
      backgroundColor: 'var(--color-bg-hover)',
    }
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
    '&:hover': {
      backgroundColor: 'var(--color-primary-hover)',
    },
    '&:disabled': {
      opacity: 0.6,
      cursor: 'not-allowed',
    }
  }
};