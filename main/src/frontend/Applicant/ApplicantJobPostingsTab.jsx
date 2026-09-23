import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../../config/api';

// ✅ Use the correct public applicant API endpoint
const API = `${API_BASE_URL}/api/applicant`;
const SUPER_ADMIN_API = `${API_BASE_URL}/api/superadmin`;

// ✅ Digits only. No letters, no symbols, no spaces.
const sanitizePhone = (value = '') => value.replace(/\D/g, '').slice(0, 15);

// Keys allowed even though they are not digits
const PHONE_CONTROL_KEYS = [
  'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Tab', 'Enter', 'Home', 'End',
];

export default function ApplicantJobPostingsTab() {
  const [jobPostings, setJobPostings] = useState([]);
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
      const API_URL = `${API_BASE_URL}/api/applicant/system-settings`;
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
      // ✅ Use public applicant branches endpoint
      const res = await fetch(`${API}/branches`);
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
    quantity: row.quantity || 1,
    postedDate: row.posted_date ? new Date(row.posted_date).toISOString().split('T')[0] : '',
    description: row.description || '',
    requirements: row.requirements || '',
    responsibilities: row.responsibilities || '',
    benefits: row.benefits || '',
  });

  // Re-fetch when branch filter changes
  useEffect(() => {
    loadJobPostings();
  }, [branchFilter]);

  useEffect(() => {
    fetchBranches();
    fetchSystemSettings(); // ✅ Fetch system settings on mount
    loadJobPostings();
  }, []);

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

  // ✅ Phone handlers: numbers only
  const handlePhoneChange = (e) => {
    setApplyForm(prev => ({ ...prev, phone: sanitizePhone(e.target.value) }));
  };

  const handlePhoneKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) return;
    if (PHONE_CONTROL_KEYS.includes(e.key)) return;
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
    }
  };

  const handlePhonePaste = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    setApplyForm(prev => ({ ...prev, phone: sanitizePhone(prev.phone + pasted) }));
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
        showErrorAlert(
          `Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB. The limit is ${maxFileSize}MB.`,
          'File Too Large'
        );
        e.target.value = null;
        setApplyForm({ ...applyForm, resume: null });
        return;
      }
      setApplyForm({ ...applyForm, resume: file });
    }
  };

  const handleApplicationSubmit = async (e) => {
    e.preventDefault();

    // ✅ Validate phone number: digits only, 7 to 15 digits
    const phoneDigits = sanitizePhone(applyForm.phone);
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      showErrorAlert('Enter a phone number with 7 to 15 digits. Numbers only.', 'Invalid Phone');
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('job_posting_id', selectedPosting.id);
      fd.append('first_name', applyForm.firstName);
      fd.append('middle_name', applyForm.middleName);
      fd.append('last_name', applyForm.lastName);
      fd.append('email', applyForm.email);
      fd.append('phone', phoneDigits);
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

      // ✅ Read as text first so an HTML error page does not crash res.json()
      const raw = await res.text();
      let data = null;
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }

      if (!res.ok) {
        console.error('Submit failed:', res.status, raw.slice(0, 300));
        if (res.status === 413) {
          showErrorAlert(`Your resume is too large for the server. Keep it under ${maxFileSize}MB.`, 'File Too Large');
        } else if (res.status === 409) {
          // ✅ Duplicate application: same email already applied to this posting
          showErrorAlert(
            (data && data.error) || 'This email has already applied for this position.',
            'Already Applied'
          );
        } else {
          showErrorAlert(
            (data && data.error) || `The server returned an error (${res.status}). Please try again.`
          );
        }
        return;
      }

      if (data && data.success) {
        setApplicantEmail(applyForm.email);
        setShowApplicationModal(false);
        // ✅ Let the applicant know a confirmation email is on its way
        showSuccessAlert(
          `Your application has been submitted. A confirmation email has been sent to ${applyForm.email}.`
        );
      } else {
        showErrorAlert((data && data.error) || 'Failed to submit application.');
      }
    } catch (err) {
      console.error('Network error while submitting application:', err);
      showErrorAlert('Could not reach the server. Check your internet connection and try again.', 'Connection Failed');
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
    const isNotFilled = (posting.hiredCount || 0) < (posting.quantity || 1);
    return matchesSearch && isActive && isNotFilled;
  });

  // Helper to render Requirements: highlighted skills, with dot per skill, and NO colons (:)
  const renderFormattedRequirements = (requirementsText) => {
    if (!requirementsText || !requirementsText.trim()) {
      return <p style={styles.description}>No specific requirements listed.</p>;
    }

    // Strip "Experience level: ...", "Required skills:", "Skills:", and ALL colons (:)
    let cleanText = requirementsText
      .replace(/Experience level:\s*[^\n\r]+/gi, '')
      .replace(/(?:Required\s+skills|Skills|Requirements)\s*:\s*/gi, '')
      .replace(/:/g, ''); // Ensure NO colons anywhere

    // Split by commas, newlines, semicolons
    const skills = cleanText
      .split(/[\n\r,;]+/)
      .map(s => s.replace(/^[\s•\-*]+|[\s•\-*]+$/g, '').trim())
      .filter(Boolean);

    if (skills.length === 0) {
      return <p style={styles.description}>No specific requirements listed.</p>;
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
        {skills.map((skill, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              backgroundColor: 'rgba(56, 189, 248, 0.08)',
              borderLeft: '3px solid #38bdf8',
              borderRadius: '0 8px 8px 0',
              color: 'var(--color-text-primary)',
              fontSize: '14px',
              fontWeight: '500',
              lineHeight: '1.5',
            }}
          >
            <span style={{ color: '#38bdf8', fontSize: '11px', lineHeight: 1 }}>●</span>
            <span style={{ letterSpacing: '0.2px' }}>{skill}</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return <div style={styles.loading}>Loading...</div>;
  }

  // Show Job Postings view with Branch filter
  return (
    <div style={styles.container}>
      {error && <div style={styles.errorBanner}>{error}</div>}

      <div className="applicant-search-section" style={styles.searchSection}>
        <div className="applicant-search-bar" style={styles.searchBar}>
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
            <div key={posting.id} className="glass-card applicant-job-card" style={styles.jobCard}>
              <div className="applicant-job-card-header" style={styles.jobCardHeader}>
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
                <div className="applicant-job-card-right" style={styles.jobCardRight}>
                  <span style={styles.salary}>₱{parseInt(posting.salaryMin || 0).toLocaleString()} - ₱{parseInt(posting.salaryMax || 0).toLocaleString()}/mo</span>
                  <span style={styles.postedDate}>Posted {posting.postedDate}</span>
                </div>
              </div>
              <p style={styles.jobDescription}>{posting.description}</p>
              <div className="applicant-job-card-footer" style={styles.jobCardFooter}>
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
          <div className="glass-card applicant-modal" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>{selectedPosting.title}</h3>
              <button onClick={() => setShowDetailsModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Job Overview</h4>
                <div className="applicant-details-grid" style={styles.detailsGrid}>
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
                    <span style={styles.detailLabel}>Vacancies / Positions:</span>
                    <span style={{ ...styles.detailValue, color: '#38bdf8', fontWeight: '700' }}>
                      {selectedPosting.quantity || 1} {selectedPosting.quantity === 1 ? 'Opening' : 'Openings'}
                    </span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Salary Range:</span>
                    <span style={styles.detailValue}>₱{parseInt(selectedPosting.salaryMin || 0).toLocaleString()} - ₱{parseInt(selectedPosting.salaryMax || 0).toLocaleString()}/mo</span>
                  </div>
                </div>
              </div>

              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Description</h4>
                <p style={{ ...styles.description, whiteSpace: 'pre-line', lineHeight: '1.7' }}>{selectedPosting.description}</p>
              </div>

              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Requirements</h4>
                {renderFormattedRequirements(selectedPosting.requirements)}
              </div>

              {selectedPosting.responsibilities && (
                <div style={styles.detailsSection}>
                  <h4 style={styles.detailsSectionTitle}>Responsibilities</h4>
                  <p style={{ ...styles.description, whiteSpace: 'pre-line', lineHeight: '1.7' }}>{selectedPosting.responsibilities}</p>
                </div>
              )}

              {selectedPosting.benefits && (
                <div style={styles.detailsSection}>
                  <h4 style={styles.detailsSectionTitle}>Benefits</h4>
                  <p style={{ ...styles.description, whiteSpace: 'pre-line', lineHeight: '1.7' }}>{selectedPosting.benefits}</p>
                </div>
              )}

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
          <div className="glass-card applicant-modal" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Apply for {selectedPosting.title}</h3>
              <button onClick={() => setShowApplicationModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <div style={styles.modalBody}>
              <form onSubmit={handleApplicationSubmit} style={styles.form}>
                <div style={styles.formSection}>
                  <h4 style={styles.formSectionTitle}>Personal Information</h4>
                  <div className="applicant-form-grid" style={styles.formGrid}>
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
                      {/* ✅ Numbers only. Pattern has no escaped characters, so it is valid in Chrome's `v` mode. */}
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="tel"
                        required
                        maxLength={15}
                        value={applyForm.phone}
                        onChange={handlePhoneChange}
                        onKeyDown={handlePhoneKeyDown}
                        onPaste={handlePhonePaste}
                        pattern="[0-9]{7,15}"
                        title="Numbers only, 7 to 15 digits"
                        style={styles.input}
                        placeholder="09XXXXXXXXX"
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
                        placeholder="e.g., BS Electrical Engineering"
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
                      placeholder="e.g., CAD, Project Management, Quality Control, Documentation"
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