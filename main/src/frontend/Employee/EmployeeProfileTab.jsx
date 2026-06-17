import React, { useState, useEffect } from 'react';
import { getEmployees, saveEmployees } from '../mockState';

export default function EmployeeProfileTab() {
  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  
  // Forms states
  const [skillInput, setSkillInput] = useState('');
  const [certForm, setCertForm] = useState({ name: '', issuer: '', date: '', expiry: '' });
  const [profileForm, setProfileForm] = useState({ name: '', email: '', department: '', role: '' });
  
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
      const extractedSkills = ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker', 'AWS'];
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

  const handleAddSkill = (e) => {
    e.preventDefault();
    if (!skillInput.trim()) return;
    if (employeeInfo.skills.includes(skillInput.trim())) return;

    const updatedSkills = [...employeeInfo.skills, skillInput.trim()];
    updateGlobalEmployee({ ...employeeInfo, skills: updatedSkills });
    setSkillInput('');
  };

  const handleRemoveSkill = (skillToRemove) => {
    const updatedSkills = employeeInfo.skills.filter(s => s !== skillToRemove);
    updateGlobalEmployee({ ...employeeInfo, skills: updatedSkills });
  };

  const handleAddCert = (e) => {
    e.preventDefault();
    if (!certForm.name || !certForm.issuer) return;

    const newCert = {
      id: Date.now(),
      name: certForm.name,
      issuer: certForm.issuer,
      date: certForm.date || new Date().toISOString().split('T')[0],
      expiry: certForm.expiry || 'N/A'
    };

    const updatedCerts = [...employeeInfo.certifications, newCert];
    updateGlobalEmployee({ ...employeeInfo, certifications: updatedCerts });
    setCertForm({ name: '', issuer: '', date: '', expiry: '' });
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
      role: profileForm.role
    });
    alert('Profile updated successfully!');
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
                  <span>📄 {ocrResult.fileName}</span>
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
                <span>📄 Current CV: <strong>{employeeInfo.resumeName}</strong></span>
                <span style={styles.resumeDate}>Uploaded on {employeeInfo.resumeUploadedAt}</span>
              </div>
            )}
          </div>

          {/* Skills Management */}
          <div className="glass-card" style={styles.card}>
            <h2 style={styles.sectionTitle}>Skills Portfolio</h2>
            <p style={styles.sectionSubtitle}>Manually append or remove skills from your engineering records.</p>
            
            <form onSubmit={handleAddSkill} style={styles.skillInputRow}>
              <input 
                type="text" 
                placeholder="e.g. AWS, Python, Kubernetes" 
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                style={styles.skillInput}
              />
              <button type="submit" style={styles.addSkillBtn}>Add</button>
            </form>

            <div style={styles.skillsList}>
              {employeeInfo.skills.map((skill, idx) => (
                <span key={idx} style={styles.skillPill}>
                  {skill}
                  <button type="button" onClick={() => handleRemoveSkill(skill)} style={styles.removeSkillBtn}>&times;</button>
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

          {/* Certifications Management */}
          <div className="glass-card" style={styles.card}>
            <h2 style={styles.sectionTitle}>Certifications</h2>
            <p style={styles.sectionSubtitle}>Add formal certifications for verification matches.</p>

            <form onSubmit={handleAddCert} style={styles.certForm}>
              <div style={styles.formRow}>
                <input 
                  type="text" 
                  placeholder="Cert Name (e.g. AWS Architect)" 
                  value={certForm.name}
                  onChange={(e) => setCertForm({ ...certForm, name: e.target.value })}
                  style={styles.certInput}
                  required
                />
                <input 
                  type="text" 
                  placeholder="Issuer (e.g. Amazon)" 
                  value={certForm.issuer}
                  onChange={(e) => setCertForm({ ...certForm, issuer: e.target.value })}
                  style={styles.certInput}
                  required
                />
              </div>
              <div style={styles.formRow}>
                <input 
                  type="date" 
                  value={certForm.date}
                  onChange={(e) => setCertForm({ ...certForm, date: e.target.value })}
                  style={styles.certInput}
                  title="Issue Date"
                />
                <input 
                  type="text" 
                  placeholder="Expiry (e.g. 2028-08-14 or N/A)" 
                  value={certForm.expiry}
                  onChange={(e) => setCertForm({ ...certForm, expiry: e.target.value })}
                  style={styles.certInput}
                />
              </div>
              <button type="submit" style={styles.addCertBtn}>Add Certification</button>
            </form>

            <div style={styles.certsList}>
              {employeeInfo.certifications.length === 0 ? (
                <p style={styles.noCerts}>No certifications uploaded.</p>
              ) : (
                employeeInfo.certifications.map(cert => (
                  <div key={cert.id} style={styles.certItem}>
                    <div style={styles.certMeta}>
                      <h4 style={styles.certName}>🏆 {cert.name}</h4>
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
  }
};
