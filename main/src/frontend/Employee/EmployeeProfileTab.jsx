import React, { useState, useEffect } from 'react';
import { getEmployees, saveEmployees } from '../mockState';

export default function EmployeeProfileTab() {
  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);

  // Forms states
  const [profileForm, setProfileForm] = useState({ name: '', email: '', department: '', role: '' });
  const [profilePicture, setProfilePicture] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  
  useEffect(() => {
    const emps = getEmployees();
    const currentEmp = emps.find(e => e.id === 'EMP-1014') || emps[0];
    setEmployeeInfo(currentEmp);
    setProfileForm({
      name: currentEmp.name,
      email: currentEmp.email,
      department: currentEmp.department,
      role: currentEmp.role
    });
    setProfilePicture(currentEmp.avatar || '');
  }, []);

  if (!employeeInfo) return <div>Loading Profile...</div>;

  const updateGlobalEmployee = (updatedEmp) => {
    setEmployeeInfo(updatedEmp);
    const emps = getEmployees();
    const updatedList = emps.map(e => e.id === updatedEmp.id ? updatedEmp : e);
    saveEmployees(updatedList);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setOcrLoading(true);
    setOcrResult(null);

    // Simulate OCR + NLP Extraction
    setTimeout(() => {
      setOcrLoading(false);
      const extractedSkills = [
        'AutoCAD 2D & 3D',
        'Dialux Lighting Calculation',
        'Electrical drawings and product drawings using AutoCAD 2D',
        'Lighting design and calculations using Dialux, Relux and AGI32',
        'Multi-Cable Transit Design using Hawke Transit Software',
        'UPS installation and Commissioning',
        'Maintenance & Troubleshooting',
        'Design and Application',
        'Sales Quotation and Proposal preparation',
        'Product Knowledge'
      ];
      setOcrResult({
        fileName: file.name,
        confidence: '97.8%',
        extractedSkills
      });

      // Merge new extracted skills with existing employee skills
      const mergedSkills = Array.from(new Set([...employeeInfo.skills, ...extractedSkills]));
      updateGlobalEmployee({
        ...employeeInfo,
        skills: mergedSkills,
        resumeName: file.name,
        resumeUploadedAt: new Date().toISOString().split('T')[0]
      });
    }, 2500);
  };

  const handleCertUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Simulate OCR certification parsing by extracting filename without extension
    const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    const newCert = {
      id: Date.now(),
      name: nameWithoutExt,
      issuer: 'Verified Issuer (via OCR)',
      date: new Date().toISOString().split('T')[0],
      expiry: 'N/A'
    };

    const updatedCerts = [...employeeInfo.certifications, newCert];
    updateGlobalEmployee({ ...employeeInfo, certifications: updatedCerts });
  };

  const handleRemoveCert = (certId) => {
    const updatedCerts = employeeInfo.certifications.filter(c => c.id !== certId);
    updateGlobalEmployee({ ...employeeInfo, certifications: updatedCerts });
  };

  const handleSaveProfile = (e) => {
    e.preventDefault();
    updateGlobalEmployee({
      ...employeeInfo,
      name: profileForm.name,
      email: profileForm.email,
      department: profileForm.department,
      role: profileForm.role,
      avatar: profilePicture
    });
    alert('Profile updated successfully!');
  };

  const handleProfilePictureChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePicture(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePasswordChange = (e) => {
    e.preventDefault();
    setPasswordError('');

    if (!currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirm password do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long.');
      return;
    }

    alert('Password changed successfully');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowChangePassword(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>My Profile Portfolio</h1>
        <p style={styles.subtitle}>Upload credentials, run CV parsers, and manage skills & certifications.</p>
      </div>

      <div style={styles.grid}>
        {/* CV & Skills Column */}
        <div style={styles.leftCol}>
          {/* Resume Upload Zone */}
          <div className="glass-card" style={styles.card}>
            <h2 style={styles.sectionTitle}>Upload CV / Resume</h2>
            <p style={styles.sectionSubtitle}>Upload PDF/image to automatically parse skills using OCR & NLP.</p>

            <div style={styles.uploadZone}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <label style={styles.uploadBtnLabel}>
                Browse Files
                <input 
                  type="file" 
                  accept=".pdf,.png,.jpg,.jpeg" 
                  onChange={handleFileUpload} 
                  style={{ display: 'none' }} 
                  disabled={ocrLoading}
                />
              </label>
              <span style={styles.uploadHelper}>Supported formats: PDF, PNG, JPG (Max 5MB)</span>
            </div>

            {ocrLoading && (
              <div style={styles.ocrLoadingWrapper}>
                <div style={styles.ocrSpinner}></div>
                <span>Scanning document & extracting text tags...</span>
              </div>
            )}

            {ocrResult && (
              <div style={styles.ocrResultCard}>
                <div style={styles.ocrResultHeader}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                    {ocrResult.fileName}
                  </span>
                  <span style={styles.ocrConfidence}>Confidence: {ocrResult.confidence}</span>
                </div>
                <div style={styles.ocrSkillsExtracted}>
                  <strong>Extracted Skills:</strong>
                  <div style={styles.ocrSkillsList}>
                    {ocrResult.extractedSkills.map((sk, idx) => (
                      <span key={idx} style={styles.extractedTag}>+{sk}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {employeeInfo.resumeName && !ocrLoading && !ocrResult && (
              <div style={styles.activeResumeRow}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                  </svg>
                  Current CV: <strong>{employeeInfo.resumeName}</strong>
                </span>
                <span style={styles.resumeDate}>Uploaded on {employeeInfo.resumeUploadedAt}</span>
              </div>
            )}
          </div>

          {/* Skills Portfolio */}
          <div className="glass-card" style={styles.card}>
            <h2 style={styles.sectionTitle}>Skills Portfolio</h2>
            <p style={styles.sectionSubtitle}>Verified skills extracted automatically from your resume profile.</p>

            <div style={styles.skillsList}>
              {employeeInfo.skills.map((skill, idx) => (
                <span key={idx} style={{ ...styles.skillPill, paddingRight: '12px' }}>
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Profile Settings & Certifications Column */}
        <div style={styles.rightCol}>
          {/* Profile Form */}
          <div className="glass-card" style={styles.card}>
            <h2 style={styles.sectionTitle}>Profile Details</h2>
            <form onSubmit={handleSaveProfile} style={styles.profileForm}>
              {/* Profile Picture */}
              <div style={styles.profilePictureSection}>
                <div style={styles.profilePictureWrapper}>
                  <img
                    src={profilePicture || 'https://via.placeholder.com/100'}
                    alt="Profile"
                    style={styles.profilePicture}
                  />
                  <label style={styles.profilePictureLabel}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleProfilePictureChange}
                      style={{ display: 'none' }}
                    />
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                      <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                  </label>
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Full Name</label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  style={styles.formInput}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Email Address</label>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  style={styles.formInput}
                  required
                />
              </div>

              <div style={styles.formRow}>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>Department</label>
                  <input
                    type="text"
                    value={profileForm.department}
                    onChange={(e) => setProfileForm({ ...profileForm, department: e.target.value })}
                    style={styles.formInput}
                    required
                  />
                </div>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>Role Title</label>
                  <input
                    type="text"
                    value={profileForm.role}
                    onChange={(e) => setProfileForm({ ...profileForm, role: e.target.value })}
                    style={styles.formInput}
                    required
                  />
                </div>
              </div>

              <button type="submit" style={styles.saveProfileBtn}>Update Profile Info</button>
            </form>
          </div>

          {/* Change Password */}
          <div className="glass-card" style={styles.card}>
            <h2 style={styles.sectionTitle}>Change Password</h2>
            <p style={styles.sectionSubtitle}>Update your password to keep your account secure.</p>

            {!showChangePassword ? (
              <button onClick={() => setShowChangePassword(true)} style={styles.changePasswordBtn}>
                Change Password
              </button>
            ) : (
              <form onSubmit={handlePasswordChange} style={styles.passwordForm}>
                {passwordError && (
                  <div style={styles.passwordError}>
                    {passwordError}
                  </div>
                )}
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    style={styles.formInput}
                    required
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    style={styles.formInput}
                    required
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    style={styles.formInput}
                    required
                  />
                </div>

                <div style={styles.passwordBtnRow}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowChangePassword(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                      setPasswordError('');
                    }}
                    style={styles.cancelPasswordBtn}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={styles.submitPasswordBtn}
                  >
                    Change Password
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Certifications Management */}
          <div className="glass-card" style={styles.card}>
            <h2 style={styles.sectionTitle}>Certifications</h2>
            <p style={styles.sectionSubtitle}>Upload PDF/image to automatically parse and append certifications.</p>

            <div style={{ ...styles.uploadZone, marginBottom: '20px' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <label style={styles.uploadBtnLabel}>
                Upload Certificate
                <input 
                  type="file" 
                  accept=".pdf,.png,.jpg,.jpeg" 
                  onChange={handleCertUpload} 
                  style={{ display: 'none' }} 
                />
              </label>
              <span style={styles.uploadHelper}>Supported formats: PDF, PNG, JPG (Max 5MB)</span>
            </div>

            <div style={styles.certsList}>
              {employeeInfo.certifications.length === 0 ? (
                <p style={styles.noCerts}>No certifications uploaded.</p>
              ) : (
                employeeInfo.certifications.map(cert => (
                  <div key={cert.id} style={styles.certItem}>
                    <div style={styles.certMeta}>
                      <h4 style={{ ...styles.certName, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                          <path d="M4 22h16"></path>
                          <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"></path>
                          <path d="M12 2a15.3 15.3 0 0 1 4 10H8a15.3 15.3 0 0 1 4-10z"></path>
                        </svg>
                        {cert.name}
                      </h4>
                      <span style={styles.certIssuer}>{cert.issuer} | Issued: {cert.date} | Expiry: {cert.expiry}</span>
                    </div>
                    <button type="button" onClick={() => handleRemoveCert(cert.id)} style={styles.removeCertBtn}>Delete</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
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
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
  },
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  rightCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  card: {
    padding: '24px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '700',
    marginBottom: '4px',
  },
  sectionSubtitle: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    marginBottom: '20px',
  },
  uploadZone: {
    border: '2px dashed var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '32px 16px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'rgba(255,255,255,0.01)',
  },
  uploadBtnLabel: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    padding: '8px 16px',
    borderRadius: '6px',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
    marginBottom: '8px',
    display: 'inline-block',
  },
  uploadHelper: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  ocrLoadingWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    marginTop: '16px',
    padding: '12px',
    background: 'var(--color-primary-light)',
    borderRadius: '6px',
    fontSize: '13px',
    color: 'var(--color-primary)',
  },
  ocrSpinner: {
    width: '18px',
    height: '18px',
    border: '2px solid rgba(16, 185, 129, 0.3)',
    borderTopColor: 'var(--color-primary)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  ocrResultCard: {
    marginTop: '16px',
    border: '1px solid var(--color-primary)',
    borderRadius: 'var(--radius-md)',
    padding: '14px',
    background: 'var(--color-primary-light)',
    textAlign: 'left',
  },
  ocrResultHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--color-primary)',
    borderBottom: '1px solid rgba(16, 185, 129, 0.2)',
    paddingBottom: '6px',
    marginBottom: '10px',
  },
  ocrConfidence: {
    fontSize: '11px',
  },
  ocrSkillsExtracted: {
    fontSize: '12px',
  },
  ocrSkillsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '6px',
  },
  extractedTag: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'var(--color-primary)',
    color: '#ffffff',
    fontWeight: '700',
  },
  activeResumeRow: {
    marginTop: '16px',
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    padding: '10px 12px',
    background: 'var(--color-bg-card-hover)',
    borderRadius: '6px',
  },
  resumeDate: {
    color: 'var(--color-text-muted)',
  },
  skillInputRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
  },
  skillInput: {
    flex: 1,
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  addSkillBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '6px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  skillsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  skillPill: {
    fontSize: '12px',
    fontWeight: '600',
    padding: '6px 12px',
    borderRadius: '30px',
    background: 'var(--color-bg-card-hover)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  removeSkillBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: 1,
  },
  profileForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    textAlign: 'left',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  formRow: {
    display: 'flex',
    gap: '16px',
  },
  formLabel: {
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
  },
  formInput: {
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  saveProfileBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '12px',
    borderRadius: '6px',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '10px',
  },
  certForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '20px',
  },
  certInput: {
    flex: 1,
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  addCertBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '10px',
    borderRadius: '6px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  certsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  noCerts: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    textAlign: 'center',
    padding: '12px 0',
  },
  certItem: {
    padding: '12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card-hover)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    textAlign: 'left',
  },
  certMeta: {
    display: 'flex',
    flexDirection: 'column',
  },
  certName: {
    fontSize: '13px',
    fontWeight: '700',
    margin: 0,
  },
  certIssuer: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    marginTop: '2px',
  },
  removeCertBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-danger)',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  profilePictureSection: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '20px',
  },
  profilePictureWrapper: {
    position: 'relative',
    width: '100px',
    height: '100px',
  },
  profilePicture: {
    width: '100px',
    height: '100px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '2px solid var(--color-border)',
  },
  profilePictureLabel: {
    position: 'absolute',
    bottom: '0',
    right: '0',
    background: 'var(--color-primary)',
    color: '#ffffff',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    border: '2px solid var(--color-bg-card)',
    transition: 'all 0.2s',
  },
  changePasswordBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '12px',
    borderRadius: '6px',
    fontWeight: '700',
    cursor: 'pointer',
    width: '100%',
  },
  passwordForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  passwordError: {
    padding: '10px',
    background: 'var(--color-danger-light)',
    color: 'var(--color-danger)',
    border: '1px solid var(--color-danger)',
    borderRadius: '6px',
    fontSize: '13px',
  },
  passwordBtnRow: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
  },
  cancelPasswordBtn: {
    flex: 1,
    padding: '10px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  submitPasswordBtn: {
    flex: 1,
    padding: '10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  }
};
