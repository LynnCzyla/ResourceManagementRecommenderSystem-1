import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';

export default function HRResourceRequestsTab() {
  const [resourceRequests, setResourceRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notConnected, setNotConnected] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    loadResourceRequests();
  }, []);

  const loadResourceRequests = async () => {
    // There is no backend route for Resource Manager requests in either upload —
    // server.js references ./routes/ResourceManager/Index but that file (and
    // whatever it requires, e.g. a resourceRequests.js) was never sent.
    // Rather than show fake numbers, this tab now loads empty and says so.
    // Once you send that route file, replace this function with a real
    // axios.get(`${API_BASE}/resource-requests`) — same pattern as the other tabs.
    setLoading(true);
    setResourceRequests([]);
    setNotConnected(true);
    setLoading(false);
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

  const handleApprove = async (id) => {
    Swal.fire({
      title: 'Not Connected Yet',
      text: 'This tab has no backend endpoint to approve against yet — send the ResourceManager route file and this button will work.',
      icon: 'info',
      confirmButtonColor: 'var(--color-primary)',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
    });
  };

  const handleReject = async (id) => {
    Swal.fire({
      title: 'Not Connected Yet',
      text: 'This tab has no backend endpoint to reject against yet — send the ResourceManager route file and this button will work.',
      icon: 'info',
      confirmButtonColor: 'var(--color-primary)',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
    });
  };

  const openDetailsModal = (request) => {
    setSelectedRequest(request);
    setShowDetailsModal(true);
  };

  const filteredRequests = resourceRequests.filter(req => {
    const matchesSearch = 
      req.requestId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.project?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.requestedBy?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return <div style={styles.loading}>Loading resource requests...</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Resource Requests</h1>
        <p style={styles.subtitle}>Review resource requests from Resource Managers</p>
      </div>

      {notConnected && (
        <div className="glass-card" style={{
          padding: '16px 20px',
          marginBottom: '20px',
          border: '1px solid var(--color-warning)',
          color: 'var(--color-warning)',
          fontSize: '14px',
          fontWeight: '600',
        }}>
          ⚠ Not connected to a backend yet — there's no ResourceManager route file to call.
          This tab is empty (not mock data) until that endpoint is provided.
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
              placeholder="Search requests..."
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
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>

        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>Request ID</th>
                <th style={styles.th}>Project</th>
                <th style={styles.th}>Requested By</th>
                <th style={styles.th}>Request Date</th>
                <th style={styles.th}>Priority</th>
                <th style={styles.th}>Resources Needed</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length === 0 ? (
                <tr><td colSpan="8" style={styles.emptyRow}>No resource requests found.</td></tr>
              ) : (
                filteredRequests.map(req => (
                  <tr key={req.id} style={styles.tableRow}>
                    <td style={{ ...styles.td, fontWeight: '600', color: 'var(--color-primary)' }}>{req.requestId}</td>
                    <td style={styles.td}>{req.project}</td>
                    <td style={styles.td}>{req.requestedBy}</td>
                    <td style={styles.td}>{req.requestDate}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.priorityBadge,
                        backgroundColor: req.priority === 'High' ? 'var(--color-danger-light)' : 
                                       req.priority === 'Medium' ? 'var(--color-warning-light)' : 'var(--color-accent-light)',
                        color: req.priority === 'High' ? 'var(--color-danger)' : 
                               req.priority === 'Medium' ? 'var(--color-warning)' : 'var(--color-accent)'
                      }}>
                        {req.priority}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.resourcesList}>
                        {req.requiredResources.map((res, idx) => (
                          <div key={idx} style={styles.resourceItem}>
                            {res.quantity}x {res.role}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: req.status === 'Approved' ? 'var(--color-primary-light)' : 
                                       req.status === 'Rejected' ? 'var(--color-danger-light)' : 'var(--color-warning-light)',
                        color: req.status === 'Approved' ? 'var(--color-primary)' : 
                               req.status === 'Rejected' ? 'var(--color-danger)' : 'var(--color-warning)'
                      }}>
                        {req.status}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.actionCell}>
                        <button onClick={() => openDetailsModal(req)} style={styles.viewBtn} title="View Details">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </button>
                        {req.status === 'Pending' && (
                          <>
                            <button onClick={() => handleApprove(req.id)} style={styles.approveBtn} title="Approve">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            </button>
                            <button onClick={() => handleReject(req.id)} style={styles.rejectBtn} title="Reject">
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
      {showDetailsModal && selectedRequest && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Resource Request Details</h3>
              <button onClick={() => setShowDetailsModal(false)} style={styles.closeBtn}>×</button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Request Information</h4>
                <div style={styles.detailsGrid}>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Request ID:</span>
                    <span style={styles.detailValue}>{selectedRequest.requestId}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Project:</span>
                    <span style={styles.detailValue}>{selectedRequest.project}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Requested By:</span>
                    <span style={styles.detailValue}>{selectedRequest.requestedBy}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Request Date:</span>
                    <span style={styles.detailValue}>{selectedRequest.requestDate}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Priority:</span>
                    <span style={{
                      ...styles.detailValue,
                      ...styles.priorityBadge,
                      backgroundColor: selectedRequest.priority === 'High' ? 'var(--color-danger-light)' : 
                                     selectedRequest.priority === 'Medium' ? 'var(--color-warning-light)' : 'var(--color-accent-light)',
                      color: selectedRequest.priority === 'High' ? 'var(--color-danger)' : 
                             selectedRequest.priority === 'Medium' ? 'var(--color-warning)' : 'var(--color-accent)'
                    }}>
                      {selectedRequest.priority}
                    </span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Status:</span>
                    <span style={{
                      ...styles.detailValue,
                      ...styles.statusBadge,
                      backgroundColor: selectedRequest.status === 'Approved' ? 'var(--color-primary-light)' : 
                                     selectedRequest.status === 'Rejected' ? 'var(--color-danger-light)' : 'var(--color-warning-light)',
                      color: selectedRequest.status === 'Approved' ? 'var(--color-primary)' : 
                             selectedRequest.status === 'Rejected' ? 'var(--color-danger)' : 'var(--color-warning)'
                    }}>
                      {selectedRequest.status}
                    </span>
                  </div>
                </div>
              </div>

              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Justification</h4>
                <div style={styles.justification}>
                  {selectedRequest.justification}
                </div>
              </div>

              <div style={styles.detailsSection}>
                <h4 style={styles.detailsSectionTitle}>Required Resources</h4>
                <div style={styles.resourcesTable}>
                  <table style={styles.innerTable}>
                    <thead>
                      <tr style={styles.innerTableHeader}>
                        <th style={styles.innerTh}>Role</th>
                        <th style={styles.innerTh}>Quantity</th>
                        <th style={styles.innerTh}>Experience</th>
                        <th style={styles.innerTh}>Skills</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRequest.requiredResources.map((res, idx) => (
                        <tr key={idx} style={styles.innerTableRow}>
                          <td style={styles.innerTd}>{res.role}</td>
                          <td style={styles.innerTd}>{res.quantity}</td>
                          <td style={styles.innerTd}>{res.experience}</td>
                          <td style={styles.innerTd}>{res.skills}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={styles.modalFooter}>
                {selectedRequest.status === 'Pending' ? (
                  <>
                    <button onClick={() => { setShowDetailsModal(false); handleApprove(selectedRequest.id); }} style={styles.actionBtnPrimary}>
                      Approve Request
                    </button>
                    <button onClick={() => { setShowDetailsModal(false); handleReject(selectedRequest.id); }} style={styles.actionBtnDanger}>
                      Reject Request
                    </button>
                  </>
                ) : (
                  <button onClick={() => setShowDetailsModal(false)} style={styles.closeModalBtn}>Close</button>
                )}
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
  priorityBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
  },
  resourcesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  resourceItem: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
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
  approveBtn: {
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
  justification: {
    padding: '16px',
    backgroundColor: 'var(--color-bg-root)',
    borderRadius: '8px',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    lineHeight: '1.6',
    border: '1px solid var(--color-border)',
  },
  resourcesTable: {
    overflowX: 'auto',
  },
  innerTable: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  innerTableHeader: {
    borderBottom: '1px solid var(--color-border)',
  },
  innerTh: {
    textAlign: 'left',
    padding: '10px 12px',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
  },
  innerTableRow: {
    borderBottom: '1px solid var(--color-border)',
  },
  innerTd: {
    padding: '12px',
    fontSize: '13px',
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
