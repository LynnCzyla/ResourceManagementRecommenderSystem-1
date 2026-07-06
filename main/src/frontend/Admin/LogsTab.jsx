import React, { useState } from 'react';

export default function LogsTab() {
  const [searchQuery, setSearchQuery] = useState('');


  const auditLogs = [
    { id: 1, date: '2026-06-17 13:40:12', user: 'Rodolfo Mirabel Jr.', action: 'Create User', category: 'User Management', desc: 'Created employee account for Vincent Miguel Soriano', ip: '192.168.1.10' },
    { id: 2, date: '2026-06-17 12:15:30', user: 'Rodolfo Mirabel Jr.', action: 'Update Settings', category: 'System Config', desc: 'Updated OCR Confidence Threshold slider to 75%', ip: '192.168.1.10' },
    { id: 3, date: '2026-06-17 11:22:15', user: 'System Parser', action: 'OCR Scan', category: 'Database', desc: 'Successfully parsed and tokenized resume: romell_ebuen_cv.pdf', ip: 'Localhost' },
    { id: 4, date: '2026-06-17 10:05:00', user: 'Lynn Czyla Alpuerto', action: 'Create Project', category: 'Recommender', desc: 'Created project specs for "Refinery Electrical Safety Upgrade"', ip: '192.168.1.44' },
    { id: 5, date: '2026-06-16 16:30:22', user: 'Romell Ebuen', action: 'Assign Resource', category: 'Recommender', desc: 'Assigned Romell Ebuen to project "Refinery Electrical Safety Upgrade" (32 hrs)', ip: '192.168.1.12' },
  ];


  const filteredAuditLogs = auditLogs.filter(log =>
    log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Activity & Audit Logs</h1>
        <p style={styles.subtitle}>Track user activities and system audit trail.</p>
      </div>

      <div className="glass-card">
          <div style={styles.tableToolbar}>
            <div style={styles.searchWrapper}>
              <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Search audit trail by description or user..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.searchInput}
              />
            </div>
            <button style={styles.exportBtn} onClick={() => alert('Audit logs downloaded as CSV')}>
              Export Audit Trail
            </button>
          </div>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeaderRow}>
                  <th style={styles.th}>Timestamp</th>
                  <th style={styles.th}>Responsible User</th>
                  <th style={styles.th}>Action</th>
                  <th style={styles.th}>System Category</th>
                  <th style={styles.th}>Log Description</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuditLogs.map(log => (
                  <tr key={log.id} style={styles.tableBodyRow}>
                    <td style={styles.td}>{log.date}</td>
                    <td style={{ ...styles.td, fontWeight: '600', color: 'var(--color-text-primary)' }}>{log.user}</td>
                    <td style={styles.td}>{log.action}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.roleBadge,
                        backgroundColor: 'var(--color-accent-light)',
                        color: 'var(--color-accent)'
                      }}>{log.category}</span>
                    </td>
                    <td style={styles.td}>{log.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

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
  exportBtn: {
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card-hover)',
    padding: '10px 18px',
    borderRadius: 'var(--radius-md)',
    fontWeight: '700',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
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
  statusBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '4px',
  },
  roleBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '4px',
  }
};
