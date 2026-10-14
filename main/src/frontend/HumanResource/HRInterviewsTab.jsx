import React, { useState, useEffect, useMemo } from 'react';
import InterviewSchedulePicker from './InterviewSchedulePicker';
import Swal from 'sweetalert2';
import hrClient from './Hrclient';
import LocationSelector from './LocationSelector';

// Time parsing and conflict detection helpers
const parseMinutes = (timeStr) => {
  if (!timeStr) return null;
  const str = String(timeStr).trim().toUpperCase();
  const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const modifier = match[3];
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  return null;
};

const formatTimeDisplay = (timeStr) => {
  if (!timeStr) return '';
  const m = parseMinutes(timeStr);
  if (m === null) return timeStr;
  const hours = Math.floor(m / 60);
  const minutes = m % 60;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${ampm}`;
};

const mapInterview = (row) => ({
  id: row.id,
  applicationId: row.application_id,
  applicantId: row.application_id,
  applicantName: `${row.job_applications?.first_name || ''} ${row.job_applications?.last_name || ''}`.trim(),
  applicantEmail: row.job_applications?.email || '',
  applicantPhone: row.job_applications?.phone || '',
  position: row.job_applications?.position_applied || '',
  department: row.job_applications?.department || '',
  interviewDate: row.interview_date,
  interviewTime: row.interview_time,
  interviewer: row.interviewer,
  interviewType: row.interview_type,
  location: row.location || '',
  status: row.status,
  notes: row.notes || '',
});

const OTHER_LOCATION = '__OTHER_LOCATION__';

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
  const [activeTab, setActiveTab] = useState('Active'); // 'Active' | 'History'
  const [hoveredTab, setHoveredTab] = useState(null);
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [branchLocationOptions, setBranchLocationOptions] = useState([]);
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

  // Calendar View & Rescheduling State
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'calendar'
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({
    id: null,
    applicantName: '',
    position: '',
    date: '',
    time: '',
    interviewer: '',
    interviewType: 'Technical Interview',
    location: '',
    notes: '',
  });

  const checkTimeConflict = (targetDate, targetTime, excludeId = null) => {
    if (!targetDate || !targetTime) return null;
    const targetMinutes = parseMinutes(targetTime);

    return interviews.find(int => {
      if (excludeId && int.id === excludeId) return false;
      if (int.status !== 'Scheduled') return false;
      if (int.interviewDate !== targetDate) return false;

      const intMinutes = parseMinutes(int.interviewTime);
      if (targetMinutes !== null && intMinutes !== null) {
        return Math.abs(targetMinutes - intMinutes) < 30; // within 30 min collision buffer
      }
      return String(int.interviewTime).trim().toLowerCase() === String(targetTime).trim().toLowerCase();
    });
  };

  const bookedSlotsOnDate = useMemo(() => {
    if (!scheduleForm.date) return [];
    return interviews.filter(int =>
      int.interviewDate === scheduleForm.date &&
      int.status !== 'Cancelled' &&
      int.status !== 'Rejected'
    );
  }, [interviews, scheduleForm.date]);

  const scheduleConflict = useMemo(() => {
    if (!scheduleForm.date || !scheduleForm.time) return null;
    return checkTimeConflict(scheduleForm.date, scheduleForm.time);
  }, [interviews, scheduleForm.date, scheduleForm.time]);

  const bookedSlotsOnRescheduleDate = useMemo(() => {
    if (!rescheduleForm.date) return [];
    return interviews.filter(int =>
      int.id !== rescheduleForm.id &&
      int.interviewDate === rescheduleForm.date &&
      int.status !== 'Cancelled' &&
      int.status !== 'Rejected'
    );
  }, [interviews, rescheduleForm.date, rescheduleForm.id]);

  const rescheduleConflict = useMemo(() => {
    if (!rescheduleForm.date || !rescheduleForm.time) return null;
    return checkTimeConflict(rescheduleForm.date, rescheduleForm.time, rescheduleForm.id);
  }, [interviews, rescheduleForm.date, rescheduleForm.time, rescheduleForm.id]);

  useEffect(() => {
    loadInterviews();
    loadBranchLocation();
  }, []);

  const loadBranchLocation = async () => {
    try {
      const res = await hrClient.get('/branches/my-branch');
      const branch = res.data?.data;
      const options = [branch?.address, branch?.location]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index);
      setBranchLocationOptions(options);
      if (options.length > 0) {
        setScheduleForm(prev => ({ ...prev, location: prev.location || options[0] }));
      }
    } catch (err) {
      console.error('Failed to load branch location:', err);
    }
  };

  const loadInterviews = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await hrClient.get(`/interviews`);
      const rows = res.data?.data || [];
      setInterviews(rows.map(mapInterview));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load interviews. Please check your connection and try again.');
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
      await hrClient.put(`/interviews/${id}/status`, { status: 'Completed' });
      await loadInterviews();
      showSuccessAlert('Interview marked as completed!');
    } catch (err) {
      showErrorAlert(err.response?.data?.error || 'Failed to complete interview');
      console.error(err);
    }
  };

  const handleHire = async (id) => {
    const result = await showConfirmationAlert(
      'Hire Applicant',
      'Are you sure you want to hire this applicant? They will be added to the Onboarding list under Hired & Onboarding Employees.',
      'Yes, Hire Candidate'
    );
    if (!result.isConfirmed) return;

    try {
      await hrClient.put(`/interviews/${id}/status`, { status: 'Hired' });
      await loadInterviews();
      showSuccessAlert('Applicant hired successfully! They are now in the Onboarding tab under Hired & Onboarding Employees.');
    } catch (err) {
      showErrorAlert(err.response?.data?.error || 'Failed to hire applicant');
      console.error(err);
    }
  };

  const handleReject = async (id) => {
    const { value: reason, isDismissed } = await Swal.fire({
      title: 'Reject Applicant',
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
      await hrClient.put(`/interviews/${id}/status`, { status: 'Rejected', notes: reason });
      await loadInterviews();
      showSuccessAlert('Applicant rejected and notification email sent successfully!');
    } catch (err) {
      showErrorAlert(err.response?.data?.error || 'Failed to reject applicant');
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

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();

    // 🛡️ Front-end collision check: block occupied date & time
    const conflict = checkTimeConflict(scheduleForm.date, scheduleForm.time);
    if (conflict) {
      showErrorAlert(
        `Time-slot conflict: An interview is already scheduled on ${scheduleForm.date} at ${formatTimeDisplay(conflict.interviewTime)} with ${conflict.applicantName || 'another candidate'}. Please select a different time or date.`,
        'Time Slot Already Booked'
      );
      return;
    }

    try {
      await hrClient.post(`/interviews`, {
        application_id: selectedApplicant.id,
        interview_date: scheduleForm.date,
        interview_time: scheduleForm.time,
        interviewer: scheduleForm.interviewer,
        interview_type: scheduleForm.interviewType,
        location: scheduleForm.location,
        notes: scheduleForm.notes,
      });
      await loadInterviews();
      setShowScheduleModal(false);
      showSuccessAlert('Interview scheduled successfully!');

      // Open email modal to send Gmail
      setEmailForm({
        to: selectedApplicant.email,
        subject: `Interview Invitation - ${selectedApplicant.position} at WEA`,
        body: `Dear ${selectedApplicant.name},\n\nWe are pleased to invite you for an interview for the ${selectedApplicant.position} position.\n\nInterview Details:\nDate: ${scheduleForm.date}\nTime: ${formatTimeDisplay(scheduleForm.time)}\nInterviewer: ${scheduleForm.interviewer}\nType: ${scheduleForm.interviewType}\nLocation: ${scheduleForm.location}\n\nPlease confirm your attendance by contacting the HR office.\n\nBest regards,\nWEA HR Team`,
      });
      setShowEmailModal(true);
    } catch (err) {
      if (err.response?.status === 409) {
        showErrorAlert(err.response?.data?.error || 'This time slot is already occupied.', 'Time Slot Collision');
      } else {
        showErrorAlert(err.response?.data?.error || 'Failed to schedule interview');
      }
      console.error(err);
    }
  };

  const openRescheduleModal = (interview) => {
    setRescheduleForm({
      id: interview.id,
      applicantName: interview.applicantName,
      position: interview.position,
      date: interview.interviewDate,
      time: interview.interviewTime,
      interviewer: interview.interviewer,
      interviewType: interview.interviewType || 'Technical Interview',
      location: interview.location || '',
      notes: interview.notes || '',
    });
    setShowRescheduleModal(true);
  };

  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();

    const conflict = checkTimeConflict(rescheduleForm.date, rescheduleForm.time, rescheduleForm.id);
    if (conflict) {
      showErrorAlert(
        `Time-slot conflict: An interview is already scheduled on ${rescheduleForm.date} at ${formatTimeDisplay(conflict.interviewTime)} with ${conflict.applicantName || 'another candidate'}. Please choose a different date or time.`,
        'Time Slot Already Booked'
      );
      return;
    }

    try {
      await hrClient.put(`/interviews/${rescheduleForm.id}`, {
        interview_date: rescheduleForm.date,
        interview_time: rescheduleForm.time,
        interviewer: rescheduleForm.interviewer,
        interview_type: rescheduleForm.interviewType,
        location: rescheduleForm.location,
        notes: rescheduleForm.notes,
      });
      await loadInterviews();
      setShowRescheduleModal(false);
      showSuccessAlert('Interview rescheduled successfully!');
    } catch (err) {
      if (err.response?.status === 409) {
        showErrorAlert(err.response?.data?.error || 'This time slot is already occupied.', 'Time Slot Collision');
      } else {
        showErrorAlert(err.response?.data?.error || 'Failed to reschedule interview');
      }
      console.error(err);
    }
  };

  const handleSendEmail = (e) => {
    e.preventDefault();
    // Open Gmail with pre-filled email
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(emailForm.to)}&su=${encodeURIComponent(emailForm.subject)}&body=${encodeURIComponent(emailForm.body)}`;
    window.open(gmailUrl, '_blank');
    setShowEmailModal(false);
    showSuccessAlert('Gmail opened with interview invitation!');
  };

  const isHistoryStatus = (status) => ['Completed', 'Hired', 'Rejected', 'Cancelled'].includes(status);

  const activeCount = interviews.filter(int => !isHistoryStatus(int.status)).length;
  const historyCount = interviews.filter(int => isHistoryStatus(int.status)).length;

  const filteredInterviews = interviews.filter(int => {
    const matchesSearch =
      int.applicantName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      int.position?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      int.interviewer?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' || int.status === statusFilter;
    const matchesTab = activeTab === 'History'
      ? isHistoryStatus(int.status)
      : !isHistoryStatus(int.status);
    return matchesSearch && matchesStatus && matchesTab;
  });

  const todayDateStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  const interviewsByDate = useMemo(() => {
    const map = {};
    filteredInterviews.forEach(int => {
      if (!int.interviewDate) return;
      if (!map[int.interviewDate]) map[int.interviewDate] = [];
      map[int.interviewDate].push(int);
    });
    Object.keys(map).forEach(dateKey => {
      map[dateKey].sort((a, b) => {
        const ma = parseMinutes(a.interviewTime) ?? 0;
        const mb = parseMinutes(b.interviewTime) ?? 0;
        return ma - mb;
      });
    });
    return map;
  }, [filteredInterviews]);

  const calendarCells = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const totalCells = Math.ceil((firstDayIndex + daysInMonth) / 7) * 7;
    const cells = [];

    for (let i = 0; i < totalCells; i++) {
      if (i < firstDayIndex) {
        const dayNum = daysInPrevMonth - firstDayIndex + 1 + i;
        const d = new Date(year, month - 1, dayNum);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        cells.push({
          dayNum,
          dateStr: `${y}-${m}-${day}`,
          isCurrentMonth: false,
        });
      } else if (i < firstDayIndex + daysInMonth) {
        const dayNum = i - firstDayIndex + 1;
        const y = year;
        const m = String(month + 1).padStart(2, '0');
        const day = String(dayNum).padStart(2, '0');
        cells.push({
          dayNum,
          dateStr: `${y}-${m}-${day}`,
          isCurrentMonth: true,
        });
      } else {
        const dayNum = i - (firstDayIndex + daysInMonth) + 1;
        const d = new Date(year, month + 1, dayNum);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        cells.push({
          dayNum,
          dateStr: `${y}-${m}-${day}`,
          isCurrentMonth: false,
        });
      }
    }
    return cells;
  }, [calendarDate]);

  const selectedDayInterviews = useMemo(() => {
    if (!selectedCalendarDay) return [];
    return interviewsByDate[selectedCalendarDay] || [];
  }, [selectedCalendarDay, interviewsByDate]);

  if (loading) {
    return <div style={styles.loading}>Loading interviews...</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Interviews</h1>
        <p style={styles.subtitle}>Manage scheduled interviews and hiring decisions</p>
      </div>

      <div style={styles.subTabsContainer}>
        <button
          type="button"
          onClick={() => setActiveTab('Active')}
          onMouseEnter={() => setHoveredTab('Active')}
          onMouseLeave={() => setHoveredTab(null)}
          style={{
            ...styles.subTabButton,
            ...(activeTab === 'Active' ? styles.subTabButtonActive : hoveredTab === 'Active' ? styles.subTabButtonHovered : {})
          }}
        >
          Active
          <span style={{ ...styles.tabCount, ...(activeTab === 'Active' ? styles.tabCountActive : {}) }}>
            {activeCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('History')}
          onMouseEnter={() => setHoveredTab('History')}
          onMouseLeave={() => setHoveredTab(null)}
          style={{
            ...styles.subTabButton,
            ...(activeTab === 'History' ? styles.subTabButtonActive : hoveredTab === 'History' ? styles.subTabButtonHovered : {})
          }}
        >
          History
          <span style={{ ...styles.tabCount, ...(activeTab === 'History' ? styles.tabCountActive : {}) }}>
            {historyCount}
          </span>
        </button>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <span>{error}</span>
          <button onClick={loadInterviews} style={styles.retryBtn}>Retry</button>
        </div>
      )}

      <div className="glass-card" style={styles.card}>
        <div style={styles.toolbar}>
          <div style={styles.viewToggleGroup}>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                ...styles.viewToggleBtn,
                ...(viewMode === 'table' ? styles.viewToggleBtnActive : {})
              }}
              title="Table View"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="3" y1="15" x2="21" y2="15"></line>
                <line x1="9" y1="3" x2="9" y2="21"></line>
              </svg>
              <span>Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              style={{
                ...styles.viewToggleBtn,
                ...(viewMode === 'calendar' ? styles.viewToggleBtnActive : {})
              }}
              title="Calendar View"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <span>Calendar</span>
            </button>
          </div>

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
            <option value="Rejected">Rejected</option>
          </select>
        </div>

        {viewMode === 'table' ? (
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
                      <td style={styles.td}>{formatTimeDisplay(int.interviewTime)}</td>
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
                          {activeTab === 'Active' ? (
                            <>
                              {int.status === 'Scheduled' && (
                                <>
                                  <button onClick={() => openRescheduleModal(int)} style={styles.rescheduleBtn} title="Reschedule Interview">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <circle cx="12" cy="12" r="10"></circle>
                                      <polyline points="12 6 12 12 16 14"></polyline>
                                    </svg>
                                  </button>
                                  <button onClick={() => handleCompleteInterview(int.id)} style={styles.completeBtn} title="Complete Interview">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                  </button>
                                </>
                              )}
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
        ) : (
          <div style={styles.calendarContainer}>
            {/* Calendar Month Header & Navigation */}
            <div style={styles.calendarHeaderBar}>
              <div style={styles.calendarNavLeft}>
                <h2 style={styles.calendarMonthHeading}>
                  {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </h2>
                <span style={styles.calendarSubtitleBadge}>
                  {filteredInterviews.length} {filteredInterviews.length === 1 ? 'interview' : 'interviews'}
                </span>
              </div>
              <div style={styles.calendarNavButtons}>
                <button
                  type="button"
                  onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                  style={styles.calendarNavBtn}
                  title="Previous Month"
                >
                  ‹ Prev
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setCalendarDate(new Date(now.getFullYear(), now.getMonth(), 1));
                    setSelectedCalendarDay(now.toISOString().slice(0, 10));
                  }}
                  style={styles.calendarTodayBtn}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                  style={styles.calendarNavBtn}
                  title="Next Month"
                >
                  Next ›
                </button>
              </div>
            </div>

            {/* Days of week header */}
            <div style={styles.calendarDaysHeader}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} style={styles.calendarDayColHeader}>{day}</div>
              ))}
            </div>

            {/* Month Grid */}
            <div style={styles.calendarMonthGrid}>
              {calendarCells.map((cell, idx) => {
                const dayInterviews = interviewsByDate[cell.dateStr] || [];
                const isToday = cell.dateStr === todayDateStr;
                const isSelected = selectedCalendarDay === cell.dateStr;

                return (
                  <div
                    key={`${cell.dateStr}-${idx}`}
                    onClick={() => setSelectedCalendarDay(cell.dateStr)}
                    style={{
                      ...styles.calendarCell,
                      ...(cell.isCurrentMonth ? {} : styles.calendarCellOtherMonth),
                      ...(isSelected ? styles.calendarCellSelected : {}),
                      ...(isToday ? styles.calendarCellToday : {}),
                    }}
                  >
                    <div style={styles.cellTopRow}>
                      <span style={{
                        ...styles.cellDayNumber,
                        ...(isToday ? styles.cellDayNumberToday : {}),
                        ...(isSelected ? styles.cellDayNumberSelected : {})
                      }}>
                        {cell.dayNum}
                      </span>
                      {dayInterviews.length > 0 && (
                        <span style={styles.cellCountBadge}>
                          {dayInterviews.length}
                        </span>
                      )}
                    </div>

                    <div style={styles.cellEventsList}>
                      {dayInterviews.slice(0, 3).map((item) => (
                        <div
                          key={item.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetailsModal(item);
                          }}
                          style={{
                            ...styles.calendarEventChip,
                            borderLeftColor:
                              item.status === 'Completed' || item.status === 'Hired'
                                ? 'var(--color-primary)'
                                : item.status === 'Rejected'
                                  ? 'var(--color-danger)'
                                  : 'var(--color-accent, #3b82f6)',
                            background:
                              item.status === 'Completed' || item.status === 'Hired'
                                ? 'rgba(16, 185, 129, 0.12)'
                                : item.status === 'Rejected'
                                  ? 'rgba(239, 68, 68, 0.12)'
                                  : 'rgba(59, 130, 246, 0.12)',
                          }}
                          title={`${formatTimeDisplay(item.interviewTime)} - ${item.applicantName} (${item.position}) [${item.status}]`}
                        >
                          <span style={styles.chipTime}>{formatTimeDisplay(item.interviewTime)}</span>
                          <span style={styles.chipName}>{item.applicantName}</span>
                        </div>
                      ))}
                      {dayInterviews.length > 3 && (
                        <span style={styles.cellMoreText}>
                          +{dayInterviews.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected Day Inspector */}
            <div style={styles.dayInspectorCard}>
              <div style={styles.inspectorHeader}>
                <div style={styles.inspectorTitleWrap}>
                  <h3 style={styles.inspectorTitle}>
                    {selectedCalendarDay
                      ? new Date(`${selectedCalendarDay}T00:00:00`).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })
                      : 'Select a day on the calendar'}
                  </h3>
                  <span style={styles.inspectorSubtitle}>
                    {selectedDayInterviews.length} {selectedDayInterviews.length === 1 ? 'interview' : 'interviews'} on this date
                  </span>
                </div>
              </div>

              {selectedDayInterviews.length === 0 ? (
                <div style={styles.emptyInspector}>
                  <p style={styles.emptyInspectorText}>No interviews scheduled for this date.</p>
                </div>
              ) : (
                <div style={styles.inspectorList}>
                  {selectedDayInterviews.map((item) => (
                    <div key={item.id} style={styles.inspectorRow}>
                      <div style={styles.inspectorTimeBlock}>
                        <span style={styles.inspectorTimeBadge}>{formatTimeDisplay(item.interviewTime)}</span>
                        <span style={styles.inspectorTypeBadge}>{item.interviewType}</span>
                      </div>

                      <div style={styles.inspectorMainInfo}>
                        <div style={styles.inspectorApplicantName}>{item.applicantName}</div>
                        <div style={styles.inspectorSubMeta}>
                          <span><strong>Position:</strong> {item.position}</span>
                          <span>•</span>
                          <span><strong>Interviewer:</strong> {item.interviewer}</span>
                          <span>•</span>
                          <span><strong>Location:</strong> {item.location}</span>
                        </div>
                      </div>

                      <div style={styles.inspectorStatusAndActions}>
                        <span style={{
                          ...styles.statusBadge,
                          backgroundColor: item.status === 'Hired' ? 'var(--color-primary-light)' :
                            item.status === 'Rejected' ? 'var(--color-danger-light)' :
                              item.status === 'Completed' ? 'var(--color-accent-light)' : 'var(--color-warning-light)',
                          color: item.status === 'Hired' ? 'var(--color-primary)' :
                            item.status === 'Rejected' ? 'var(--color-danger)' :
                              item.status === 'Completed' ? 'var(--color-accent)' : 'var(--color-warning)'
                        }}>
                          {item.status}
                        </span>

                        <div style={styles.actionCell}>
                          <button onClick={() => openDetailsModal(item)} style={styles.viewBtn} title="View Details">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                          </button>
                          {item.status === 'Scheduled' && (
                            <>
                              <button onClick={() => openRescheduleModal(item)} style={styles.rescheduleBtn} title="Reschedule Interview">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10"></circle>
                                  <polyline points="12 6 12 12 16 14"></polyline>
                                </svg>
                              </button>
                              <button onClick={() => handleCompleteInterview(item.id)} style={styles.completeBtn} title="Complete Interview">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              </button>
                            </>
                          )}
                          {item.status === 'Completed' && (
                            <>
                              <button onClick={() => handleHire(item.id)} style={styles.hireBtn} title="Hire">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                  <circle cx="12" cy="7" r="4"></circle>
                                </svg>
                              </button>
                              <button onClick={() => handleReject(item.id)} style={styles.rejectBtn} title="Reject">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10"></circle>
                                  <line x1="15" y1="9" x2="9" y2="15"></line>
                                  <line x1="9" y1="9" x2="15" y2="15"></line>
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
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
                    <span style={styles.detailValue}>{formatTimeDisplay(selectedInterview.interviewTime)}</span>
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
                  <>
                    <button onClick={() => { setShowDetailsModal(false); openRescheduleModal(selectedInterview); }} style={styles.actionBtnSecondary}>
                      Reschedule
                    </button>
                    <button onClick={() => { setShowDetailsModal(false); handleCompleteInterview(selectedInterview.id); }} style={styles.actionBtnPrimary}>
                      Complete Interview
                    </button>
                  </>
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
                  <h4 style={styles.formSectionTitle}>Interview Schedule & Availability Calendar</h4>
                  <InterviewSchedulePicker
                    selectedDate={scheduleForm.date}
                    selectedTime={scheduleForm.time}
                    onSelectDate={(date) => setScheduleForm(prev => ({ ...prev, date }))}
                    onSelectTime={(time) => setScheduleForm(prev => ({ ...prev, time }))}
                    interviews={interviews}
                  />

                  <div style={styles.formGrid}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Selected Date *</label>
                      <input
                        type="date"
                        required
                        min={todayDateStr}
                        style={styles.input}
                        value={scheduleForm.date}
                        onChange={(e) => setScheduleForm(prev => ({ ...prev, date: e.target.value }))}
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Selected Time *</label>
                      <input
                        type="time"
                        required
                        style={styles.input}
                        value={scheduleForm.time}
                        onChange={(e) => setScheduleForm(prev => ({ ...prev, time: e.target.value }))}
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
                        onChange={(e) => setScheduleForm(prev => ({ ...prev, interviewer: e.target.value }))}
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Interview Type *</label>
                      <select
                        required
                        style={styles.input}
                        value={scheduleForm.interviewType}
                        onChange={(e) => setScheduleForm(prev => ({ ...prev, interviewType: e.target.value }))}
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
                    <LocationSelector
                      value={scheduleForm.location}
                      options={branchLocationOptions}
                      onChange={(newLocation) => setScheduleForm(prev => ({ ...prev, location: newLocation }))}
                      placeholder="Enter the interview address or meeting link..."
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
                      onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
                    />
                  </div>
                </div>

                <div style={styles.modalFooter}>
                  <button type="button" onClick={() => setShowScheduleModal(false)} style={styles.closeModalBtn}>Cancel</button>
                  <button
                    type="submit"
                    disabled={!!scheduleConflict}
                    style={{
                      ...styles.submitBtn,
                      opacity: scheduleConflict ? 0.6 : 1,
                      cursor: scheduleConflict ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Schedule & Send Email
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {showRescheduleModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Reschedule Interview</h3>
              <button onClick={() => setShowRescheduleModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <div style={styles.modalBody}>
              <form onSubmit={handleRescheduleSubmit} style={styles.form}>
                <div style={styles.formSection}>
                  <h4 style={styles.formSectionTitle}>Applicant</h4>
                  <div style={styles.applicantInfoBox}>
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Candidate:</span>
                      <span style={styles.infoValue}>{rescheduleForm.applicantName}</span>
                    </div>
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Position:</span>
                      <span style={styles.infoValue}>{rescheduleForm.position}</span>
                    </div>
                  </div>
                </div>

                <div style={styles.formSection}>
                  <h4 style={styles.formSectionTitle}>New Interview Schedule & Availability Calendar</h4>
                  <InterviewSchedulePicker
                    selectedDate={rescheduleForm.date}
                    selectedTime={rescheduleForm.time}
                    onSelectDate={(date) => setRescheduleForm(prev => ({ ...prev, date }))}
                    onSelectTime={(time) => setRescheduleForm(prev => ({ ...prev, time }))}
                    interviews={interviews}
                    excludeInterviewId={rescheduleForm.id}
                  />

                  <div style={styles.formGrid}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>New Date *</label>
                      <input
                        type="date"
                        required
                        min={todayDateStr}
                        style={styles.input}
                        value={rescheduleForm.date}
                        onChange={(e) => setRescheduleForm(prev => ({ ...prev, date: e.target.value }))}
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>New Time *</label>
                      <input
                        type="time"
                        required
                        style={styles.input}
                        value={rescheduleForm.time}
                        onChange={(e) => setRescheduleForm(prev => ({ ...prev, time: e.target.value }))}
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
                        value={rescheduleForm.interviewer}
                        onChange={(e) => setRescheduleForm(prev => ({ ...prev, interviewer: e.target.value }))}
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Interview Type *</label>
                      <select
                        required
                        style={styles.input}
                        value={rescheduleForm.interviewType}
                        onChange={(e) => setRescheduleForm(prev => ({ ...prev, interviewType: e.target.value }))}
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
                    <LocationSelector
                      value={rescheduleForm.location}
                      options={branchLocationOptions}
                      onChange={(newLocation) => setRescheduleForm(prev => ({ ...prev, location: newLocation }))}
                      placeholder="Enter the interview address or meeting link..."
                    />
                  </div>
                </div>

                <div style={styles.formSection}>
                  <h4 style={styles.formSectionTitle}>Reschedule Notes</h4>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Notes</label>
                    <textarea
                      style={styles.textarea}
                      rows="3"
                      placeholder="Reason for reschedule or updated instructions..."
                      value={rescheduleForm.notes}
                      onChange={(e) => setRescheduleForm({ ...rescheduleForm, notes: e.target.value })}
                    />
                  </div>
                </div>

                <div style={styles.modalFooter}>
                  <button type="button" onClick={() => setShowRescheduleModal(false)} style={styles.closeModalBtn}>Cancel</button>
                  <button
                    type="submit"
                    disabled={!!rescheduleConflict}
                    style={{
                      ...styles.submitBtn,
                      opacity: rescheduleConflict ? 0.6 : 1,
                      cursor: rescheduleConflict ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Confirm Reschedule
                  </button>
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
  subTabsContainer: {
    display: 'flex',
    gap: '8px',
    borderBottom: '1px solid var(--color-border)',
    marginTop: '-4px',
    marginBottom: '20px',
  },
  subTabButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '10px 4px',
    marginRight: '16px',
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  subTabButtonActive: {
    color: 'var(--color-primary)',
    borderBottom: '2px solid var(--color-primary)',
  },
  subTabButtonHovered: {
    color: 'var(--color-text-primary)',
  },
  tabCount: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: '30px',
    background: 'var(--color-bg-card-hover)',
    color: 'var(--color-text-muted)',
  },
  tabCountActive: {
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
  },
  viewOnlyText: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
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
  viewOnlyText: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
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

  viewToggleGroup: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--color-bg-card-hover, rgba(255, 255, 255, 0.05))',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    padding: '3px',
    gap: '4px',
  },
  viewToggleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 14px',
    border: 'none',
    borderRadius: '8px',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  viewToggleBtnActive: {
    background: 'var(--color-primary)',
    color: '#ffffff',
    boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)',
  },
  rescheduleBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    color: 'var(--color-accent, #3b82f6)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  actionBtnSecondary: {
    padding: '10px 20px',
    backgroundColor: 'var(--color-bg-card-hover, rgba(255, 255, 255, 0.08))',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  bookedSlotsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '10px 14px',
    borderRadius: '8px',
    background: 'var(--color-bg-card-hover, rgba(255, 255, 255, 0.03))',
    border: '1px solid var(--color-border)',
    marginTop: '-4px',
    marginBottom: '8px',
  },
  bookedSlotsLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  bookedSlotsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  bookedSlotChip: {
    fontSize: '11px',
    fontWeight: '600',
    padding: '3px 8px',
    borderRadius: '6px',
    background: 'rgba(239, 68, 68, 0.12)',
    color: 'var(--color-danger, #ef4444)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
  },
  conflictAlert: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 14px',
    borderRadius: '8px',
    background: 'rgba(239, 68, 68, 0.12)',
    color: 'var(--color-danger, #ef4444)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    fontSize: '13px',
    lineHeight: '1.45',
    marginTop: '-4px',
    marginBottom: '8px',
  },
  calendarContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  calendarHeaderBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    paddingBottom: '16px',
    borderBottom: '1px solid var(--color-border)',
  },
  calendarNavLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  calendarMonthHeading: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    margin: 0,
    letterSpacing: '-0.3px',
  },
  calendarSubtitleBadge: {
    fontSize: '12px',
    fontWeight: '600',
    padding: '4px 10px',
    borderRadius: '20px',
    background: 'var(--color-primary-light, rgba(79, 70, 229, 0.12))',
    color: 'var(--color-primary)',
  },
  calendarNavButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  calendarNavBtn: {
    padding: '7px 14px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  calendarTodayBtn: {
    padding: '7px 16px',
    borderRadius: '8px',
    border: '1px solid var(--color-primary)',
    background: 'var(--color-primary-light, rgba(79, 70, 229, 0.12))',
    color: 'var(--color-primary)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  calendarDaysHeader: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '8px',
    textAlign: 'center',
  },
  calendarDayColHeader: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    padding: '6px 0',
  },
  calendarMonthGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '8px',
  },
  calendarCell: {
    minHeight: '115px',
    padding: '8px',
    borderRadius: '10px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    background: 'var(--color-bg-card)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    overflow: 'hidden',
  },
  calendarCellOtherMonth: {
    opacity: 0.45,
    background: 'transparent',
  },
  calendarCellSelected: {
    borderColor: 'var(--color-primary)',
    boxShadow: '0 0 0 2px var(--color-primary-light, rgba(79, 70, 229, 0.25))',
    background: 'var(--color-bg-card-hover)',
  },
  calendarCellToday: {
    borderColor: 'var(--color-primary)',
  },
  cellTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cellDayNumber: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    width: '24px',
    height: '24px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
  },
  cellDayNumberToday: {
    background: 'var(--color-primary)',
    color: '#ffffff',
    fontWeight: '700',
  },
  cellDayNumberSelected: {
    color: 'var(--color-primary)',
    fontWeight: '700',
  },
  cellCountBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '1px 6px',
    borderRadius: '10px',
    background: 'var(--color-primary-light, rgba(79, 70, 229, 0.15))',
    color: 'var(--color-primary)',
  },
  cellEventsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
  },
  calendarEventChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 6px',
    borderRadius: '4px',
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
    fontSize: '11px',
    fontWeight: '500',
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    cursor: 'pointer',
    transition: 'transform 0.1s ease',
  },
  chipTime: {
    fontWeight: '700',
    fontSize: '10px',
    flexShrink: 0,
    opacity: 0.9,
  },
  chipName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cellMoreText: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: '2px',
  },
  dayInspectorCard: {
    borderRadius: '12px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    padding: '20px',
    marginTop: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  inspectorHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '12px',
    borderBottom: '1px solid var(--color-border)',
  },
  inspectorTitleWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  inspectorTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  inspectorSubtitle: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
  },
  emptyInspector: {
    padding: '28px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
    fontSize: '14px',
  },
  emptyInspectorText: {
    margin: 0,
  },
  inspectorList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  inspectorRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    flexWrap: 'wrap',
  },
  inspectorTimeBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '100px',
  },
  inspectorTimeBadge: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--color-primary)',
  },
  inspectorTypeBadge: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  inspectorMainInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
    minWidth: '220px',
  },
  inspectorApplicantName: {
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  inspectorSubMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
  },
  inspectorStatusAndActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },

};