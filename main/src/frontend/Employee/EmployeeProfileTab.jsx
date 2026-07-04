import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { supabase } from '../../lib/supabaseClient';
import SkillFeedbackModal from './SkillFeedbackModal';

const API_URL = 'http://localhost:5000/api';

export default function EmployeeProfileTab() {
  // Auth states
  const [user, setUser] = useState(null);
  const [employeeId, setEmployeeId] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Profile states
  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [employeeSkills, setEmployeeSkills] = useState([]);
  const [employeeDocuments, setEmployeeDocuments] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [certLoading, setCertLoading] = useState(false);
  const [certOcrResult, setCertOcrResult] = useState(null);

  // In EmployeeProfileTab.jsx
  const [pendingSkills, setPendingSkills] = useState([]);
  const [autoApprovedSkills, setAutoApprovedSkills] = useState([]);
  const [needsReviewSkills, setNeedsReviewSkills] = useState([]);

  // Progress states
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  const [processingStep, setProcessingStep] = useState('');
  const [showProgressDetails, setShowProgressDetails] = useState(false);

  // Feedback modal states
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [pendingDocumentId, setPendingDocumentId] = useState(null);
  const [pendingDocumentType, setPendingDocumentType] = useState('');

  // Document mismatch confirmation — shown via SweetAlert2, generic message only
  // (no employee IDs/names rendered in the dialog itself)
  const confirmMismatchDialog = async () => {
    const result = await Swal.fire({
      icon: 'warning',
      title: "Document doesn't match your profile",
      text: "This document doesn't appear to align with your account information. Are you sure you want to upload it anyway?",
      showCancelButton: true,
      confirmButtonText: 'Upload Anyway',
      cancelButtonText: 'Cancel',
      confirmButtonColor: 'var(--color-primary)',
      cancelButtonColor: 'var(--color-secondary)',
      iconColor: 'var(--color-primary)',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
      reverseButtons: true,
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm',
        cancelButton: 'swal-custom-cancel'
      }
    });
    return result.isConfirmed;
  };

  // Form states
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    department: '',
    role: ''
  });
  const [profilePicture, setProfilePicture] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // ===== TOP-LEVEL TAB STATE =====
  // 'credentials' = Upload CV / Resume + Certifications
  // 'account'     = Profile Details + Change Password
  const [mainTab, setMainTab] = useState('credentials');

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
    const storedToken =
      localStorage.getItem('token') ||
      localStorage.getItem('access_token') ||
      localStorage.getItem('supabase_token') ||
      localStorage.getItem('sb-wea-auth-token');
    if (storedToken) return { Authorization: `Bearer ${storedToken}` };
    return {};
  };

  // Posts a document to the backend. If the backend responds with a 409
  // NAME_MISMATCH, shows a confirm dialog and — if the user accepts —
  // resubmits the exact same file with confirmMismatch=true to override it.
  const submitDocumentWithMismatchConfirm = async ({ file, documentType, onUploadProgress }) => {
    const post = async (confirmMismatch) => {
      const authHeader = await getAuthHeader();
      const formData = new FormData();
      formData.append('document', file);
      formData.append('documentType', documentType);
      if (confirmMismatch) formData.append('confirmMismatch', 'true');

      return axios.post(`${API_URL}/employee/process-document`, formData, {
        headers: authHeader,
        timeout: 300000,
        ...(onUploadProgress ? { onUploadProgress } : {})
      });
    };

    try {
      return await post(false);
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 409 && data?.error === 'DOCUMENT_MISMATCH') {
        const proceed = await confirmMismatchDialog();
        if (!proceed) {
          const cancelled = new Error('Upload cancelled — the document didn\'t appear to match your information.');
          cancelled.isMismatchCancelled = true;
          throw cancelled;
        }
        return post(true);
      }
      throw err;
    }
  };

  useEffect(() => {
    const getUser = async () => {
      setAuthLoading(true);
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) console.error('Session error:', sessionError);
        if (session?.user) {
          setUser(session.user);
          const employeeMetaId = session.user.user_metadata?.employee_id;
          if (employeeMetaId) setEmployeeId(employeeMetaId);
        } else {
          const localUser = localStorage.getItem('user');
          if (localUser) {
            try {
              const parsedUser = JSON.parse(localUser);
              setUser(parsedUser);
              if (parsedUser.employee_id) setEmployeeId(parsedUser.employee_id);
            } catch (e) {
              console.error('Error parsing user from localStorage:', e);
            }
          }
        }
      } catch (error) {
        console.error('Error getting user:', error);
      } finally {
        setAuthLoading(false);
      }
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        const employeeMetaId = session.user.user_metadata?.employee_id;
        if (employeeMetaId) setEmployeeId(employeeMetaId);
        fetchEmployeeData();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setEmployeeId(null);
        setEmployeeInfo(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authLoading && user) fetchEmployeeData();
  }, [authLoading, user]);

  if (!authLoading && !user) {
    return (
      <div style={styles.errorContainer}>
        <p style={styles.errorText}>🔒 Please log in to view your profile</p>
        <p style={styles.errorSubText}>You need to be logged in to access this page.</p>
        <button onClick={() => window.location.href = '/login'} style={styles.retryBtn}>Go to Login</button>
      </div>
    );
  }

  const fetchEmployeeData = async () => {
    setLoading(true);
    setError(null);
    try {
      const authHeader = await getAuthHeader();
      let actualEmployeeId = employeeId;
  
      if (!actualEmployeeId || !/^EMP-\d+/i.test(actualEmployeeId)) {
        const res = await axios.get(`${API_URL}/employee/profile`, { headers: authHeader });
        if (res.data.success) {
          actualEmployeeId = res.data.data.employee_id;
          setEmployeeId(actualEmployeeId);
        } else {
          throw new Error(res.data.error || 'Failed to resolve current profile');
        }
      }
  
      if (!actualEmployeeId) throw new Error('Unable to determine employee ID');
  
      const profileRes = await axios.get(`${API_URL}/employee/profile/${actualEmployeeId}`, { headers: authHeader });
      if (profileRes.data.success) {
        const d = profileRes.data.data;
        setEmployeeInfo(d);
        setProfileForm({
          firstName: d.first_name || '',
          lastName: d.last_name || '',
          email: d.email || user?.email || '',
          department: d.department || '',
          role: d.role || ''
        });
        setProfilePicture(d.avatar_url || '');
      } else {
        setProfileForm({
          firstName: user?.user_metadata?.first_name || '',
          lastName: user?.user_metadata?.last_name || '',
          email: user?.email || '',
          department: '',
          role: ''
        });
      }
  
      const skillsRes = await axios.get(`${API_URL}/employee/skills?employeeId=${actualEmployeeId}`, { headers: authHeader });
        if (skillsRes.data.success) {
            // ============ FIX: Extract skill names from objects ============
            const skillNames = skillsRes.data.data.map(s => {
                if (typeof s === 'string') return s;
                return s.skill_name || s.skill_tag || s.skill || String(s);
            });
            console.log('📊 Processed skills:', skillNames);
            setEmployeeSkills(skillNames);
        }
  
      // ============ FIX: Separate documents by type ============
      const docsRes = await axios.get(`${API_URL}/employee/documents?employeeId=${actualEmployeeId}`, { headers: authHeader });
      if (docsRes.data.success) {
        const allDocs = docsRes.data.data;
        
        // Separate into resumes and certificates
        const resumes = allDocs.filter(doc => doc.document_type === 'Resume');
        const certificates = allDocs.filter(doc => doc.document_type === 'Certificate');
        
        setEmployeeDocuments(resumes); // Only resumes for CV section
        setCertifications(certificates); // Certificates for certifications section
      }
  
    } catch (err) {
      console.error('❌ Error fetching employee data:', err);
      if (err.response?.status === 404) {
        setProfileForm({
          firstName: user?.user_metadata?.first_name || '',
          lastName: user?.user_metadata?.last_name || '',
          email: user?.email || '',
          department: '',
          role: ''
        });
      } else {
        setError(`Failed to load employee data: ${err.response?.data?.error || err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!employeeId) { setUploadError('Please log in to upload documents'); return; }
    setOcrLoading(true);
    setOcrResult(null);
    setUploadError(null);
    setUploadProgress(0);
    setProcessingStatus('Starting upload...');
    setProcessingStep('uploading');
    setShowProgressDetails(true);
    try {
        const response = await submitDocumentWithMismatchConfirm({
            file,
            documentType: 'Resume',
            employeeId,
            onUploadProgress: (progressEvent) => {
                const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                setUploadProgress(pct);
                if (pct < 30) setProcessingStatus('Uploading file...');
                else if (pct < 60) setProcessingStatus('Uploading file to server...');
                else if (pct < 90) setProcessingStatus('Processing upload...');
            }
        });
        if (response.data.success) {
            const { data } = response.data;
            if (!data?.documentId) {
                throw new Error('Document processed but did not return a valid document ID. Please try again.');
            }
            
            // ============ FIX: Properly extract data ============
            const nlp = data.nlp || {};
            
            // FIX: Ensure these are always arrays
            const allSkills = Array.isArray(nlp.skills) ? nlp.skills : [];
            const autoApproved = Array.isArray(nlp.auto_approved) ? nlp.auto_approved : [];
            const needsReview = Array.isArray(nlp.needs_review) ? nlp.needs_review : [];
            const categorizedSkills = nlp.categorized_skills || {};
            
            // FIX: If needsReview is empty but we have skills, use all skills
            const finalNeedsReview = needsReview.length > 0 ? needsReview : allSkills;
            const finalAutoApproved = autoApproved.length > 0 ? autoApproved : [];
            
            console.log('📊 Skill Data:', {
                allSkills: allSkills.length,
                autoApproved: finalAutoApproved.length,
                needsReview: finalNeedsReview.length,
                categorized: Object.keys(categorizedSkills).length
            });
            
            // ============ Set OCR Result for display ============
            setOcrResult({
                fileName: file.name,
                confidence: data.ocr?.confidence ? `${(data.ocr.confidence * 100).toFixed(1)}%` : 'N/A',
                extractedSkills: allSkills,  // ← Must be an array
                needsReview: finalNeedsReview,
                autoApproved: finalAutoApproved,
                method: data.ocr?.method || 'unknown',
                processingTime: data.ocr?.processing_time || 0
            });
            
            // ============ Store for modal ============
            setAutoApprovedSkills(finalAutoApproved);
            setNeedsReviewSkills(finalNeedsReview);
            setPendingSkills(finalNeedsReview);
            
            // ============ Show modal if there are skills ============
            if (finalNeedsReview.length > 0 || finalAutoApproved.length > 0) {
                setPendingDocumentId(data.documentId);
                setPendingDocumentType('Resume');
                setShowFeedbackModal(true);
                console.log('🎯 Opening feedback modal with:', {
                    needsReview: finalNeedsReview.length,
                    autoApproved: finalAutoApproved.length
                });
            } else {
                // No skills found
                await fetchEmployeeData();
                setProcessingStatus('Done!');
                setProcessingStep('complete');
                setTimeout(() => setShowProgressDetails(false), 3000);
                alert('No skills were extracted from this document.');
            }
        } else {
            throw new Error(response.data.error || 'Processing failed');
        }
    } catch (error) {
        let msg = 'Failed to process document';
        if (error.isMismatchCancelled) msg = error.message;
        else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) msg = '⏱️ Processing is taking longer than expected. Please try with a smaller file.';
        else if (error.response?.status === 500) msg = 'Server error. Please check the backend logs.';
        else if (error.response?.data?.error) msg = error.response.data.error;
        else if (error.message) msg = error.message;
        setUploadError(msg);
        setProcessingStatus(error.isMismatchCancelled ? 'Cancelled' : 'Error: ' + msg);
        setProcessingStep(error.isMismatchCancelled ? 'cancelled' : 'error');
        setTimeout(() => setShowProgressDetails(false), error.isMismatchCancelled ? 3000 : 10000);
    } finally {
        setOcrLoading(false);
    }
};

const handleCertUpload = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!employeeId) { setUploadError('Please log in to upload certificates'); return; }
  setCertLoading(true);
  setCertOcrResult(null);
  setUploadError(null);
  try {
      const response = await submitDocumentWithMismatchConfirm({ file, documentType: 'Certificate' });
      if (response.data.success) {
          const { data } = response.data;
          if (!data?.documentId) {
              throw new Error('Document processed but did not return a valid document ID. Please try again.');
          }
          
          // ============ FIX: Properly extract data ============
          const nlp = data.nlp || {};
          const allSkills = Array.isArray(nlp.skills) ? nlp.skills : [];
          const autoApproved = Array.isArray(nlp.auto_approved) ? nlp.auto_approved : [];
          const needsReview = Array.isArray(nlp.needs_review) ? nlp.needs_review : [];
          
          const finalNeedsReview = needsReview.length > 0 ? needsReview : allSkills;
          const finalAutoApproved = autoApproved.length > 0 ? autoApproved : [];
          
          if (allSkills.length > 0) {
              setCertOcrResult({
                  fileName: file.name,
                  confidence: data.ocr?.confidence ? `${(data.ocr.confidence * 100).toFixed(1)}%` : 'N/A',
                  extractedSkills: allSkills,
                  needsReview: finalNeedsReview,
                  autoApproved: finalAutoApproved,
                  method: data.ocr?.method || 'unknown',
                  processingTime: data.ocr?.processing_time || 0,
              });
              
              setPendingDocumentId(data.documentId);
              setPendingSkills(finalNeedsReview);
              setPendingDocumentType('Certificate');
              setShowFeedbackModal(true);
          } else {
              setCertOcrResult(null);
              setCertifications([...certifications, {
                  id: Date.now(),
                  name: file.name,
                  issuer: nlp.organizations?.[0] || 'Verified (via OCR)',
                  date: new Date().toISOString().split('T')[0],
                  expiry: 'N/A',
                  skills: []
              }]);
              await fetchEmployeeData();
              alert('Certificate uploaded successfully!');
          }
      } else {
          throw new Error(response.data.error || 'Processing failed');
      }
  } catch (error) {
      let msg = 'Failed to process certificate';
      if (error.isMismatchCancelled) msg = error.message;
      else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) msg = '⏱️ Processing is taking longer than expected. Please try with a smaller file.';
      else if (error.response?.data?.error) msg = error.response.data.error;
      else if (error.message) msg = error.message;
      setUploadError(msg);
  } finally {
      setCertLoading(false);
  }
};

  const handleFeedbackSubmitted = async (approvedSkills) => {
    if (approvedSkills?.length > 0) {
      const merged = Array.from(new Set([...employeeSkills, ...approvedSkills]));
      setEmployeeSkills(merged);
      if (employeeInfo) setEmployeeInfo({ ...employeeInfo, skills: merged });
    }
    await fetchEmployeeData();
    setProcessingStatus('Done!');
    setProcessingStep('complete');
    setTimeout(() => setShowProgressDetails(false), 3000);
  };

  const handleSkipFeedback = () => {
    fetchEmployeeData();
    setProcessingStatus('Done!');
    setProcessingStep('complete');
    setTimeout(() => setShowProgressDetails(false), 3000);
  };

  const handleRemoveCert = (certId) => setCertifications(certifications.filter(c => c.id !== certId));

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!employeeId) { alert('Please log in to update your profile'); return; }
    try {
      const authHeader = await getAuthHeader();
      const response = await axios.put(`${API_URL}/employee/profile`, {
        employeeId,
        first_name: profileForm.firstName,
        last_name: profileForm.lastName,
        email: profileForm.email,
        department: profileForm.department,
        role: profileForm.role,
        avatar_url: profilePicture
      }, { headers: authHeader });
      if (response.data.success) { alert('Profile updated successfully!'); await fetchEmployeeData(); }
      else alert('Failed to update profile');
    } catch (error) {
      console.error('Update error:', error);
      alert('Failed to update profile');
    }
  };

  const handleProfilePictureChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setProfilePicture(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handlePasswordChange = (e) => {
    e.preventDefault();
    setPasswordError('');
    if (!currentPassword) { setPasswordError('Please enter your current password.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('New password and confirm password do not match.'); return; }
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters long.'); return; }
    alert('Password changed successfully');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <p style={styles.errorText}>❌ {error}</p>
        <button onClick={fetchEmployeeData} style={styles.retryBtn}>Retry</button>
      </div>
    );
  }

  const skills = employeeSkills || [];

  // ── Icon helpers ────────────────────────────────────────────────────────────
  const IconUpload = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
  const IconUser = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  );
  const IconLock = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );

  return (
    <div style={styles.container}>
      <SkillFeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => { setShowFeedbackModal(false); handleSkipFeedback(); }}
        documentId={pendingDocumentId}
        employeeId={employeeId}
        // ✅ FIX: Use the separated lists
        needsReview={needsReviewSkills || []}
        autoApproved={autoApprovedSkills || []}                               // ← No auto-approved yet
        documentType={pendingDocumentType}
        onFeedbackSubmitted={handleFeedbackSubmitted}
        onSkip={handleSkipFeedback}
      />

      <div style={styles.header}>
        <h1 style={styles.title}>My Profile Portfolio</h1>
        <p style={styles.subtitle}>Upload credentials, run CV parsers, and manage skills & certifications.</p>
      </div>

      {uploadError && <div style={styles.errorBanner}>⚠️ {uploadError}</div>}

      {/* ═══════════════ MAIN TAB BAR ═══════════════ */}
      <div style={styles.mainTabBar}>
        <button
          type="button"
          onClick={() => setMainTab('credentials')}
          style={{ ...styles.mainTabBtn, ...(mainTab === 'credentials' ? styles.mainTabBtnActive : {}) }}
        >
          <IconUpload />
          Credentials
        </button>
        <button
          type="button"
          onClick={() => setMainTab('account')}
          style={{ ...styles.mainTabBtn, ...(mainTab === 'account' ? styles.mainTabBtnActive : {}) }}
        >
          <IconUser />
          Account Settings
        </button>
      </div>

      {/* ═══════════════ TAB 1: CREDENTIALS ═══════════════ */}
      {mainTab === 'credentials' && (
        <div style={styles.grid}>
          {/* Left: Resume Upload + Skills */}
          <div style={styles.col}>
            <div className="glass-card" style={styles.card}>
              <h2 style={styles.sectionTitle}>Upload CV / Resume</h2>
              <p style={styles.sectionSubtitle}>Upload PDF/image to automatically parse skills using OCR & NLP.</p>
              <div style={styles.uploadZone}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <label style={styles.uploadBtnLabel}>
                  Browse Files
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileUpload} style={{ display: 'none' }} disabled={ocrLoading} />
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
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                      </svg>
                      {ocrResult.fileName}
                    </span>
                    <span style={styles.ocrConfidence}>Confidence: {ocrResult.confidence}</span>
                  </div>
                  <div style={styles.ocrSkillsExtracted}>
                    <strong>Extracted Skills:</strong>
                    <div style={styles.ocrSkillsList}>
                          {Array.isArray(ocrResult.extractedSkills) && ocrResult.extractedSkills.map((sk, idx) => {
                              // ============ FIX: Handle both string and object skills ============
                              let skillName = sk;
                              if (typeof sk === 'object' && sk !== null) {
                                  skillName = sk.skill_name || sk.skill_tag || sk.skill || String(sk);
                              }
                              return <span key={idx} style={styles.extractedTag}>+{String(skillName)}</span>;
                          })}
                    </div>
                  </div>
                </div>
              )}

              {employeeDocuments.length > 0 && !ocrLoading && !ocrResult && (
                <div style={styles.activeResumeRow}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    Current CV: <strong>{employeeDocuments[0]?.file_name || 'None'}</strong>
                  </span>
                  <span style={styles.resumeDate}>
                    Uploaded on {employeeDocuments[0]?.created_at ? new Date(employeeDocuments[0].created_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              )}
            </div>

            <div className="glass-card" style={styles.card}>
              <h2 style={styles.sectionTitle}>Skills Portfolio</h2>
              <p style={styles.sectionSubtitle}>Verified skills extracted automatically from your resume profile.</p>
              <div style={styles.skillsList}>
                  {skills.length > 0
                      ? skills.map((skill, idx) => {
                          // ============ FIX: Handle both string and object skills ============
                          let skillName = skill;
                          if (typeof skill === 'object' && skill !== null) {
                              // If it's an object, extract the skill name
                              skillName = skill.skill_name || skill.skill_tag || skill.skill || String(skill);
                          }
                          return <span key={idx} style={styles.skillPill}>{skillName}</span>;
                        })
                      : <p style={styles.noSkills}>No skills extracted yet. Upload a resume to get started.</p>
                  }
              </div>
            </div>
          </div>

          {/* Right: Certifications */}
          <div style={styles.col}>
            <div className="glass-card" style={styles.card}>
              <h2 style={styles.sectionTitle}>Certifications</h2>
              <p style={styles.sectionSubtitle}>Upload PDF/image to automatically parse and append certifications.</p>
              <div style={{ ...styles.uploadZone, marginBottom: '20px' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <label style={styles.uploadBtnLabel}>
                  Upload Certificate
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleCertUpload} style={{ display: 'none' }} />
                </label>
                <span style={styles.uploadHelper}>Supported formats: PDF, PNG, JPG (Max 5MB)</span>
              </div>

              {certLoading && (
                <div style={styles.ocrLoadingWrapper}>
                  <div style={styles.ocrSpinner}></div>
                  <span>Scanning document & extracting text tags...</span>
                </div>
              )}

              {certOcrResult && (
                <div style={styles.ocrResultCard}>
                  <div style={styles.ocrResultHeader}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                      </svg>
                      {certOcrResult.fileName}
                    </span>
                    <span style={styles.ocrConfidence}>Confidence: {certOcrResult.confidence}</span>
                  </div>
                  <div style={styles.ocrSkillsExtracted}>
                    <strong>Extracted Skills:</strong>
                    <div style={styles.ocrSkillsList}>
                        {Array.isArray(certOcrResult.extractedSkills) && certOcrResult.extractedSkills.map((sk, idx) => {
                            // ============ FIX: Handle both string and object skills ============
                            let skillName = sk;
                            if (typeof sk === 'object' && sk !== null) {
                                skillName = sk.skill_name || sk.skill_tag || sk.skill || String(sk);
                            }
                            return <span key={idx} style={styles.extractedTag}>+{String(skillName)}</span>;
                        })}
                    </div>
                  </div>
                </div>
              )}

              <div style={styles.certsList}>
                {(employeeInfo?.certifications || []).length === 0 ? (
                  <p style={styles.noCerts}>No certifications uploaded.</p>
                ) : (
                  (employeeInfo?.certifications || []).map(cert => (
                    <div key={cert.id} style={styles.certItem}>
                      <div style={styles.certMeta}>
                        <h4 style={{ ...styles.certName, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
                            <path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"/>
                            <path d="M12 2a15.3 15.3 0 0 1 4 10H8a15.3 15.3 0 0 1 4-10z"/>
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
      )}

      {/* ═══════════════ TAB 2: ACCOUNT SETTINGS ═══════════════ */}
      {mainTab === 'account' && (
        <div className="glass-card" style={styles.card}>
          <form onSubmit={handleSaveProfile} style={styles.profileForm}>
              <div style={styles.profilePictureSection}>
                <div style={styles.profilePictureWrapper}>
                  <img
                    src={profilePicture || `https://ui-avatars.com/api/?name=${profileForm.firstName}+${profileForm.lastName}&size=100`}
                    alt="Profile"
                    style={styles.profilePicture}
                  />
                  <label style={styles.profilePictureLabel}>
                    <input type="file" accept="image/*" onChange={handleProfilePictureChange} style={{ display: 'none' }} />
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  </label>
                </div>
              </div>
              <div style={styles.twoColForm}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>First Name</label>
                  <input type="text" value={profileForm.firstName} onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })} style={styles.formInput} required />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Last Name</label>
                  <input type="text" value={profileForm.lastName} onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })} style={styles.formInput} required />
                </div>
                <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                  <label style={styles.formLabel}>Email Address</label>
                  <input type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} style={styles.formInput} required />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Department</label>
                  <input type="text" value={profileForm.department} onChange={(e) => setProfileForm({ ...profileForm, department: e.target.value })} style={styles.formInput} required />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Role Title</label>
                  <input type="text" value={profileForm.role} onChange={(e) => setProfileForm({ ...profileForm, role: e.target.value })} style={styles.formInput} required />
                </div>
              </div>
              <button type="submit" style={styles.saveBtn}>Update Profile Info</button>
            </form>

            <div style={styles.accountSectionSpacer} />

            <form onSubmit={handlePasswordChange} style={styles.profileForm}>
              <p style={styles.sectionSubtitle}>Update your password to keep your account secure.</p>
              {passwordError && <div style={styles.passwordError}>{passwordError}</div>}
              <div style={styles.twoColForm}>
                <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                  <label style={styles.formLabel}>Current Password</label>
                  <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" style={styles.formInput} required />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>New Password</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" style={styles.formInput} required />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Confirm New Password</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" style={styles.formInput} required />
                </div>
              </div>
              <button type="submit" style={styles.saveBtn}>Change Password</button>
            </form>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', gap: '24px' },
  header: { marginBottom: '8px' },
  title: { fontSize: '28px', fontWeight: '800', letterSpacing: '-0.75px', marginBottom: '4px' },
  subtitle: { fontSize: '15px', color: 'var(--color-text-secondary)' },

  // ── Main tab bar (top-level) ──────────────────────────────────────────────
  mainTabBar: {
    display: 'flex',
    gap: '6px',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '0',
  },
  mainTabBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    padding: '10px 20px',
    fontSize: '13px',
    fontWeight: '600',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: '-1px',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    borderRadius: '6px 6px 0 0',
    transition: 'color 0.15s',
  },
  mainTabBtnActive: {
    color: 'var(--color-primary)',
    borderBottom: '2px solid var(--color-primary)',
    background: 'var(--color-primary-light)',
  },

  // ── Inner tab bar (inside Account Settings card) ── matches screenshot ────
  accountSectionSpacer: {
    height: '24px'
  },

  // ── Layout ────────────────────────────────────────────────────────────────
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' },
  col: { display: 'flex', flexDirection: 'column', gap: '24px' },
  card: { padding: '24px' },

  // ── Section headings ──────────────────────────────────────────────────────
  sectionTitle: { fontSize: '18px', fontWeight: '700', marginBottom: '4px' },
  sectionSubtitle: { fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '20px' },

  // ── Upload zone ───────────────────────────────────────────────────────────
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
  uploadHelper: { fontSize: '11px', color: 'var(--color-text-muted)' },

  // ── OCR ──────────────────────────────────────────────────────────────────
  ocrLoadingWrapper: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
    marginTop: '16px', padding: '12px', background: 'var(--color-primary-light)',
    borderRadius: '6px', fontSize: '13px', color: 'var(--color-primary)',
  },
  ocrSpinner: {
    width: '18px', height: '18px',
    border: '2px solid rgba(16, 185, 129, 0.3)',
    borderTopColor: 'var(--color-primary)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  ocrResultCard: {
    marginTop: '16px', border: '1px solid var(--color-primary)',
    borderRadius: 'var(--radius-md)', padding: '14px',
    background: 'var(--color-primary-light)', textAlign: 'left',
  },
  ocrResultHeader: {
    display: 'flex', justifyContent: 'space-between', fontSize: '12px',
    fontWeight: '700', color: 'var(--color-primary)',
    borderBottom: '1px solid rgba(16, 185, 129, 0.2)',
    paddingBottom: '6px', marginBottom: '10px',
  },
  ocrConfidence: { fontSize: '11px' },
  ocrSkillsExtracted: { fontSize: '12px' },
  ocrSkillsList: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' },
  extractedTag: {
    fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
    background: 'var(--color-primary)', color: '#ffffff', fontWeight: '700',
  },
  activeResumeRow: {
    marginTop: '16px', display: 'flex', justifyContent: 'space-between',
    fontSize: '12px', color: 'var(--color-text-secondary)',
    padding: '10px 12px', background: 'var(--color-bg-card-hover)', borderRadius: '6px',
  },
  resumeDate: { color: 'var(--color-text-muted)' },

  // ── Skills ────────────────────────────────────────────────────────────────
  skillsList: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  skillPill: {
    fontSize: '12px', fontWeight: '600', padding: '6px 12px',
    borderRadius: '30px', background: 'var(--color-bg-card-hover)',
    color: 'var(--color-text-primary)', border: '1px solid var(--color-border)',
    display: 'flex', alignItems: 'center', gap: '8px',
  },
  noSkills: { fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px 0' },

  // ── Certifications ────────────────────────────────────────────────────────
  certsList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  noCerts: { fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center', padding: '12px 0' },
  certItem: {
    padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card-hover)', display: 'flex',
    justifyContent: 'space-between', alignItems: 'center', textAlign: 'left',
  },
  certMeta: { display: 'flex', flexDirection: 'column' },
  certName: { fontSize: '13px', fontWeight: '700', margin: 0 },
  certIssuer: { fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' },
  removeCertBtn: {
    background: 'transparent', border: 'none', color: 'var(--color-danger)',
    fontSize: '12px', fontWeight: '600', cursor: 'pointer',
  },

  // ── Profile form ──────────────────────────────────────────────────────────
  profileForm: { display: 'flex', flexDirection: 'column', gap: '20px' },
  twoColForm: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  formLabel: { fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--color-text-secondary)' },
  formInput: {
    padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)', color: 'var(--color-text-primary)',
    fontSize: '14px', outline: 'none',
  },
  saveBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'var(--color-primary)', color: '#ffffff', border: 'none',
    padding: '11px 24px', borderRadius: '6px', fontWeight: '700',
    fontSize: '13px', cursor: 'pointer',
  },
  passwordError: {
    padding: '10px', background: 'var(--color-danger-light)', color: 'var(--color-danger)',
    border: '1px solid var(--color-danger)', borderRadius: '6px', fontSize: '13px',
  },

  // ── Profile picture ───────────────────────────────────────────────────────
  profilePictureSection: { display: 'flex', justifyContent: 'center' },
  profilePictureWrapper: { position: 'relative', width: '100px', height: '100px' },
  profilePicture: {
    width: '100px', height: '100px', borderRadius: '50%',
    objectFit: 'cover', border: '2px solid var(--color-border)',
  },
  profilePictureLabel: {
    position: 'absolute', bottom: '0', right: '0',
    background: 'var(--color-primary)', color: '#ffffff',
    width: '32px', height: '32px', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', border: '2px solid var(--color-bg-card)', transition: 'all 0.2s',
  },

  // ── Errors / utility ─────────────────────────────────────────────────────
  errorContainer: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '400px', gap: '16px',
    padding: '20px', textAlign: 'center',
  },
  errorText: { fontSize: '20px', fontWeight: '600', color: 'var(--color-danger)' },
  errorSubText: { fontSize: '14px', color: 'var(--color-text-muted)' },
  errorBanner: {
    padding: '12px 16px', background: '#fef2f2', color: '#dc2626',
    border: '1px solid #fecaca', borderRadius: '8px', fontSize: '14px',
  },
  retryBtn: {
    padding: '10px 24px', backgroundColor: 'var(--color-primary)', color: '#ffffff',
    border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
  },
};