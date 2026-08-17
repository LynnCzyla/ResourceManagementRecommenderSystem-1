import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import hrClient from './Hrclient';


const mapHire = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone || '',
  position: row.positions?.position_name || '',
  department: row.departments?.department_name || '',
  hireDate: row.hire_date,
  salary: row.salary || 0,
  status: row.status,
  // The hired_employees table doesn't store interviewer/interview date directly —
  // check the linked interview record (interview_id) on the Interviews tab for that.
  interviewer: '',
  interviewDate: '',
});

export default function HRHiredEmployeesTab() {
  const [hiredEmployees, setHiredEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');

  useEffect(() => {
    loadHiredEmployees();
  }, []);

  const loadHiredEmployees = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await hrClient.get(`/hired-employees`);
      const rows = res.data?.data || [];
      setHiredEmployees(rows.map(mapHire));
    } catch (err) {
      setError('Failed to load hired employees');
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

  const openDetailsModal = (employee) => {
    setSelectedEmployee(employee);
    setShowDetailsModal(true);
  };

  const filteredEmployees = hiredEmployees.filter(emp => {
    const matchesSearch = 
      emp.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.position?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDepartment = departmentFilter === 'All' || emp.department === departmentFilter;
    return matchesSearch && matchesDepartment;
  });

  const departments = [...new Set(hiredEmployees.map(e => e.department))];

  if (loading) {
    return <div style={styles.loading}>Loading hired employees...</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Hired Employees</h1>
        <p style={styles.subtitle}>View and manage employees hired through the recruitment process</p>
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
              placeholder="Search employees..."
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

        <div style={styles.statsRow}>
          <div className="glass-card" style={styles.statCard}>
            <div style={styles.statValue}>{hiredEmployees.length}</div>
            <div style={styles.statLabel}>Total Hired</div>
          </div>
          <div className="glass-card" style={styles.statCard}>
            <div style={styles.statValue}>{hiredEmployees.filter(e => e.status === 'Active').length}</div>
            <div style={styles.statLabel}>Active</div>
          </div>
          <div className="glass-card" style={styles.statCard}>
            <div style={styles.statValue}>{hiredEmployees.filter(e => e.status === 'Onboarding').length}</div>
            <div style={styles.statLabel}>Onboarding</div>
          </div>
        </div>

        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>Employee</th>
                <th style={styles.th}>Position</th>
                <th style={styles.th}>Department</th>
                <th style={styles.th}>Hire Date</th>
                <th style={styles.th}>Salary</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr><td colSpan="7" style={styles.emptyRow}>No hired employees found.</td></tr>
              ) : (
                filteredEmployees.map(emp => (
                  <tr key={emp.id} style={styles.tableRow}>
                    <td style={styles.td}>
                      <div style={styles.employeeInfo}>
                        <div style={styles.employeeName}>{emp.name}</div>
                        <div style={styles.employeeEmail}>{emp.email}</div>
                      </div>
                    </td>
                    <td style={styles.td}>{emp.position}</td>
                    <td style={styles.td}>{emp.department}</td>
                    <td style={styles.td}>{emp.hireDate}</td>
                    <td style={styles.td}>₱{parseInt(emp.salary).toLocaleString()}/mo</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: emp.status === 'Active' ? 'var(--color-primary-light)' : 'var(--color-accent-light)',
                        color: emp.status === 'Active' ? 'var(--color-primary)' : 'var(--color-accent)'
                      }}>
                        {emp.status}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.actionCell}>
                        <button onClick={() => openDetailsModal(emp)} style={styles.viewBtn} title="View Details">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </button>
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
                    <span style={styles.detailValue}>{selectedEmployee.phone}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Status:</span>
                    <span style={{
                      ...styles.detailValue,
                      ...styles.statusBadge,
                      backgroundColor: selectedEmployee.status === 'Active' ? 'var(--color-primary-light)' : 'var(--color-accent-light)',
                      color: selectedEmployee.status === 'Active' ? 'var(--color-primary)' : 'var(--color-accent)'
                    }}>
                      {selectedEmployee.status}
                    </span>
                  </div>
                </div>
              </div>

              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Employment Information</h4>
                <div style={styles.detailsGrid}>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Position:</span>
                    <span style={styles.detailValue}>{selectedEmployee.position}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Department:</span>
                    <span style={styles.detailValue}>{selectedEmployee.department}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Hire Date:</span>
                    <span style={styles.detailValue}>{selectedEmployee.hireDate}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Salary:</span>
                    <span style={styles.detailValue}>₱{parseInt(selectedEmployee.salary).toLocaleString()}/mo</span>
                  </div>
                </div>
              </div>

              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Interview Information</h4>
                <div style={styles.detailsGrid}>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Interviewer:</span>
                    <span style={styles.detailValue}>{selectedEmployee.interviewer}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Interview Date:</span>
                    <span style={styles.detailValue}>{selectedEmployee.interviewDate}</span>
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
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  statCard: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  statValue: {
    fontSize: '32px',
    fontWeight: '700',
    color: 'var(--color-primary)',
  },
  statLabel: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    fontWeight: '500',
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
    marginTop: '8px',
    paddingTop: '16px',
    borderTop: '1px solid var(--color-border)',
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