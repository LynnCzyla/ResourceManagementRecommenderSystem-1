import React, { useState, useEffect } from 'react';
import { getEmployees, saveEmployees } from '../mockState';

export default function RMEmployeeDirectoryTab() {
  const [employees, setEmployees] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('All');

  useEffect(() => {
    setEmployees(getEmployees());
  }, []);

  const handleToggleVerify = (empId) => {
    const updated = employees.map(emp => {
      if (emp.id === empId) {
        return { ...emp, isVerified: !emp.isVerified };
      }
      return emp;
    });
    setEmployees(updated);
    saveEmployees(updated);
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = 
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.skills.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()));
      
    const matchesRole = selectedRole === 'All' || emp.role === selectedRole;
    return matchesSearch && matchesRole;
  });

  const uniqueRoles = ['All', ...new Set(employees.map(emp => emp.role))];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Employee Directory</h1>
        <p style={styles.subtitle}>Verify employee profiles, view skills, and check credentials parsed by OCR & NLP.</p>
      </div>

      {/* Filter Row */}
      <div style={styles.filterRow}>
        <div style={styles.searchWrapper}>
          <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search by name, skills, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        <select 
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
          style={styles.selectFilter}
        >
          {uniqueRoles.map((role, idx) => (
            <option key={idx} value={role}>{role}</option>
          ))}
        </select>
      </div>

      {/* Grid List */}
      <div style={styles.grid}>
        {filteredEmployees.length === 0 ? (
          <div className="glass-card" style={styles.emptyCard}>
            No employee profiles found matching the filters.
          </div>
        ) : (
          filteredEmployees.map(emp => (
            <div key={emp.id} className="glass-card" style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                  <img src={emp.avatar} alt={emp.name} style={styles.avatar} />
                  <div>
                    <h3 style={styles.empName}>
                      {emp.name}
                      {emp.isVerified && (
                        <span style={styles.verifyBadge} title="Verified Profile">✓ Verified</span>
                      )}
                    </h3>
                    <div style={styles.empRole}>{emp.role}</div>
                    <div style={styles.empDept}>{emp.department}</div>
                  </div>
                </div>
              </div>

              {/* Skills Section */}
              <div style={styles.section}>
                <h4 style={styles.sectionHeader}>NLP Extracted Skills</h4>
                <div style={styles.skillsList}>
                  {emp.skills.map((skill, idx) => (
                    <span key={idx} style={styles.skillPill}>{skill}</span>
                  ))}
                </div>
              </div>

              {/* Certifications Section */}
              <div style={styles.section}>
                <h4 style={styles.sectionHeader}>OCR Parsed Certifications</h4>
                <div style={styles.certList}>
                  {emp.certifications.length === 0 ? (
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>No certifications verified.</span>
                  ) : (
                    emp.certifications.map(cert => (
                      <div key={cert.id} style={styles.certItem}>
                        <div style={styles.certMeta}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                              <path d="M4 22h16"></path>
                              <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"></path>
                              <path d="M12 2a15.3 15.3 0 0 1 4 10H8a15.3 15.3 0 0 1 4-10z"></path>
                            </svg>
                            <strong>{cert.name}</strong>
                          </span>
                          <span>{cert.issuer} | Issued: {cert.date}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Footer / Actions */}
              <div style={styles.cardFooter}>
                <button 
                  onClick={() => handleToggleVerify(emp.id)}
                  style={{
                    ...styles.actionVerifyBtn,
                    backgroundColor: emp.isVerified ? 'var(--color-danger-light)' : 'var(--color-primary-light)',
                    color: emp.isVerified ? 'var(--color-danger)' : 'var(--color-success)',
                    borderColor: emp.isVerified ? 'var(--color-danger)' : 'var(--color-primary)'
                  }}
                >
                  {emp.isVerified ? 'Revoke Profile Verification' : '✓ Verify Profile Details'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    textAlign: 'left',
  },
  header: {
    marginBottom: '8px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '800',
    letterSpacing: '-0.75px',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '15px',
    color: 'var(--color-text-secondary)',
  },
  filterRow: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  },
  searchWrapper: {
    position: 'relative',
    flex: 1,
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
    padding: '10px 14px 10px 38px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    outline: 'none',
    fontSize: '14px',
  },
  selectFilter: {
    padding: '10px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    fontWeight: '600',
    outline: 'none',
    fontSize: '14px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
    gap: '24px',
  },
  emptyCard: {
    gridColumn: '1 / -1',
    padding: '40px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
  },
  card: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  avatar: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  empName: {
    fontSize: '16px',
    fontWeight: '800',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  verifyBadge: {
    backgroundColor: 'var(--color-primary-light)',
    color: 'var(--color-success)',
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: '700',
  },
  empRole: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    fontWeight: '600',
    marginTop: '2px',
  },
  empDept: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  sectionHeader: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-text-muted)',
    fontWeight: '700',
    margin: 0,
  },
  skillsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  skillPill: {
    fontSize: '11px',
    background: 'var(--color-bg-card-hover)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    padding: '3px 8px',
    borderRadius: '4px',
    fontWeight: '600',
  },
  certList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  certItem: {
    padding: '8px 12px',
    background: 'rgba(255, 255, 255, 0.01)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
  },
  certMeta: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: '11px',
    gap: '2px',
  },
  cardFooter: {
    marginTop: 'auto',
    borderTop: '1px solid var(--color-border)',
    paddingTop: '16px',
    display: 'flex',
    justifyContent: 'stretch',
  },
  actionVerifyBtn: {
    flex: 1,
    padding: '10px',
    borderRadius: '6px',
    border: '1px solid',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s',
  }
};
