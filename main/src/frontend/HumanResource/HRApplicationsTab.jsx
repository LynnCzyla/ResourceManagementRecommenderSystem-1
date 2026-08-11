import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';

export default function HRApplicationsTab() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [positionFilter, setPositionFilter] = useState('All');
  const [scheduleForm, setScheduleForm] = useState({
    date: '',
    time: '',
    interviewer: '',
    interviewType: 'Technical Interview',
    location: '',
    notes: '',
  });

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    try {
      setLoading(true);
      // Mock data for now
      setApplications([
        {
          id: 1,
          name: 'John Doe',
          email: 'john.doe@email.com',
          phone: '+63 912 345 6789',
          position: 'Senior Software Engineer',
          department: 'Engineering',
          status: 'Pending',
          appliedDate: '2025-08-09',
          experience: '5 years',
          skills: 'React, Node.js, Python',
          education: 'BS Computer Science',
          coverLetter: 'I am excited to apply for this position...',
          resume: 'resume_john_doe.pdf',
        },
        {
          id: 2,
          name: 'Jane Smith',
          email: 'jane.smith@email.com',
          phone: '+63 923 456 7890',
          position: 'Data Analyst',
          department: 'Analytics',
          status: 'Pending',
          appliedDate: '2025-08-08',
          experience: '3 years',
          skills: 'Python, SQL, Tableau',
          education: 'MS Data Science',
          coverLetter: 'With my background in data analysis...',
          resume: 'resume_jane_smith.pdf',
        },
        {
          id: 3,
          name: 'Mike Johnson',
          email: 'mike.johnson@email.com',
          phone: '+63 934 567 8901',
          position: 'Project Manager',
          department: 'Operations',
          status: 'Recommended',
          appliedDate: '2025-08-07',
          experience: '7 years',
          skills: 'Agile, Scrum, Leadership',
          education: 'MBA',
          coverLetter: 'I have successfully managed multiple projects...',
          resume: 'resume_mike_johnson.pdf',
        },
        {
          id: 4,
          name: 'Sarah Williams',
          email: 'sarah.williams@email.com',
          phone: '+63 945 678 9012',
          position: 'UI/UX Designer',
          department: 'Design',
          status: 'Pending',
          appliedDate: '2025-08-06',
          experience: '4 years',
          skills: 'Figma, Adobe XD, Sketch',
          education: 'BS Design',
          coverLetter: 'My design philosophy focuses on user experience...',
          resume: 'resume_sarah_williams.pdf',
        },
        {
          id: 5,
          name: 'David Brown',
          email: 'david.brown@email.com',
          phone: '+63 956 789 0123',
          position: 'Senior Software Engineer',
          department: 'Engineering',
          status: 'Rejected',
          appliedDate: '2025-08-05',
          experience: '2 years',
          skills: 'Java, Spring Boot',
          education: 'BS Computer Science',
          coverLetter: 'I am eager to contribute to your team...',
          resume: 'resume_david_brown.pdf',
        },
      ]);
    } catch (err) {
      setError('Failed to load applications');
      console.error(err);
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

  const handleRecommendForEmployment = async (id) => {
    const result = await showConfirmationAlert(
      'Recommend for Employment',
      'Are you sure you want to recommend this applicant for employment?',
      'Yes, Recommend'
    );
    if (!result.isConfirmed) return;

    try {
      setApplications(applications.map(app => 
        app.id === id ? { ...app, status: 'Recommended' } : app
      ));
      showSuccessAlert('Applicant recommended for employment!');
    } catch (err) {
      showErrorAlert('Failed to recommend applicant');
      console.error(err);
    }
  };

  const openScheduleModal = (application) => {
    setSelectedApplication(application);
    setScheduleForm({
      date: '',
      time: '',
      interviewer: '',
      interviewType: 'Technical Interview',
      location: '',
      notes: '',
    });
    setShowScheduleModal(true);
  };

  const handleScheduleSubmit = (e) => {
    e.preventDefault();
    // Update application status
    setApplications(applications.map(app => 
      app.id === selectedApplication.id ? { ...app, status: 'Scheduled for Interview' } : app
    ));
    setShowScheduleModal(false);
    showSuccessAlert('Interview scheduled successfully!');
    
    // Open Gmail directly with pre-filled email
    const subject = `Interview Invitation - ${selectedApplication.position} at WEA`;
    const body = `Dear ${selectedApplication.name},\n\nWe are pleased to invite you for an interview for the ${selectedApplication.position} position.\n\nInterview Details:\nDate: ${scheduleForm.date}\nTime: ${scheduleForm.time}\nInterviewer: ${scheduleForm.interviewer}\nType: ${scheduleForm.interviewType}\nLocation: ${scheduleForm.location}\n\n${scheduleForm.notes ? `Additional Notes: ${scheduleForm.notes}\n\n` : ''}Please confirm your attendance by replying to this email.\n\nBest regards,\nWEA HR Team`;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(selectedApplication.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
  };

  const handleReject = async (id) => {
    const result = await showConfirmationAlert(
      'Reject Application',
      'Are you sure you want to reject this application? This action cannot be undone.',
      'Yes, Reject'
    );
    if (!result.isConfirmed) return;

    try {
      setApplications(applications.map(app => 
        app.id === id ? { ...app, status: 'Rejected' } : app
      ));
      showSuccessAlert('Application rejected successfully!');
    } catch (err) {
      showErrorAlert('Failed to reject application');
      console.error(err);
    }
  };

  const openDetailsModal = (application) => {
    setSelectedApplication(application);
    setShowDetailsModal(true);
  };

  const filteredApplications = applications.filter(app => {
    const matchesSearch = 
      app.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.position?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' || app.status === statusFilter;
    const matchesPosition = positionFilter === 'All' || app.position === positionFilter;
    // Show Pending, Recommended, and Rejected (not Scheduled for Interview or Hired)
    const isAllowedStatus = app.status === 'Pending' || app.status === 'Recommended' || app.status === 'Rejected';
    return matchesSearch && matchesStatus && matchesPosition && isAllowedStatus;
  });

  const positions = [...new Set(applications.map(app => app.position))];

  if (loading) {
    return <div style={styles.loading}>Loading applications...</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Applications</h1>
        <p style={styles.subtitle}>Review and manage job applications</p>
      </div>

      <div className="glass-card" style={styles.card}>
        <div style={styles.toolbar}>
          <div style={styles.searchWrapper}>
            <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search applications..."
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
            <option value="Pending">Pending</option>
            <option value="Recommended">Recommended</option>
            <option value="Rejected">Rejected</option>
          </select>
          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="All">All Positions</option>
            {positions.map(pos => (
              <option key={pos} value={pos}>{pos}</option>
            ))}
          </select>
        </div>

        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>Applicant</th>
                <th style={styles.th}>Position</th>
                <th style={styles.th}>Department</th>
                <th style={styles.th}>Experience</th>
                <th style={styles.th}>Skills</th>
                <th style={styles.th}>Applied Date</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredApplications.length === 0 ? (
                <tr><td colSpan="8" style={styles.emptyRow}>No applications found.</td></tr>
              ) : (
                filteredApplications.map(app => (
                  <tr key={app.id} style={styles.tableRow}>
                    <td style={styles.td}>
                      <div style={styles.applicantInfo}>
                        <div style={styles.applicantName}>{app.name}</div>
                        <div style={styles.applicantEmail}>{app.email}</div>
                      </div>
                    </td>
                    <td style={styles.td}>{app.position}</td>
                    <td style={styles.td}>{app.department}</td>
                    <td style={styles.td}>{app.experience}</td>
                    <td style={styles.td}>
                      <span style={styles.skillsText}>{app.skills}</span>
                    </td>
                    <td style={styles.td}>{app.appliedDate}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: app.status === 'Recommended' ? 'var(--color-primary-light)' : 
                                       app.status === 'Scheduled for Interview' ? 'var(--color-accent-light)' :
                                       app.status === 'Rejected' ? 'var(--color-danger-light)' : 'var(--color-warning-light)',
                        color: app.status === 'Recommended' ? 'var(--color-primary)' : 
                               app.status === 'Scheduled for Interview' ? 'var(--color-accent)' :
                               app.status === 'Rejected' ? 'var(--color-danger)' : 'var(--color-warning)'
                      }}>
                        {app.status}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.actionCell}>
                        <button onClick={() => openDetailsModal(app)} style={styles.viewBtn} title="View Details">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </button>
                        {app.status === 'Pending' && (
                          <button onClick={() => handleRecommendForEmployment(app.id)} style={styles.recommendBtn} title="Recommend for Employment">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                              <circle cx="9" cy="7" r="4"></circle>
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                          </button>
                        )}
                        {(app.status === 'Pending' || app.status === 'Recommended') && (
                          <button onClick={() => openScheduleModal(app)} style={styles.scheduleBtn} title="Schedule Interview">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                              <line x1="16" y1="2" x2="16" y2="6"></line>
                              <line x1="8" y1="2" x2="8" y2="6"></line>
                              <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                          </button>
                        )}
                        {app.status === 'Pending' && (
                          <button onClick={() => handleReject(app.id)} style={styles.rejectBtn} title="Reject">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10"></circle>
                              <line x1="15" y1="9" x2="9" y2="15"></line>
                              <line x1="9" y1="9" x2="15" y2="15"></line>
                            </svg>
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

      {/* Details Modal */}
      {showDetailsModal && selectedApplication && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Application Details</h3>
              <button onClick={() => setShowDetailsModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Personal Information</h4>
                <div style={styles.detailsGrid}>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Name:</span>
                    <span style={styles.detailValue}>{selectedApplication.name}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Email:</span>
                    <span style={styles.detailValue}>{selectedApplication.email}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Phone:</span>
                    <span style={styles.detailValue}>{selectedApplication.phone}</span>
                  </div>
                </div>
              </div>

              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Application Details</h4>
                <div style={styles.detailsGrid}>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Position:</span>
                    <span style={styles.detailValue}>{selectedApplication.position}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Department:</span>
                    <span style={styles.detailValue}>{selectedApplication.department}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Applied Date:</span>
                    <span style={styles.detailValue}>{selectedApplication.appliedDate}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Status:</span>
                    <span style={{
                      ...styles.detailValue,
                      ...styles.statusBadge,
                      backgroundColor: selectedApplication.status === 'Recommended' ? 'var(--color-primary-light)' : 
                                     selectedApplication.status === 'Under Review' ? 'var(--color-accent-light)' :
                                     selectedApplication.status === 'Rejected' ? 'var(--color-danger-light)' : 'var(--color-warning-light)',
                      color: selectedApplication.status === 'Recommended' ? 'var(--color-primary)' : 
                             selectedApplication.status === 'Under Review' ? 'var(--color-accent)' :
                             selectedApplication.status === 'Rejected' ? 'var(--color-danger)' : 'var(--color-warning)'
                    }}>
                      {selectedApplication.status}
                    </span>
                  </div>
                </div>
              </div>

              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Qualifications</h4>
                <div style={styles.detailsGrid}>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Experience:</span>
                    <span style={styles.detailValue}>{selectedApplication.experience}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Education:</span>
                    <span style={styles.detailValue}>{selectedApplication.education}</span>
                  </div>
                  <div style={styles.detailItemFull}>
                    <span style={styles.detailLabel}>Skills:</span>
                    <span style={styles.detailValue}>{selectedApplication.skills}</span>
                  </div>
                </div>
              </div>

              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Cover Letter</h4>
                <div style={styles.coverLetter}>
                  {selectedApplication.coverLetter}
                </div>
              </div>

              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Resume</h4>
                <div style={styles.resumeLink}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                  {selectedApplication.resume}
                </div>
              </div>

              <div style={styles.modalFooter}>
                {selectedApplication.status === 'Pending' ? (
                  <>
                    <button onClick={() => { setShowDetailsModal(false); handleRecommendForEmployment(selectedApplication.id); }} style={styles.actionBtnPrimary}>
                      Recommend for Employment
                    </button>
                    <button onClick={() => { setShowDetailsModal(false); handleReject(selectedApplication.id); }} style={styles.actionBtnDanger}>
                      Reject
                    </button>
                  </>
                ) : selectedApplication.status === 'Recommended' ? (
                  <button onClick={() => { setShowDetailsModal(false); openScheduleModal(selectedApplication); }} style={styles.actionBtnPrimary}>
                    Schedule Interview
                  </button>
                ) : (
                  <button onClick={() => setShowDetailsModal(false)} style={styles.closeModalBtn}>Close</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Interview Modal */}
      {showScheduleModal && selectedApplication && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Schedule Interview</h3>
              <button onClick={() => setShowScheduleModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <div style={styles.modalBody}>
              <form onSubmit={handleScheduleSubmit} style={styles.form}>
                <div style={styles.formSection}>
                  <h4 style={styles.formSectionTitle}>Applicant Information</h4>
                  <div style={styles.applicantInfoBox}>
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Name:</span>
                      <span style={styles.infoValue}>{selectedApplication.name}</span>
                    </div>
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Position:</span>
                      <span style={styles.infoValue}>{selectedApplication.position}</span>
                    </div>
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Email:</span>
                      <span style={styles.infoValue}>{selectedApplication.email}</span>
                    </div>
                  </div>
                </div>

                <div style={styles.formSection}>
                  <h4 style={styles.formSectionTitle}>Interview Schedule</h4>
                  <div style={styles.formGrid}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Date *</label>
                      <input 
                        type="date" 
                        required 
                        style={styles.input} 
                        value={scheduleForm.date}
                        onChange={(e) => setScheduleForm({...scheduleForm, date: e.target.value})}
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Time *</label>
                      <input 
                        type="time" 
                        required 
                        style={styles.input} 
                        value={scheduleForm.time}
                        onChange={(e) => setScheduleForm({...scheduleForm, time: e.target.value})}
                      />
                    </div>
                  </div>
                  <div style={styles.formGrid}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Interviewer *</label>
                      <input 
                        type="text" 
                        required 
                        style={styles.input} 
                        placeholder="e.g., HR Manager"
                        value={scheduleForm.interviewer}
                        onChange={(e) => setScheduleForm({...scheduleForm, interviewer: e.target.value})}
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Interview Type *</label>
                      <select 
                        required 
                        style={styles.input}
                        value={scheduleForm.interviewType}
                        onChange={(e) => setScheduleForm({...scheduleForm, interviewType: e.target.value})}
                      >
                        <option value="Initial Screening">Initial Screening</option>
                        <option value="Technical Interview">Technical Interview</option>
                        <option value="Behavioral Interview">Behavioral Interview</option>
                        <option value="Final Interview">Final Interview</option>
                      </select>
                    </div>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Location *</label>
                    <input 
                      type="text" 
                      required 
                      style={styles.input} 
                      placeholder="e.g., Conference Room A or Video Call"
                      value={scheduleForm.location}
                      onChange={(e) => setScheduleForm({...scheduleForm, location: e.target.value})}
                    />
                  </div>
                </div>

                <div style={styles.formSection}>
                  <h4 style={styles.formSectionTitle}>Additional Notes</h4>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Notes</label>
                    <textarea 
                      style={styles.textarea} 
                      rows="3" 
                      placeholder="Any additional notes for the interviewer..."
                      value={scheduleForm.notes}
                      onChange={(e) => setScheduleForm({...scheduleForm, notes: e.target.value})}
                    />
                  </div>
                </div>

                <div style={styles.formSection}>
                  <h4 style={styles.formSectionTitle}>Email Invitation</h4>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>To</label>
                    <input 
                      type="email" 
                      required 
                      style={styles.input} 
                      value={selectedApplication.email}
                      readOnly
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Subject</label>
                    <input 
                      type="text" 
                      required 
                      style={styles.input} 
                      value={`Interview Invitation - ${selectedApplication.position} at WEA`}
                      readOnly
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Message</label>
                    <textarea 
                      required 
                      style={styles.textarea} 
                      rows="8" 
                      value={`Dear ${selectedApplication.name},\n\nWe are pleased to invite you for an interview for the ${selectedApplication.position} position.\n\nInterview Details:\nDate: ${scheduleForm.date || '[Select date]'}\nTime: ${scheduleForm.time || '[Select time]'}\nInterviewer: ${scheduleForm.interviewer || '[Enter interviewer]'}\nType: ${scheduleForm.interviewType || '[Select type]'}\nLocation: ${scheduleForm.location || '[Enter location]'}\n\n${scheduleForm.notes ? `Additional Notes: ${scheduleForm.notes}\n\n` : ''}Please confirm your attendance by replying to this email.\n\nBest regards,\nWEA HR Team`}
                      readOnly
                    />
                  </div>
                </div>

                <div style={styles.modalFooter}>
                  <button type="button" onClick={() => setShowScheduleModal(false)} style={styles.closeModalBtn}>Cancel</button>
                  <button type="submit" style={styles.submitBtn}>Schedule & Send Email</button>
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
  applicantInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  applicantName: {
    fontWeight: '600',
    color: 'var(--color-text-primary)',
  },
  applicantEmail: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  skillsText: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
  },
  actionCell: {
    display: 'flex',
    gap: '8px',
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
  reviewBtn: {
    background: 'var(--color-warning-light)',
    color: 'var(--color-warning)',
    border: 'none',
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  recommendBtn: {
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    border: 'none',
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  rejectBtn: {
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
  scheduleBtn: {
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
  applicantInfoBox: {
    padding: '16px',
    backgroundColor: 'var(--color-bg-card-hover)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid var(--color-border)',
  },
  infoLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
  },
  infoValue: {
    fontSize: '14px',
    color: 'var(--color-text-primary)',
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
    gap: '24px',
  },
  detailsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  detailsSectionTitle: {
    fontSize: '16px',
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
  detailItemFull: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    gridColumn: '1 / -1',
  },
  detailLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: '14px',
    color: 'var(--color-text-primary)',
  },
  coverLetter: {
    padding: '16px',
    backgroundColor: 'var(--color-bg-root)',
    borderRadius: '8px',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    lineHeight: '1.6',
    border: '1px solid var(--color-border)',
  },
  resumeLink: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: 'var(--color-bg-root)',
    borderRadius: '8px',
    fontSize: '14px',
    color: 'var(--color-primary)',
    border: '1px solid var(--color-border)',
    cursor: 'pointer',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '8px',
    paddingTop: '16px',
    borderTop: '1px solid var(--color-border)',
  },
  actionBtnPrimary: {
    padding: '10px 20px',
    backgroundColor: 'var(--color-primary)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  actionBtnSecondary: {
    padding: '10px 20px',
    backgroundColor: 'var(--color-accent)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  actionBtnDanger: {
    padding: '10px 20px',
    backgroundColor: 'var(--color-danger)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  closeModalBtn: {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};
