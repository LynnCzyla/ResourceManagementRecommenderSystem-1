import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import hrClient from './Hrclient';

// Maps a job_postings row (with joined departments/positions) coming back from the
// API into the flat shape this component's UI was built around.
const mapPosting = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description || '',
  department: row.departments?.department_name || row.department || '',
  department_id: row.department_id || null,
  position_id: row.position_id || null,
  location: row.location || '',
  employmentType: row.employment_type || 'Full-time',
  salaryMin: row.salary_min ?? '',
  salaryMax: row.salary_max ?? '',
  status: row.status || 'Active',
  applications: row.applications || 0,
  quantity: row.quantity || 1,
  hiredCount: row.hired_count || 0,
  postedDate: row.posted_date,
  closingDate: row.closing_date || '',
  sourceRequestId: row.source_request_id || null,
  sourceRequestTitle: row.source_request_title || row.hr_resource_requests?.request_title || null,
  sourcePositionTitle: row.source_position_title || row.hr_resource_requests?.position_title || null,
  sourceRequesterName: row.source_requester_name || null,
  requirements: row.requirements || '',
  responsibilities: row.responsibilities || '',
  benefits: row.benefits || '',
});

const mapResourceRequest = (row) => ({
  id: row.id,
  requestTitle: row.request_title,
  departmentName: row.department_name,
  positionTitle: row.position_title,
  quantity: row.quantity_needed,
  requiredSkills: row.required_skills || '',
  experienceLevel: row.experience_level || '',
  reason: row.reason || '',
  requestedBy: row.requester
    ? `${row.requester.first_name || ''} ${row.requester.last_name || ''}`.trim()
    : '—',
  alreadyPosted: !!row.already_posted,
});

const emptyForm = {
  title: '',
  description: '',
  department_id: '',
  location: '',
  employmentType: 'Full-time',
  salaryMin: '',
  salaryMax: '',
  requirements: '',
  responsibilities: '',
  benefits: '',
  status: 'Active',
  closingDate: '',
  sourceRequestId: '',
  quantity: 1,
};

export default function HRJobPostingsTab() {
  const [jobPostings, setJobPostings] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [resourceRequests, setResourceRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPosting, setSelectedPosting] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [userBranch, setUserBranch] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    loadJobPostings();
    loadDepartments();
    loadResourceRequests();
    fetchUserBranch();

    const handleUpdate = () => {
      loadResourceRequests();
      loadJobPostings();
    };
    window.addEventListener('resourceRequestsUpdated', handleUpdate);
    return () => window.removeEventListener('resourceRequestsUpdated', handleUpdate);
  }, []);

  // ✅ Fetch user's branch from my-branch endpoint
  const fetchUserBranch = async () => {
    try {
      console.log('🔍 Fetching user branch from /branches/my-branch...');
      const res = await hrClient.get('/branches/my-branch');
      console.log('📋 Branch response:', res.data);
      
      if (res.data?.success && res.data.data) {
        const branch = res.data.data;
        setUserBranch(branch);
        
        // Auto-fill location
        const locationValue = branch.location || branch.name || '';
        console.log('📍 Setting location to:', locationValue);
        
        setFormData(prev => ({
          ...prev,
          location: locationValue
        }));
      } else {
        console.warn('⚠️ No branch data received:', res.data);
      }
    } catch (err) {
      console.error('❌ Failed to fetch user branch:', err);
      if (err.response?.data?.error === 'User has no branch assigned') {
        console.warn('⚠️ User has no branch assigned');
      }
    }
  };

  const loadJobPostings = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await hrClient.get(`/job-postings`);
      const rows = res.data?.data || [];
      setJobPostings(rows.map(mapPosting));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load job postings. Please check your connection and try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const res = await hrClient.get('/departments');
      const data = res.data;
      if (data.success) setDepartments(data.data || []);
    } catch (err) {
      console.error('Failed to load departments', err);
      try {
        const fallbackRes = await fetch('http://localhost:5000/api/hr/departments');
        const fallbackData = await fallbackRes.json();
        if (fallbackData.success) setDepartments(fallbackData.data || []);
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr);
      }
    }
  };

  const loadResourceRequests = async () => {
    try {
      const res = await hrClient.get('/job-postings/resource-requests');
      const rows = res.data?.data || [];
      setResourceRequests(rows.map(mapResourceRequest));
    } catch (err) {
      console.error('Failed to load approved resource requests', err);
    }
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

  const handleSelectResourceRequest = (requestId) => {
    if (!requestId) {
      setFormData((prev) => ({ 
        ...prev, 
        sourceRequestId: '',
        location: userBranch?.location || userBranch?.name || prev.location 
      }));
      return;
    }

    const req = resourceRequests.find((r) => String(r.id) === String(requestId));
    if (!req) return;

    const matchedDept = departments.find(
      (d) => d.department_name?.toLowerCase().trim() === req.departmentName?.toLowerCase().trim()
    );

    setFormData((prev) => ({
      ...prev,
      sourceRequestId: requestId,
      title: req.positionTitle || prev.title,
      department_id: matchedDept ? String(matchedDept.id) : prev.department_id,
      location: prev.location || userBranch?.location || userBranch?.name || '',
      quantity: req.quantity || 1,
      // SKILLS ONLY in requirements — do NOT include Experience Level!
      requirements: req.requiredSkills || prev.requirements,
      description: req.reason || req.requestTitle || prev.description,
    }));
  };

  const buildPayload = () => ({
    title: formData.title,
    description: formData.description,
    department_id: formData.department_id || null,
    position_id: selectedPosting?.position_id || null,
    location: formData.location,
    employment_type: formData.employmentType,
    salary_min: formData.salaryMin || null,
    salary_max: formData.salaryMax || null,
    requirements: formData.requirements,
    responsibilities: formData.responsibilities,
    benefits: formData.benefits,
    status: formData.status,
    closing_date: formData.closingDate || null,
    source_request_id: formData.sourceRequestId || null,
    quantity: formData.quantity || 1,
  });

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      await hrClient.post(`/job-postings`, buildPayload());
      window.dispatchEvent(new Event('resourceRequestsUpdated'));
      await loadJobPostings();
      await loadResourceRequests();
      setShowCreateModal(false);
      resetForm();
      showSuccessAlert('Job posting created successfully!');
    } catch (err) {
      showErrorAlert(err.response?.data?.error || 'Failed to create job posting');
      console.error(err);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const result = await showConfirmationAlert(
        'Confirm Changes',
        'Are you sure you want to update this job posting?',
        'Yes, Save Changes'
      );
      if (!result.isConfirmed) return;

      await hrClient.put(`/job-postings/${selectedPosting.id}`, buildPayload());
      await loadJobPostings();
      await loadResourceRequests();
      setShowEditModal(false);
      resetForm();
      showSuccessAlert('Job posting updated successfully!');
    } catch (err) {
      showErrorAlert(err.response?.data?.error || 'Failed to update job posting');
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    const result = await showConfirmationAlert(
      'Delete Job Posting',
      'Are you sure you want to delete this job posting? This action cannot be undone.',
      'Yes, Delete'
    );
    if (!result.isConfirmed) return;

    try {
      await hrClient.delete(`/job-postings/${id}`);
      setJobPostings(jobPostings.filter(p => p.id !== id));
      loadResourceRequests();
      showSuccessAlert('Job posting deleted successfully!');
    } catch (err) {
      showErrorAlert(err.response?.data?.error || 'Failed to delete job posting');
      console.error(err);
    }
  };

  const openEditModal = (posting) => {
    setSelectedPosting(posting);
    setFormData({
      title: posting.title,
      description: posting.description || '',
      department_id: posting.department_id || '',
      location: posting.location || userBranch?.location || userBranch?.name || '',
      employmentType: posting.employmentType,
      salaryMin: posting.salaryMin,
      salaryMax: posting.salaryMax,
      requirements: posting.requirements || '',
      responsibilities: posting.responsibilities || '',
      benefits: posting.benefits || '',
      status: posting.status,
      closingDate: posting.closingDate || '',
      sourceRequestId: posting.sourceRequestId ? String(posting.sourceRequestId) : '',
      quantity: posting.quantity || 1,
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      ...emptyForm,
      location: userBranch?.location || userBranch?.name || '',
    });
    setSelectedPosting(null);
  };

  // ✅ Open create modal with auto-filled location
  const openCreateModal = () => {
    console.log('📋 Opening create modal, userBranch:', userBranch);
    
    // Reset form first
    setFormData({
      ...emptyForm,
      location: userBranch?.location || userBranch?.name || '',
    });
    
    // If location is still empty, try to get from localStorage user
    const locationValue = userBranch?.location || userBranch?.name || '';
    if (locationValue) {
      setFormData(prev => ({
        ...prev,
        location: locationValue
      }));
      console.log('📍 Location auto-filled:', locationValue);
    } else {
      console.warn('⚠️ No location available from branch');
    }
    
    setShowCreateModal(true);
  };

  const filteredPostings = jobPostings.filter((posting) => {
    const matchesSearch = 
      posting.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      posting.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      posting.location?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' || posting.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const availableRequests = resourceRequests.filter((r) => !r.alreadyPosted);

  const renderResourceRequestField = () => (
    <div style={styles.formGroup}>
      <label style={styles.formLabel}>
        Create From Resource Request (optional)
        {availableRequests.length > 0 && (
          <span style={{
            marginLeft: '8px',
            backgroundColor: 'rgba(56, 189, 248, 0.15)',
            color: '#38bdf8',
            fontSize: '11px',
            fontWeight: '700',
            borderRadius: '10px',
            padding: '2px 8px'
          }}>
            {availableRequests.length} available
          </span>
        )}
      </label>
      <select
        value={formData.sourceRequestId}
        onChange={(e) => handleSelectResourceRequest(e.target.value)}
        style={styles.formInput}
      >
        <option value="">— None, start blank —</option>
        {availableRequests.map((r) => (
          <option key={r.id} value={r.id}>
            {r.positionTitle || r.requestTitle} ({r.quantity || 1}x) • {r.departmentName || ''}
          </option>
        ))}
        {availableRequests.length === 0 && (
          <option value="" disabled>— No unposted approved requests available —</option>
        )}
      </select>
      <span style={styles.fieldHint}>
        Selecting a request only prefills the fields below — everything stays editable.
      </span>
    </div>
  );

  const renderFormFields = () => (
    <>
      {renderResourceRequestField()}

      <div style={styles.formRow}>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Position Title *</label>
          <input
            type="text"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            style={styles.formInput}
          />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Quantity / Vacancies Needed *</label>
          <input
            type="number"
            min="1"
            required
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            style={styles.formInput}
            placeholder="e.g. 1"
          />
        </div>
      </div>
      <div style={styles.formRow}>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Department *</label>
          <select
            required
            value={formData.department_id}
            onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
            style={styles.formInput}
          >
            <option value="">Select Department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.department_name}</option>
            ))}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Location *</label>
          <input
            type="text"
            required
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            style={styles.formInput}
            placeholder="Auto-filled from your branch"
          />
          {!formData.location && (
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
              Location will be auto-filled from your branch
            </span>
          )}
        </div>
      </div>
      <div style={styles.formRow}>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Employment Type *</label>
          <select
            required
            value={formData.employmentType}
            onChange={(e) => setFormData({ ...formData, employmentType: e.target.value })}
            style={styles.formInput}
          >
            <option value="Full-time">Full-time</option>
            <option value="Part-time">Part-time</option>
            <option value="Contract">Contract</option>
            <option value="Remote">Remote</option>
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Status</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            style={styles.formInput}
          >
            <option value="Active">Active</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
      </div>
      <div style={styles.formRow}>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Min Salary (₱)</label>
          <input
            type="number"
            value={formData.salaryMin}
            onChange={(e) => setFormData({ ...formData, salaryMin: e.target.value })}
            style={styles.formInput}
          />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Max Salary (₱)</label>
          <input
            type="number"
            value={formData.salaryMax}
            onChange={(e) => setFormData({ ...formData, salaryMax: e.target.value })}
            style={styles.formInput}
          />
        </div>
      </div>
      <div style={styles.formRow}>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Posting End Date</label>
          <input
            type="date"
            value={formData.closingDate}
            onChange={(e) => setFormData({ ...formData, closingDate: e.target.value })}
            style={styles.formInput}
          />
          <span style={styles.fieldHint}>The posting closes automatically after this date.</span>
        </div>
        <div style={styles.formGroup} />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          style={styles.formTextarea}
          rows={3}
        />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Requirements</label>
        <textarea
          value={formData.requirements}
          onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
          style={styles.formTextarea}
          rows={3}
        />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Responsibilities</label>
        <textarea
          value={formData.responsibilities}
          onChange={(e) => setFormData({ ...formData, responsibilities: e.target.value })}
          style={styles.formTextarea}
          rows={3}
        />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Benefits</label>
        <textarea
          value={formData.benefits}
          onChange={(e) => setFormData({ ...formData, benefits: e.target.value })}
          style={styles.formTextarea}
          rows={3}
        />
      </div>
    </>
  );

  if (loading) {
    return <div style={styles.loading}>Loading job postings...</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Job Postings</h1>
        <p style={styles.subtitle}>Manage job postings and track applications</p>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <span>{error}</span>
          <button onClick={loadJobPostings} style={styles.retryBtn}>Retry</button>
        </div>
      )}

      <div className="glass-card" style={styles.card}>
        <div style={styles.toolbar}>
          <div style={styles.searchWrapper}>
            <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search job postings..."
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
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Closed">Closed</option>
          </select>
          <button onClick={openCreateModal} style={styles.createBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Create Job Posting
            {availableRequests.length > 0 && (
              <span style={{
                marginLeft: '8px',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: '700',
                borderRadius: '10px',
                padding: '2px 7px',
                lineHeight: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}>
                {availableRequests.length}
              </span>
            )}
          </button>
        </div>

        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>Position Title</th>
                <th style={styles.th}>Department</th>
                <th style={styles.th}>Location</th>
                <th style={styles.th}>Vacancies</th>
                <th style={styles.th}>Employment Type</th>
                <th style={styles.th}>Salary Range</th>
                <th style={styles.th}>Applications</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Posted Date</th>
                <th style={styles.th}>End Date</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPostings.length === 0 ? (
                <tr><td colSpan="11" style={styles.emptyRow}>No job postings found.</td></tr>
              ) : (
                filteredPostings.map((posting) => {
                  const isFilled = (posting.hiredCount || 0) >= (posting.quantity || 1);
                  return (
                    <tr key={posting.id} style={styles.tableRow}>
                      <td style={styles.td}>
                        <div style={{ fontWeight: '600', color: 'var(--color-text-primary)', fontSize: '14px' }}>
                          {posting.title}
                        </div>
                        {posting.sourceRequestId ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                            <span style={{
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: '700',
                              backgroundColor: 'rgba(56, 189, 248, 0.15)',
                              color: '#38bdf8',
                              whiteSpace: 'nowrap'
                            }}>
                              RM Request
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }} title="Request Title created by RM">
                              {posting.sourceRequestTitle || posting.sourcePositionTitle || `Req #${posting.sourceRequestId}`}
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                            <span style={{
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: '600',
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                              color: 'var(--color-text-muted)',
                              whiteSpace: 'nowrap'
                            }}>
                              HR Direct Post
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={styles.td}>{posting.department}</td>
                      <td style={styles.td}>{posting.location}</td>
                      <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                        <span style={{
                          ...styles.badge,
                          backgroundColor: isFilled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                          color: isFilled ? '#22c55e' : '#38bdf8',
                          border: isFilled ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          whiteSpace: 'nowrap',
                          padding: '5px 12px',
                        }}>
                          {posting.hiredCount || 0} / {posting.quantity || 1} {isFilled ? 'Filled' : 'Needed'}
                        </span>
                      </td>
                      <td style={styles.td}>{posting.employmentType}</td>
                      <td style={styles.td}>₱{parseInt(posting.salaryMin || 0).toLocaleString()} - ₱{parseInt(posting.salaryMax || 0).toLocaleString()}</td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.badge,
                          backgroundColor: 'var(--color-primary-light)',
                          color: 'var(--color-primary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          whiteSpace: 'nowrap',
                        }}>
                          {posting.applications}
                        </span>
                      </td>
                      <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                        <span style={{
                          ...styles.statusBadge,
                          backgroundColor: posting.status === 'Active' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: posting.status === 'Active' ? '#22c55e' : '#ef4444',
                          border: posting.status === 'Active' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          whiteSpace: 'nowrap',
                          padding: '5px 12px',
                        }}>
                          {posting.status} {isFilled && posting.status === 'Closed' ? '(Filled)' : ''}
                        </span>
                      </td>
                      <td style={styles.td}>{posting.postedDate ? new Date(posting.postedDate).toLocaleDateString() : '—'}</td>
                      <td style={styles.td}>{posting.closingDate ? new Date(posting.closingDate).toLocaleDateString() : '—'}</td>
                      <td style={styles.td}>
                        <div style={styles.actionCell}>
                          <button onClick={() => openEditModal(posting)} style={styles.editBtn} title="Edit">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </button>
                          <button onClick={() => handleDelete(posting.id)} style={styles.deleteBtn} title="Delete">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Create Job Posting</h3>
              <button onClick={() => setShowCreateModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <form onSubmit={handleCreateSubmit} style={styles.modalBody}>
              {renderFormFields()}
              <div style={styles.modalFooter}>
                <button type="button" onClick={() => setShowCreateModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.submitBtn}>Create Posting</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Edit Job Posting</h3>
              <button onClick={() => setShowEditModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <form onSubmit={handleEditSubmit} style={styles.modalBody}>
              {renderFormFields()}
              <div style={styles.modalFooter}>
                <button type="button" onClick={() => setShowEditModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.submitBtn}>Save Changes</button>
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
    padding: '0',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    marginBottom: '16px',
    borderRadius: '8px',
    background: 'var(--color-danger-light)',
    color: 'var(--color-danger)',
    fontSize: '14px',
    fontWeight: '500',
  },
  retryBtn: {
    padding: '6px 14px',
    background: 'var(--color-danger)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '400px',
    fontSize: '16px',
    color: 'var(--color-text-secondary)',
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '8px',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '15px',
    color: 'var(--color-text-secondary)',
  },
  card: {
    padding: '24px',
  },
  toolbar: {
    display: 'flex',
    gap: '16px',
    marginBottom: '24px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  searchWrapper: {
    position: 'relative',
    flex: 1,
    minWidth: '250px',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--color-text-muted)',
  },
  searchInput: {
    width: '100%',
    padding: '10px 12px 10px 36px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  filterSelect: {
    padding: '10px 16px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
  },
  createBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 20px',
    backgroundColor: 'var(--color-primary)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  tableContainer: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeader: {
    borderBottom: '1px solid var(--color-border)',
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  tableRow: {
    borderBottom: '1px solid var(--color-border)',
  },
  td: {
    padding: '16px',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
  },
  emptyRow: {
    padding: '32px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '14px',
  },
  badge: {
    padding: '5px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    lineHeight: '1.4',
  },
  statusBadge: {
    padding: '5px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    lineHeight: '1.4',
  },
  actionCell: {
    display: 'flex',
    gap: '8px',
  },
  editBtn: {
    background: 'var(--color-accent-light)',
    color: 'var(--color-accent)',
    border: 'none',
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  deleteBtn: {
    background: 'var(--color-danger-light)',
    color: 'var(--color-danger)',
    border: 'none',
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
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
    zIndex: 1000,
  },
  modal: {
    width: '100%',
    maxWidth: '700px',
    maxHeight: '90vh',
    overflow: 'auto',
    padding: '28px',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid var(--color-border)',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: 'var(--color-text-muted)',
  },
  modalBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: 1,
  },
  formRow: {
    display: 'flex',
    gap: '16px',
  },
  formLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
  },
  fieldHint: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  formInput: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  formTextarea: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    resize: 'vertical',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '8px',
    paddingTop: '16px',
    borderTop: '1px solid var(--color-border)',
  },
  cancelBtn: {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  submitBtn: {
    padding: '10px 20px',
    backgroundColor: 'var(--color-primary)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};