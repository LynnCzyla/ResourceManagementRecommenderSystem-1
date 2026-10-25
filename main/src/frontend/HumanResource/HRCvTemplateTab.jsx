import React, { useState, useEffect, useRef } from 'react';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../../config/api';

export default function HRCvTemplateTab() {
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const getAuthHeader = () => {
    const token = localStorage.getItem('token') || localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchTemplate = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE_URL}/api/cv-template`, {
        headers: {
          ...getAuthHeader(),
          'x-login-time': localStorage.getItem('loginTime') || ''
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to load CV template.');
      }

      setTemplate(data.data || null);
    } catch (err) {
      console.error('❌ Error fetching CV template:', err);
      setError(err.message || 'Unable to connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplate();
  }, []);

  const handleFileSelected = async (file) => {
    if (!file) return;

    // Validate type: PDF or DOCX
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const isPdf = ext === '.pdf' || file.type === 'application/pdf';
    const isDocx =
      ext === '.docx' ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.type === 'application/msword';

    if (!isPdf && !isDocx) {
      Swal.fire({
        title: 'Invalid File Type',
        text: 'Only PDF or DOCX files are accepted for the CV template.',
        icon: 'warning',
        confirmButtonColor: 'var(--color-primary, #3b82f6)'
      });
      return;
    }

    // Validate size: 5 MB max
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      Swal.fire({
        title: 'File Too Large',
        text: `The selected file is ${(file.size / (1024 * 1024)).toFixed(2)} MB. Maximum allowed size is 5 MB.`,
        icon: 'warning',
        confirmButtonColor: 'var(--color-primary, #3b82f6)'
      });
      return;
    }

    const formData = new FormData();
    formData.append('template', file);

    try {
      setUploading(true);
      const res = await fetch(`${API_BASE_URL}/api/cv-template`, {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
          'x-login-time': localStorage.getItem('loginTime') || ''
        },
        body: formData
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to upload template.');
      }

      setTemplate(result.data);
      Swal.fire({
        title: 'Success!',
        text: template ? 'CV template replaced successfully.' : 'CV template uploaded successfully.',
        icon: 'success',
        timer: 2500,
        showConfirmButton: false
      });
    } catch (err) {
      console.error('❌ Upload error:', err);
      Swal.fire({
        title: 'Upload Failed',
        text: err.message || 'An error occurred during upload. Please try again.',
        icon: 'error',
        confirmButtonColor: 'var(--color-primary, #3b82f6)'
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUnsubmit = async () => {
    const confirm = await Swal.fire({
      title: 'Remove CV Template?',
      text: 'Are you sure you want to remove the current template? Applicants will not be able to download any template until a new one is uploaded.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: 'var(--color-bg-card-hover, #64748b)',
      confirmButtonText: 'Yes, Unsubmit',
      cancelButtonText: 'Cancel'
    });

    if (!confirm.isConfirmed) return;

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/cv-template`, {
        method: 'DELETE',
        headers: {
          ...getAuthHeader(),
          'x-login-time': localStorage.getItem('loginTime') || ''
        }
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to remove template.');
      }

      setTemplate(null);
      Swal.fire({
        title: 'Template Removed',
        text: 'The CV template has been removed successfully.',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (err) {
      console.error('❌ Remove error:', err);
      Swal.fire({
        title: 'Action Failed',
        text: err.message || 'Failed to remove CV template.',
        icon: 'error',
        confirmButtonColor: 'var(--color-primary, #3b82f6)'
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'Unknown date';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes || isNaN(bytes)) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getPreviewUrl = () => {
    if (!template?.view_url) return null;
    if (!/\.docx$/i.test(template.file_name || '')) return template.view_url;
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(template.view_url)}`;
  };

  return (
    <div style={styles.container}>
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleFileSelected(e.target.files?.[0])}
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: 'none' }}
        id="cv-template-file-input"
      />

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.headerTitle}>CV Template Management</h2>
          <p style={styles.headerSubtitle}>
            Provide an official standard CV / Resume template (PDF or DOCX, max 5 MB) for job applicants to download and fill out.
          </p>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="glass-card" style={styles.centeredCard}>
          <div style={styles.spinner}></div>
          <p style={{ marginTop: '16px', color: 'var(--color-text-secondary)', fontSize: '14px' }}>
            Checking current CV template...
          </p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="glass-card" style={styles.errorCard}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" style={{ marginBottom: '12px' }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3 style={styles.errorTitle}>Unable to load CV template</h3>
          <p style={styles.errorSubtitle}>{error}</p>
          <button onClick={fetchTemplate} style={styles.retryBtn}>
            Try Again
          </button>
        </div>
      )}

      {/* Active Template View */}
      {!loading && !error && template && (
        <div className="glass-card" style={styles.templateCard}>
          <div style={styles.cardTop}>
            <div style={styles.fileIconWrapper}>
              {template.file_name?.toLowerCase().endsWith('.docx') ? (
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.8">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              ) : (
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <text x="7" y="18" fill="#ef4444" fontSize="6" fontWeight="bold">PDF</text>
                </svg>
              )}
            </div>

            <div style={styles.fileDetails}>
              <div style={styles.fileBadge}>
                <span style={styles.activeDot}></span> Active Template
              </div>
              <h3 style={styles.fileName}>{template.file_name}</h3>
              <div style={styles.metaRow}>
                <span>
                  <strong>Uploaded:</strong> {formatDate(template.uploaded_at)}
                </span>
                {template.size && (
                  <>
                    <span style={styles.metaSeparator}>•</span>
                    <span>
                      <strong>Size:</strong> {formatFileSize(template.size)}
                    </span>
                  </>
                )}
                <span style={styles.metaSeparator}>•</span>
                <span>
                  <strong>Location:</strong> cv-templates/current/
                </span>
              </div>
            </div>
          </div>

          <div style={styles.actionsBar}>
            <div style={styles.leftActions}>
              {/* Preview Button */}
              {template.view_url && (
                <a
                  href={getPreviewUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.actionBtnOutline}
                  id="cv-template-preview-btn"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  Preview
                </a>
              )}

              {/* Download Button */}
              {template.download_url && (
                <a
                  href={template.download_url}
                  download={template.file_name}
                  style={styles.actionBtnOutline}
                  id="cv-template-download-btn"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download
                </a>
              )}

              {/* Replace Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={styles.actionBtnPrimary}
                id="cv-template-replace-btn"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {uploading ? 'Uploading...' : 'Replace template'}
              </button>
            </div>

            {/* Unsubmit / Remove Button */}
            <button
              onClick={handleUnsubmit}
              style={styles.dangerBtn}
              id="cv-template-unsubmit-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              Unsubmit
            </button>
          </div>
        </div>
      )}

      {/* Empty State / Dropzone */}
      {!loading && !error && !template && (
        <div
          className="glass-card"
          style={{
            ...styles.emptyCard,
            borderColor: dragOver ? 'var(--color-primary)' : 'var(--color-border)',
            backgroundColor: dragOver ? 'var(--color-primary-light, rgba(59,130,246,0.08))' : 'var(--color-bg-card)'
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.[0]) {
              handleFileSelected(e.dataTransfer.files[0]);
            }
          }}
        >
          <div style={styles.emptyIconContainer}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <h3 style={styles.emptyTitle}>No CV template available yet</h3>
          <p style={styles.emptySubtitle}>
            Drag and drop a PDF or DOCX file here, or click below to upload the official applicant CV template (max 5 MB).
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={styles.primaryBtn}
            id="cv-template-empty-upload-btn"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {uploading ? 'Uploading...' : 'Upload template'}
          </button>
        </div>
      )}

      {/* Helpful Guidelines Card */}
      <div className="glass-card" style={styles.infoCard}>
        <h4 style={styles.infoTitle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" style={{ marginRight: '8px' }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          Template Rules & Workflow
        </h4>
        <ul style={styles.infoList}>
          <li>
            <strong>Single Current File:</strong> Uploading a new template automatically replaces any existing template inside the <code>current/</code> folder.
          </li>
          <li>
            <strong>Applicant Experience:</strong> Applicants will see <em>"View"</em> and <em>"Download CV Template"</em> right beside their CV upload area on the Application page.
          </li>
          <li>
            <strong>Allowed Formats:</strong> PDF (<code>.pdf</code>) and Microsoft Word (<code>.docx</code>), maximum size of 5 MB.
          </li>
          <li>
            <strong>Security:</strong> Stored securely in a private Supabase Storage bucket with time-limited signed links.
          </li>
        </ul>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '16px'
  },
  headerTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    margin: 0
  },
  headerSubtitle: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    margin: '6px 0 0 0',
    maxWidth: '650px',
    lineHeight: 1.5
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 20px',
    backgroundColor: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
  },
  centeredCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 24px',
    borderRadius: '16px',
    textAlign: 'center'
  },
  spinner: {
    width: '36px',
    height: '36px',
    border: '3px solid var(--color-border)',
    borderTopColor: 'var(--color-primary)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  },
  errorCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    borderRadius: '16px',
    textAlign: 'center',
    border: '1px solid rgba(239, 68, 68, 0.3)'
  },
  errorTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#ef4444',
    margin: '0 0 8px 0'
  },
  errorSubtitle: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    margin: '0 0 20px 0',
    maxWidth: '450px'
  },
  retryBtn: {
    padding: '8px 18px',
    backgroundColor: 'var(--color-bg-card-hover)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  templateCard: {
    padding: '28px',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)'
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    flexWrap: 'wrap'
  },
  fileIconWrapper: {
    width: '64px',
    height: '64px',
    borderRadius: '14px',
    backgroundColor: 'var(--color-bg-root, rgba(0,0,0,0.05))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: '1px solid var(--color-border)'
  },
  fileDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: '1 1 300px'
  },
  fileBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    padding: '3px 10px',
    borderRadius: '20px',
    alignSelf: 'flex-start'
  },
  activeDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#10b981'
  },
  fileName: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    margin: 0,
    wordBreak: 'break-all'
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    fontSize: '13px',
    color: 'var(--color-text-secondary)'
  },
  metaSeparator: {
    color: 'var(--color-text-muted)'
  },
  actionsBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    paddingTop: '20px',
    borderTop: '1px solid var(--color-border)'
  },
  leftActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap'
  },
  actionBtnOutline: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '9px 16px',
    borderRadius: '9px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-bg-card-hover)',
    color: 'var(--color-text-primary)',
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  actionBtnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '9px 16px',
    borderRadius: '9px',
    border: 'none',
    backgroundColor: 'var(--color-primary)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  dangerBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '9px 16px',
    borderRadius: '9px',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    color: '#ef4444',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  emptyCard: {
    padding: '60px 24px',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    border: '2px dashed var(--color-border)',
    transition: 'all 0.2s ease'
  },
  emptyIconContainer: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-bg-root, rgba(0,0,0,0.03))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px'
  },
  emptyTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    margin: '0 0 8px 0'
  },
  emptySubtitle: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    margin: '0 0 24px 0',
    maxWidth: '480px',
    lineHeight: 1.5
  },
  infoCard: {
    padding: '24px',
    borderRadius: '16px',
    border: '1px solid var(--color-border)'
  },
  infoTitle: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    margin: '0 0 14px 0'
  },
  infoList: {
    margin: 0,
    paddingLeft: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6
  }
};
