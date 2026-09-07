import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';

export default function ApplicantApplicationFormTab() {
  const [selectedPosition, setSelectedPosition] = useState('');
  const [myApplications, setMyApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [maxFileSize, setMaxFileSize] = useState(5); // ✅ Use separate state for max file size

  const [formData, setFormData] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    position: '',
    experience: '',
    education: '',
    skills: '',
    coverLetter: '',
    resume: null,
  });

  const availablePositions = [
    'Senior Software Engineer',
    'Data Analyst',
    'UI/UX Designer',
    'Project Manager',
    'Backend Developer',
    'Mobile Developer',
    'Frontend Developer',
    'Quality Assurance Engineer',
  ];

  useEffect(() => {
    loadMyApplications();
    fetchSystemSettings();
  }, []);

  // ✅ Fetch system settings from the new endpoint
  const fetchSystemSettings = async () => {
    try {
      const API_URL = 'http://localhost:5000/api/applicant/system-settings';
      console.log('📡 Fetching system settings from:', API_URL);
      
      const res = await fetch(API_URL);
      console.log('📡 Response status:', res.status);
      
      if (res.ok) {
        const data = await res.json();
        console.log('📡 System settings data:', data);
        
        if (data.success && data.data) {
          const size = data.data.max_file_upload_size || 5;
          console.log('✅ Setting max file size to:', size);
          
          // ✅ Update the state with the new value
          setMaxFileSize(size);
        } else {
          console.warn('⚠️ API returned success:false or no data');
        }
      } else {
        console.error('❌ API returned error status:', res.status);
      }
    } catch (err) {
      console.error('❌ Failed to fetch system settings:', err);
      // Keep default value (5MB)
    }
  };

  const loadMyApplications = async () => {
    try {
      setLoading(true);
      // Mock data for now
      setMyApplications([
        {
          id: 1,
          position: 'Senior Software Engineer',
          appliedDate: '2025-08-09',
          status: 'Pending',
        },
        {
          id: 2,
          position: 'Data Analyst',
          appliedDate: '2025-08-05',
          status: 'Under Review',
        },
      ]);
    } catch (err) {
      console.error('Failed to load applications:', err);
    } finally {
      setLoading(false);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Mock submission
      const newApplication = {
        id: myApplications.length + 1,
        position: formData.position,
        appliedDate: new Date().toISOString().split('T')[0],
        status: 'Pending',
      };
      setMyApplications([...myApplications, newApplication]);
      setShowForm(false);
      resetForm();
      showSuccessAlert('Your application has been submitted successfully! We will review it and get back to you soon.');
    } catch (err) {
      showErrorAlert('Failed to submit application. Please try again.');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // ✅ Use dynamic max file size
      const maxSizeBytes = maxFileSize * 1024 * 1024;
      
      console.log(`📄 File size: ${(file.size / (1024 * 1024)).toFixed(2)}MB, Limit: ${maxFileSize}MB`);

      if (file.type !== 'application/pdf') {
        showErrorAlert('Only PDF files are accepted.', 'Invalid File Type');
        e.target.value = null;
        setFormData({ ...formData, resume: null });
        return;
      }

      if (file.size > maxSizeBytes) {
        showErrorAlert(
          `File size exceeds the ${maxFileSize}MB limit.`,
          'File Too Large'
        );
        e.target.value = null;
        setFormData({ ...formData, resume: null });
        return;
      }
      setFormData({ ...formData, resume: file });
    }
  };

  const resetForm = () => {
    setFormData({
      firstName: '',
      middleName: '',
      lastName: '',
      email: '',
      phone: '',
      address: '',
      position: '',
      experience: '',
      education: '',
      skills: '',
      coverLetter: '',
      resume: null,
    });
  };

  const openNewApplication = (position = '') => {
    setSelectedPosition(position);
    setFormData({ ...formData, position });
    setShowForm(true);
  };

  if (loading) {
    return <div style={styles.loading}>Loading applications...</div>;
  }

  // ✅ Log current value for debugging
  console.log('🔍 Current maxFileSize state:', maxFileSize);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>My Applications</h1>
        <p style={styles.subtitle}>View your application history and submit new applications</p>
      </div>

      {!showForm ? (
        <>
          <div style={styles.toolbar}>
            <button onClick={() => openNewApplication()} style={styles.createBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              New Application
            </button>
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
                <p style={styles.emptyText}>You haven't submitted any applications yet.</p>
                <button onClick={() => openNewApplication()} style={styles.emptyActionBtn}>
                  Submit Your First Application
                </button>
              </div>
            ) : (
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeader}>
                      <th style={styles.th}>Position</th>
                      <th style={styles.th}>Applied Date</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myApplications.map(app => (
                      <tr key={app.id} style={styles.tableRow}>
                        <td style={{ ...styles.td, fontWeight: '600', color: 'var(--color-text-primary)' }}>{app.position}</td>
                        <td style={styles.td}>{app.appliedDate}</td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.statusBadge,
                            backgroundColor: app.status === 'Pending' ? 'var(--color-warning-light)' : 
                                           app.status === 'Under Review' ? 'var(--color-accent-light)' : 
                                           app.status === 'Recommended' ? 'var(--color-primary-light)' : 'var(--color-danger-light)',
                            color: app.status === 'Pending' ? 'var(--color-warning)' : 
                                   app.status === 'Under Review' ? 'var(--color-accent)' : 
                                   app.status === 'Recommended' ? 'var(--color-primary)' : 'var(--color-danger)'
                          }}>
                            {app.status}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <button style={styles.viewBtn} title="View Details">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="glass-card" style={styles.formCard}>
          <div style={styles.formHeader}>
            <h2 style={styles.formTitle}>Job Application Form</h2>
            <button onClick={() => { setShowForm(false); resetForm(); }} style={styles.cancelFormBtn}>
              Cancel
            </button>
          </div>

          <form onSubmit={handleSubmit} style={styles.formBody}>
            <div style={styles.formSection}>
              <h3 style={styles.formSectionTitle}>Personal Information</h3>
              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>First Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    style={styles.formInput}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Middle Name</label>
                  <input
                    type="text"
                    value={formData.middleName}
                    onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                    style={styles.formInput}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Last Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    style={styles.formInput}
                  />
                </div>
              </div>
              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Email Address *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={styles.formInput}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    style={styles.formInput}
                    placeholder="+63 XXX XXX XXXX"
                  />
                </div>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Address *</label>
                <input
                  type="text"
                  required
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  style={styles.formInput}
                  placeholder="House/Unit No., Street, Barangay, City, Province"
                />
              </div>
            </div>

            <div style={styles.formSection}>
              <h3 style={styles.formSectionTitle}>Position Details</h3>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Position Applied For *</label>
                <select
                  required
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  style={styles.formInput}
                >
                  <option value="">Select a position...</option>
                  {availablePositions.map(pos => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Years of Experience *</label>
                <input
                  type="text"
                  required
                  value={formData.experience}
                  onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                  style={styles.formInput}
                  placeholder="e.g., 5 years"
                />
              </div>
            </div>

            <div style={styles.formSection}>
              <h3 style={styles.formSectionTitle}>Qualifications</h3>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Education *</label>
                <input
                  type="text"
                  required
                  value={formData.education}
                  onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                  style={styles.formInput}
                  placeholder="e.g., BS Computer Science, MS Data Science"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Skills *</label>
                <input
                  type="text"
                  required
                  value={formData.skills}
                  onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                  style={styles.formInput}
                  placeholder="e.g., React, Node.js, Python, SQL"
                />
              </div>
            </div>

            <div style={styles.formSection}>
              <h3 style={styles.formSectionTitle}>Additional Information</h3>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Cover Letter</label>
                <textarea
                  value={formData.coverLetter}
                  onChange={(e) => setFormData({ ...formData, coverLetter: e.target.value })}
                  style={styles.formTextarea}
                  rows={6}
                  placeholder="Tell us why you're interested in this position and what makes you a great fit..."
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>
                  Resume (PDF) * 
                  <span style={styles.fileSizeHint}>
                    (Max {maxFileSize}MB) {/* ✅ Shows dynamic value */}
                  </span>
                </label>
                <div style={styles.fileUpload}>
                  <input
                    type="file"
                    required
                    accept="application/pdf"
                    onChange={handleFileChange}
                    style={styles.fileInput}
                    id="resume-upload"
                  />
                  <label htmlFor="resume-upload" style={styles.fileLabel}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginBottom: '8px' }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="17 8 12 3 7 8"></polyline>
                      <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    <span style={styles.fileText}>
                      {formData.resume ? formData.resume.name : 'Click to upload your resume'}
                    </span>
                    <span style={styles.fileHint}>
                      Accepted formats: PDF only (Max {maxFileSize}MB) {/* ✅ Shows dynamic value */}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div style={styles.formFooter}>
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} style={styles.cancelBtn}>
                Cancel
              </button>
              <button type="submit" disabled={submitting} style={styles.submitBtn}>
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </form>
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
  toolbar: {
    marginBottom: '24px',
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
  },
  card: {
    padding: '24px',
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
    marginBottom: '16px',
  },
  emptyActionBtn: {
    padding: '10px 20px',
    backgroundColor: 'var(--color-primary)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
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
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
  },
  viewBtn: {
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
  formCard: {
    padding: '28px',
    maxWidth: '800px',
    margin: '0 auto',
  },
  formHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid var(--color-border)',
  },
  formTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  cancelFormBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
  formBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
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
    marginBottom: '8px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  formLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
  },
  fileSizeHint: {
    fontSize: '12px',
    fontWeight: '400',
    color: 'var(--color-text-muted)',
    marginLeft: '4px',
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
    fontFamily: 'inherit',
  },
  fileUpload: {
    marginTop: '8px',
  },
  fileInput: {
    display: 'none',
  },
  fileLabel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    border: '2px dashed var(--color-border)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
    backgroundColor: 'var(--color-bg-root)',
  },
  fileText: {
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    fontWeight: '500',
  },
  fileHint: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    marginTop: '4px',
  },
  formFooter: {
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
    opacity: 1,
  },
};