import React, { useState } from 'react';

export default function ReportsTab() {
  const [reportType, setReportType] = useState('utilization');
  const [dateRange, setDateRange] = useState('30days');
  const [exportFormat, setExportFormat] = useState('pdf');
  const [isCompiling, setIsCompiling] = useState(false);
  const [generatedData, setGeneratedData] = useState(null);

  const handleCompile = (e) => {
    e.preventDefault();
    setIsCompiling(true);
    setGeneratedData(null);

    setTimeout(() => {
      setIsCompiling(false);
      
      if (reportType === 'utilization') {
        setGeneratedData({
          title: 'Employee Capacity Utilization Summary',
          generatedAt: new Date().toLocaleString(),
          headers: ['Employee Name', 'Role', 'Assigned Hours', 'Total Capacity', 'Utilization %'],
          rows: [
            ['Romell J. Ebuen', 'Electrical Technician', '32 hrs', '40 hrs', '80%'],
            ['Vincent Miguel P. Soriano', 'Safety Officer', '20 hrs', '20 hrs', '100%'],
            ['Lynn Czyla M. Alpuerto', 'Lead Designer', '12 hrs', '40 hrs', '30%'],
            ['Engr. Juan Dela Cruz', 'Electrical Engineer', '0 hrs', '40 hrs', '0% (Underutilized)'],
          ]
        });
      } else if (reportType === 'accuracy') {
        setGeneratedData({
          title: 'OCR Extraction Accuracy Performance',
          generatedAt: new Date().toLocaleString(),
          headers: ['Document Name', 'Characters Scanned', 'System Correct', 'Error Rate', 'Accuracy Index'],
          rows: [
            ['romell_cv.pdf', '1,420 chars', '1,394 chars', '1.8%', '98.2%'],
            ['lynn_license.jpg', '480 chars', '460 chars', '4.2%', '95.8%'],
            ['miguel_cert.pdf', '850 chars', '829 chars', '2.5%', '97.5%'],
          ]
        });
      } else {
        setGeneratedData({
          title: 'Certificates Expiration Monitoring',
          generatedAt: new Date().toLocaleString(),
          headers: ['Employee Name', 'License / Certification', 'Authority', 'Expiration Date', 'Status'],
          rows: [
            ['Romell J. Ebuen', 'BOSH Certification', 'OSHC Philippines', '2026-10-15', 'Valid (Expiring Soon)'],
            ['Vincent Miguel P. Soriano', 'COSH Certification', 'OSHC Philippines', '2027-05-20', 'Valid'],
            ['Lynn Czyla M. Alpuerto', 'Electrical Engineer License', 'PRC Philippines', '2029-03-01', 'Valid'],
          ]
        });
      }
    }, 1500);
  };

  const handleDownload = () => {
    if (!generatedData) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += generatedData.title + "\n";
    csvContent += "Generated: " + generatedData.generatedAt + "\n\n";
    csvContent += generatedData.headers.join(",") + "\n";
    generatedData.rows.forEach(row => {
      csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${reportType}_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>System Analytics & Reports</h1>
        <p style={styles.subtitle}>Generate custom summary sheets, check OCR accuracy averages, and export CSV files.</p>
      </div>

      <div style={styles.container}>
        <div className="glass-card" style={styles.formCard}>
          <h3 style={styles.cardTitle}>Report Configuration</h3>
          
          <form onSubmit={handleCompile}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Select Report Type</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                style={styles.select}
              >
                <option value="utilization">Employee Capacity Utilization Summary</option>
                <option value="accuracy">OCR Text Extraction Accuracy Performance</option>
                <option value="expiration">Certificates & Licenses Expiration Schedule</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Select Date Range</label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                style={styles.select}
              >
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="ytd">Year to Date (AY 2026-2027)</option>
                <option value="custom">Custom Date Range</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Export File Format</label>
              <div style={styles.formatWrapper}>
                <label style={styles.radioLabel}>
                  <input
                    type="radio"
                    name="format"
                    value="pdf"
                    checked={exportFormat === 'pdf'}
                    onChange={() => setExportFormat('pdf')}
                    style={styles.radio}
                  />
                  PDF Document
                </label>
                <label style={styles.radioLabel}>
                  <input
                    type="radio"
                    name="format"
                    value="csv"
                    checked={exportFormat === 'csv'}
                    onChange={() => setExportFormat('csv')}
                    style={styles.radio}
                  />
                  CSV Spreadsheet
                </label>
              </div>
            </div>

            <button
              type="submit"
              style={styles.submitBtn}
              className="glow-primary"
              disabled={isCompiling}
            >
              {isCompiling ? (
                <span style={styles.spinnerWrapper}>
                  <span style={styles.spinner}></span>
                  Compiling Data...
                </span>
              ) : (
                'Compile & Preview Report'
              )}
            </button>
          </form>
        </div>

        <div className="glass-card" style={styles.previewCard}>
          <div style={styles.previewHeader}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Report Live Preview</h3>
            {generatedData && (
              <button onClick={handleDownload} style={styles.downloadBtn}>
                Download .CSV File
              </button>
            )}
          </div>

          <div style={styles.previewBody}>
            {!generatedData && !isCompiling && (
              <div style={styles.emptyPreview}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text-muted)', marginBottom: 16 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <circle cx="10" cy="13" r="2"></circle>
                  <circle cx="14" cy="17" r="2"></circle>
                </svg>
                <p>Configure parameters on the left and click Compile to view a preview and export details.</p>
              </div>
            )}

            {isCompiling && (
              <div style={styles.emptyPreview}>
                <div style={styles.largeSpinner}></div>
                <p style={{ marginTop: 16 }}>Scanning database record logs. Calculating totals...</p>
              </div>
            )}

            {generatedData && !isCompiling && (
              <div style={styles.dataWrapper}>
                <h4 style={styles.dataTitle}>{generatedData.title}</h4>
                <span style={styles.dataMeta}>Compiled At: {generatedData.generatedAt}</span>
                
                <div style={styles.tableScroll}>
                  <table style={styles.previewTable}>
                    <thead>
                      <tr>
                        {generatedData.headers.map((h, i) => (
                          <th key={i} style={styles.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {generatedData.rows.map((row, idx) => (
                        <tr key={idx} style={styles.tableRow}>
                          {row.map((val, cellIdx) => (
                            <td key={cellIdx} style={styles.td}>{val}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
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
  container: {
    display: 'flex',
    gap: '24px',
    alignItems: 'stretch',
    flexWrap: 'wrap',
  },
  formCard: {
    flex: '1 1 320px',
    padding: '28px',
    textAlign: 'left',
  },
  previewCard: {
    flex: '2 1 480px',
    display: 'flex',
    flexDirection: 'column',
    padding: '28px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '20px',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '10px',
  },
  formGroup: {
    marginBottom: '20px',
  },
  formLabel: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '8px',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  formatWrapper: {
    display: 'flex',
    gap: '16px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  radio: {
    marginRight: '8px',
    accentColor: 'var(--color-primary)',
  },
  submitBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    '&:hover': {
      backgroundColor: 'var(--color-primary-hover)',
    }
  },
  spinnerWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  spinner: {
    width: '14px',
    height: '14px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '12px',
    marginBottom: '20px',
  },
  downloadBtn: {
    backgroundColor: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    border: '1px solid var(--color-primary)',
    padding: '6px 14px',
    borderRadius: '6px',
    fontWeight: '700',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    '&:hover': {
      backgroundColor: 'var(--color-primary)',
      color: '#ffffff',
    }
  },
  previewBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '260px',
  },
  emptyPreview: {
    textAlign: 'center',
    padding: '24px',
    maxWidth: '360px',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.5',
  },
  largeSpinner: {
    width: '32px',
    height: '32px',
    border: '3px solid var(--color-border)',
    borderTopColor: 'var(--color-primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  dataWrapper: {
    width: '100%',
    textAlign: 'left',
  },
  dataTitle: {
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '2px',
  },
  dataMeta: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    display: 'block',
    marginBottom: '16px',
  },
  tableScroll: {
    width: '100%',
    overflowX: 'auto',
  },
  previewTable: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '10px 12px',
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
    borderBottom: '2px solid var(--color-border)',
  },
  tableRow: {
    borderBottom: '1px solid var(--color-border)',
  },
  td: {
    padding: '10px 12px',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
  }
};
