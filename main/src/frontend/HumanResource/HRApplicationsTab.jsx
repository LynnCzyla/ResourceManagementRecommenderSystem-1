import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import hrClient from './Hrclient';
import { API_BASE_URL } from '../../config/api';


const mapApplication = (row) => {
  let location = row.location || '';
  let coverLetter = row.cover_letter || '';
  
  if (!location && coverLetter.includes('[Applicant Address:')) {
    const match = coverLetter.match(/\[Applicant Address:\s*(.*?)\]/);
    if (match) {
      location = match[1];
      coverLetter = coverLetter.replace(/\[Applicant Address:\s*.*?\]/, '').trim();
    }
  }

  return {
    id: row.id,
    name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    email: row.email,
    phone: row.phone || '',
    position: row.position_applied,
    department: row.department || '',
    status: row.status || 'Pending',
    appliedDate: row.applied_date,
    experience: row.experience || '',
    skills: row.skills || '',
    education: row.education || '',
    coverLetter: coverLetter,
    resume: row.resume_path || '',
    location: location || '—',
    postingQuantity: row.posting_quantity || 1,
    postingHiredCount: row.posting_hired_count || 0,
    postingFilled: Boolean(row.posting_filled),
    postingStatus: row.posting_status || 'Active',
  };
};

// An application belongs to "History" if:
// 1. Its status has reached terminal outcome (Hired or Rejected), OR
// 2. Its job posting has reached its quota (e.g. 1/1 hired) and is marked filled / closed.
const isHistoryApplication = (app) => {
  if (app.status === 'Hired' || app.status === 'Rejected') return true;
  if (app.postingFilled || app.postingStatus === 'Closed') return true;
  return false;
};

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
  const [scheduling, setScheduling] = useState(false);

  // Active / History tab
  const [activeTab, setActiveTab] = useState('Active'); // 'Active' | 'History'

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
      setError(null);
      const res = await hrClient.get(`/applications`);
      const rows = res.data?.data || [];
      setApplications(rows.map(mapApplication));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load applications. Please check your connection and try again.');
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
      await hrClient.put(`/applications/${id}/status`, { status: 'Recommended' });
      await loadApplications();
      showSuccessAlert('Applicant recommended for employment!');
    } catch (err) {
      showErrorAlert(err.response?.data?.error || 'Failed to recommend applicant');
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

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    setScheduling(true);
    try {
      // Scheduling the interview on the backend also flips the application's
      // status to "Interview Scheduled" AND sends the invitation email
      // automatically via nodemailer (see backend/utils/mailer.js) — no
      // manual "click send" step needed on this end anymore.
      await hrClient.post(`/interviews`, {
        application_id: selectedApplication.id,
        interview_date: scheduleForm.date,
        interview_time: scheduleForm.time,
        interviewer: scheduleForm.interviewer,
        interview_type: scheduleForm.interviewType,
        location: scheduleForm.location,
        notes: scheduleForm.notes,
      });
      await loadApplications();
      setShowScheduleModal(false);
      showSuccessAlert('Interview scheduled and invitation email sent!');
    } catch (err) {
      showErrorAlert(err.response?.data?.error || 'Failed to schedule interview');
      console.error(err);
    } finally {
      setScheduling(false);
    }
  };

  const handleReject = async (id) => {
    const { value: reason, isDismissed } = await Swal.fire({
      title: 'Reject Application',
      input: 'textarea',
      inputLabel: 'Reason for rejection (will be emailed to the applicant)',
      inputPlaceholder: 'Please type the reason for rejection...',
      showCancelButton: true,
      confirmButtonText: 'Yes, Reject',
      cancelButtonText: 'Cancel',
      confirmButtonColor: 'var(--color-danger)',
      cancelButtonColor: 'var(--color-border)',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
      inputValidator: (value) => {
        if (!value) {
          return 'You need to write a reason!';
        }
      }
    });

    if (isDismissed) return;

    try {
      await hrClient.put(`/applications/${id}/status`, { status: 'Rejected', notes: reason });
      await loadApplications();
      showSuccessAlert('Application rejected and notification email sent successfully!');
    } catch (err) {
      showErrorAlert(err.response?.data?.error || 'Failed to reject application');
      console.error(err);
    }
  };

  const openDetailsModal = (application) => {
    setSelectedApplication(application);
    setShowDetailsModal(true);
  };

  // Tab counts
  const activeCount = applications.filter(app => !isHistoryApplication(app)).length;
  const historyCount = applications.filter(app => isHistoryApplication(app)).length;

  const filteredApplications = applications.filter(app => {
    const matchesSearch = 
      app.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.position?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' || app.status === statusFilter;
    const matchesPosition = positionFilter === 'All' || app.position === positionFilter;
    const matchesTab = activeTab === 'History'
      ? isHistoryApplication(app)
      : !isHistoryApplication(app);
    return matchesSearch && matchesStatus && matchesPosition && matchesTab;
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

      {/* Active / History Tabs */}
      <div style={styles.subTabsContainer}>
        <button
          onClick={() => setActiveTab('Active')}
          style={{
            ...styles.subTabButton,
            borderBottomColor: activeTab === 'Active' ? 'var(--color-primary)' : 'transparent',
            color: activeTab === 'Active' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeTab === 'Active' ? '700' : '500'
          }}
        >
          Active ({activeCount})
        </button>
        <button
          onClick={() => setActiveTab('History')}
          style={{
            ...styles.subTabButton,
            borderBottomColor: activeTab === 'History' ? 'var(--color-primary)' : 'transparent',
            color: activeTab === 'History' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeTab === 'History' ? '700' : '500'
          }}
        >
          History ({historyCount})
        </button>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <span>{error}</span>
          <button onClick={loadApplications} style={styles.retryBtn}>Retry</button>
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
              placeholder={`Search ${activeTab === 'History' ? 'history' : 'applications'}...`}
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
            {activeTab === 'Active' ? (
              <>
                <option value="Pending">Pending</option>
                <option value="Recommended">Recommended</option>
                <option value="Interview Scheduled">Interview Scheduled</option>
              </>
            ) : (
              <>
                <option value="Hired">Hired</option>
                <option value="Rejected">Rejected</option>
              </>
            )}
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
                <tr><td colSpan="8" style={styles.emptyRow}>
                  {activeTab === 'History' ? 'No history records found.' : 'No applications found.'}
                </td></tr>
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                        <span style={{
                          ...styles.statusBadge,
                          backgroundColor: app.status === 'Recommended' ? 'var(--color-primary-light)' : 
                                 app.status === 'Interview Scheduled' ? 'rgba(56, 189, 248, 0.15)' :
                                 app.status === 'Hired' ? 'rgba(34, 197, 94, 0.15)' :
                                 app.status === 'Rejected' ? 'var(--color-danger-light)' : 'var(--color-warning-light)',
                          color: app.status === 'Recommended' ? 'var(--color-primary)' : 
                                 app.status === 'Interview Scheduled' ? 'var(--color-accent)' :
                                 app.status === 'Hired' ? 'var(--color-success)' :
                                 app.status === 'Rejected' ? 'var(--color-danger)' : 'var(--color-warning)'
                        }}>
                          {app.status}
                        </span>
                        {app.postingFilled && (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: '600',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            backgroundColor: 'rgba(56, 189, 248, 0.12)',
                            color: '#38bdf8'
                          }}>
                            Quota: {app.postingHiredCount}/{app.postingQuantity} Filled
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.actionCell}>
                        <button onClick={() => openDetailsModal(app)} style={styles.viewBtn} title="View Details">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </button>

                        {activeTab === 'Active' ? (
                          <>
                            <button
                              onClick={() => openScheduleModal(app)}
                              disabled={app.status !== 'Recommended'}
                              style={{
                                ...styles.scheduleBtn,
                                opacity: app.status === 'Recommended' ? 1 : 0.4,
                                cursor: app.status === 'Recommended' ? 'pointer' : 'not-allowed'
                              }}
                              title={app.status === 'Recommended' ? "Schedule Interview" : "Must be Recommended first"}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                              </svg>
                            </button>
                          </>
                        ) : (
                          <span style={styles.viewOnlyText}>View Only</span>
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
      {showDetailsModal && selectedApplication && (() => {
        const getResumeUrl = (resumePath) => {
          if (!resumePath) return '';
          if (resumePath.startsWith('http')) return resumePath;
          return `${API_BASE_URL}/${resumePath}`;
        };
        const resumeUrl = getResumeUrl(selectedApplication.resume);
        const resumeFileName = selectedApplication.resume ? (selectedApplication.resume.includes('/') ? selectedApplication.resume.split('/').pop() : selectedApplication.resume) : '';

        return (
          <div style={styles.modalOverlay}>
            <div className="glass-card" style={styles.modalLarge}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Application Details</h3>
                <button onClick={() => setShowDetailsModal(false)} style={styles.closeBtn}>×</button>
              </div>
              
              <div style={styles.modalSplitBody}>
                {/* Left Column: Resume Viewer */}
                <div style={styles.leftColumn}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={styles.detailsSectionTitle}>Resume / CV</h4>
                    {resumeUrl ? (
                      <a
                        href={resumeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: 'var(--color-primary)',
                          fontSize: '13px',
                          fontWeight: '600',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        Open in New Tab ↗
                      </a>
                    ) : null}
                  </div>
                  {resumeUrl ? (
                    <iframe
                      src={resumeUrl}
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                        backgroundColor: 'rgba(255,255,255,0.02)'
                      }}
                      title="Resume PDF"
                    />
                  ) : (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: 1,
                      border: '1px dashed var(--color-border)',
                      borderRadius: '8px',
                      color: 'var(--color-text-muted)',
                      fontSize: '14px',
                      background: 'rgba(0,0,0,0.05)'
                    }}>
                      No resume uploaded for this applicant.
                    </div>
                  )}
                </div>

                {/* Right Column: Application Details */}
                <div style={styles.rightColumn}>
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
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>Address:</span>
                        <span style={styles.detailValue}>{selectedApplication.location}</span>
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
                                         selectedApplication.status === 'Hired' ? 'var(--color-success-light)' :
                                         selectedApplication.status === 'Rejected' ? 'var(--color-danger-light)' : 'var(--color-warning-light)',
                          color: selectedApplication.status === 'Recommended' ? 'var(--color-primary)' : 
                                 selectedApplication.status === 'Under Review' ? 'var(--color-accent)' :
                                 selectedApplication.status === 'Hired' ? 'var(--color-success)' :
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
                    <h4 style={styles.detailsSectionTitle}>Resume File</h4>
                    {resumeUrl ? (
                      <a
                        href={resumeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...styles.resumeLink, textDecoration: 'none' }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                        {resumeFileName} (Click to open)
                      </a>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>No resume uploaded</span>
                    )}
                  </div>
                </div>
              </div>

              <div style={styles.modalFooter}>
                {activeTab === 'History' ? (
                  <button onClick={() => setShowDetailsModal(false)} style={styles.closeModalBtn}>Close</button>
                ) : selectedApplication.status === 'Pending' ? (
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
        );
      })()}

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

                {/* Email preview — read-only, shown so HR can see what will be
                    sent. The actual send happens automatically on the backend
                    when this form is submitted; there is no separate "open
                    Gmail" step anymore. */}
                <div style={styles.formSection}>
                  <h4 style={styles.formSectionTitle}>Email Preview (sent automatically on submit)</h4>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>To</label>
                    <input 
                      type="email" 
                      style={styles.input} 
                      value={selectedApplication.email}
                      readOnly
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Subject</label>
                    <input 
                      type="text" 
                      style={styles.input} 
                      value={`Interview Invitation - ${selectedApplication.position} at WEA`}
                      readOnly
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Message</label>
                    <textarea 
                      style={styles.textarea} 
                      rows="8" 
                      value={`Dear ${selectedApplication.name},\n\nWe are pleased to invite you for an interview for the ${selectedApplication.position} position.\n\nInterview Details:\nDate: ${scheduleForm.date || '[Select date]'}\nTime: ${scheduleForm.time || '[Select time]'}\nInterviewer: ${scheduleForm.interviewer || '[Enter interviewer]'}\nType: ${scheduleForm.interviewType || '[Select type]'}\nLocation: ${scheduleForm.location || '[Enter location]'}\n\n${scheduleForm.notes ? `Additional Notes: ${scheduleForm.notes}\n\n` : ''}Please confirm your attendance by replying to this email.\n\nBest regards,\nWEA HR Team`}
                      readOnly
                    />
                  </div>
                </div>

                <div style={styles.modalFooter}>
                  <button type="button" onClick={() => setShowScheduleModal(false)} style={styles.closeModalBtn}>Cancel</button>
                  <button type="submit" disabled={scheduling} style={styles.submitBtn}>
                    {scheduling ? 'Sending...' : 'Schedule & Send Email'}
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
    marginBottom: '20px',
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
  // Active / History tabs
  subTabsContainer: {
    display: 'flex',
    gap: '28px',
    borderBottom: '1px solid var(--color-border)',
    marginBottom: '24px',
  },
  subTabButton: {
    background: 'none',
    border: 'none',
    borderBottom: '3px solid transparent',
    padding: '12px 6px',
    fontSize: '15px',
    cursor: 'pointer',
    transition: 'all 0.2s',
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
    alignItems: 'center',
  },
  viewOnlyText: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
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
  modalLarge: {
    width: '95%',
    maxWidth: '1300px',
    maxHeight: '92vh',
    overflow: 'hidden',
    padding: '28px',
    display: 'flex',
    flexDirection: 'column',
  },
  modalSplitBody: {
    display: 'flex',
    flexDirection: 'row',
    gap: '28px',
    flex: 1,
    overflow: 'hidden',
    marginTop: '12px',
    marginBottom: '12px',
  },
  leftColumn: {
    flex: 1.3,
    display: 'flex',
    flexDirection: 'column',
    height: '65vh',
  },
  rightColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    overflowY: 'auto',
    height: '65vh',
    paddingRight: '8px',
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