import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';

export default function ApplicantJobPostingsTab({ showMyApplications }) {
  const [jobPostings, setJobPostings] = useState([]);
  const [myApplications, setMyApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [selectedPosting, setSelectedPosting] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showApplicationModal, setShowApplicationModal] = useState(false);

  useEffect(() => {
    loadJobPostings();
  }, []);

  const loadJobPostings = async () => {
    try {
      setLoading(true);
      // Mock data for now - these are the job postings from HR
      setJobPostings([
        {
          id: 1,
          title: 'Senior Software Engineer',
          department: 'Engineering',
          location: 'Manila',
          employmentType: 'Full-time',
          salaryMin: '80000',
          salaryMax: '120000',
          status: 'Active',
          postedDate: '2025-08-05',
          description: 'We are looking for an experienced Senior Software Engineer to join our team and lead development of our core products.',
          requirements: '5+ years experience in software development, proficiency in React, Node.js, and Python',
          responsibilities: 'Lead development team, architect solutions, mentor junior developers',
          benefits: 'Health insurance, flexible work hours, professional development budget',
        },
        {
          id: 2,
          title: 'Data Analyst',
          department: 'Analytics',
          location: 'Cebu',
          employmentType: 'Full-time',
          salaryMin: '50000',
          salaryMax: '70000',
          status: 'Active',
          postedDate: '2025-08-03',
          description: 'Join our analytics team to help drive data-driven decisions across the organization.',
          requirements: '3+ years experience in data analysis, proficiency in Python, SQL, and Tableau',
          responsibilities: 'Analyze business data, create reports, provide insights',
          benefits: 'Health insurance, performance bonuses, training programs',
        },
        {
          id: 3,
          title: 'UI/UX Designer',
          department: 'Design',
          location: 'Remote',
          employmentType: 'Full-time',
          salaryMin: '60000',
          salaryMax: '90000',
          status: 'Active',
          postedDate: '2025-08-01',
          description: 'We are seeking a talented UI/UX Designer to create beautiful and intuitive user experiences.',
          requirements: '3+ years experience in UI/UX design, proficiency in Figma, Adobe XD, and Sketch',
          responsibilities: 'Design user interfaces, conduct user research, create prototypes',
          benefits: 'Remote work, flexible schedule, creative freedom',
        },
        {
          id: 4,
          title: 'Project Manager',
          department: 'Operations',
          location: 'Manila',
          employmentType: 'Full-time',
          salaryMin: '70000',
          salaryMax: '100000',
          status: 'Active',
          postedDate: '2025-07-28',
          description: 'We need an experienced Project Manager to lead our cross-functional teams and deliver projects on time.',
          requirements: '5+ years experience in project management, PMP certification preferred',
          responsibilities: 'Manage project timelines, coordinate teams, communicate with stakeholders',
          benefits: 'Leadership opportunities, competitive salary, career growth',
        },
        {
          id: 5,
          title: 'Backend Developer',
          department: 'Engineering',
          location: 'Manila',
          employmentType: 'Full-time',
          salaryMin: '65000',
          salaryMax: '95000',
          status: 'Active',
          postedDate: '2025-07-25',
          description: 'Join our backend team to build robust and scalable server-side applications.',
          requirements: '3+ years experience in backend development, proficiency in Java, Spring Boot',
          responsibilities: 'Develop REST APIs, optimize database performance, ensure security',
          benefits: 'Technical challenges, learning opportunities, team collaboration',
        },
      ]);
    } catch (err) {
      setError('Failed to load job postings');
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

  const openDetailsModal = (posting) => {
    setSelectedPosting(posting);
    setShowDetailsModal(true);
  };

  const handleApply = (posting) => {
    setShowDetailsModal(false);
    setSelectedPosting(posting);
    setShowApplicationModal(true);
  };

  const loadMyApplications = () => {
    // Mock data for user's applications
    setMyApplications([
      {
        id: 1,
        jobId: 1,
        jobTitle: 'Senior Software Engineer',
        department: 'Engineering',
        appliedDate: '2025-08-09',
        status: 'Pending',
      },
      {
        id: 2,
        jobId: 3,
        jobTitle: 'UI/UX Designer',
        department: 'Design',
        appliedDate: '2025-08-07',
        status: 'Scheduled for Interview',
      },
    ]);
  };

  const filteredPostings = jobPostings.filter(posting => {
    const matchesSearch = 
      posting.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      posting.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      posting.location?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDepartment = departmentFilter === 'All' || posting.department === departmentFilter;
    const matchesLocation = locationFilter === 'All' || posting.location === locationFilter;
    const isActive = posting.status === 'Active';
    return matchesSearch && matchesDepartment && matchesLocation && isActive;
  });

  const departments = [...new Set(jobPostings.map(p => p.department))];
  const locations = [...new Set(jobPostings.map(p => p.location))];

  if (loading) {
    return <div style={styles.loading}>Loading job postings...</div>;
  }

  // Show My Applications view
  if (showMyApplications) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>My Applications</h1>
          <p style={styles.subtitle}>Track your job application status</p>
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
              <p style={styles.emptyText}>You haven't applied to any positions yet.</p>
            </div>
          ) : (
            <div style={styles.applicationsList}>
              {myApplications.map(app => (
                <div key={app.id} className="glass-card" style={styles.applicationCard}>
                  <div style={styles.applicationHeader}>
                    <h3 style={styles.applicationTitle}>{app.jobTitle}</h3>
                    <span style={{
                      ...styles.statusBadge,
                      backgroundColor: app.status === 'Scheduled for Interview' ? 'var(--color-accent-light)' : 
                                     app.status === 'Hired' ? 'var(--color-primary-light)' :
                                     app.status === 'Rejected' ? 'var(--color-danger-light)' : 'var(--color-warning-light)',
                      color: app.status === 'Scheduled for Interview' ? 'var(--color-accent)' : 
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

  // Show Job Postings view
  return (
    <div style={styles.container}>
      <div style={styles.searchSection}>
        <div style={styles.searchBar}>
          <svg style={styles.searchIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Job title, keywords, or company"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        <div style={styles.filters}>
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
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="All">All Locations</option>
            {locations.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
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
                    <span style={styles.jobMetaItem}>{posting.location}</span>
                    <span style={styles.jobMetaSeparator}>•</span>
                    <span style={styles.jobMetaItem}>{posting.employmentType}</span>
                  </div>
                </div>
                <div style={styles.jobCardRight}>
                  <span style={styles.salary}>₱{parseInt(posting.salaryMin).toLocaleString()} - ₱{parseInt(posting.salaryMax).toLocaleString()}/mo</span>
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
                    <span style={styles.detailLabel}>Location:</span>
                    <span style={styles.detailValue}>{selectedPosting.location}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Employment Type:</span>
                    <span style={styles.detailValue}>{selectedPosting.employmentType}</span>
                  </div>
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Salary Range:</span>
                    <span style={styles.detailValue}>₱{parseInt(selectedPosting.salaryMin).toLocaleString()} - ₱{parseInt(selectedPosting.salaryMax).toLocaleString()}/mo</span>
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
              <form onSubmit={(e) => { e.preventDefault(); setShowApplicationModal(false); showSuccessAlert('Application submitted successfully!'); }} style={styles.form}>
                <div style={styles.formSection}>
                  <h4 style={styles.formSectionTitle}>Personal Information</h4>
                  <div style={styles.formGrid}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Full Name *</label>
                      <input type="text" required style={styles.input} placeholder="Enter your full name" />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Email *</label>
                      <input type="email" required style={styles.input} placeholder="your@email.com" />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Phone *</label>
                      <input type="tel" required style={styles.input} placeholder="+63 XXX XXX XXXX" />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Location</label>
                      <input type="text" style={styles.input} placeholder="City, Country" />
                    </div>
                  </div>
                </div>

                <div style={styles.formSection}>
                  <h4 style={styles.formSectionTitle}>Professional Details</h4>
                  <div style={styles.formGrid}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Years of Experience *</label>
                      <input type="number" required style={styles.input} placeholder="e.g., 5" />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Education Level *</label>
                      <select required style={styles.input}>
                        <option value="">Select education level</option>
                        <option value="high-school">High School</option>
                        <option value="associate">Associate Degree</option>
                        <option value="bachelor">Bachelor's Degree</option>
                        <option value="master">Master's Degree</option>
                        <option value="phd">PhD</option>
                      </select>
                    </div>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Skills *</label>
                    <input type="text" required style={styles.input} placeholder="e.g., React, Node.js, Python" />
                  </div>
                </div>

                <div style={styles.formSection}>
                  <h4 style={styles.formSectionTitle}>Cover Letter</h4>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Tell us why you're interested in this position *</label>
                    <textarea required style={styles.textarea} rows="5" placeholder="Write your cover letter here..." />
                  </div>
                </div>

                <div style={styles.formSection}>
                  <h4 style={styles.formSectionTitle}>Resume</h4>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Upload Resume (PDF) *</label>
                    <input type="file" accept=".pdf" required style={styles.fileInput} />
                    <p style={styles.fileHelp}>Accepted formats: PDF only. Max size: 5MB</p>
                  </div>
                </div>

                <div style={styles.modalFooter}>
                  <button type="button" onClick={() => setShowApplicationModal(false)} style={styles.closeModalBtn}>Cancel</button>
                  <button type="submit" style={styles.submitBtn}>Submit Application</button>
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
