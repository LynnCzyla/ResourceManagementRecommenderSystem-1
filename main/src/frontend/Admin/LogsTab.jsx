import React, { useState, useEffect } from 'react';

export default function LogsTab({ activeSubTab: initialSubTab }) {
  const [subTab, setSubTab] = useState(initialSubTab || 'ocr');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOcrLog, setSelectedOcrLog] = useState(null);

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const ocrLogs = [
    {
      id: 1,
      fileName: 'romell_ebuen_cv.pdf',
      date: '2026-06-17 11:22:15',
      status: 'Success',
      confidence: 98.2,
      role: 'Electrical Maintenance Technician',
      skills: ['Distribution Transformer Installation', 'Electrical Distribution', 'Circuit Wiring'],
      certs: ['OSH 40-Hour Training', 'BOSH Certification'],
      rawText: 'ROML J. EBUEN - ELEC MAINTENANCE TECH. Exp: 5 yrs in oil & gas distribution transformer instalation, safety protocols (OSH 40hr training cert, BOSH certified 2024). electrical dist.',
      normalizedTokens: [
        { raw: 'ELEC MAINTENANCE TECH', token: 'Electrical Technician', type: 'Role' },
        { raw: 'distribution transformer instalation', token: 'Electrical Distribution', type: 'Skill' },
        { raw: 'OSH 40hr training cert', token: 'Safety Certification', type: 'Certification' },
        { raw: 'BOSH certified', token: 'Safety Certification', type: 'Certification' },
        { raw: 'electrical dist', token: 'Electrical Distribution', type: 'Skill' }
      ]
    },
    {
      id: 2,
      fileName: 'lynn_alpuerto_ee_license.jpg',
      date: '2026-06-17 09:40:02',
      status: 'Success',
      confidence: 95.8,
      role: 'Electrical Engineer',
      skills: ['Power Grid Design', 'Substation Installation'],
      certs: ['Registered Electrical Engineer License'],
      rawText: 'PRC LICENSE CERTIFICATE: LYNN CZYLA ALPUERTO. REGISTERED ELECTRICAL ENGINEER. LIC NO: 009871. Substation grid designer. High voltage.',
      normalizedTokens: [
        { raw: 'REGISTERED ELECTRICAL ENGINEER', token: 'Electrical Engineer', type: 'Role' },
        { raw: 'Substation grid designer', token: 'Substation Installation', type: 'Skill' }
      ]
    },
    {
      id: 3,
      fileName: 'miguel_soriano_safety_cert.pdf',
      date: '2026-06-16 15:10:44',
      status: 'Success',
      confidence: 97.5,
      role: 'Safety Officer',
      skills: ['Hazard Safety Audit', 'Fire Prevention'],
      certs: ['COSH Certification', 'First Aid Responder'],
      rawText: 'Vincent Miguel P. Soriano - Qualified Safety Officer. Certifications: Construction Safety & Health (COSH) 80hr course, First Aid Responder CPR training.',
      normalizedTokens: [
        { raw: 'Safety Officer', token: 'Safety Officer', type: 'Role' },
        { raw: 'Construction Safety & Health (COSH)', token: 'Safety Certification', type: 'Certification' },
        { raw: 'First Aid Responder', token: 'Safety Certification', type: 'Certification' }
      ]
    },
    {
      id: 4,
      fileName: 'damaged_cert_scan.png',
      date: '2026-06-15 14:02:18',
      status: 'Failed',
      confidence: 42.1,
      role: 'Unknown',
      skills: [],
      certs: [],
      rawText: '### ERR: Low Resolution Scan / Contrast Ratio below 3:1. Characters unrecognized. ###',
      normalizedTokens: []
    }
  ];

  const auditLogs = [
    { id: 1, date: '2026-06-17 13:40:12', user: 'Rodolfo Mirabel Jr.', action: 'Create User', category: 'User Management', desc: 'Created employee account for Vincent Miguel Soriano', ip: '192.168.1.10' },
    { id: 2, date: '2026-06-17 12:15:30', user: 'Rodolfo Mirabel Jr.', action: 'Update Settings', category: 'System Config', desc: 'Updated OCR Confidence Threshold slider to 75%', ip: '192.168.1.10' },
    { id: 3, date: '2026-06-17 11:22:15', user: 'System Parser', action: 'OCR Scan', category: 'Database', desc: 'Successfully parsed and tokenized resume: romell_ebuen_cv.pdf', ip: 'Localhost' },
    { id: 4, date: '2026-06-17 10:05:00', user: 'Lynn Czyla Alpuerto', action: 'Create Project', category: 'Recommender', desc: 'Created project specs for "Refinery Electrical Safety Upgrade"', ip: '192.168.1.44' },
    { id: 5, date: '2026-06-16 16:30:22', user: 'Romell Ebuen', action: 'Assign Resource', category: 'Recommender', desc: 'Assigned Romell Ebuen to project "Refinery Electrical Safety Upgrade" (32 hrs)', ip: '192.168.1.12' },
  ];

  const filteredOcrLogs = ocrLogs.filter(log => 
    log.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAuditLogs = auditLogs.filter(log =>
    log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>System Logs & Monitoring</h1>
        <p style={styles.subtitle}>Audit text extraction outputs, OCR confidence levels, and user activities.</p>
      </div>

      <div style={styles.subTabsContainer}>
        <button 
          onClick={() => { setSubTab('ocr'); setSearchQuery(''); }} 
          style={{
            ...styles.subTabButton,
            borderBottomColor: subTab === 'ocr' ? 'var(--color-primary)' : 'transparent',
            color: subTab === 'ocr' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: subTab === 'ocr' ? '700' : '500'
          }}
        >
          OCR & NLP Extraction Logs
        </button>
        <button 
          onClick={() => { setSubTab('audit'); setSearchQuery(''); }} 
          style={{
            ...styles.subTabButton,
            borderBottomColor: subTab === 'audit' ? 'var(--color-primary)' : 'transparent',
            color: subTab === 'audit' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: subTab === 'audit' ? '700' : '500'
          }}
        >
          Activity & Audit Logs
        </button>
      </div>

      {subTab === 'ocr' && (
        <div className="glass-card">
          <div style={styles.tableToolbar}>
            <div style={styles.searchWrapper}>
              <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Search OCR logs by file name or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.searchInput}
              />
            </div>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: '600' }}>
              Average OCR Accuracy: <strong style={{ color: 'var(--color-primary)' }}>97.16%</strong>
            </span>
          </div>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeaderRow}>
                  <th style={styles.th}>Scanned File</th>
                  <th style={styles.th}>Timestamp</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Identified Role</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOcrLogs.map(log => (
                  <tr key={log.id} style={styles.tableBodyRow}>
                    <td style={{ ...styles.td, fontWeight: '600', color: 'var(--color-text-primary)' }}>{log.fileName}</td>
                    <td style={styles.td}>{log.date}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: log.status === 'Success' ? 'var(--color-primary-light)' : 'var(--color-danger-light)',
                        color: log.status === 'Success' ? 'var(--color-success)' : 'var(--color-danger)'
                      }}>
                        {log.status}
                      </span>
                    </td>
                    <td style={styles.td}>{log.role}</td>
                    <td style={styles.td}>
                      {log.status === 'Success' ? (
                        <button onClick={() => setSelectedOcrLog(log)} style={styles.inspectBtn}>
                          Inspect Extraction
                        </button>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>Uninspectable</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'audit' && (
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
      )}

      {selectedOcrLog && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 18 }}>OCR & NLP Alignment Inspector</h2>
              <button onClick={() => setSelectedOcrLog(null)} style={styles.closeModalBtn}>&times;</button>
            </div>
            
            <div style={styles.inspectorBody}>
              <div style={styles.inspectorColumn}>
                <h4 style={styles.columnTitle}>Raw Scanned OCR Text Output</h4>
                <div style={styles.rawTextContainer}>
                  {selectedOcrLog.rawText}
                </div>
              </div>

              <div style={styles.inspectorColumn}>
                <h4 style={styles.columnTitle}>Normalized Tokens (NLP Synonym Mapping)</h4>
                <div style={styles.tokenContainer}>
                  {selectedOcrLog.normalizedTokens.map((tok, idx) => (
                    <div key={idx} style={styles.tokenItem}>
                      <div style={styles.tokenRow}>
                        <span style={styles.tokenLabel}>Raw Text:</span>
                        <code style={styles.code}>"{tok.raw}"</code>
                      </div>
                      <div style={styles.tokenRow}>
                        <span style={styles.tokenLabel}>Mapped To:</span>
                        <span style={{ 
                          ...styles.tokenValue,
                          color: tok.type === 'Role' ? 'var(--color-accent)' : tok.type === 'Certification' ? 'var(--color-warning)' : 'var(--color-primary)' 
                        }}>{tok.token}</span>
                      </div>
                      <span style={{
                        ...styles.typeTag,
                        backgroundColor: tok.type === 'Role' ? 'var(--color-accent-light)' : tok.type === 'Certification' ? 'var(--color-warning-light)' : 'var(--color-primary-light)',
                        color: tok.type === 'Role' ? 'var(--color-accent)' : tok.type === 'Certification' ? 'var(--color-warning)' : 'var(--color-primary)'
                      }}>{tok.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={styles.modalActions}>
              <button onClick={() => setSelectedOcrLog(null)} style={styles.closeBtn}>Close Inspector</button>
            </div>
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
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    width: '120px',
  },
  progressBarBg: {
    flex: 1,
    height: '6px',
    backgroundColor: 'var(--color-border)',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: '3px',
  },
  inspectBtn: {
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    '&:hover': {
      background: 'var(--color-primary)',
      color: '#ffffff',
    }
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
    zIndex: 999,
  },
  modalCard: {
    width: '100%',
    maxWidth: '820px',
    padding: '28px',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '12px',
    marginBottom: '20px',
  },
  closeModalBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: 'var(--color-text-muted)',
    '&:hover': {
      color: 'var(--color-danger)',
    }
  },
  inspectorBody: {
    display: 'flex',
    gap: '24px',
  },
  inspectorColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'left',
  },
  columnTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  rawTextContainer: {
    backgroundColor: 'var(--color-bg-root)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '16px',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.6',
    flex: 1,
    minHeight: '240px',
    fontFamily: 'ui-monospace, monospace',
  },
  tokenContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    overflowY: 'auto',
    maxHeight: '300px',
    flex: 1,
  },
  tokenItem: {
    backgroundColor: 'var(--color-bg-root)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 14px',
    position: 'relative',
  },
  tokenRow: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '12px',
    marginBottom: '4px',
  },
  tokenLabel: {
    width: '80px',
    color: 'var(--color-text-muted)',
    fontWeight: '600',
  },
  code: {
    fontFamily: 'ui-monospace, monospace',
    background: 'var(--color-border)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '11px',
    color: 'var(--color-text-primary)',
  },
  tokenValue: {
    fontWeight: '700',
    fontSize: '13px',
  },
  typeTag: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    fontSize: '9px',
    fontWeight: '800',
    textTransform: 'uppercase',
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '0.5px',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '24px',
  },
  closeBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '700',
  }
};
