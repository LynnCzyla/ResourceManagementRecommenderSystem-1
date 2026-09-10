import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../../config/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

// Icon components
const IconUsers = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const IconRequests = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);

const IconLocked = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const IconCreateAccount = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <line x1="19" y1="8" x2="19" y2="14"/>
    <line x1="22" y1="11" x2="16" y2="11"/>
  </svg>
);

export default function UserManagementTab({ activeSubTab: initialSubTab }) {
  const [subTab, setSubTab] = useState(initialSubTab || 'accounts');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
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
    role: '',
    department_id: '',
    position_id: '',
  });

  const [users, setUsers] = useState([]);
  const [lockedAccounts, setLockedAccounts] = useState([]);
  const [loadingLocked, setLoadingLocked] = useState(false);
  const [unlockingId, setUnlockingId] = useState(null);

  // ── Pagination states ──────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [jumpPage, setJumpPage] = useState('');

  // ── Contact Requests — real data from Supabase ──────────────────────────────
  const [contactRequests, setContactRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // ── Message Viewer Modal ─────────────────────────────────────────────────────
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showMessageModal, setShowMessageModal] = useState(false);

  // ── Create Accounts — accepted job offers from HR, awaiting a system account ─
  const [hiredEmployeesRaw, setHiredEmployeesRaw] = useState([]);
  const [loadingHires, setLoadingHires] = useState(false);

  // ── Departments & Positions — for the Department / Position form fields ─────
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);

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

  // ── Message Viewer Functions ──────────────────────────────────────────────────
  const openMessageModal = (request) => {
    setSelectedRequest(request);
    setShowMessageModal(true);
  };

  const closeMessageModal = () => {
    setShowMessageModal(false);
    setSelectedRequest(null);
  };

  // ── Fetch users ──────────────────────────────────────────────────────────────
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/users`, { headers });
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
          position_id: profile.position_id || '',
          department_id: profile.department_id || '',
          branch_name: profile.branches?.name || '',
        }));
        setUsers(transformedUsers);
        setError(null);
        setCurrentPage(1);
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
      const response = await fetch(`${API_BASE_URL}/api/admin/locked-users`, { headers });
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

  // ── Fetch contact requests ────────────────────────────────────────────────────
  const fetchContactRequests = async () => {
    try {
      setLoadingRequests(true);
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/admin/contact-requests`, { headers });
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

  // ── Fetch hired employees from HR (to surface accepted offers) ───────────────
  const fetchHiredEmployees = async () => {
    try {
      setLoadingHires(true);
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/hr/hired-employees`, { headers });
      const data = await response.json();

      if (data.success) {
        setHiredEmployeesRaw(data.data || []);
      } else {
        console.error('Failed to fetch hired employees:', data.error);
      }
    } catch (err) {
      console.error('Error fetching hired employees:', err);
    } finally {
      setLoadingHires(false);
    }
  };

  // ── Fetch departments & positions (for the Department / Position fields) ────
  const fetchDepartmentsAndPositions = async () => {
    try {
      const headers = getAuthHeaders();
      const [deptRes, posRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/departments`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/positions`, { headers }),
      ]);
      const deptData = await deptRes.json();
      const posData = await posRes.json();

      if (deptData.success) setDepartments(deptData.data || []);
      if (posData.success) setPositions(posData.data || []);
    } catch (err) {
      console.error('Error fetching departments/positions:', err);
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
      await fetch(`${API_BASE_URL}/api/admin/contact-requests/${id}`, {
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
      const adminId = user?.id || null;

      await fetch(`${API_BASE_URL}/api/admin/contact-requests/${id}/status`, {
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
      const response = await fetch(`${API_BASE_URL}/api/admin/unlock/unlock-user`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId }),
      });
      const data = await response.json();

      if (data.success) {
        showSuccessAlert('Account unlocked successfully! The user can now login.', 'Account Unlocked!');
        await fetchLockedAccounts();
        await fetchUsers();
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
      const response = await fetch(`${API_BASE_URL}/api/admin/lock-user`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId }),
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

  // ── Deactivate/Activate account ─────────────────────────────────────────────
  const handleDeactivateActivate = async (userId) => {
    const user = users.find(u => u.id === userId);
    const isActive = user.status === 'Active';
    const action = isActive ? 'deactivate' : 'activate';
    const actionDisplay = isActive ? 'Deactivate' : 'Activate';

    const result = await showConfirmationAlert(
      `Confirm ${actionDisplay}`,
      `Are you sure you want to ${action} ${user.name}'s account?${isActive ? ' This is a soft delete.' : ' This will reactivate the account.'}`,
      `Yes, ${actionDisplay}`
    );
    if (!result.isConfirmed) return;

    try {
      setLoading(true);
      const headers = getAuthHeaders();
      
      const newStatus = isActive ? 'Deactivated' : 'Active';
      const response = await fetch(`${API_BASE_URL}/api/users/${userId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: newStatus }),
      });
      
      const data = await response.json();

      if (data.success) {
        await fetchUsers();
        showSuccessAlert(
          `User ${user.name} has been ${action}d successfully!`,
          `Account ${actionDisplay}ed!`
        );
      } else {
        showErrorAlert(data.error || `Failed to ${action} account`);
      }
    } catch (err) {
      console.error(`Error ${action}ing user:`, err);
      showErrorAlert(`Failed to ${action} account. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  // ── Toggle user status (Lock/Unlock) ─────────────────────────────────────────
  const toggleUserStatus = async (userId) => {
    const user = users.find(u => u.id === userId);
    const isActive = user.status === 'Active';
    const action = isActive ? 'lock' : 'unlock';
    const actionDisplay = isActive ? 'Lock' : 'Unlock';

    const result = await showConfirmationAlert(
      `Confirm ${actionDisplay}`,
      `Are you sure you want to ${action} ${user.name}'s account?${isActive ? ' They will not be able to login.' : ' They will be able to login again.'}`,
      `Yes, ${actionDisplay} Account`
    );
    if (!result.isConfirmed) return;

    try {
      setLoading(true);
      const headers = getAuthHeaders();
      
      let response;
      if (isActive) {
        response = await fetch(`${API_BASE_URL}/api/admin/lock-user`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ userId }),
        });
      } else {
        response = await fetch(`${API_BASE_URL}/api/admin/unlock/unlock-user`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ userId }),
        });
      }
      
      const data = await response.json();

      if (data.success) {
        await fetchUsers();
        await fetchLockedAccounts();
        showSuccessAlert(
          `User ${user.name} has been ${action}ed successfully!`,
          `Account ${actionDisplay}ed!`
        );
      } else {
        showErrorAlert(data.message || `Failed to ${action} account`);
      }
    } catch (err) {
      console.error(`Error ${action}ing user:`, err);
      showErrorAlert(`Failed to ${action} account. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchLockedAccounts();
    fetchContactRequests();
    fetchHiredEmployees();
    fetchDepartmentsAndPositions();
  }, []);

  useEffect(() => {
    if (initialSubTab) setSubTab(initialSubTab);
  }, [initialSubTab]);

  // ── Helper function to handle network errors ──────────────────────────────
  const handleNetworkError = (err) => {
    console.error('Network error:', err);
    
    let errorMessage = 'Unable to connect to the server. ';
    
    // Check if it's a network error
    if (err.message === 'Failed to fetch' || 
        err.message.includes('NetworkError') || 
        err.message.includes('fetch failed') ||
        err.message.includes('network')) {
      errorMessage = 'Unable to connect to the server. Please check your internet connection and try again.';
    } else if (err.message.includes('ECONNREFUSED')) {
      errorMessage = 'Cannot connect to the server. Please ensure the server is running and try again.';
    } else if (err.message.includes('timeout') || err.message.includes('Timed out')) {
      errorMessage = 'Request timed out. Please check your internet connection and try again.';
    } else if (err.name === 'AbortError') {
      errorMessage = 'Request was cancelled. Please try again.';
    } else {
      errorMessage = err.message || 'An unexpected error occurred. Please try again.';
    }
    
    return errorMessage;
  };

  // ── Create user ──────────────────────────────────────────────────────────────
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate role is selected
    if (!formData.role) {
      setError('Please select a role for the user.');
      setLoading(false);
      return;
    }

    // Validate required fields
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      setError('First name and last name are required.');
      setLoading(false);
      return;
    }

    const trimmedEmail = formData.email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Email address is required.');
      setLoading(false);
      return;
    }

    // Frontend validation: check if email already exists in system
    const emailExists = users.some(
      u => (u.email || '').trim().toLowerCase() === trimmedEmail
    );
    if (emailExists) {
      const errorMsg = 'An account with this email address already exists.';
      setError(errorMsg);
      showErrorAlert(errorMsg);
      setLoading(false);
      return;
    }

    try {
      const headers = getAuthHeaders();
      
      // Add a timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(`${API_BASE_URL}/api/users/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          first_name: formData.first_name.trim(),
          middle_name: formData.middle_name.trim() || null,
          last_name: formData.last_name.trim(),
          email: formData.email.trim(),
          role: formData.role,
          position_id: formData.position_id || null,
          redirectOrigin: window.location.origin,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        // If the response is not JSON, it might be a server error
        throw new Error('Server returned an invalid response. Please try again.');
      }

      if (response.ok && data.success) {
        setShowCreateModal(false);
        resetForm();
        setError(null);
        await fetchUsers();
        await fetchHiredEmployees();
        showSuccessAlert(
          `User ${formData.first_name} ${formData.last_name} has been created successfully! A "Create Password" email has been sent to ${formData.email} so they can set up their own password.`,
          'Account Created!'
        );
      } else {
        const errorMsg = data.error || data.message || 'Failed to create user account.';
        setError(errorMsg);
        showErrorAlert(errorMsg);
      }
    } catch (err) {
      console.error('Error creating user:', err);
      const errorMessage = handleNetworkError(err);
      setError(errorMessage);
      showErrorAlert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // ── Edit user ────────────────────────────────────────────────────────────────
  const handleEditSubmit = async (e) => {
    e.preventDefault();

    // Validate role is selected
    if (!formData.role) {
      setError('Please select a role for the user.');
      return;
    }

    // Validate required fields
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      setError('First name and last name are required.');
      return;
    }

    if (!formData.email.trim()) {
      setError('Email address is required.');
      return;
    }

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
      
      // Add a timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(`${API_BASE_URL}/api/users/${selectedUser.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          first_name: formData.first_name.trim(),
          middle_name: formData.middle_name.trim() || null,
          last_name: formData.last_name.trim(),
          role: formData.role,
          email: formData.email.trim(),
          position_id: formData.position_id || null,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        throw new Error('Server returned an invalid response. Please try again.');
      }

      if (response.ok && data.success) {
        setShowEditModal(false);
        resetForm();
        setError(null);
        await fetchUsers();
        showSuccessAlert(
          `User ${formData.first_name} ${formData.last_name} has been updated successfully!`,
          'Changes Saved!'
        );
      } else {
        const errorMsg = data.error || data.message || 'Failed to update user account.';
        setError(errorMsg);
        showErrorAlert(errorMsg);
      }
    } catch (err) {
      console.error('Error updating user:', err);
      const errorMessage = handleNetworkError(err);
      setError(errorMessage);
      showErrorAlert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (user) => {
    setSelectedUser(user);
    const matchedPosition = positions.find(p => String(p.id) === String(user.position_id));
    setFormData({
      first_name: user.first_name || '',
      middle_name: user.middle_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      role: user.role || '',
      department_id: matchedPosition?.department_id ? String(matchedPosition.department_id) : '',
      position_id: user.position_id ? String(user.position_id) : '',
      password: ''
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({ first_name: '', middle_name: '', last_name: '', email: '', role: '', department_id: '', position_id: '' });
    setSelectedUser(null);
    setError(null);
  };

  // ── Best-effort role guess from the applicant's hired position ───────────────
  const guessRoleFromPosition = (position) => {
    const p = (position || '').toLowerCase();
    if (p.includes('resource manager')) return 'Resource Manager';
    if (p.includes('project manager')) return 'Project Manager';
    if (p.includes('human resource') || p.includes('hr assistant') || p.includes('hr ')) return 'Human Resources';
    return 'Employee';
  };

  // ── Open the Create Account modal, prefilled from an accepted HR candidate ───
  const openCreateModalFromHire = (candidate) => {
    const nameParts = (candidate.name || '').trim().split(/\s+/).filter(Boolean);
    const first_name = nameParts[0] || '';
    const last_name = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    const matchedDept = departments.find(
      d => (d.department_name || '').trim().toLowerCase() === (candidate.department || '').trim().toLowerCase()
    );
    const candidatePositionsPool = matchedDept
      ? positions.filter(p => String(p.department_id) === String(matchedDept.id))
      : positions;
    const matchedPosition = candidatePositionsPool.find(
      p => (p.position_name || '').trim().toLowerCase() === (candidate.position || '').trim().toLowerCase()
    ) || positions.find(
      p => (p.position_name || '').trim().toLowerCase() === (candidate.position || '').trim().toLowerCase()
    );

    setSelectedUser(null);
    setError(null);
    setFormData({
      first_name,
      middle_name: '',
      last_name,
      email: candidate.email || '',
      role: guessRoleFromPosition(candidate.position),
      department_id: matchedDept ? String(matchedDept.id) : (matchedPosition ? String(matchedPosition.department_id) : ''),
      position_id: matchedPosition ? String(matchedPosition.id) : '',
    });
    setShowCreateModal(true);
  };

  // ── Accepted HR offers that don't have a system account yet ──────────────────
  const existingAccountEmails = new Set(
    users.map(u => (u.email || '').trim().toLowerCase()).filter(Boolean)
  );

  const pendingHireCandidates = hiredEmployeesRaw
    .filter(emp => {
      const notes = emp.job_applications?.notes || emp.notes || '';
      const offerAccepted = Boolean(emp.offer_accepted) || notes.includes('OFFER_ACCEPTED') || emp.status === 'Offer Accepted';
      const email = (emp.email || '').trim().toLowerCase();
      return offerAccepted && !!email && !existingAccountEmails.has(email);
    })
    .map(emp => ({
      id: emp.id,
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      position: emp.positions?.position_name || emp.job_applications?.position_applied || 'N/A',
      department: emp.departments?.department_name || emp.job_applications?.department || 'N/A',
      hireDate: emp.hire_date,
    }));

  // ── Positions filtered by the currently selected department in the form ─────
  const positionsForSelectedDepartment = formData.department_id
    ? positions.filter(p => String(p.department_id) === String(formData.department_id))
    : positions;

  // ── Pagination logic ──────────────────────────────────────────────────────────
  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.role?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const totalItems = filteredUsers.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredUsers.slice(indexOfFirstItem, indexOfLastItem);

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleJumpPage = (e) => {
    if (e.key === 'Enter') {
      const page = parseInt(jumpPage, 10);
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        setCurrentPage(page);
        setJumpPage('');
      }
    }
  };

  // Get status counts for the filter badges
  const getStatusCounts = () => {
    const counts = {
      all: users.length,
      Active: users.filter(u => u.status === 'Active').length,
      Locked: users.filter(u => u.status === 'Locked').length,
      Deactivated: users.filter(u => u.status === 'Deactivated').length,
      Pending: users.filter(u => u.status === 'Pending').length,
    };
    return counts;
  };

  const statusCounts = getStatusCounts();

  // ── Render pagination controls ──────────────────────────────────────────────
  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    return (
      <div style={styles.paginationContainer}>
        <span style={styles.paginationInfo}>
          Showing {indexOfFirstItem + 1}–{Math.min(indexOfLastItem, totalItems)} of {totalItems} users
        </span>
        <div style={styles.paginationControls}>
          <button
            style={{ ...styles.pageBtn, ...(currentPage === 1 ? styles.pageBtnDisabled : {}) }}
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
          >
            ‹
          </button>
          
          {start > 1 && (
            <>
              <button style={styles.pageBtn} onClick={() => goToPage(1)}>1</button>
              {start > 2 && <span style={styles.ellipsis}>…</span>}
            </>
          )}
          
          {Array.from({ length: end - start + 1 }, (_, i) => start + i).map(page => (
            <button
              key={page}
              style={{ ...styles.pageBtn, ...(page === currentPage ? styles.pageBtnActive : {}) }}
              onClick={() => goToPage(page)}
            >
              {page}
            </button>
          ))}
          
          {end < totalPages && (
            <>
              {end < totalPages - 1 && <span style={styles.ellipsis}>…</span>}
              <button style={styles.pageBtn} onClick={() => goToPage(totalPages)}>{totalPages}</button>
            </>
          )}
          
          <button
            style={{ ...styles.pageBtn, ...(currentPage === totalPages ? styles.pageBtnDisabled : {}) }}
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            ›
          </button>
          
          <div style={styles.jumpContainer}>
            <span style={styles.jumpLabel}>Go to</span>
            <input
              type="number"
              min="1"
              max={totalPages}
              value={jumpPage}
              onChange={(e) => setJumpPage(e.target.value)}
              onKeyDown={handleJumpPage}
              style={styles.jumpInput}
              placeholder="Page"
            />
            <button
              style={styles.jumpBtn}
              onClick={() => {
                const page = parseInt(jumpPage, 10);
                if (!isNaN(page) && page >= 1 && page <= totalPages) {
                  setCurrentPage(page);
                  setJumpPage('');
                }
              }}
            >
              Go
            </button>
          </div>
        </div>
      </div>
    );
  };

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
        <button 
          onClick={() => {
            setSubTab('accounts');
            fetchUsers();
          }} 
          onMouseEnter={(e) => {
            if (subTab !== 'accounts') {
              e.currentTarget.style.background = 'var(--color-primary-light)';
              e.currentTarget.style.color = 'var(--color-primary)';
            }
          }}
          onMouseLeave={(e) => {
            if (subTab !== 'accounts') {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--color-text-secondary)';
            }
          }}
          style={{ ...styles.subTabButton, borderBottomColor: subTab === 'accounts' ? 'var(--color-primary)' : 'transparent', color: subTab === 'accounts' ? 'var(--color-primary)' : 'var(--color-text-secondary)', fontWeight: subTab === 'accounts' ? '700' : '500', ...(subTab === 'accounts' ? styles.subTabButtonHover : {}) }}
        >
          <IconUsers />
          User Accounts {loading && '...'}
        </button>
        <button 
          onClick={() => {
            setSubTab('create');
            fetchHiredEmployees();
            fetchUsers();
          }} 
          onMouseEnter={(e) => {
            if (subTab !== 'create') {
              e.currentTarget.style.background = 'var(--color-primary-light)';
              e.currentTarget.style.color = 'var(--color-primary)';
            }
          }}
          onMouseLeave={(e) => {
            if (subTab !== 'create') {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--color-text-secondary)';
            }
          }}
          style={{ ...styles.subTabButton, borderBottomColor: subTab === 'create' ? 'var(--color-primary)' : 'transparent', color: subTab === 'create' ? 'var(--color-primary)' : 'var(--color-text-secondary)', fontWeight: subTab === 'create' ? '700' : '500', ...(subTab === 'create' ? styles.subTabButtonHover : {}) }}
        >
          <IconCreateAccount />
          Create Accounts
          {loadingHires && '...'}
          {!loadingHires && pendingHireCandidates.length > 0 && (
            <span style={{ marginLeft: '8px', backgroundColor: 'var(--color-danger)', color: 'white', borderRadius: '50%', padding: '2px 8px', fontSize: '11px', fontWeight: '700' }}>
              {pendingHireCandidates.length}
            </span>
          )}
        </button>
        <button 
          onClick={() => setSubTab('requests')} 
          onMouseEnter={(e) => {
            if (subTab !== 'requests') {
              e.currentTarget.style.background = 'var(--color-primary-light)';
              e.currentTarget.style.color = 'var(--color-primary)';
            }
          }}
          onMouseLeave={(e) => {
            if (subTab !== 'requests') {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--color-text-secondary)';
            }
          }}
          style={{ ...styles.subTabButton, borderBottomColor: subTab === 'requests' ? 'var(--color-primary)' : 'transparent', color: subTab === 'requests' ? 'var(--color-primary)' : 'var(--color-text-secondary)', fontWeight: subTab === 'requests' ? '700' : '500', ...(subTab === 'requests' ? styles.subTabButtonHover : {}) }}
        >
          <IconRequests />
          Contact Requests
          {!loadingRequests && contactRequests.filter(r => r.status === 'Pending').length > 0 && (
            <span style={{ marginLeft: '8px', backgroundColor: 'var(--color-danger)', color: 'white', borderRadius: '50%', padding: '2px 8px', fontSize: '11px', fontWeight: '700' }}>
              {contactRequests.filter(r => r.status === 'Pending').length}
            </span>
          )}
        </button>
        <button 
          onClick={() => setSubTab('locked')} 
          onMouseEnter={(e) => {
            if (subTab !== 'locked') {
              e.currentTarget.style.background = 'var(--color-primary-light)';
              e.currentTarget.style.color = 'var(--color-primary)';
            }
          }}
          onMouseLeave={(e) => {
            if (subTab !== 'locked') {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--color-text-secondary)';
            }
          }}
          style={{ ...styles.subTabButton, borderBottomColor: subTab === 'locked' ? 'var(--color-primary)' : 'transparent', color: subTab === 'locked' ? 'var(--color-primary)' : 'var(--color-text-secondary)', fontWeight: subTab === 'locked' ? '700' : '500', ...(subTab === 'locked' ? styles.subTabButtonHover : {}) }}
        >
          <IconLocked />
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
            
            <div style={styles.filterWrapper}>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={styles.filterSelect}
              >
                <option value="all">All Status ({statusCounts.all})</option>
                <option value="Active">Active ({statusCounts.Active})</option>
                <option value="Locked">Locked ({statusCounts.Locked})</option>
                <option value="Deactivated">Deactivated ({statusCounts.Deactivated})</option>
                <option value="Pending">Pending ({statusCounts.Pending})</option>
              </select>
            </div>
          </div>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeaderRow}>
                  <th style={styles.th}>Full Name</th>
                  <th style={styles.th}>Email Address</th>
                  <th style={styles.th}>System Role</th>
                  <th style={styles.th}>Branch</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Created Date</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && currentItems.length === 0 ? (
                  <tr><td colSpan="7" style={styles.emptyRow}>Loading users...</td></tr>
                ) : currentItems.length === 0 ? (
                  <tr><td colSpan="7" style={styles.emptyRow}>
                    {searchQuery || statusFilter !== 'all' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                          <circle cx="11" cy="11" r="8"></circle>
                          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-text-primary)' }}>No users found</span>
                        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                          {searchQuery && `No results for "${searchQuery}"`}
                          {statusFilter !== 'all' && searchQuery && ' with '}
                          {statusFilter !== 'all' && `status "${statusFilter}"`}
                        </span>
                      </div>
                    ) : (
                      'No user accounts found.'
                    )}
                  </td></tr>
                ) : (
                  currentItems.map(u => (
                    <tr key={u.id} style={styles.tableBodyRow}>
                      <td style={{ ...styles.td, fontWeight: '600', color: 'var(--color-text-primary)' }}>{u.name}</td>
                      <td style={styles.td}>{u.email}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.roleBadge, backgroundColor: u.role === 'Admin' ? 'rgba(239, 68, 68, 0.1)' : u.role === 'Resource Manager' ? 'rgba(16, 185, 129, 0.1)' : u.role === 'HR' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(2, 132, 199, 0.1)', color: u.role === 'Admin' ? 'var(--color-danger)' : u.role === 'Resource Manager' ? 'var(--color-primary)' : u.role === 'HR' ? '#8b5cf6' : 'var(--color-accent)' }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={styles.td}>{u.branch_name || '—'}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.statusBadge, backgroundColor: u.status === 'Active' ? 'var(--color-primary-light)' : u.status === 'Locked' ? 'var(--color-danger-light)' : u.status === 'Deactivated' ? 'var(--color-warning-light)' : 'rgba(107,114,128,0.1)', color: u.status === 'Active' ? 'var(--color-success)' : u.status === 'Locked' ? 'var(--color-danger)' : u.status === 'Deactivated' ? 'var(--color-warning)' : 'var(--color-text-secondary)' }}>
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
                            onClick={() => u.status === 'Active' ? handleLockAccount(u.id) : handleUnlockAccount(u.id)} 
                            style={{ 
                              ...styles.lockIconBtn, 
                              color: u.status === 'Active' || u.status === 'Locked' ? 'var(--color-warning)' : 'var(--color-success)', 
                              background: u.status === 'Active' || u.status === 'Locked' ? 'rgba(245, 158, 11, 0.1)' : 'var(--color-primary-light)' 
                            }} 
                            title={u.status === 'Active' || u.status === 'Locked' ? 'Lock account' : 'Unlock account'} 
                            disabled={loading}
                          >
                            {u.status === 'Active' || u.status === 'Locked' ? (
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
                            onClick={() => handleDeactivateActivate(u.id)} 
                            style={{ 
                              ...styles.statusToggleBtn, 
                              color: u.status === 'Active' || u.status === 'Locked' ? 'var(--color-danger)' : 'var(--color-success)', 
                              background: u.status === 'Active' || u.status === 'Locked' ? 'var(--color-danger-light)' : 'var(--color-primary-light)' 
                            }} 
                            disabled={loading}
                          >
                            {u.status === 'Active' || u.status === 'Locked' ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {renderPagination()}
        </div>
      )}

      {/* ── Create Accounts Tab ── */}
      {subTab === 'create' && (
        <div className="glass-card">
          <div style={styles.tableToolbar}>
            <div>
              <h2 style={{ ...styles.tabSectionTitle, marginBottom: '4px' }}>Create Accounts</h2>
              <p style={{ ...styles.tabSectionSubtitle, marginBottom: 0 }}>
                Employees who accepted their job offer from HR and are ready for a system account.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button 
                onClick={async () => {
                  await Promise.all([fetchHiredEmployees(), fetchUsers()]);
                  showSuccessAlert('Pending queue synchronized with HR records.', 'Synced!');
                }} 
                style={{
                  ...styles.statusToggleBtn,
                  background: 'var(--color-bg-root)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-secondary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                }} 
                disabled={loadingHires}
                title="Refresh list of accepted offers from HR"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
                {loadingHires ? 'Syncing...' : 'Sync with HR'}
              </button>
              <button onClick={() => { resetForm(); setShowCreateModal(true); }} style={styles.createBtn} disabled={loading}>
                + Create User Account
              </button>
            </div>
          </div>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeaderRow}>
                  <th style={styles.th}>Employee</th>
                  <th style={styles.th}>Email Address</th>
                  <th style={styles.th}>Position</th>
                  <th style={styles.th}>Department</th>
                  <th style={styles.th}>Hire Date</th>
                  <th style={styles.th}>Offer Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingHires ? (
                  <tr><td colSpan="7" style={styles.emptyRow}>Loading accepted offers...</td></tr>
                ) : pendingHireCandidates.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={styles.emptyRow}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                          <circle cx="9" cy="7" r="4"></circle>
                          <line x1="19" y1="8" x2="19" y2="14"></line>
                          <line x1="22" y1="11" x2="16" y2="11"></line>
                        </svg>
                        <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-text-primary)' }}>No pending accounts to create</span>
                        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Accepted job offers from HR will show up here.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pendingHireCandidates.map(candidate => (
                    <tr key={candidate.id} style={styles.tableBodyRow}>
                      <td style={{ ...styles.td, fontWeight: '600', color: 'var(--color-text-primary)' }}>{candidate.name}</td>
                      <td style={styles.td}>{candidate.email}</td>
                      <td style={styles.td}>{candidate.position}</td>
                      <td style={styles.td}>{candidate.department}</td>
                      <td style={styles.td}>{candidate.hireDate || 'N/A'}</td>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ ...styles.statusBadge, backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', fontWeight: '600' }}>Offer Accepted</span>
                        </div>
                      </td>
                      <td style={styles.td}>
                        <button
                          onClick={() => openCreateModalFromHire(candidate)}
                          style={{ ...styles.statusToggleBtn, color: '#ffffff', background: 'var(--color-primary)' }}
                          disabled={loading}
                        >
                          + Create Account
                        </button>
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
                      <td style={styles.td}>
                        <div 
                          style={{ 
                            maxWidth: '400px', 
                            whiteSpace: 'nowrap', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis',
                            cursor: 'pointer',
                            color: 'var(--color-text-primary)',
                            transition: 'color 0.2s',
                          }}
                          onClick={() => openMessageModal(req)}
                          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-primary)'}
                          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-primary)'}
                          title="Click to view full message"
                        >
                          {req.message}
                        </div>
                      </td>
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
                                  setFormData(prev => ({ ...prev, email: req.email, role: '' }));
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
            <button 
              onClick={() => { fetchLockedAccounts(); fetchUsers(); }} 
              style={styles.refreshBtn} 
              disabled={loadingLocked}
            >
              🔄 Refresh
            </button>
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
                        <span style={{ ...styles.roleBadge, backgroundColor: acc.role === 'Admin' ? 'rgba(239, 68, 68, 0.1)' : acc.role === 'Resource Manager' ? 'rgba(16, 185, 129, 0.1)' : acc.role === 'Project Manager' ? 'rgba(2, 132, 199, 0.1)' : acc.role === 'HR' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(107, 114, 128, 0.1)', color: acc.role === 'Admin' ? 'var(--color-danger)' : acc.role === 'Resource Manager' ? 'var(--color-primary)' : acc.role === 'Project Manager' ? 'var(--color-accent)' : acc.role === 'HR' ? '#8b5cf6' : 'var(--color-text-secondary)' }}>
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

      {/* ── Message Viewer Modal ── */}
      {showMessageModal && selectedRequest && (
        <div style={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && closeMessageModal()}>
          <div className="glass-card" style={{ ...styles.modalCard, maxWidth: '560px' }}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 18, color: 'var(--color-text-primary)' }}>
                Message Details
              </h2>
              <button onClick={closeMessageModal} style={styles.closeModalBtn}>&times;</button>
            </div>
            
            <div style={{ marginTop: '16px', textAlign: 'left' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ ...styles.formLabel, fontSize: '11px', fontWeight: '700' }}>From</label>
                <div style={{ 
                  padding: '10px 12px', 
                  background: 'var(--color-bg-root)', 
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  fontSize: '14px',
                }}>
                  {selectedRequest.email}
                  {selectedRequest.name && (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginLeft: '8px' }}>
                      ({selectedRequest.name})
                    </span>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ ...styles.formLabel, fontSize: '11px', fontWeight: '700' }}>Request Type</label>
                <div style={{ 
                  padding: '10px 12px', 
                  background: 'var(--color-bg-root)', 
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  fontSize: '14px',
                }}>
                  <span style={{ ...styles.requestTypeBadge, backgroundColor: selectedRequest.requestType === 'Account Request' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: selectedRequest.requestType === 'Account Request' ? 'var(--color-primary)' : 'var(--color-warning)' }}>
                    {selectedRequest.requestType}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ ...styles.formLabel, fontSize: '11px', fontWeight: '700' }}>Date Received</label>
                <div style={{ 
                  padding: '10px 12px', 
                  background: 'var(--color-bg-root)', 
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  fontSize: '14px',
                }}>
                  {selectedRequest.date}
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ ...styles.formLabel, fontSize: '11px', fontWeight: '700' }}>Status</label>
                <div style={{ 
                  padding: '10px 12px', 
                  background: 'var(--color-bg-root)', 
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  fontSize: '14px',
                }}>
                  <span style={{ ...styles.statusBadge, backgroundColor: selectedRequest.status === 'Pending' ? 'var(--color-warning-light)' : selectedRequest.status === 'Approved' ? 'var(--color-primary-light)' : selectedRequest.status === 'Rejected' ? 'var(--color-danger-light)' : 'rgba(107,114,128,0.1)', color: selectedRequest.status === 'Pending' ? 'var(--color-warning)' : selectedRequest.status === 'Approved' ? 'var(--color-success)' : selectedRequest.status === 'Rejected' ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
                    {selectedRequest.status}
                  </span>
                </div>
              </div>

              <div>
                <label style={{ ...styles.formLabel, fontSize: '11px', fontWeight: '700' }}>Message</label>
                <div style={{ 
                  padding: '14px 16px', 
                  background: 'var(--color-bg-root)', 
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {selectedRequest.message || 'No message provided.'}
                </div>
              </div>

              <div style={styles.modalActions}>
                <button onClick={closeMessageModal} style={styles.cancelBtn}>Close</button>
              </div>
            </div>
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
                <input 
                  type="email" 
                  value={formData.email} 
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (error && error.toLowerCase().includes('email')) setError(null);
                  }} 
                  style={{
                    ...styles.modalInput,
                    ...(users.some(u => (u.email || '').trim().toLowerCase() === (formData.email || '').trim().toLowerCase()) && formData.email.trim() ? { borderColor: '#ef4444' } : {})
                  }} 
                  placeholder="user@wea.com" 
                  required 
                />
                {users.some(u => (u.email || '').trim().toLowerCase() === (formData.email || '').trim().toLowerCase()) && formData.email.trim() && (
                  <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', fontWeight: '500' }}>
                    An account with this email address already exists.
                  </span>
                )}
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Department</label>
                <select
                  value={formData.department_id}
                  onChange={(e) => setFormData({ ...formData, department_id: e.target.value, position_id: '' })}
                  style={styles.modalSelect}
                >
                  <option value="">Select a department…</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.department_name}</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Position</label>
                <select
                  value={formData.position_id}
                  onChange={(e) => setFormData({ ...formData, position_id: e.target.value })}
                  style={styles.modalSelect}
                  disabled={!formData.department_id}
                >
                  <option value="">{formData.department_id ? 'Select a position…' : 'Select a department first'}</option>
                  {positionsForSelectedDepartment.map((pos) => (
                    <option key={pos.id} value={pos.id}>{pos.position_name}</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Assign Role *</label>
                <select 
                  value={formData.role} 
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })} 
                  style={styles.modalSelect} 
                  required
                >
                  <option value="">-- Select Role --</option>
                  <option value="Employee">Employee</option>
                  <option value="Resource Manager">Resource Manager</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Human Resources">Human Resources</option>
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
                <label style={styles.formLabel}>Department</label>
                <select
                  value={formData.department_id}
                  onChange={(e) => setFormData({ ...formData, department_id: e.target.value, position_id: '' })}
                  style={styles.modalSelect}
                >
                  <option value="">Select a department…</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.department_name}</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Position</label>
                <select
                  value={formData.position_id}
                  onChange={(e) => setFormData({ ...formData, position_id: e.target.value })}
                  style={styles.modalSelect}
                  disabled={!formData.department_id}
                >
                  <option value="">{formData.department_id ? 'Select a position…' : 'Select a department first'}</option>
                  {positionsForSelectedDepartment.map((pos) => (
                    <option key={pos.id} value={pos.id}>{pos.position_name}</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>System Role *</label>
                <select 
                  value={formData.role} 
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })} 
                  style={styles.modalSelect} 
                  required
                >
                  <option value="">-- Select Role --</option>
                  <option value="Employee">Employee</option>
                  <option value="Resource Manager">Resource Manager</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Human Resources">Human Resources</option>
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

// Styles
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
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    padding: '10px 20px',
    fontSize: '13px',
    fontWeight: '600',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: '-1px',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    borderRadius: '6px 6px 0 0',
    transition: 'color 0.15s',
  },
  subTabButtonHover: {
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
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
  },
  filterWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  filterSelect: {
    padding: '10px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
    minWidth: '180px',
    transition: 'border-color 0.2s',
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
    gap: '16px',
    marginBottom: '16px',
    padding: '10px 16px',
    background: 'var(--color-bg-root)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    width: 'fit-content',
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
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginTop: '2px',
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
  },
  paginationContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderTop: '1px solid var(--color-border)',
    flexWrap: 'wrap',
    gap: '12px',
  },
  paginationInfo: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
  },
  paginationControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  pageBtn: {
    minWidth: '34px',
    height: '34px',
    padding: '0 8px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnActive: {
    background: 'var(--color-primary)',
    borderColor: 'var(--color-primary)',
    color: '#ffffff',
  },
  pageBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  ellipsis: {
    padding: '0 4px',
    color: 'var(--color-text-muted)',
  },
  jumpContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginLeft: '8px',
    paddingLeft: '8px',
    borderLeft: '1px solid var(--color-border)',
  },
  jumpLabel: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  jumpInput: {
    width: '56px',
    height: '34px',
    padding: '0 6px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    textAlign: 'center',
    outline: 'none',
  },
  jumpBtn: {
    height: '34px',
    padding: '0 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};

// Add keyframe styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}