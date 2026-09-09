import React, { useState, useEffect, useCallback, useRef } from 'react';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../../config/api';

const API_BASE = `${API_BASE_URL}/api/superadmin`;

// Cache helper functions - with versioning for smart refresh
const CACHE_KEY = 'admin_management_cache';
const CACHE_VERSION_KEY = 'admin_management_cache_version';

// Track cache version - increment this when you want to force refresh all users
let cacheVersion = 1;

const getCachedData = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached);
      // Check if cache version matches
      const storedVersion = localStorage.getItem(CACHE_VERSION_KEY);
      if (storedVersion && parseInt(storedVersion) === cacheVersion) {
        return data;
      }
    }
    return null;
  } catch {
    return null;
  }
};

const setCachedData = (data) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_VERSION_KEY, String(cacheVersion));
  } catch {
    // Ignore cache errors
  }
};

// Force clear all cache
export const clearAdminCache = () => {
  cacheVersion++;
  localStorage.setItem(CACHE_VERSION_KEY, String(cacheVersion));
  localStorage.removeItem(CACHE_KEY);
};

const emptyForm = {
  employee_id: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  email: '',
  contact_number: '',
  join_date: '',
  branch_id: '',
};

// Helper: Generate employee ID format: WEA-Location-XXX
const generateEmployeeId = (branchName, existingIds = []) => {
  if (!branchName) return '';
  
  // Extract location from branch name
  let location = '';
  
  // Remove "WEA-" prefix if it exists
  let cleanName = branchName;
  if (branchName.toUpperCase().startsWith('WEA-')) {
    cleanName = branchName.substring(4);
  }
  
  // Clean the location name - keep only letters and convert to uppercase
  location = cleanName.replace(/[^a-zA-Z]/g, '').toUpperCase();
  
  // If location is empty, use the original name
  if (!location) {
    location = branchName.replace(/[^a-zA-Z]/g, '').toUpperCase();
  }
  
  // If still empty, use a default
  if (!location) {
    location = 'BRANCH';
  }
  
  let highest = 0;
  const prefix = `WEA-${location}-`;
  
  console.log('🔍 Generating ID for location:', location);
  console.log('📦 Existing IDs:', existingIds);
  
  existingIds.forEach(id => {
    if (id && id.startsWith(prefix)) {
      const numPart = id.replace(prefix, '');
      const num = parseInt(numPart, 10);
      if (!isNaN(num) && num > highest) {
        highest = num;
      }
    }
  });
  
  const nextNumber = highest + 1;
  const paddedNumber = String(nextNumber).padStart(3, '0');
  const newId = `WEA-${location}-${paddedNumber}`;
  
  console.log('✅ Generated new ID:', newId);
  console.log('📊 Highest found:', highest);
  
  return newId;
};

export default function AdminManagementTab() {
  const [admins, setAdmins] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [lockFilter, setLockFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [generatedId, setGeneratedId] = useState('');
  const [generatingId, setGeneratingId] = useState(false);
  const [allEmployeeIds, setAllEmployeeIds] = useState([]);

  // Refs for caching and preventing duplicate requests
  const isMounted = useRef(true);
  const fetchInProgress = useRef(false);
  const initialLoadComplete = useRef(false);
  const currentFilters = useRef({ searchQuery: '', statusFilter: '', lockFilter: '', branchFilter: '' });
  const backgroundRefreshTimeout = useRef(null);

  // ============================================
  // ALERT HELPERS
  // ============================================

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
    });
  };

  // ============================================
  // DATA LOADING WITH SMART CACHE
  // ============================================

  const loadBranches = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/branches?limit=100`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load branches');
      if (isMounted.current) {
        setBranches(json.data || []);
      }
    } catch (err) {
      showErrorAlert(err.message, 'Failed to load branches');
    }
  }, []);

  const loadAllEmployeeIds = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/accounts?limit=999999`);
      const json = await res.json();
      
      if (!json.success) {
        console.error('Failed to load accounts:', json.error);
        const adminRes = await fetch(`${API_BASE}/admins?limit=999999`);
        const adminJson = await adminRes.json();
        if (adminJson.success) {
          const ids = adminJson.data.map(admin => admin.employee_id).filter(Boolean);
          console.log('📦 Loaded employee IDs from admins (fallback):', ids);
          if (isMounted.current) {
            setAllEmployeeIds(ids);
          }
        }
        return;
      }
      
      const ids = json.data.map(profile => profile.employee_id).filter(Boolean);
      console.log(`📦 Loaded ${ids.length} employee IDs from accounts`);
      console.log('📋 Employee IDs:', ids);
      
      if (isMounted.current) {
        setAllEmployeeIds(ids);
      }
    } catch (err) {
      console.error('Error loading employee IDs:', err);
      try {
        const adminRes = await fetch(`${API_BASE}/admins?limit=999999`);
        const adminJson = await adminRes.json();
        if (adminJson.success) {
          const ids = adminJson.data.map(admin => admin.employee_id).filter(Boolean);
          console.log('📦 Loaded employee IDs from admins (fallback):', ids);
          if (isMounted.current) {
            setAllEmployeeIds(ids);
          }
        }
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr);
      }
    }
  }, []);

  const loadAdmins = useCallback(async (page = 1, forceRefresh = false, silent = false) => {
    if (fetchInProgress.current) return;
    
    const filtersChanged = 
      currentFilters.current.searchQuery !== searchQuery ||
      currentFilters.current.statusFilter !== statusFilter ||
      currentFilters.current.lockFilter !== lockFilter ||
      currentFilters.current.branchFilter !== branchFilter;

    if (initialLoadComplete.current && !filtersChanged && !forceRefresh) {
      console.log('✅ Admin data already loaded, skipping fetch');
      return;
    }

    currentFilters.current = { searchQuery, statusFilter, lockFilter, branchFilter };

    if (!forceRefresh) {
      const cachedData = getCachedData();
      if (cachedData && 
          cachedData.filters && 
          cachedData.filters.searchQuery === searchQuery &&
          cachedData.filters.statusFilter === statusFilter &&
          cachedData.filters.lockFilter === lockFilter &&
          cachedData.filters.branchFilter === branchFilter) {
        console.log('📦 Loading admin data from cache');
        if (isMounted.current) {
          setAdmins(cachedData.admins);
          setPagination(cachedData.pagination);
          setLoading(false);
          initialLoadComplete.current = true;
          
          if (backgroundRefreshTimeout.current) {
            clearTimeout(backgroundRefreshTimeout.current);
          }
          backgroundRefreshTimeout.current = setTimeout(() => {
            if (isMounted.current && !fetchInProgress.current) {
              console.log('🔄 Background refresh: fetching fresh data');
              loadAdmins(pagination.page, true, true);
            }
          }, 5000);
          return;
        }
      }
    }

    fetchInProgress.current = true;
    if (!silent) {
      setLoading(true);
    }
    
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pagination.limit),
      });
      
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (lockFilter !== '') params.set('locked', lockFilter);
      if (branchFilter) params.set('branch_id', branchFilter);

      const res = await fetch(`${API_BASE}/admins?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load admins');
      
      if (isMounted.current) {
        setAdmins(json.data);
        setPagination(json.pagination);
        initialLoadComplete.current = true;
        
        setCachedData({
          admins: json.data,
          pagination: json.pagination,
          filters: { searchQuery, statusFilter, lockFilter, branchFilter }
        });
        
        if (backgroundRefreshTimeout.current) {
          clearTimeout(backgroundRefreshTimeout.current);
          backgroundRefreshTimeout.current = null;
        }
      }
    } catch (err) {
      if (isMounted.current) {
        const cachedData = getCachedData();
        if (cachedData && cachedData.admins) {
          console.log('📦 Loading cached data as fallback');
          setAdmins(cachedData.admins);
          setPagination(cachedData.pagination);
          if (!silent && !cachedData.admins.length) {
            showErrorAlert(err.message, 'Failed to load admins');
          }
        } else if (!silent) {
          showErrorAlert(err.message, 'Failed to load admins');
        }
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
      fetchInProgress.current = false;
    }
  }, [searchQuery, statusFilter, lockFilter, branchFilter, pagination.limit]);

  // Initial load
  useEffect(() => {
    const initialize = async () => {
      await loadBranches();
      await loadAllEmployeeIds();
      
      const cachedData = getCachedData();
      if (cachedData && cachedData.admins) {
        console.log('📦 Loading cached data on mount');
        setAdmins(cachedData.admins);
        setPagination(cachedData.pagination);
        setLoading(false);
        initialLoadComplete.current = true;
        currentFilters.current = cachedData.filters || { searchQuery: '', statusFilter: '', lockFilter: '', branchFilter: '' };
        
        setTimeout(() => {
          if (isMounted.current && !fetchInProgress.current) {
            console.log('🔄 Initial background refresh');
            loadAdmins(1, true, true);
          }
        }, 1000);
      } else {
        loadAdmins(1);
      }
    };

    initialize();

    return () => {
      isMounted.current = false;
      if (backgroundRefreshTimeout.current) {
        clearTimeout(backgroundRefreshTimeout.current);
      }
    };
  }, []);

  // Load admins when filters change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (initialLoadComplete.current) {
        loadAdmins(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, statusFilter, lockFilter, branchFilter]);

  // ============================================
  // AUTO-GENERATE EMPLOYEE ID
  // ============================================

  useEffect(() => {
    if (formData.branch_id) {
      generateEmployeeIdForBranch(formData.branch_id);
    } else {
      setGeneratedId('');
    }
  }, [formData.branch_id, allEmployeeIds]);

  const generateEmployeeIdForBranch = (branchId) => {
    const branch = branches.find(b => b.id === branchId);
    if (!branch) {
      setGeneratedId('');
      return;
    }

    setGeneratingId(true);
    
    if (allEmployeeIds.length === 0) {
      loadAllEmployeeIds();
    }
    
    const newId = generateEmployeeId(branch.name, allEmployeeIds);
    console.log('🎯 Generated ID for branch:', branch.name, '->', newId);
    
    setGeneratedId(newId);
    setFormData(prev => ({ ...prev, employee_id: newId }));
    setGeneratingId(false);
  };

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  const handleCreate = async (e) => {
    e.preventDefault();

    if (!formData.first_name.trim()) {
      showErrorAlert('First name is required.', 'Validation Error');
      return;
    }

    if (!formData.last_name.trim()) {
      showErrorAlert('Last name is required.', 'Validation Error');
      return;
    }

    if (!formData.email.trim()) {
      showErrorAlert('Email address is required.', 'Validation Error');
      return;
    }

    if (!formData.branch_id) {
      showErrorAlert('Branch is required. Admin must be assigned to a branch.', 'Validation Error');
      return;
    }

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
      setGeneratedId('');
      
      localStorage.removeItem(CACHE_KEY);
      initialLoadComplete.current = false;
      await loadAdmins(1, true);
      await loadAllEmployeeIds();

      Swal.fire({
        title: 'Admin Created!',
        html: `The admin account was created.<br/><br/><b>Employee ID:</b><br/><code style="font-size:16px;background:#f0f0f0;padding:8px 12px;border-radius:4px;display:inline-block;">${json.data.employee_id}</code><br/><br/><b>Temporary password:</b><br/><code style="font-size:16px;background:#f0f0f0;padding:8px 12px;border-radius:4px;display:inline-block;">${json.tempPassword}</code><br/><br/>⚠️ Share these credentials securely — they will not be shown again.`,
        icon: 'success',
        confirmButtonColor: 'var(--color-primary)',
        background: 'var(--color-bg-card)',
        color: 'var(--color-text-primary)',
      });
    } catch (err) {
      showErrorAlert(err.message, 'Failed to create admin account');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();

    if (!formData.first_name.trim()) {
      showErrorAlert('First name is required.', 'Validation Error');
      return;
    }

    if (!formData.last_name.trim()) {
      showErrorAlert('Last name is required.', 'Validation Error');
      return;
    }

    if (!formData.email.trim()) {
      showErrorAlert('Email address is required.', 'Validation Error');
      return;
    }

    if (!formData.branch_id) {
      showErrorAlert('Branch is required. Admin must be assigned to a branch.', 'Validation Error');
      return;
    }

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
      
      localStorage.removeItem(CACHE_KEY);
      initialLoadComplete.current = false;
      await loadAdmins(pagination.page, true);
      
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
      `Are you sure you want to delete ${admin.first_name} ${admin.last_name}? This action cannot be undone.`,
      'Yes, Delete'
    );
    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`${API_BASE}/admins/${admin.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to delete admin');
      
      localStorage.removeItem(CACHE_KEY);
      initialLoadComplete.current = false;
      await loadAdmins(pagination.page, true);
      await loadAllEmployeeIds();
      
      showSuccessAlert('Admin account deleted successfully!');
    } catch (err) {
      showErrorAlert(err.message, 'Failed to delete admin');
    }
  };

  // ============================================
  // ACCOUNT STATUS MANAGEMENT
  // ============================================

  const handleToggleStatus = async (admin) => {
    // ✅ Changed from "Inactive" to "Deactivated"
    const newStatus = admin.status === 'Active' ? 'Deactivated' : 'Active';
    const result = await showConfirmationAlert(
      `${newStatus} Admin Account`,
      `Are you sure you want to ${newStatus.toLowerCase()} ${admin.first_name} ${admin.last_name}?`,
      `Yes, ${newStatus}`
    );
    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`${API_BASE}/admins/${admin.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to update status');
      
      localStorage.removeItem(CACHE_KEY);
      initialLoadComplete.current = false;
      await loadAdmins(pagination.page, true);
      
      showSuccessAlert(`Account ${newStatus.toLowerCase()}d successfully!`);
    } catch (err) {
      showErrorAlert(err.message, 'Failed to update status');
    }
  };

  const handleLockAccount = async (admin) => {
    if (admin.locked) {
      const result = await showConfirmationAlert(
        'Unlock Account',
        `Are you sure you want to unlock ${admin.first_name} ${admin.last_name}'s account?`,
        'Yes, Unlock'
      );
      if (!result.isConfirmed) return;

      try {
        const res = await fetch(`${API_BASE}/admins/${admin.id}/unlock`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to unlock account');
        
        localStorage.removeItem(CACHE_KEY);
        initialLoadComplete.current = false;
        await loadAdmins(pagination.page, true);
        
        showSuccessAlert('Account unlocked successfully!');
      } catch (err) {
        showErrorAlert(err.message, 'Failed to unlock account');
      }
    } else {
      const result = await showConfirmationAlert(
        'Lock Account',
        `Are you sure you want to lock ${admin.first_name} ${admin.last_name}'s account? They will not be able to login.`,
        'Yes, Lock'
      );
      if (!result.isConfirmed) return;

      try {
        const res = await fetch(`${API_BASE}/admins/${admin.id}/lock`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to lock account');
        
        localStorage.removeItem(CACHE_KEY);
        initialLoadComplete.current = false;
        await loadAdmins(pagination.page, true);
        
        showSuccessAlert('Account locked successfully!');
      } catch (err) {
        showErrorAlert(err.message, 'Failed to lock account');
      }
    }
  };

  // ============================================
  // MODAL HELPERS
  // ============================================

  const openEditModal = (admin) => {
    setSelectedAdmin(admin);
    setFormData({
      employee_id: admin.employee_id || '',
      first_name: admin.first_name || '',
      middle_name: admin.middle_name || '',
      last_name: admin.last_name || '',
      email: admin.email || '',
      contact_number: admin.contact_number || '',
      join_date: admin.join_date || '',
      branch_id: admin.branch?.id || admin.branch_id || '',
    });
    setGeneratedId(admin.employee_id || '');
    setShowEditModal(true);
  };

  const goToPage = (page) => {
    if (page < 1 || page > pagination.totalPages) return;
    loadAdmins(page);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setLockFilter('');
    setBranchFilter('');
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Admin Management</h1>
          <p style={styles.subtitle}>Create, manage, and monitor admin accounts across all branches</p>
        </div>
      </div>

      <div style={styles.controls}>
        <div style={styles.searchWrapper}>
          <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search by name, employee ID, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        {/* ✅ Changed from "Inactive" to "Deactivated" */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Deactivated">Deactivated</option>
        </select>

        <select
          value={lockFilter}
          onChange={(e) => setLockFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All Lock States</option>
          <option value="true">Locked</option>
          <option value="false">Unlocked</option>
        </select>

        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All Branches</option>
          {branches.map(b => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        {(searchQuery || statusFilter || lockFilter || branchFilter) && (
          <button onClick={clearFilters} style={styles.clearFiltersBtn}>
            ✕ Clear Filters
          </button>
        )}

        <button
          onClick={() => { setFormData(emptyForm); setGeneratedId(''); setShowCreateModal(true); }}
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
              <th style={styles.tableHeaderCell}>Role</th>
              <th style={styles.tableHeaderCell}>Branch</th>
              <th style={styles.tableHeaderCell}>Status</th>
              <th style={styles.tableHeaderCell}>Locked</th>
              <th style={styles.tableHeaderCell}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={styles.emptyCell}>Loading...</td></tr>
            ) : admins.length === 0 ? (
              <tr>
                <td colSpan="8" style={styles.emptyCell}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '20px 0' }}>
                    <span style={{ fontSize: '28px' }}>🔍</span>
                    <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-text-primary)' }}>No accounts found</span>
                    <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                      {searchQuery || statusFilter || lockFilter || branchFilter 
                        ? 'Try adjusting your search or filters' 
                        : 'No admin accounts have been created yet'}
                    </span>
                    {(searchQuery || statusFilter || lockFilter || branchFilter) && (
                      <button onClick={clearFilters} style={styles.clearFiltersSmallBtn}>
                        Clear all filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              admins.map(admin => (
                <tr key={admin.id} style={styles.tableRow}>
                  <td style={styles.tableCell}>
                    <span style={styles.employeeIdBadge}>{admin.employee_id}</span>
                  </td>
                  <td style={styles.tableCell}>
                    <span style={styles.fullName}>
                      {admin.first_name} {admin.middle_name ? `${admin.middle_name} ` : ''}{admin.last_name}
                    </span>
                  </td>
                  <td style={styles.tableCell}>{admin.email}</td>
                  <td style={styles.tableCell}>
                    <span style={{
                      ...styles.roleBadge,
                      backgroundColor: admin.role === 'Super Admin' ? 'rgba(239, 68, 68, 0.15)' : 
                                      admin.role === 'Admin' ? 'rgba(245, 158, 11, 0.15)' :
                                      admin.role === 'Human Resources' ? 'rgba(139, 92, 246, 0.15)' :
                                      admin.role === 'Project Manager' ? 'rgba(59, 130, 246, 0.15)' :
                                      admin.role === 'Resource Manager' ? 'rgba(16, 185, 129, 0.15)' :
                                      'rgba(107, 114, 128, 0.15)',
                      color: admin.role === 'Super Admin' ? '#ef4444' : 
                             admin.role === 'Admin' ? '#f59e0b' :
                             admin.role === 'Human Resources' ? '#8b5cf6' :
                             admin.role === 'Project Manager' ? '#3b82f6' :
                             admin.role === 'Resource Manager' ? '#22c55e' :
                             '#6b7280',
                    }}>
                      {admin.role || 'Employee'}
                    </span>
                  </td>
                  <td style={styles.tableCell}>
                    <span style={styles.branchBadge}>
                      {admin.branch?.name || '—'}
                    </span>
                    {admin.branch?.location && (
                      <span style={styles.branchLocation}>
                        {admin.branch.location}
                      </span>
                    )}
                  </td>
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
                    <span style={{
                      ...styles.lockBadge,
                      backgroundColor: admin.locked ? 'rgba(234, 179, 8, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                      color: admin.locked ? '#eab308' : '#22c55e',
                    }}>
                      {admin.locked ? '🔒 Locked' : '🔓 Unlocked'}
                    </span>
                    {admin.failed_attempts > 0 && (
                      <span style={styles.failedAttempts}>
                        ({admin.failed_attempts} failed)
                      </span>
                    )}
                  </td>
                  <td style={styles.tableCell}>
                    <div style={styles.actionButtons}>
                      <button
                        onClick={() => openEditModal(admin)}
                        style={styles.editBtn}
                        title="Edit Admin"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>

                      <button
                        onClick={() => handleToggleStatus(admin)}
                        style={styles.statusToggleBtn}
                        title={admin.status === 'Active' ? 'Deactivate' : 'Activate'}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                      </button>

                      <button
                        onClick={() => handleLockAccount(admin)}
                        style={admin.locked ? styles.unlockBtn : styles.lockBtn}
                        title={admin.locked ? 'Unlock Account' : 'Lock Account'}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          {admin.locked ? (
                            <path d="M8 11V7a4 4 0 0 1 8 0v4M4 11v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z"></path>
                          ) : (
                            <>
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </>
                          )}
                        </svg>
                      </button>

                      <button
                        onClick={() => handleDelete(admin)}
                        style={styles.deleteBtn}
                        title="Delete Admin"
                      >
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
            <span style={styles.pageInfo}>
              Page {pagination.page} of {pagination.totalPages}
              <span style={styles.pageTotal}>
                ({pagination.total} total admins)
              </span>
            </span>
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

      {/* ============================================ */}
      {/* CREATE MODAL */}
      {/* ============================================ */}
      {showCreateModal && (
        <div style={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={styles.modalTitle}>Create Admin Account</h2>
                <p style={styles.modalSubtitle}>Assign a new branch administrator</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} style={styles.closeBtn}>×</button>
            </div>

            <form onSubmit={handleCreate} style={styles.modalForm}>
              <div style={styles.formSection}>
                <h4 style={styles.sectionTitle}>Required Information</h4>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>
                    Branch <span style={styles.required}>*</span>
                  </label>
                  <select
                    required
                    value={formData.branch_id}
                    onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                    style={styles.formInput}
                  >
                    <option value="">Select Branch</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} {b.location ? `(${b.location})` : ''}
                      </option>
                    ))}
                  </select>
                  <span style={styles.helperText}>
                    This admin will be the manager of this branch
                  </span>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>
                    Employee ID <span style={styles.required}>*</span>
                  </label>
                  <div style={styles.idPreviewContainer}>
                    <input
                      type="text"
                      required
                      value={generatedId}
                      readOnly
                      style={{
                        ...styles.formInput,
                        backgroundColor: 'var(--color-bg-card-hover)',
                        cursor: 'not-allowed',
                        fontFamily: 'monospace',
                        fontWeight: '600',
                        color: 'var(--color-primary)',
                      }}
                    />
                    {generatingId && <span style={styles.loadingDot}>⏳</span>}
                  </div>
                  <span style={styles.helperText}>
                    Auto-generated based on branch
                  </span>
                </div>

                <div style={styles.formRow}>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>
                      First Name <span style={styles.required}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      style={styles.formInput}
                    />
                  </div>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>Middle Name</label>
                    <input
                      type="text"
                      value={formData.middle_name}
                      onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
                      style={styles.formInput}
                    />
                  </div>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>
                      Last Name <span style={styles.required}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      style={styles.formInput}
                    />
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>
                    Email <span style={styles.required}>*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={styles.formInput}
                    placeholder="admin@company.com"
                  />
                </div>
              </div>

              <hr style={styles.divider} />

              <div style={styles.formSection}>
                <h4 style={styles.sectionTitle}>Optional Information</h4>

                <div style={styles.formRow}>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>Contact Number</label>
                    <input
                      type="text"
                      value={formData.contact_number}
                      onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                      style={styles.formInput}
                      placeholder="e.g., 09123456789"
                    />
                  </div>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>Join Date</label>
                    <input
                      type="date"
                      value={formData.join_date}
                      onChange={(e) => setFormData({ ...formData, join_date: e.target.value })}
                      style={styles.formInput}
                    />
                  </div>
                </div>
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowCreateModal(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} style={styles.submitBtn}>
                  {submitting ? 'Creating...' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* EDIT MODAL */}
      {/* ============================================ */}
      {showEditModal && (
        <div style={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={styles.modalTitle}>Edit Admin Account</h2>
                <p style={styles.modalSubtitle}>Update {selectedAdmin?.first_name} {selectedAdmin?.last_name}'s information</p>
              </div>
              <button onClick={() => setShowEditModal(false)} style={styles.closeBtn}>×</button>
            </div>

            <form onSubmit={handleEdit} style={styles.modalForm}>
              <div style={styles.formSection}>
                <h4 style={styles.sectionTitle}>Required Information</h4>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>
                    Employee ID <span style={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled
                    value={generatedId}
                    style={{
                      ...styles.formInput,
                      opacity: 0.6,
                      cursor: 'not-allowed',
                      fontFamily: 'monospace',
                      fontWeight: '600',
                    }}
                  />
                  <span style={styles.helperText}>Employee ID cannot be changed</span>
                </div>

                <div style={styles.formRow}>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>
                      First Name <span style={styles.required}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      style={styles.formInput}
                    />
                  </div>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>Middle Name</label>
                    <input
                      type="text"
                      value={formData.middle_name}
                      onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
                      style={styles.formInput}
                    />
                  </div>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>
                      Last Name <span style={styles.required}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      style={styles.formInput}
                    />
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>
                    Email <span style={styles.required}>*</span>
                  </label>
                  <input
                    type="email"
                    required
                    disabled
                    value={formData.email}
                    style={{
                      ...styles.formInput,
                      opacity: 0.6,
                      cursor: 'not-allowed',
                    }}
                  />
                  <span style={styles.helperText}>Email cannot be changed</span>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>
                    Branch <span style={styles.required}>*</span>
                  </label>
                  <select
                    required
                    value={formData.branch_id}
                    onChange={(e) => {
                      const newBranchId = e.target.value;
                      setFormData({ ...formData, branch_id: newBranchId });
                      const branch = branches.find(b => b.id === newBranchId);
                      if (branch) {
                        const newId = generateEmployeeId(branch.name, allEmployeeIds);
                        setGeneratedId(newId);
                      }
                    }}
                    style={styles.formInput}
                  >
                    <option value="">Select Branch</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} {b.location ? `(${b.location})` : ''}
                      </option>
                    ))}
                  </select>
                  <span style={styles.helperText}>
                    Changing branch will update this admin's branch assignment
                  </span>
                </div>
              </div>

              <hr style={styles.divider} />

              <div style={styles.formSection}>
                <h4 style={styles.sectionTitle}>Optional Information</h4>

                <div style={styles.formRow}>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>Contact Number</label>
                    <input
                      type="text"
                      value={formData.contact_number}
                      onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                      style={styles.formInput}
                      placeholder="e.g., 09123456789"
                    />
                  </div>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.formLabel}>Join Date</label>
                    <input
                      type="date"
                      value={formData.join_date}
                      onChange={(e) => setFormData({ ...formData, join_date: e.target.value })}
                      style={styles.formInput}
                    />
                  </div>
                </div>
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowEditModal(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
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

// ============================================
// STYLES
// ============================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '12px',
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
    flexWrap: 'wrap',
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
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    minWidth: '140px',
  },
  clearFiltersBtn: {
    padding: '8px 16px',
    background: 'transparent',
    border: '1px solid var(--color-danger)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-danger)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  clearFiltersSmallBtn: {
    padding: '6px 14px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text-secondary)',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  createBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 20px',
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginLeft: 'auto',
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
    fontSize: '11px',
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
    verticalAlign: 'middle',
  },

  employeeIdBadge: {
    display: 'inline-block',
    padding: '4px 10px',
    background: 'rgba(99, 102, 241, 0.1)',
    color: '#6366f1',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  fullName: {
    fontWeight: '600',
    fontSize: '14px',
  },
  roleBadge: {
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
    display: 'inline-block',
  },
  branchBadge: {
    display: 'inline-block',
    padding: '2px 10px',
    background: 'rgba(59, 130, 246, 0.1)',
    color: '#3b82f6',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
  },
  branchLocation: {
    display: 'block',
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    marginTop: '2px',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: '600',
    display: 'inline-block',
  },
  lockBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: '600',
    display: 'inline-block',
  },
  failedAttempts: {
    display: 'block',
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    marginTop: '2px',
  },

  actionButtons: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
  },
  editBtn: {
    padding: '6px 8px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  statusToggleBtn: {
    padding: '6px 8px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: '#3b82f6',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  lockBtn: {
    padding: '6px 8px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: '#eab308',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  unlockBtn: {
    padding: '6px 8px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: '#22c55e',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  deleteBtn: {
    padding: '6px 8px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-danger)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  emptyCell: {
    padding: '48px 32px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '14px',
  },

  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    padding: '16px',
    borderTop: '1px solid var(--color-border)',
  },
  pageBtn: {
    padding: '6px 14px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    fontSize: '13px',
  },
  pageInfo: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
  },
  pageTotal: {
    marginLeft: '8px',
    color: 'var(--color-text-muted)',
    fontSize: '12px',
  },

  // Modal Styles
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
    backdropFilter: 'blur(4px)',
  },
  modal: {
    background: 'var(--color-bg-card)',
    borderRadius: 'var(--radius-md)',
    width: '100%',
    maxWidth: '600px',
    maxHeight: '90vh',
    overflowY: 'auto',
    border: '1px solid var(--color-border)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '20px 24px',
    borderBottom: '1px solid var(--color-border)',
    position: 'sticky',
    top: 0,
    background: 'var(--color-bg-card)',
    zIndex: 1,
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  modalSubtitle: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    margin: '4px 0 0 0',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '28px',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: 0,
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-sm)',
    transition: 'all 0.2s',
  },

  modalForm: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    margin: '0 0 4px 0',
  },
  formRow: {
    display: 'flex',
    gap: '12px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  formLabel: {
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--color-text-primary)',
  },
  required: {
    color: 'var(--color-danger)',
  },
  formInput: {
    padding: '10px 12px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '14px',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    outline: 'none',
    transition: 'border-color 0.2s',
    width: '100%',
  },
  helperText: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    marginTop: '2px',
  },
  divider: {
    border: 'none',
    borderTop: '1px solid var(--color-border)',
    margin: '0',
  },

  idPreviewContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  loadingDot: {
    position: 'absolute',
    right: '12px',
    fontSize: '14px',
  },

  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    paddingTop: '8px',
    borderTop: '1px solid var(--color-border)',
    marginTop: '4px',
  },
  cancelBtn: {
    padding: '10px 24px',
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
    padding: '10px 24px',
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