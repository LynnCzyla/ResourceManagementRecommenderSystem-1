import React, { useState } from 'react';

export default function DbRecordsTab() {
  const [activeTable, setActiveTable] = useState('employees');
  const [searchQuery, setSearchQuery] = useState('');

  const [employees, setEmployees] = useState([
    { id: 1, name: 'Romell J. Ebuen', role: 'Electrical Technician', skills: ['Electrical Distribution', 'Transformer Installation'], certs: ['OSH 40-Hour Training', 'BOSH Certification'], hours: 32, capacity: 40 },
    { id: 2, name: 'Lynn Czyla M. Alpuerto', role: 'Lead Designer', skills: ['Electrical Distribution', 'Power Grid Design'], certs: ['Registered Electrical Engineer License'], hours: 12, capacity: 40 },
    { id: 3, name: 'Vincent Miguel P. Soriano', role: 'Safety Officer', skills: ['Safety Maintenance', 'Hazard Auditing'], certs: ['COSH Certification'], hours: 20, capacity: 20 },
    { id: 4, name: 'Engr. Juan Dela Cruz', email: 'juan.cruz@wea.com', role: 'Electrical Engineer', skills: ['Substation Installation', 'Power Grid Design'], certs: ['Professional Electrical Engineer License'], hours: 0, capacity: 40 },
  ]);

  const [projects, setProjects] = useState([
    { id: 101, name: 'Substation Wiring & Upgrade', client: 'Petron Gas Refinery', skills: ['Electrical Distribution', 'Transformer Installation'], certs: ['OSH 40-Hour Training'], hoursNeeded: 80, teamSize: 2, status: 'Active' },
    { id: 102, name: 'Refinery Electrical Safety Audit', client: 'Shell Oil Plant', skills: ['Safety Maintenance', 'Hazard Auditing'], certs: ['COSH Certification'], hoursNeeded: 40, teamSize: 1, status: 'Active' },
    { id: 103, name: 'Transformer Wiring Calibration', client: 'Chevron Distribution', skills: ['Transformer Installation'], certs: ['BOSH Certification'], hoursNeeded: 20, teamSize: 0, status: 'Draft' },
  ]);

  const handleHoursChange = (empId, newHours) => {
    const val = parseInt(newHours) || 0;
    setEmployees(employees.map(emp => emp.id === empId ? { ...emp, hours: Math.min(val, emp.capacity) } : emp));
  };

  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredProjects = projects.filter(proj =>
    proj.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    proj.client.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Database Records Management</h1>
        <p style={styles.subtitle}>Maintain table schema, synchronize indexes, and edit hours capacity mappings.</p>
      </div>

      <div style={styles.subTabsContainer}>
        <button 
          onClick={() => { setActiveTable('employees'); setSearchQuery(''); }} 
          style={{
            ...styles.subTabButton,
            borderBottomColor: activeTable === 'employees' ? 'var(--color-primary)' : 'transparent',
            color: activeTable === 'employees' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeTable === 'employees' ? '700' : '500'
          }}
        >
          Workforce Records (Employees)
        </button>
        <button 
          onClick={() => { setActiveTable('projects'); setSearchQuery(''); }} 
          style={{
            ...styles.subTabButton,
            borderBottomColor: activeTable === 'projects' ? 'var(--color-primary)' : 'transparent',
            color: activeTable === 'projects' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeTable === 'projects' ? '700' : '500'
          }}
        >
          Project Spec Records (Requirements)
        </button>
      </div>

      {activeTable === 'employees' && (
        <div className="glass-card">
          <div style={styles.tableToolbar}>
            <div style={styles.searchWrapper}>
              <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Search database employee records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.searchInput}
              />
            </div>
            <button style={styles.syncBtn} onClick={() => alert('Supabase indexing completed. 4 employee nodes synchronized.')}>
              Trigger Re-indexing
            </button>
          </div>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeaderRow}>
                  <th style={styles.th}>Employee Name</th>
                  <th style={styles.th}>Role Classification</th>
                  <th style={styles.th}>Verified Competencies</th>
                  <th style={styles.th}>Active Certifications</th>
                  <th style={styles.th}>Allocated Hours (C)</th>
                  <th style={styles.th}>Capacity</th>
                  <th style={styles.th}>Workload (A%)</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map(emp => {
                  const utilization = Math.round((emp.hours / emp.capacity) * 100);
                  return (
                    <tr key={emp.id} style={styles.tableBodyRow}>
                      <td style={{ ...styles.td, fontWeight: '600', color: 'var(--color-text-primary)' }}>{emp.name}</td>
                      <td style={styles.td}>{emp.role}</td>
                      <td style={styles.td}>
                        <div style={styles.badgeWrapper}>
                          {emp.skills.map((s, i) => (
                            <span key={i} style={styles.skillBadge}>{s}</span>
                          ))}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.badgeWrapper}>
                          {emp.certs.map((c, i) => (
                            <span key={i} style={styles.certBadge}>{c}</span>
                          ))}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{emp.hours}</span>
                        <span style={{ marginLeft: 6 }}>hrs</span>
                      </td>
                      <td style={styles.td}>{emp.capacity} hrs</td>
                      <td style={styles.td}>
                        <div style={styles.capacityWrapper}>
                          <span style={{ 
                            ...styles.utilPercent,
                            color: utilization > 90 ? 'var(--color-danger)' : utilization > 50 ? 'var(--color-warning)' : 'var(--color-success)'
                          }}>{utilization}%</span>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: 4 }}>
                            {utilization > 80 ? '(Allocated)' : utilization < 30 ? '(Underutilized)' : '(Optimal)'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTable === 'projects' && (
        <div className="glass-card">
          <div style={styles.tableToolbar}>
            <div style={styles.searchWrapper}>
              <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Search database project records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.searchInput}
              />
            </div>
          </div>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeaderRow}>
                  <th style={styles.th}>Project Title</th>
                  <th style={styles.th}>Client Authority</th>
                  <th style={styles.th}>Required Skills (Sp)</th>
                  <th style={styles.th}>Required Certifications</th>
                  <th style={styles.th}>Weekly Load</th>
                  <th style={styles.th}>Team Size</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map(proj => (
                  <tr key={proj.id} style={styles.tableBodyRow}>
                    <td style={{ ...styles.td, fontWeight: '600', color: 'var(--color-text-primary)' }}>{proj.name}</td>
                    <td style={styles.td}>{proj.client}</td>
                    <td style={styles.td}>
                      <div style={styles.badgeWrapper}>
                        {proj.skills.map((s, i) => (
                          <span key={i} style={styles.skillRequired}>{s}</span>
                        ))}
                      </div>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.badgeWrapper}>
                        {proj.certs.map((c, i) => (
                          <span key={i} style={styles.certRequired}>{c}</span>
                        ))}
                      </div>
                    </td>
                    <td style={styles.td}>{proj.hoursNeeded} hrs</td>
                    <td style={styles.td}>{proj.teamSize} assigned</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: proj.status === 'Active' ? 'var(--color-primary-light)' : 'var(--color-border)',
                        color: proj.status === 'Active' ? 'var(--color-success)' : 'var(--color-text-secondary)'
                      }}>{proj.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  header: {
    marginBottom: '28px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '800',
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.75px',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '15px',
    color: 'var(--color-text-secondary)',
  },
  subTabsContainer: {
    display: 'flex',
    gap: '24px',
    borderBottom: '1px solid var(--color-border)',
    marginBottom: '28px',
  },
  subTabButton: {
    background: 'transparent',
    border: 'none',
    borderBottom: '3px solid transparent',
    padding: '12px 4px',
    fontSize: '15px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tableToolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    maxWidth: '480px',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    color: 'var(--color-text-muted)',
  },
  searchInput: {
    width: '100%',
    padding: '10px 12px 10px 36px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
    '&:focus': {
      borderColor: 'var(--color-primary)',
    }
  },
  syncBtn: {
    backgroundColor: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    border: '1px solid var(--color-primary)',
    padding: '10px 18px',
    borderRadius: 'var(--radius-md)',
    fontWeight: '700',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    '&:hover': {
      backgroundColor: 'var(--color-primary)',
      color: '#ffffff',
    }
  },
  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  tableHeaderRow: {
    borderBottom: '2px solid var(--color-border)',
  },
  th: {
    padding: '14px 16px',
    fontSize: '12px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-text-secondary)',
  },
  tableBodyRow: {
    borderBottom: '1px solid var(--color-border)',
    transition: 'background-color 0.2s',
    '&:hover': {
      backgroundColor: 'var(--color-bg-card-hover)',
    }
  },
  td: {
    padding: '14px 16px',
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
  },
  badgeWrapper: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  skillBadge: {
    backgroundColor: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: '600',
  },
  certBadge: {
    backgroundColor: 'var(--color-accent-light)',
    color: 'var(--color-accent)',
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: '600',
  },
  skillRequired: {
    backgroundColor: 'var(--color-border)',
    color: 'var(--color-text-primary)',
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: '600',
  },
  certRequired: {
    backgroundColor: 'var(--color-warning-light)',
    color: 'var(--color-warning)',
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: '600',
  },
  hoursInput: {
    width: '60px',
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    fontWeight: '700',
    textAlign: 'center',
    outline: 'none',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '4px',
  },
  capacityWrapper: {
    display: 'flex',
    alignItems: 'center',
  },
  utilPercent: {
    fontWeight: '700',
  }
};
