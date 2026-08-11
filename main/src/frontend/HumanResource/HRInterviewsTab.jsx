import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';

export default function HRInterviewsTab() {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedInterview, setSelectedInterview] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    date: '',
    time: '',
    interviewer: '',
    interviewType: 'Technical Interview',
    location: '',
    notes: '',
  });
  const [emailForm, setEmailForm] = useState({
    to: '',
    subject: '',
    body: '',
  });

  useEffect(() => {
    loadInterviews();
  }, []);

  const loadInterviews = async () => {
    try {
      setLoading(true);
      // Mock data for now - these are applicants scheduled for interview
      setInterviews([
        {
          id: 1,
          applicantId: 3,
          applicantName: 'Mike Johnson',
          applicantEmail: 'mike.johnson@email.com',
          applicantPhone: '+63 934 567 8901',
          position: 'Project Manager',
          department: 'Operations',
          interviewDate: '2025-08-15',
          interviewTime: '10:00 AM',
          interviewer: 'HR Manager',
          interviewType: 'Technical Interview',
          location: 'Conference Room A',
          status: 'Scheduled',
          notes: '',
        },
        {
          id: 2,
          applicantId: 6,
          applicantName: 'Emily Davis',
          applicantEmail: 'emily.davis@email.com',
          applicantPhone: '+63 967 890 1234',
          position: 'Senior Software Engineer',
          department: 'Engineering',
          interviewDate: '2025-08-16',
          interviewTime: '2:00 PM',
          interviewer: 'Tech Lead',
          interviewType: 'Initial Screening',
          location: 'Video Call',
          status: 'Completed',
          notes: 'Strong technical skills, good communication',
        },
        {
          id: 3,
          applicantId: 7,
          applicantName: 'Robert Chen',
          applicantEmail: 'robert.chen@email.com',
          applicantPhone: '+63 978 901 2345',
          position: 'Data Analyst',
          department: 'Analytics',
          interviewDate: '2025-08-17',
          interviewTime: '11:00 AM',
          interviewer: 'Data Manager',
          interviewType: 'Technical Interview',
          location: 'Conference Room B',
          status: 'Scheduled',
          notes: '',
        },
      ]);
    } catch (err) {
      setError('Failed to load interviews');
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

  const handleCompleteInterview = async (id) => {
    const result = await showConfirmationAlert(
      'Complete Interview',
      'Are you sure you want to mark this interview as completed? You can then decide to hire or reject the applicant.',
      'Yes, Complete'
    );
    if (!result.isConfirmed) return;

    try {
      setInterviews(interviews.map(int => 
        int.id === id ? { ...int, status: 'Completed' } : int
      ));
      showSuccessAlert('Interview marked as completed!');
    } catch (err) {
      showErrorAlert('Failed to complete interview');
      console.error(err);
    }
  };

  const handleHire = async (id) => {
    const result = await showConfirmationAlert(
      'Hire Applicant',
      'Are you sure you want to hire this applicant? They will be moved to the hired employees list.',
      'Yes, Hire'
    );
    if (!result.isConfirmed) return;

    try {
      setInterviews(interviews.map(int => 
        int.id === id ? { ...int, status: 'Hired' } : int
      ));
      showSuccessAlert('Applicant hired successfully!');
    } catch (err) {
      showErrorAlert('Failed to hire applicant');
      console.error(err);
    }
  };

  const handleReject = async (id) => {
    const result = await showConfirmationAlert(
      'Reject Applicant',
      'Are you sure you want to reject this applicant after the interview? This action cannot be undone.',
      'Yes, Reject'
    );
    if (!result.isConfirmed) return;

    try {
      setInterviews(interviews.map(int => 
        int.id === id ? { ...int, status: 'Rejected' } : int
      ));
      showSuccessAlert('Applicant rejected successfully!');
    } catch (err) {
      showErrorAlert('Failed to reject applicant');
      console.error(err);
    }
  };

  const openDetailsModal = (interview) => {
    setSelectedInterview(interview);
    setShowDetailsModal(true);
  };

  const openScheduleModal = (applicant) => {
    setSelectedApplicant(applicant);
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
    // Create new interview
    const newInterview = {
      id: interviews.length + 1,
      applicantId: selectedApplicant.id,
      applicantName: selectedApplicant.name,
      applicantEmail: selectedApplicant.email,
      applicantPhone: selectedApplicant.phone,
      position: selectedApplicant.position,
      department: selectedApplicant.department,
      interviewDate: scheduleForm.date,
      interviewTime: scheduleForm.time,
      interviewer: scheduleForm.interviewer,
      interviewType: scheduleForm.interviewType,
      location: scheduleForm.location,
      status: 'Scheduled',
      notes: scheduleForm.notes,
    };
    setInterviews([...interviews, newInterview]);
    setShowScheduleModal(false);
    showSuccessAlert('Interview scheduled successfully!');
    
    // Open email modal to send Gmail
    setEmailForm({
      to: selectedApplicant.email,
      subject: `Interview Invitation - ${selectedApplicant.position} at WEA`,
      body: `Dear ${selectedApplicant.name},\n\nWe are pleased to invite you for an interview for the ${selectedApplicant.position} position.\n\nInterview Details:\nDate: ${scheduleForm.date}\nTime: ${scheduleForm.time}\nInterviewer: ${scheduleForm.interviewer}\nType: ${scheduleForm.interviewType}\nLocation: ${scheduleForm.location}\n\nPlease confirm your attendance by replying to this email.\n\nBest regards,\nWEA HR Team`,
    });
    setShowEmailModal(true);
  };

  const handleSendEmail = (e) => {
    e.preventDefault();
    // Open Gmail with pre-filled email
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(emailForm.to)}&su=${encodeURIComponent(emailForm.subject)}&body=${encodeURIComponent(emailForm.body)}`;
    window.open(gmailUrl, '_blank');
    setShowEmailModal(false);
    showSuccessAlert('Gmail opened with interview invitation!');
  };

  const filteredInterviews = interviews.filter(int => {
    const matchesSearch = 
      int.applicantName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      int.position?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      int.interviewer?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' || int.status === statusFilter;
    // Only show Scheduled and Completed interviews (not Hired or Rejected)
    const isAllowedStatus = int.status === 'Scheduled' || int.status === 'Completed';
    return matchesSearch && matchesStatus && isAllowedStatus;
  });

  if (loading) {
    return <div style={styles.loading}>Loading interviews...</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Interviews</h1>
        <p style={styles.subtitle}>Manage scheduled interviews and hiring decisions</p>
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
              placeholder="Search interviews..."
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
            <option value="Scheduled">Scheduled</option>
            <option value="Completed">Completed</option>
          </select>
        </div>

        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>Applicant</th>
                <th style={styles.th}>Position</th>
                <th style={styles.th}>Interview Date</th>
                <th style={styles.th}>Interview Time</th>
                <th style={styles.th}>Interviewer</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Location</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInterviews.length === 0 ? (
                <tr><td colSpan="9" style={styles.emptyRow}>No interviews found.</td></tr>
              ) : (
                filteredInterviews.map(int => (
                  <tr key={int.id} style={styles.tableRow}>
                    <td style={styles.td}>
                      <div style={styles.applicantInfo}>
                        <div style={styles.applicantName}>{int.applicantName}</div>
                        <div style={styles.applicantEmail}>{int.applicantEmail}</div>
                      </div>
                    </td>
                    <td style={styles.td}>{int.position}</td>
                    <td style={styles.td}>{int.interviewDate}</td>
                    <td style={styles.td}>{int.interviewTime}</td>
                    <td style={styles.td}>{int.interviewer}</td>
                    <td style={styles.td}>{int.interviewType}</td>
                    <td style={styles.td}>{int.location}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: int.status === 'Hired' ? 'var(--color-primary-light)' : 
                                       int.status === 'Rejected' ? 'var(--color-danger-light)' : 
                                       int.status === 'Completed' ? 'var(--color-accent-light)' : 'var(--color-warning-light)',
                        color: int.status === 'Hired' ? 'var(--color-primary)' : 
                               int.status === 'Rejected' ? 'var(--color-danger)' : 
                               int.status === 'Completed' ? 'var(--color-accent)' : 'var(--color-warning)'
                      }}>
                        {int.status}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.actionCell}>
                        <button onClick={() => openDetailsModal(int)} style={styles.viewBtn} title="View Details">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </button>
                        {int.status === 'Scheduled' && (
                          <button onClick={() => handleCompleteInterview(int.id)} style={styles.completeBtn} title="Complete Interview">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          </button>
                        )}
                        {int.status === 'Completed' && (
                          <>
                            <button onClick={() => handleHire(int.id)} style={styles.hireBtn} title="Hire">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                              </svg>
                            </button>
                            <button onClick={() => handleReject(int.id)} style={styles.rejectBtn} title="Reject">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="15" y1="9" x2="9" y2="15"></line>
                                <line x1="9" y1="9" x2="15" y2="15"></line>
                              </svg>
                            </button>
                          </>
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
      {showDetailsModal && selectedInterview && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Interview Details</h3>
              <button onClick={() => setShowDetailsModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Applicant Information</h4>
                <div style={styles.detailsGrid}>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Name:</span>
                    <span style={styles.detailValue}>{selectedInterview.applicantName}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Email:</span>
                    <span style={styles.detailValue}>{selectedInterview.applicantEmail}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Phone:</span>
                    <span style={styles.detailValue}>{selectedInterview.applicantPhone}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Position:</span>
                    <span style={styles.detailValue}>{selectedInterview.position}</span>
                  </div>
                </div>
              </div>

              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Interview Information</h4>
                <div style={styles.detailsGrid}>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Date:</span>
                    <span style={styles.detailValue}>{selectedInterview.interviewDate}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Time:</span>
                    <span style={styles.detailValue}>{selectedInterview.interviewTime}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Interviewer:</span>
                    <span style={styles.detailValue}>{selectedInterview.interviewer}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Type:</span>
                    <span style={styles.detailValue}>{selectedInterview.interviewType}</span>
                  </div>
                  <div style={styles.detailItemFull}>
                    <span style={styles.detailLabel}>Location:</span>
                    <span style={styles.detailValue}>{selectedInterview.location}</span>
                  </div>
                  <div style={styles.detailItemFull}>
                    <span style={styles.detailLabel}>Status:</span>
                    <span style={{
                      ...styles.detailValue,
                      ...styles.statusBadge,
                      backgroundColor: selectedInterview.status === 'Hired' ? 'var(--color-primary-light)' : 
                                     selectedInterview.status === 'Rejected' ? 'var(--color-danger-light)' : 
                                     selectedInterview.status === 'Completed' ? 'var(--color-accent-light)' : 'var(--color-warning-light)',
                      color: selectedInterview.status === 'Hired' ? 'var(--color-primary)' : 
                             selectedInterview.status === 'Rejected' ? 'var(--color-danger)' : 
                             selectedInterview.status === 'Completed' ? 'var(--color-accent)' : 'var(--color-warning)'
                    }}>
                      {selectedInterview.status}
                    </span>
                  </div>
                </div>
              </div>

              {selectedInterview.notes && (
                <div style={styles.detailsSection}>
                  <h4 style={styles.detailsSectionTitle}>Interview Notes</h4>
                  <div style={styles.notes}>
                    {selectedInterview.notes}
                  </div>
                </div>
              )}

              <div style={styles.modalFooter}>
                {selectedInterview.status === 'Scheduled' && (
                  <button onClick={() => { setShowDetailsModal(false); handleCompleteInterview(selectedInterview.id); }} style={styles.actionBtnPrimary}>
                    Complete Interview
                  </button>
                )}
                {selectedInterview.status === 'Completed' && (
                  <>
                    <button onClick={() => { setShowDetailsModal(false); handleHire(selectedInterview.id); }} style={styles.actionBtnSuccess}>
                      Hire Applicant
                    </button>
                    <button onClick={() => { setShowDetailsModal(false); handleReject(selectedInterview.id); }} style={styles.actionBtnDanger}>
                      Reject Applicant
                    </button>
                  </>
                )}
                <button onClick={() => setShowDetailsModal(false)} style={styles.closeModalBtn}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Interview Modal */}
      {showScheduleModal && selectedApplicant && (
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
                      <span style={styles.infoValue}>{selectedApplicant.name}</span>
                    </div>
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Position:</span>
                      <span style={styles.infoValue}>{selectedApplicant.position}</span>
                    </div>
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Email:</span>
                      <span style={styles.infoValue}>{selectedApplicant.email}</span>
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

                <div style={styles.modalFooter}>
                  <button type="button" onClick={() => setShowScheduleModal(false)} style={styles.closeModalBtn}>Cancel</button>
                  <button type="submit" style={styles.submitBtn}>Schedule & Send Email</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Send Interview Invitation via Gmail</h3>
              <button onClick={() => setShowEmailModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <div style={styles.modalBody}>
              <form onSubmit={handleSendEmail} style={styles.form}>
                <div style={styles.formSection}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>To</label>
                    <input type="email" required style={styles.input} value={emailForm.to} readOnly />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Subject</label>
                    <input type="text" required style={styles.input} value={emailForm.subject} readOnly />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Message</label>
                    <textarea required style={styles.textarea} rows="10" value={emailForm.body} readOnly />
                  </div>
                </div>
                <div style={styles.modalFooter}>
                  <button type="button" onClick={() => setShowEmailModal(false)} style={styles.closeModalBtn}>Cancel</button>
                  <button type="submit" style={styles.submitBtn}>Open in Gmail</button>
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
  completeBtn: {
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
  hireBtn: {
    background: 'var(--color-success-light)',
    color: 'var(--color-success)',
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
  notes: {
    padding: '16px',
    backgroundColor: 'var(--color-bg-root)',
    borderRadius: '8px',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    lineHeight: '1.6',
    border: '1px solid var(--color-border)',
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
  actionBtnSuccess: {
    padding: '10px 20px',
    backgroundColor: 'var(--color-success)',
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
