import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import hrClient from './Hrclient';

// Internal tab keys stay the same as before (Hired / Onboarding / Archived) so the existing
// filtering logic doesn't need to change — only the LABEL and TOOLTIP shown to the user changes.
// Hired      -> displayed as "Onboarding"  (candidates who need / received a job offer email)
// Onboarding -> displayed as "Employee"    (real WEA staff, sourced from the `profiles` table)
// Archived   -> stays "Archived"           (applicant did not accept the offer)
const TAB_META = {
  Hired: {
    label: 'Onboarding',
    tooltip: 'This is when you create and send a job offer email to the applicant.',
  },
  Onboarding: {
    label: 'Employee',
    tooltip: 'All the employees in WEA — pulled directly from their system profiles.',
  },
  Archived: {
    label: 'Archived',
    tooltip: 'The applicant did not accept the job offer.',
  },
};

const mapHire = (row) => {
  let uiStatus = 'Hired';
  const notesStr = row.job_applications?.notes || row.notes || '';

  if (row.status === 'Inactive' || row.status === 'Archived') {
    uiStatus = 'Archived';
  } else if (row.status === 'Active' || notesStr.includes('OFFER_SENT') || notesStr.includes('OFFER_ACCEPTED')) {
    uiStatus = 'Offer Sent';
  } else {
    uiStatus = 'Hired';
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    position: row.job_applications?.position_applied || row.positions?.position_name || row.position || '',
    department: row.job_applications?.department || row.departments?.department_name || row.department || '',
    hireDate: row.hire_date || '',
    salary: row.salary || 0,
    status: uiStatus,
    rawStatus: row.status,
    notes: notesStr,
    offerAccepted: notesStr.includes('OFFER_ACCEPTED'),
  };
};

// Maps a row from the `profiles` table into the shape the Employee tab / details modal expects.
// Adjust the field names on the right if your `profiles` schema differs.
const mapProfileEmployee = (row) => ({
  id: row.id,
  name: row.full_name || row.name || `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unnamed',
  email: row.email || '',
  phone: row.phone || row.contact_number || 'N/A',
  position: row.role || row.position || row.job_title || 'N/A',
  department: row.department || row.department_name || 'N/A',
  hireDate: row.created_at ? String(row.created_at).slice(0, 10) : (row.hire_date || 'N/A'),
  salary: null,
  status: 'Employee',
});

export default function HRHiredEmployeesTab() {
  const [hiredEmployees, setHiredEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employeesError, setEmployeesError] = useState(null);

  // Tabs (internal keys): 'Hired', 'Onboarding', 'Archived' — see TAB_META for display labels
  // Default to Onboarding so the most active records are visible first.
  const [activeSubTab, setActiveSubTab] = useState('Onboarding');
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');

  // Modals
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);

  // Forms
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    position: '',
    department: '',
    salary: '',
    hireDate: '',
    status: '',
  });

  const [offerForm, setOfferForm] = useState({
    jobTitle: '',
    salary: '',
    benefits: 'SSS, PhilHealth, Pag-IBIG, HMO Insurance, Paid Leaves',
    employmentType: 'Full-time',
    startDate: '',
    workLocation: 'Main Office Headquarters',
    workingHours: '8:00 AM - 5:00 PM (Mon-Fri)',
    conditions: 'Offer is subject to medical exam and routine background check.',
    instructions: 'Please reply to this email confirming your formal acceptance within 5 business days.',
    subject: '',
    customMessage: '',
    sending: false,
  });

  useEffect(() => {
    loadHiredEmployees();
    loadEmployees();
  }, []);

  const loadHiredEmployees = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await hrClient.get(`/hired-employees`);
      const rows = res.data?.data || [];
      setHiredEmployees(rows.map(mapHire));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load hired employees.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      setEmployeesLoading(true);
      setEmployeesError(null);
      const res = await hrClient.get(`/hired-employees/employees`);
      const rows = res.data?.data || [];
      setEmployees(rows.map(mapProfileEmployee));
    } catch (err) {
      setEmployeesError(err.response?.data?.error || 'Failed to load employees.');
      console.error(err);
    } finally {
      setEmployeesLoading(false);
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

  // Actions
  const openDetailsModal = (emp) => {
    setSelectedEmployee(emp);
    setShowDetailsModal(true);
  };

  const openEditModal = (emp) => {
    if (emp.offerAccepted) return; // locked once the offer is accepted
    setSelectedEmployee(emp);
    setEditForm({
      name: emp.name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      position: emp.position || '',
      department: emp.department || '',
      salary: emp.salary || '',
      hireDate: emp.hireDate || '',
      status: emp.status || 'Hired',
    });
    setShowEditModal(true);
  };

  const openOfferModal = (emp) => {
    if (emp.offerAccepted) return; // locked once the offer is accepted
    setSelectedEmployee(emp);
    setOfferForm({
      jobTitle: emp.position || 'Employee Position',
      salary: emp.salary || '',
      benefits: 'SSS, PhilHealth, Pag-IBIG, HMO Medical Insurance, 15 Days Paid Leave',
      employmentType: 'Full-time',
      startDate: emp.hireDate || new Date().toISOString().slice(0, 10),
      workLocation: 'Main Office Headquarters',
      workingHours: '8:00 AM - 5:00 PM (Mon-Fri)',
      conditions: 'Offer is subject to medical exam and background check verification.',
      instructions: 'Please reply to this email confirming your formal acceptance within 5 business days.',
      subject: `Official Job Offer: ${emp.position || 'Position'} - WEA Resource Management`,
      customMessage: `Dear ${emp.name},\n\nWe are delighted to extend this formal offer of employment for the position of ${emp.position || 'Position'} at WEA.`,
      sending: false,
    });
    setShowOfferModal(true);
  };

  const handleSendOfferSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    try {
      setOfferForm(prev => ({ ...prev, sending: true }));
      await hrClient.post(`/hired-employees/${selectedEmployee.id}/send-offer`, {
        jobTitle: offerForm.jobTitle,
        salary: offerForm.salary,
        benefits: offerForm.benefits,
        employmentType: offerForm.employmentType,
        startDate: offerForm.startDate,
        workLocation: offerForm.workLocation,
        workingHours: offerForm.workingHours,
        conditions: offerForm.conditions,
        instructions: offerForm.instructions,
        subject: offerForm.subject,
        customMessage: offerForm.customMessage,
      });

      setShowOfferModal(false);
      await loadHiredEmployees();
      showSuccessAlert(`Job offer email sent successfully to ${selectedEmployee.name}!`);
    } catch (err) {
      showErrorAlert(err.response?.data?.error || 'Failed to send offer email.');
      console.error(err);
    } finally {
      setOfferForm(prev => ({ ...prev, sending: false }));
    }
  };

  // Check button — HR manually confirms the applicant formally accepted the offer
  // (e.g. verbally, or confirmed on their first day). This intentionally does NOT
  // refetch the full list or move the row anywhere — it only updates this one row
  // locally so the applicant keeps showing right where they are. The list is only
  // re-fetched from the server when the record is moved to Archived.
  const handleAcceptOffer = async (emp) => {
    if (emp.offerAccepted) return;

    const confirm = await showConfirmationAlert(
      'Confirm Offer Acceptance',
      `Confirm that ${emp.name} has formally accepted the job offer? Once confirmed, the Edit and Email actions will be locked for this record.`,
      'Yes, Mark as Accepted'
    );
    if (!confirm.isConfirmed) return;

    try {
      await hrClient.put(`/hired-employees/${emp.id}/accept-offer`);
      setHiredEmployees(prev =>
        prev.map(e => (e.id === emp.id ? { ...e, offerAccepted: true } : e))
      );
      showSuccessAlert(`${emp.name}'s offer acceptance has been recorded.`);
    } catch (err) {
      showErrorAlert(err.response?.data?.error || 'Failed to record offer acceptance.');
      console.error(err);
    }
  };

  const handleArchive = async (emp) => {
    const confirm = await showConfirmationAlert(
      'Archive Employee',
      `Are you sure you want to archive ${emp.name}? They will be moved to the view-only Archived list.`,
      'Yes, Archive'
    );
    if (!confirm.isConfirmed) return;

    try {
      await hrClient.put(`/hired-employees/${emp.id}/status`, { status: 'Archived' });
      await loadHiredEmployees();
      showSuccessAlert(`${emp.name} has been moved to Archived.`);
    } catch (err) {
      showErrorAlert(err.response?.data?.error || 'Failed to archive employee.');
      console.error(err);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    try {
      await hrClient.put(`/hired-employees/${selectedEmployee.id}`, {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
        salary: editForm.salary ? parseFloat(editForm.salary) : 0,
        hire_date: editForm.hireDate,
        status: editForm.status,
      });

      setShowEditModal(false);
      await loadHiredEmployees();
      showSuccessAlert('Employee details updated successfully!');
    } catch (err) {
      showErrorAlert(err.response?.data?.error || 'Failed to update employee.');
      console.error(err);
    }
  };

  // Status breakdown counters
  const hiredCount = hiredEmployees.filter(e => e.status === 'Hired' || e.status === 'Offer Sent').length;
  const archivedCount = hiredEmployees.filter(e => e.status === 'Archived' || e.status === 'Inactive').length;
  const employeeCount = employees.length;

  const filteredEmployees = hiredEmployees.filter(emp => {
    const matchesSearch =
      emp.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.position?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDepartment = departmentFilter === 'All' || emp.department === departmentFilter;

    let matchesTab = false;
    if (activeSubTab === 'Hired') {
      matchesTab = emp.status === 'Hired' || emp.status === 'Offer Sent';
    } else if (activeSubTab === 'Archived') {
      matchesTab = emp.status === 'Archived' || emp.status === 'Inactive';
    }

    return matchesSearch && matchesDepartment && matchesTab;
  });

  const filteredProfileEmployees = employees.filter(emp => {
    const matchesSearch =
      emp.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.position?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDepartment = departmentFilter === 'All' || emp.department === departmentFilter;
    return matchesSearch && matchesDepartment;
  });

  const isEmployeeTab = activeSubTab === 'Onboarding';

  const departments = isEmployeeTab
    ? [...new Set(employees.map(e => e.department).filter(Boolean))]
    : [...new Set(hiredEmployees.map(e => e.department).filter(Boolean))];

  if (loading) {
    return <div style={styles.loading}>Loading hired employees...</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Hired & Onboarding Employees</h1>
        <p style={styles.subtitle}>Manage hired applicants, job offer emails, onboarding, and archived records</p>
      </div>

      {/* 1. Summary Cards (3 Equal Sized Cards, each with a tooltip explaining what it means) */}
      <div style={styles.summaryGrid}>
        <div className="glass-card" style={styles.summaryCard}>
          <div style={styles.summaryValue}>{hiredCount}</div>
          <div style={styles.summaryLabelRow}>
            <span style={styles.summaryLabel}>{TAB_META.Hired.label}</span>
            <span style={styles.tooltipIcon} title={TAB_META.Hired.tooltip}>ⓘ</span>
          </div>
        </div>
        <div className="glass-card" style={styles.summaryCard}>
          <div style={styles.summaryValue}>{employeeCount}</div>
          <div style={styles.summaryLabelRow}>
            <span style={styles.summaryLabel}>{TAB_META.Onboarding.label}</span>
            <span style={styles.tooltipIcon} title={TAB_META.Onboarding.tooltip}>ⓘ</span>
          </div>
        </div>
        <div className="glass-card" style={styles.summaryCard}>
          <div style={styles.summaryValue}>{archivedCount}</div>
          <div style={styles.summaryLabelRow}>
            <span style={styles.summaryLabel}>{TAB_META.Archived.label}</span>
            <span style={styles.tooltipIcon} title={TAB_META.Archived.tooltip}>ⓘ</span>
          </div>
        </div>
      </div>

      {/* 2. Main Tabs */}
      <div style={styles.subTabsContainer}>
        <button
          onClick={() => setActiveSubTab('Hired')}
          title={TAB_META.Hired.tooltip}
          style={{
            ...styles.subTabButton,
            borderBottomColor: activeSubTab === 'Hired' ? 'var(--color-primary)' : 'transparent',
            color: activeSubTab === 'Hired' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'Hired' ? '700' : '500'
          }}
        >
          {TAB_META.Hired.label} ({hiredCount})
        </button>
        <button
          onClick={() => setActiveSubTab('Onboarding')}
          title={TAB_META.Onboarding.tooltip}
          style={{
            ...styles.subTabButton,
            borderBottomColor: activeSubTab === 'Onboarding' ? 'var(--color-primary)' : 'transparent',
            color: activeSubTab === 'Onboarding' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'Onboarding' ? '700' : '500'
          }}
        >
          {TAB_META.Onboarding.label} ({employeeCount})
        </button>
        <button
          onClick={() => setActiveSubTab('Archived')}
          title={TAB_META.Archived.tooltip}
          style={{
            ...styles.subTabButton,
            borderBottomColor: activeSubTab === 'Archived' ? 'var(--color-primary)' : 'transparent',
            color: activeSubTab === 'Archived' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'Archived' ? '700' : '500'
          }}
        >
          {TAB_META.Archived.label} ({archivedCount})
        </button>
      </div>

      {!isEmployeeTab && error && (
        <div style={styles.errorBanner}>
          <span>{error}</span>
          <button onClick={loadHiredEmployees} style={styles.retryBtn}>Retry</button>
        </div>
      )}
      {isEmployeeTab && employeesError && (
        <div style={styles.errorBanner}>
          <span>{employeesError}</span>
          <button onClick={loadEmployees} style={styles.retryBtn}>Retry</button>
        </div>
      )}

      {/* Table Container */}
      <div className="glass-card" style={styles.card}>
        <div style={styles.toolbar}>
          <div style={styles.searchWrapper}>
            <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder={`Search ${TAB_META[activeSubTab].label.toLowerCase()}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="All">All Departments</option>
            {departments.map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>

        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                {isEmployeeTab ? (
                  <>
                    <th style={styles.th}>Employee</th>
                    <th style={styles.th}>Role</th>
                    <th style={styles.th}>Department</th>
                    <th style={styles.th}>Date Joined</th>
                    <th style={styles.th}>Actions</th>
                  </>
                ) : (
                  <>
                    <th style={styles.th}>Employee</th>
                    <th style={styles.th}>Position</th>
                    <th style={styles.th}>Department</th>
                    <th style={styles.th}>Start / Hire Date</th>
                    <th style={styles.th}>Offer Status</th>
                    <th style={styles.th}>Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {isEmployeeTab ? (
                employeesLoading ? (
                  <tr><td colSpan="5" style={styles.emptyRow}>Loading employees...</td></tr>
                ) : filteredProfileEmployees.length === 0 ? (
                  <tr><td colSpan="5" style={styles.emptyRow}>No employees found.</td></tr>
                ) : (
                  filteredProfileEmployees.map(emp => (
                    <tr key={emp.id} style={styles.tableRow}>
                      <td style={styles.td}>
                        <div style={styles.employeeInfo}>
                          <div style={styles.employeeName}>{emp.name}</div>
                          <div style={styles.employeeEmail}>{emp.email}</div>
                        </div>
                      </td>
                      <td style={styles.td}>{emp.position || 'N/A'}</td>
                      <td style={styles.td}>{emp.department || 'N/A'}</td>
                      <td style={styles.td}>{emp.hireDate || 'N/A'}</td>
                      <td style={styles.td}>
                        <button onClick={() => openDetailsModal(emp)} style={styles.iconBtnView} title="View Details">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )
              ) : filteredEmployees.length === 0 ? (
                <tr><td colSpan="6" style={styles.emptyRow}>No employees in {TAB_META[activeSubTab].label} list.</td></tr>
              ) : (
                filteredEmployees.map(emp => (
                  <tr key={emp.id} style={styles.tableRow}>
                    <td style={styles.td}>
                      <div style={styles.employeeInfo}>
                        <div style={styles.employeeName}>{emp.name}</div>
                        <div style={styles.employeeEmail}>{emp.email}</div>
                      </div>
                    </td>
                    <td style={styles.td}>{emp.position || 'N/A'}</td>
                    <td style={styles.td}>{emp.department || 'N/A'}</td>
                    <td style={styles.td}>{emp.hireDate || 'N/A'}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: emp.status === 'Offer Sent' ? 'rgba(59, 130, 246, 0.15)' :
                                       emp.status === 'Archived' ? 'rgba(148, 163, 184, 0.15)' : 'var(--color-accent-light)',
                        color: emp.status === 'Offer Sent' ? '#3b82f6' :
                               emp.status === 'Archived' ? '#94a3b8' : 'var(--color-accent)'
                      }}>
                        {emp.status === 'Offer Sent' ? 'Offer Sent ✓' : emp.status}
                      </span>
                      {emp.offerAccepted && (
                        <span style={styles.acceptedBadge}>✔ Accepted</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <div style={styles.actionCell}>
                        {/* View — always visible */}
                        <button
                          onClick={() => openDetailsModal(emp)}
                          style={styles.iconBtnView}
                          title="View Details"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </button>

                        {activeSubTab === 'Hired' && (
                          <>
                            {!emp.offerAccepted && (
                              <>
                                <button
                                  onClick={() => openOfferModal(emp)}
                                  disabled={emp.offerAccepted}
                                  style={{
                                    ...styles.iconBtnEmail,
                                    ...(emp.offerAccepted ? styles.iconBtnDisabled : {})
                                  }}
                                  title={emp.offerAccepted ? 'Locked — offer already accepted' : 'Send Job Offer Email'}
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                    <polyline points="22,6 12,13 2,6"></polyline>
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleAcceptOffer(emp)}
                                  disabled={emp.offerAccepted || emp.status !== 'Offer Sent'}
                                  style={{
                                    ...styles.iconBtnCheck,
                                    ...(emp.offerAccepted ? styles.iconBtnAccepted : {}),
                                    ...(emp.status !== 'Offer Sent' && !emp.offerAccepted ? styles.iconBtnDisabled : {})
                                  }}
                                  title={
                                    emp.offerAccepted 
                                      ? 'Offer already accepted' 
                                      : emp.status !== 'Offer Sent' 
                                        ? 'Must send job offer email first' 
                                        : 'Mark Offer as Accepted'
                                  }
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: emp.offerAccepted ? '4px' : '0' }}>
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                  </svg>
                                  {emp.offerAccepted && 'Accepted'}
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleArchive(emp)}
                              style={styles.iconBtnArchive}
                              title="Archive Employee (offer not accepted)"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}>
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                              Archive
                            </button>
                          </>
                        )}

                        {activeSubTab === 'Archived' && (
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
      {showDetailsModal && selectedEmployee && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Employee Details</h3>
              <button onClick={() => setShowDetailsModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Personal Information</h4>
                <div style={styles.detailsGrid}>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Name:</span>
                    <span style={styles.detailValue}>{selectedEmployee.name}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Email:</span>
                    <span style={styles.detailValue}>{selectedEmployee.email}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Phone:</span>
                    <span style={styles.detailValue}>{selectedEmployee.phone || 'N/A'}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Current Status:</span>
                    <span style={styles.detailValue}>
                      {selectedEmployee.status}
                      {selectedEmployee.offerAccepted ? ' (Offer Accepted)' : ''}
                    </span>
                  </div>
                </div>
              </div>

              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Employment Information</h4>
                <div style={styles.detailsGrid}>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Position:</span>
                    <span style={styles.detailValue}>{selectedEmployee.position || 'N/A'}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Department:</span>
                    <span style={styles.detailValue}>{selectedEmployee.department || 'N/A'}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Start / Hire Date:</span>
                    <span style={styles.detailValue}>{selectedEmployee.hireDate || 'N/A'}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Offered Salary:</span>
                    <span style={styles.detailValue}>
                      {selectedEmployee.salary ? `₱${parseInt(selectedEmployee.salary).toLocaleString()}/mo` : 'Not specified'}
                    </span>
                  </div>
                </div>
              </div>

              <div style={styles.modalFooter}>
                <button onClick={() => setShowDetailsModal(false)} style={styles.closeModalBtn}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {showEditModal && selectedEmployee && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Edit Employee Details</h3>
              <button onClick={() => setShowEditModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <div style={styles.modalBody}>
              <form onSubmit={handleSaveEdit} style={styles.form}>
                <div style={styles.formGrid}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Full Name *</label>
                    <input
                      type="text" required style={styles.input}
                      value={editForm.name}
                      onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Email *</label>
                    <input
                      type="email" required style={styles.input}
                      value={editForm.email}
                      onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                    />
                  </div>
                </div>

                <div style={styles.formGrid}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Phone Number</label>
                    <input
                      type="text" style={styles.input}
                      value={editForm.phone}
                      onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Monthly Salary (₱)</label>
                    <input
                      type="number" min="0" step="500" style={styles.input}
                      value={editForm.salary}
                      onChange={(e) => setEditForm({...editForm, salary: e.target.value})}
                    />
                  </div>
                </div>

                <div style={styles.formGrid}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Start / Hire Date</label>
                    <input
                      type="date" style={styles.input}
                      value={editForm.hireDate}
                      onChange={(e) => setEditForm({...editForm, hireDate: e.target.value})}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Status</label>
                    <select
                      style={styles.input}
                      value={editForm.status}
                      onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                    >
                      <option value="Hired">Hired</option>
                      <option value="Offer Sent">Offer Sent</option>
                      <option value="Archived">Archived</option>
                    </select>
                  </div>
                </div>

                <div style={styles.modalFooter}>
                  <button type="button" onClick={() => setShowEditModal(false)} style={styles.closeModalBtn}>Cancel</button>
                  <button type="submit" style={styles.submitBtn}>Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 3. Offer Email Modal */}
      {showOfferModal && selectedEmployee && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalLarge}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>✉️ Send Official Job Offer Email</h3>
              <button onClick={() => setShowOfferModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <div style={styles.modalBody}>
              <form onSubmit={handleSendOfferSubmit} style={styles.form}>

                {/* Applicant Summary */}
                <div style={styles.applicantInfoBox}>
                  <div style={styles.infoRow}>
                    <span style={styles.infoLabel}>Applicant Name:</span>
                    <span style={styles.infoValue}>{selectedEmployee.name}</span>
                  </div>
                  <div style={styles.infoRow}>
                    <span style={styles.infoLabel}>Applicant Email:</span>
                    <span style={styles.infoValue}>{selectedEmployee.email}</span>
                  </div>
                </div>

                {/* Offer Details Grid */}
                <div style={styles.formGrid}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Job Title *</label>
                    <input
                      type="text" required style={styles.input}
                      value={offerForm.jobTitle}
                      onChange={(e) => setOfferForm({...offerForm, jobTitle: e.target.value})}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Salary / Compensation (₱) *</label>
                    <input
                      type="number" required min="0" step="500" style={styles.input}
                      value={offerForm.salary}
                      onChange={(e) => setOfferForm({...offerForm, salary: e.target.value})}
                    />
                  </div>
                </div>

                <div style={styles.formGrid}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Employment Type *</label>
                    <select
                      style={styles.input}
                      value={offerForm.employmentType}
                      onChange={(e) => setOfferForm({...offerForm, employmentType: e.target.value})}
                    >
                      <option value="Full-time">Full-time Regular</option>
                      <option value="Probationary">Probationary (6 Months)</option>
                      <option value="Contract">Project Contract</option>
                      <option value="Part-time">Part-time</option>
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Start Date *</label>
                    <input
                      type="date" required style={styles.input}
                      value={offerForm.startDate}
                      onChange={(e) => setOfferForm({...offerForm, startDate: e.target.value})}
                    />
                  </div>
                </div>

                <div style={styles.formGrid}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Work Location / Setup</label>
                    <input
                      type="text" style={styles.input}
                      value={offerForm.workLocation}
                      onChange={(e) => setOfferForm({...offerForm, workLocation: e.target.value})}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Working Hours</label>
                    <input
                      type="text" style={styles.input}
                      value={offerForm.workingHours}
                      onChange={(e) => setOfferForm({...offerForm, workingHours: e.target.value})}
                    />
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Benefits Package</label>
                  <input
                    type="text" style={styles.input}
                    value={offerForm.benefits}
                    onChange={(e) => setOfferForm({...offerForm, benefits: e.target.value})}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Conditions of Employment</label>
                  <textarea
                    style={styles.textarea} rows="2"
                    value={offerForm.conditions}
                    onChange={(e) => setOfferForm({...offerForm, conditions: e.target.value})}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Instructions for Accepting the Offer</label>
                  <textarea
                    style={styles.textarea} rows="2"
                    value={offerForm.instructions}
                    onChange={(e) => setOfferForm({...offerForm, instructions: e.target.value})}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Email Subject *</label>
                  <input
                    type="text" required style={styles.input}
                    value={offerForm.subject}
                    onChange={(e) => setOfferForm({...offerForm, subject: e.target.value})}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Email Custom Body / Message</label>
                  <textarea
                    style={styles.textarea} rows="3"
                    value={offerForm.customMessage}
                    onChange={(e) => setOfferForm({...offerForm, customMessage: e.target.value})}
                  />
                </div>

                <div style={styles.modalFooter}>
                  <button
                    type="button"
                    onClick={() => setShowOfferModal(false)}
                    style={styles.closeModalBtn}
                    disabled={offerForm.sending}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={styles.submitBtnSuccess}
                    disabled={offerForm.sending}
                  >
                    {offerForm.sending ? 'Sending Offer Email...' : 'Send Offer'}
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
  // 1. Equal Sized Summary Cards Grid
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '20px',
    marginBottom: '24px',
  },
  summaryCard: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    minHeight: '110px',
  },
  summaryValue: {
    fontSize: '34px',
    fontWeight: '800',
    color: 'var(--color-primary)',
  },
  summaryLabelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  summaryLabel: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  tooltipIcon: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    cursor: 'help',
    lineHeight: 1,
  },
  // 2. Main Tabs Container & Buttons
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
    padding: '14px 16px',
    fontSize: '12px',
    fontWeight: '700',
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
  employeeInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  employeeName: {
    fontWeight: '600',
    color: 'var(--color-text-primary)',
  },
  employeeEmail: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '700',
  },
  acceptedBadge: {
    marginLeft: '8px',
    padding: '4px 10px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: '700',
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#10b981',
  },
  actionCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  // Action Icon Buttons with consistent styling
  iconBtnView: {
    background: 'rgba(59, 130, 246, 0.12)',
    color: '#3b82f6',
    border: 'none',
    padding: '6px 10px',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnEdit: {
    background: 'rgba(234, 179, 8, 0.12)',
    color: '#eab308',
    border: 'none',
    padding: '6px 10px',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnEmail: {
    background: 'rgba(168, 85, 247, 0.15)',
    color: '#a855f7',
    border: 'none',
    padding: '6px 10px',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnCheck: {
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#10b981',
    border: 'none',
    padding: '6px 10px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnAccepted: {
    background: 'rgba(16, 185, 129, 0.28)',
    color: '#10b981',
    cursor: 'not-allowed',
    fontSize: '12px',
    padding: '6px 10px',
  },
  iconBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  iconBtnArchive: {
    background: 'rgba(239, 68, 68, 0.12)',
    color: '#ef4444',
    border: 'none',
    padding: '6px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  viewOnlyText: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
  },
  modal: {
    width: '100%',
    maxWidth: '650px',
    maxHeight: '90vh',
    overflow: 'auto',
    padding: '28px',
  },
  modalLarge: {
    width: '100%',
    maxWidth: '750px',
    maxHeight: '90vh',
    overflow: 'auto',
    padding: '28px',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
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
    gap: '20px',
  },
  applicantInfoBox: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '8px',
  },
  infoRow: {
    display: 'flex',
    gap: '12px',
  },
  infoLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
    width: '130px',
  },
  infoValue: {
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    fontWeight: '500',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  detailsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  detailsSectionTitle: {
    fontSize: '15px',
    fontWeight: '700',
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
    fontSize: '14px',
    color: 'var(--color-text-primary)',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '12px',
    paddingTop: '16px',
    borderTop: '1px solid var(--color-border)',
  },
  submitBtn: {
    padding: '10px 20px',
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  submitBtnSuccess: {
    padding: '10px 20px',
    backgroundColor: 'var(--color-success)',
    color: '#ffffff',
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