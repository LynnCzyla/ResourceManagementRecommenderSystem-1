import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';

// ✅ Use the correct public applicant API endpoint
const API = 'http://localhost:5000/api/applicant';
const SUPER_ADMIN_API = 'http://localhost:5000/api/superadmin';

export default function ApplicantJobPostingsTab({ showMyApplications }) {
  const [jobPostings, setJobPostings] = useState([]);
  const [myApplications, setMyApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Branch filter
  const [branchFilter, setBranchFilter] = useState('All');
  const [branches, setBranches] = useState([]);

  const [selectedPosting, setSelectedPosting] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [applicantEmail, setApplicantEmail] = useState('');

  // ✅ Add state for max file size
  const [maxFileSize, setMaxFileSize] = useState(5);

  const [applyForm, setApplyForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    phone: '',
    location: '',
    experience: '',
    education: '',
    skills: '',
    coverLetter: '',
    resume: null,
  });

  // ✅ Fetch system settings for file size limit
  const fetchSystemSettings = async () => {
    try {
      const API_URL = 'http://localhost:5000/api/applicant/system-settings';
      console.log('📡 Fetching system settings from:', API_URL);
      
      const res = await fetch(API_URL);
      
      if (res.ok) {
        const data = await res.json();
        console.log('📡 System settings data:', data);
        
        if (data.success && data.data) {
          const size = data.data.max_file_upload_size || 5;
          console.log('✅ Setting max file size to:', size);
          setMaxFileSize(size);
        }
      }
    } catch (err) {
      console.error('❌ Failed to fetch system settings:', err);
      // Keep default 5MB
    }
  };

  // Fetch branches for filter
  const fetchBranches = async () => {
    try {
      // ✅ Use the correct superadmin endpoint
      const res = await fetch(`${SUPER_ADMIN_API}/branches?limit=100`);
      const data = await res.json();
      if (data.success) {
        setBranches(data.data || []);
      } else {
        // Fallback: use hardcoded branches
        setBranches([
          { id: '1', name: 'WEA-PHIL', location: 'Manila' },
          { id: '2', name: 'WEA-SGP', location: 'Singapore' },
          { id: '3', name: 'WEA-THA', location: 'Thailand' },
          { id: '4', name: 'WEA-IDN', location: 'Indonesia' },
        ]);
      }
    } catch (err) {
      console.error('Error fetching branches:', err);
      // Fallback: use hardcoded branches
      setBranches([
        { id: '1', name: 'WEA-PHIL', location: 'Manila' },
        { id: '2', name: 'WEA-SGP', location: 'Singapore' },
        { id: '3', name: 'WEA-THA', location: 'Thailand' },
        { id: '4', name: 'WEA-IDN', location: 'Indonesia' },
      ]);
    }
  };

  // ✅ Load all active job postings (public endpoint - no auth required)
  const loadJobPostings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // ✅ Use the correct public applicant endpoint - NO "hr" in the path!
      const url = `${API}/job-postings`;
      
      console.log('📡 Fetching job postings from:', url);
      
      const res = await fetch(url);
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      
      if (data.success) {
        let postings = data.data.map(mapPosting);
        
        // ✅ Apply branch filter on client side
        if (branchFilter !== 'All') {
          postings = postings.filter(p => {
            // Match by branch_id if available, otherwise by branch name
            const branch = branches.find(b => b.id === branchFilter);
            return p.branch_id === branchFilter || p.branch === branch?.name;
          });
        }
        
        setJobPostings(postings);
      } else {
        setError(data.error || 'Failed to load job postings');
      }
    } catch (err) {
      console.error('Error loading job postings:', err);
      setError('Could not connect to the server. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Maps a job posting row
  const mapPosting = (row) => ({
    id: row.id,
    title: row.title,
    department: row.departments?.department_name || row.department || '',
    department_id: row.department_id,
    position_id: row.position_id,
    location: row.location || '',
    branch: row.branch_name || row.profiles?.branches?.name || '',
    branch_id: row.branch_id || row.profiles?.branch_id || '',
    employmentType: row.employment_type || 'Full-time',
    salaryMin: row.salary_min ?? '',
    salaryMax: row.salary_max ?? '',
    status: row.status,
    postedDate: row.posted_date ? new Date(row.posted_date).toISOString().split('T')[0] : '',
    description: row.description || '',
    requirements: row.requirements || '',
    responsibilities: row.responsibilities || '',
    benefits: row.benefits || '',
  });

  const loadMyApplications = async () => {
    if (!applicantEmail) {
      setMyApplications([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`${API}/my-applications?email=${encodeURIComponent(applicantEmail)}`);
      const data = await res.json();
      if (data.success) {
        setMyApplications(
          data.data.map((app) => ({
            id: app.id,
            jobTitle: app.job_postings?.title || app.position_applied,
            department: app.department || app.job_postings?.departments?.department_name || '—',
            appliedDate: app.applied_date ? new Date(app.applied_date).toISOString().split('T')[0] : '',
            status: app.status,
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load applications:', err);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch when branch filter changes
  useEffect(() => {
    if (!showMyApplications) {
      loadJobPostings();
    }
  }, [branchFilter]);

  useEffect(() => {
    fetchBranches();
    fetchSystemSettings(); // ✅ Fetch system settings on mount
    if (showMyApplications) {
      loadMyApplications();
    } else {
      loadJobPostings();
    }
  }, [showMyApplications]);

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

  const openDetailsModal = (posting) => {
    setSelectedPosting(posting);
    setShowDetailsModal(true);
  };

  const handleApply = (posting) => {
    setShowDetailsModal(false);
    setSelectedPosting(posting);
    setApplyForm({
      firstName: '',
      middleName: '',
      lastName: '',
      email: applicantEmail || '',
      phone: '',
      location: '',
      experience: '',
      education: '',
      skills: '',
      coverLetter: '',
      resume: null,
    });
    setShowApplicationModal(true);
  };

  const handleApplyFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        showErrorAlert('Only PDF files are accepted.', 'Invalid File Type');
        e.target.value = null;
        setApplyForm({ ...applyForm, resume: null });
        return;
      }
      // ✅ Use dynamic max file size
      const maxSize = maxFileSize * 1024 * 1024;
      if (file.size > maxSize) {
        showErrorAlert(`File size exceeds the ${maxFileSize}MB limit.`, 'File Too Large');
        e.target.value = null;
        setApplyForm({ ...applyForm, resume: null });
        return;
      }
      setApplyForm({ ...applyForm, resume: file });
    }
  };

  const handleApplicationSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('job_posting_id', selectedPosting.id);
      fd.append('first_name', applyForm.firstName);
      fd.append('middle_name', applyForm.middleName);
      fd.append('last_name', applyForm.lastName);
      fd.append('email', applyForm.email);
      fd.append('phone', applyForm.phone);
      fd.append('location', applyForm.location);
      fd.append('position_applied', selectedPosting.title);
      fd.append('department', selectedPosting.department);
      fd.append('experience', applyForm.experience);
      fd.append('education', applyForm.education);
      fd.append('skills', applyForm.skills);
      fd.append('cover_letter', applyForm.coverLetter);
      if (applyForm.resume) fd.append('resume', applyForm.resume);

      const res = await fetch(`${API}/applications`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();

      if (data.success) {
        setApplicantEmail(applyForm.email);
        setShowApplicationModal(false);
        showSuccessAlert('Application submitted successfully!');
      } else {
        showErrorAlert(data.error || 'Failed to submit application.');
      }
    } catch (err) {
      showErrorAlert('Could not connect to the server.');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered job postings by search
  const filteredPostings = jobPostings.filter(posting => {
    const matchesSearch = 
      posting.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      posting.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      posting.branch?.toLowerCase().includes(searchQuery.toLowerCase());
    const isActive = posting.status === 'Active';
    return matchesSearch && isActive;
  });

  if (loading) {
    return <div style={styles.loading}>Loading...</div>;
  }

  // Show My Applications view
  if (showMyApplications) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>My Applications</h1>
          <p style={styles.subtitle}>Track your job application status</p>
        </div>

        <div className="glass-card" style={{ ...styles.card, marginBottom: 24 }}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Enter the email you applied with</label>
            <div style={{ display: 'flex', gap: 12 }}>
              <input
                type="email"
                value={applicantEmail}
                onChange={(e) => setApplicantEmail(e.target.value)}
                placeholder="your@email.com"
                style={{ ...styles.input, flex: 1 }}
              />
              <button onClick={loadMyApplications} style={styles.applyBtn}>Search</button>
            </div>
          </div>
        </div>

        <div className="glass-card" style={styles.card}>
          {myApplications.length === 0 ? (
            <div style={styles.emptyState}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
              <p style={styles.emptyText}>
                {applicantEmail
                  ? "No applications found for this email."
                  : "Enter your email above to view your applications."}
              </p>
            </div>
          ) : (
            <div style={styles.applicationsList}>
              {myApplications.map(app => (
                <div key={app.id} className="glass-card" style={styles.applicationCard}>
                  <div style={styles.applicationHeader}>
                    <h3 style={styles.applicationTitle}>{app.jobTitle}</h3>
                    <span style={{
                      ...styles.statusBadge,
                      backgroundColor: app.status === 'Interview Scheduled' ? 'var(--color-accent-light)' : 
                                     app.status === 'Hired' ? 'var(--color-primary-light)' :
                                     app.status === 'Rejected' ? 'var(--color-danger-light)' : 'var(--color-warning-light)',
                      color: app.status === 'Interview Scheduled' ? 'var(--color-accent)' : 
                             app.status === 'Hired' ? 'var(--color-primary)' :
                             app.status === 'Rejected' ? 'var(--color-danger)' : 'var(--color-warning)'
                    }}>
                      {app.status}
                    </span>
                  </div>
                  <div style={styles.applicationMeta}>
                    <div style={styles.metaItem}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.metaIcon}>
                        <rect x="2" y="7" width="20" height="14" rx="2"></rect>
                        <path d="M16 7V5a2 2 0 0 0-4 0v2"></path>
                      </svg>
                      <span style={styles.metaText}>{app.department}</span>
                    </div>
                    <div style={styles.metaItem}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.metaIcon}>
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                      </svg>
                      <span style={styles.metaText}>Applied: {app.appliedDate}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show Job Postings view with Branch filter
  return (
    <div style={styles.container}>
      {error && <div style={styles.errorBanner}>{error}</div>}

      <div style={styles.searchSection}>
        <div style={styles.searchBar}>
          <svg style={styles.searchIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Job title, keywords, or branch"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        
        <div style={styles.filters}>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="All">All Branches</option>
            {branches.map(branch => (
              <option key={branch.id} value={branch.id}>
                {branch.name} {branch.location ? `(${branch.location})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={styles.resultsHeader}>
        <h2 style={styles.resultsTitle}>{filteredPostings.length} Jobs Found</h2>
      </div>

      <div style={styles.jobList}>
        {filteredPostings.length === 0 ? (
          <div style={styles.emptyState}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text-muted)', marginBottom: '16px' }}>
              <rect x="2" y="7" width="20" height="14" rx="2"></rect>
              <path d="M16 7V5a2 2 0 0 0-4 0v2"></path>
            </svg>
            <p style={styles.emptyText}>No job postings found matching your criteria.</p>
          </div>
        ) : (
          filteredPostings.map(posting => (
            <div key={posting.id} className="glass-card" style={styles.jobCard}>
              <div style={styles.jobCardHeader}>
                <div style={styles.jobCardLeft}>
                  <h3 style={styles.jobTitle}>{posting.title}</h3>
                  <div style={styles.jobMeta}>
                    <span style={styles.jobMetaItem}>{posting.department}</span>
                    <span style={styles.jobMetaSeparator}>•</span>
                    <span style={styles.jobMetaItem}>{posting.branch || 'N/A'}</span>
                    <span style={styles.jobMetaSeparator}>•</span>
                    <span style={styles.jobMetaItem}>{posting.employmentType}</span>
                  </div>
                </div>
                <div style={styles.jobCardRight}>
                  <span style={styles.salary}>₱{parseInt(posting.salaryMin || 0).toLocaleString()} - ₱{parseInt(posting.salaryMax || 0).toLocaleString()}/mo</span>
                  <span style={styles.postedDate}>Posted {posting.postedDate}</span>
                </div>
              </div>
              <p style={styles.jobDescription}>{posting.description}</p>
              <div style={styles.jobCardFooter}>
                <button onClick={() => openDetailsModal(posting)} style={styles.viewDetailsBtn}>
                  View Details
                </button>
                <button onClick={() => handleApply(posting)} style={styles.applyBtn}>
                  Apply
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedPosting && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>{selectedPosting.title}</h3>
              <button onClick={() => setShowDetailsModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Job Overview</h4>
                <div style={styles.detailsGrid}>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Department:</span>
                    <span style={styles.detailValue}>{selectedPosting.department}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Branch:</span>
                    <span style={styles.detailValue}>{selectedPosting.branch || 'N/A'}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Employment Type:</span>
                    <span style={styles.detailValue}>{selectedPosting.employmentType}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Salary Range:</span>
                    <span style={styles.detailValue}>₱{parseInt(selectedPosting.salaryMin || 0).toLocaleString()} - ₱{parseInt(selectedPosting.salaryMax || 0).toLocaleString()}/mo</span>
                  </div>
                </div>
              </div>

              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Description</h4>
                <p style={styles.description}>{selectedPosting.description}</p>
              </div>

              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Requirements</h4>
                <p style={styles.description}>{selectedPosting.requirements}</p>
              </div>

              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Responsibilities</h4>
                <p style={styles.description}>{selectedPosting.responsibilities}</p>
              </div>

              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Benefits</h4>
                <p style={styles.description}>{selectedPosting.benefits}</p>
              </div>

              <div style={styles.modalFooter}>
                <button onClick={() => setShowDetailsModal(false)} style={styles.closeModalBtn}>Close</button>
                <button onClick={() => handleApply(selectedPosting)} style={styles.applyModalBtn}>Apply for this Position</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Application Form Modal */}
      {showApplicationModal && selectedPosting && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Apply for {selectedPosting.title}</h3>
              <button onClick={() => setShowApplicationModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <div style={styles.modalBody}>
              <form onSubmit={handleApplicationSubmit} style={styles.form}>
                {/* Form fields - same as before */}
                <div style={styles.formSection}>
                  <h4 style={styles.formSectionTitle}>Personal Information</h4>
                  <div style={styles.formGrid}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>First Name *</label>
                      <input
                        type="text"
                        required
                        value={applyForm.firstName}
                        onChange={(e) => setApplyForm({ ...applyForm, firstName: e.target.value })}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Middle Name</label>
                      <input
                        type="text"
                        value={applyForm.middleName}
                        onChange={(e) => setApplyForm({ ...applyForm, middleName: e.target.value })}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Last Name *</label>
                      <input
                        type="text"
                        required
                        value={applyForm.lastName}
                        onChange={(e) => setApplyForm({ ...applyForm, lastName: e.target.value })}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Email *</label>
                      <input
                        type="email"
                        required
                        value={applyForm.email}
                        onChange={(e) => setApplyForm({ ...applyForm, email: e.target.value })}
                        style={styles.input}
                        placeholder="your@email.com"
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Phone *</label>
                      <input
                        type="tel"
                        required
                        value={applyForm.phone}
                        onChange={(e) => setApplyForm({ ...applyForm, phone: e.target.value })}
                        style={styles.input}
                        placeholder="+63 XXX XXX XXXX"
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Location / Address *</label>
                      <input
                        type="text"
                        required
                        value={applyForm.location}
                        onChange={(e) => setApplyForm({ ...applyForm, location: e.target.value })}
                        style={styles.input}
                        placeholder="e.g. Quezon City, Manila"
                      />
                    </div>
                  </div>
                </div>

                <div style={styles.formSection}>
                  <h4 style={styles.formSectionTitle}>Professional Details</h4>
                  <div style={styles.formGrid}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Years of Experience *</label>
                      <input
                        type="text"
                        required
                        value={applyForm.experience}
                        onChange={(e) => setApplyForm({ ...applyForm, experience: e.target.value })}
                        style={styles.input}
                        placeholder="e.g., 3 years"
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Education *</label>
                      <input
                        type="text"
                        required
                        value={applyForm.education}
                        onChange={(e) => setApplyForm({ ...applyForm, education: e.target.value })}
                        style={styles.input}
                        placeholder="e.g., BS Computer Science"
                      />
                    </div>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Skills *</label>
                    <input
                      type="text"
                      required
                      value={applyForm.skills}
                      onChange={(e) => setApplyForm({ ...applyForm, skills: e.target.value })}
                      style={styles.input}
                      placeholder="e.g., React, Node.js, Python"
                    />
                  </div>
                </div>

                <div style={styles.formSection}>
                  <h4 style={styles.formSectionTitle}>Cover Letter</h4>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Tell us why you're interested in this position</label>
                    <textarea
                      value={applyForm.coverLetter}
                      onChange={(e) => setApplyForm({ ...applyForm, coverLetter: e.target.value })}
                      style={styles.textarea}
                      rows="5"
                      placeholder="Write your cover letter here..."
                    />
                  </div>
                </div>

                {/* ✅ UPDATED Resume Section with dynamic file size */}
                <div style={styles.formSection}>
                  <h4 style={styles.formSectionTitle}>Resume</h4>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>
                      Upload Resume (PDF only) *
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginLeft: '4px' }}>
                        (Max {maxFileSize}MB)
                      </span>
                    </label>
                    <input
                      type="file"
                      accept="application/pdf"
                      required
                      onChange={handleApplyFileChange}
                      style={styles.fileInput}
                    />
                    <p style={styles.fileHelp}>
                      Accepted formats: PDF only. Max size: {maxFileSize}MB
                    </p>
                  </div>
                </div>

                <div style={styles.modalFooter}>
                  <button type="button" onClick={() => setShowApplicationModal(false)} style={styles.closeModalBtn}>Cancel</button>
                  <button type="submit" disabled={submitting} style={styles.submitBtn}>
                    {submitting ? 'Submitting...' : 'Submit Application'}
                  </button>
                </div>
              </form>
            </div>
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
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '400px',
    fontSize: '16px',
    color: 'var(--color-text-secondary)',
  },
  errorBanner: {
    padding: '12px 16px',
    backgroundColor: 'var(--color-danger-light)',
    color: 'var(--color-danger)',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '20px',
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '32px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '8px',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '16px',
    color: 'var(--color-text-secondary)',
  },
  card: {
    padding: '24px',
  },
  searchSection: {
    marginBottom: '32px',
  },
  searchBar: {
    position: 'relative',
    marginBottom: '16px',
  },
  searchIcon: {
    position: 'absolute',
    left: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--color-text-muted)',
  },
  searchInput: {
    width: '100%',
    padding: '16px 16px 16px 48px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    fontSize: '16px',
    outline: 'none',
    boxShadow: 'var(--shadow-sm)',
  },
  filters: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  filterSelect: {
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
    minWidth: '150px',
  },
  resultsHeader: {
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid var(--color-border)',
  },
  resultsTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  jobList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 24px',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: '16px',
    color: 'var(--color-text-muted)',
  },
  jobCard: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  jobCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
  },
  jobCardLeft: {
    flex: 1,
  },
  jobTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--color-primary)',
    margin: '0 0 8px 0',
  },
  jobMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  jobMetaItem: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
  },
  jobMetaSeparator: {
    color: 'var(--color-text-muted)',
  },
  jobCardRight: {
    textAlign: 'right',
    minWidth: '200px',
  },
  salary: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    display: 'block',
    marginBottom: '4px',
  },
  postedDate: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  jobDescription: {
    fontSize: '15px',
    color: 'var(--color-text-primary)',
    lineHeight: '1.6',
    margin: '0',
  },
  jobCardFooter: {
    display: 'flex',
    gap: '12px',
    paddingTop: '16px',
    borderTop: '1px solid var(--color-border)',
  },
  viewDetailsBtn: {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  applyBtn: {
    padding: '10px 24px',
    backgroundColor: 'var(--color-primary)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  applicationsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  applicationCard: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  applicationHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
  },
  applicationTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  applicationMeta: {
    display: 'flex',
    gap: '16px',
  },
  statusBadge: {
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
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
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '28px',
    cursor: 'pointer',
    color: 'var(--color-text-muted)',
  },
  modalBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  detailsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  detailsSectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    marginBottom: '4px',
  },
  detailsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px',
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  detailLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: '15px',
    color: 'var(--color-text-primary)',
  },
  description: {
    fontSize: '15px',
    color: 'var(--color-text-primary)',
    lineHeight: '1.6',
    margin: 0,
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '8px',
    paddingTop: '16px',
    borderTop: '1px solid var(--color-border)',
  },
  closeModalBtn: {
    padding: '12px 24px',
    backgroundColor: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  applyModalBtn: {
    padding: '12px 24px',
    backgroundColor: 'var(--color-primary)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  formSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  formSectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    marginBottom: '4px',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
  },
  input: {
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  textarea: {
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  fileInput: {
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  fileHelp: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    margin: '4px 0 0 0',
  },
  submitBtn: {
    padding: '12px 24px',
    backgroundColor: 'var(--color-primary)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  metaIcon: {
    color: 'var(--color-text-muted)',
  },
  metaText: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
  },
};