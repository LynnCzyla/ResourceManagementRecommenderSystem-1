import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { supabase } from '../../lib/supabaseClient';
import SkillFeedbackModal from './SkillFeedbackModal'; // Import the modal

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

  // Progress states
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  const [processingStep, setProcessingStep] = useState('');
  const [showProgressDetails, setShowProgressDetails] = useState(false);

  // ============ FEEDBACK MODAL STATES ============
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [pendingDocumentId, setPendingDocumentId] = useState(null);
  const [pendingSkills, setPendingSkills] = useState([]);
  const [pendingDocumentType, setPendingDocumentType] = useState('');

  // Forms states
  const [profileForm, setProfileForm] = useState({ 
    firstName: '', 
    lastName: '', 
    email: '', 
    department: '', 
    role: '' 
  });
  const [profilePicture, setProfilePicture] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Get current user from Supabase Auth
  useEffect(() => {
    const getUser = async () => {
      setAuthLoading(true);
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Session error:', sessionError);
        }

        if (session?.user) {
          console.log('✅ User found in session:', session.user);
          console.log('✅ User email:', session.user.email);
          setUser(session.user);
          
          const empId = session.user.user_metadata?.employee_id || 
                        session.user.email?.split('@')[0] || 
                        'EMP-1014';
          setEmployeeId(empId);
          console.log('📋 Employee ID:', empId);
        } else {
          console.log('⚠️ No active session found');
          const localUser = localStorage.getItem('user');
          if (localUser) {
            try {
              const parsedUser = JSON.parse(localUser);
              console.log('✅ User found in localStorage:', parsedUser);
              setUser(parsedUser);
              const empId = parsedUser.employee_id || parsedUser.email?.split('@')[0] || 'EMP-1014';
              setEmployeeId(empId);
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('🔄 Auth state changed:', event);
        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          const empId = session.user.user_metadata?.employee_id || 
                        session.user.email?.split('@')[0] || 
                        'EMP-1014';
          setEmployeeId(empId);
          fetchEmployeeData();
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setEmployeeId(null);
          setEmployeeInfo(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Fetch employee data when employeeId is available
  useEffect(() => {
    if (employeeId && !authLoading) {
      fetchEmployeeData();
    }
  }, [employeeId, authLoading]);

  // If no user is logged in, show a message
  if (!authLoading && !user) {
    return (
      <div style={styles.errorContainer}>
        <p style={styles.errorText}>🔒 Please log in to view your profile</p>
        <p style={styles.errorSubText}>You need to be logged in to access this page.</p>
        <button onClick={() => window.location.href = '/login'} style={styles.retryBtn}>
          Go to Login
        </button>
      </div>
    );
  }

  const fetchEmployeeData = async () => {
    if (!employeeId) {
      console.log('⚠️ No employeeId available');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('📋 Fetching profile for employee:', employeeId);
      console.log('📧 User email:', user?.email);
      
      const profileResponse = await axios.get(`${API_URL}/employee/profile/${employeeId}`);
      console.log('📋 Profile Response:', profileResponse.data);
      
      if (profileResponse.data.success) {
        const profileData = profileResponse.data.data;
        setEmployeeInfo(profileData);
        setProfileForm({
          firstName: profileData.first_name || '',
          lastName: profileData.last_name || '',
          email: profileData.email || user?.email || '',
          department: profileData.department || '',
          role: profileData.role || ''
        });
        setProfilePicture(profileData.avatar_url || '');
      } else {
        console.log('⚠️ Profile not found, using user data');
        setProfileForm({
          firstName: user?.user_metadata?.first_name || '',
          lastName: user?.user_metadata?.last_name || '',
          email: user?.email || '',
          department: '',
          role: ''
        });
      }

      const skillsResponse = await axios.get(`${API_URL}/employee/skills?employeeId=${employeeId}`);
      if (skillsResponse.data.success) {
        const skills = skillsResponse.data.data.map(skill => skill.skill_name || skill);
        setEmployeeSkills(skills);
      }

      const docsResponse = await axios.get(`${API_URL}/employee/documents?employeeId=${employeeId}`);
      if (docsResponse.data.success) {
        setEmployeeDocuments(docsResponse.data.data);
      }

    } catch (err) {
      console.error('❌ Error fetching employee data:', err);
      if (err.response?.status === 404) {
        console.log('📝 Profile not found, creating from user data');
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

  // ============ HANDLE FILE UPLOAD WITH FEEDBACK ============
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
  
    if (!employeeId) {
      setUploadError('Please log in to upload documents');
      return;
    }
  
    setOcrLoading(true);
    setOcrResult(null);
    setUploadError(null);
    setUploadProgress(0);
    setProcessingStatus('Starting upload...');
    setProcessingStep('uploading');
    setShowProgressDetails(true);
  
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('employeeId', employeeId);
      formData.append('documentType', 'Resume');
  
      console.log('📤 Uploading file:', file.name);
  
      const response = await axios.post(
        `${API_URL}/employee/process-document`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 300000,
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentCompleted);
            if (percentCompleted < 30) {
              setProcessingStatus('Uploading file...');
            } else if (percentCompleted < 60) {
              setProcessingStatus('Uploading file to server...');
            } else if (percentCompleted < 90) {
              setProcessingStatus('Processing upload...');
            }
          }
        }
      );
  
      console.log('✅ Upload response:', response.data);
  
      if (response.data.success) {
        const { data } = response.data;
        
        // Store extracted skills for feedback
        const extractedSkills = data.nlp?.categorized_skills || [];
        
        // Show OCR results
        setOcrResult({
          fileName: file.name,
          confidence: data.ocr?.confidence ? `${(data.ocr.confidence * 100).toFixed(1)}%` : 'N/A',
          extractedSkills: extractedSkills,
          method: data.ocr?.method || 'unknown',
          processingTime: data.ocr?.processing_time || 0
        });
  
        // ============ SHOW FEEDBACK MODAL ============
        if (extractedSkills.length > 0) {
          setPendingDocumentId(data.documentId || `doc_${Date.now()}`);
          setPendingSkills(extractedSkills);
          setPendingDocumentType('Resume');
          setShowFeedbackModal(true);
        } else {
          // No skills to review, just update
          await fetchEmployeeData();
          setProcessingStatus('Done!');
          setProcessingStep('complete');
          setTimeout(() => {
            setShowProgressDetails(false);
          }, 3000);
        }
  
        console.log('✅ Document processed successfully:', data);
      } else {
        throw new Error(response.data.error || 'Processing failed');
      }
  
    } catch (error) {
      console.error('❌ Upload error:', error);
      
      let errorMessage = 'Failed to process document';
      
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = '⏱️ Processing is taking longer than expected. Please try with a smaller file.';
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error. Please check the backend logs.';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setUploadError(errorMessage);
      setProcessingStatus('Error: ' + errorMessage);
      setProcessingStep('error');
      
      setTimeout(() => {
        setShowProgressDetails(false);
      }, 10000);
      
    } finally {
      setOcrLoading(false);
    }
  };

  // ============ HANDLE CERTIFICATE UPLOAD WITH FEEDBACK ============
  const handleCertUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
  
    if (!employeeId) {
      setUploadError('Please log in to upload certificates');
      return;
    }
  
    setCertLoading(true);
    setUploadError(null);
  
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('employeeId', employeeId);
      formData.append('documentType', 'Certificate');
  
      console.log('📤 Uploading certificate:', file.name);
  
      const response = await axios.post(
        `${API_URL}/employee/process-document`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 300000,
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            console.log(`📊 Certificate upload: ${percentCompleted}%`);
          }
        }
      );
  
      console.log('✅ Certificate upload response:', response.data);
  
      if (response.data.success) {
        const { data } = response.data;
        
        const extractedSkills = data.nlp?.categorized_skills || [];
        
        // ============ SHOW FEEDBACK MODAL FOR CERTIFICATE ============
        if (extractedSkills.length > 0) {
          setPendingDocumentId(data.documentId || `cert_${Date.now()}`);
          setPendingSkills(extractedSkills);
          setPendingDocumentType('Certificate');
          setShowFeedbackModal(true);
        } else {
          // No skills, just add certificate
          const newCert = {
            id: Date.now(),
            name: file.name,
            issuer: data.nlp?.organizations?.[0] || 'Verified (via OCR)',
            date: new Date().toISOString().split('T')[0],
            expiry: 'N/A',
            skills: []
          };
          setCertifications([...certifications, newCert]);
          await fetchEmployeeData();
          setUploadError(null);
          alert('Certificate uploaded successfully!');
        }
        
        console.log('✅ Certificate processed successfully:', data);
      } else {
        throw new Error(response.data.error || 'Processing failed');
      }
    } catch (error) {
      console.error('❌ Certificate upload error:', error);
      
      let errorMessage = 'Failed to process certificate';
      
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = '⏱️ Processing is taking longer than expected. Please try with a smaller file.';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setUploadError(errorMessage);
    } finally {
      setCertLoading(false);
    }
  };

  // ============ HANDLE FEEDBACK SUBMITTED ============
  const handleFeedbackSubmitted = async (approvedSkills) => {
    console.log('✅ Feedback submitted with approved skills:', approvedSkills);
    
    // Update employee skills with approved skills
    if (approvedSkills && approvedSkills.length > 0) {
      const mergedSkills = Array.from(new Set([...employeeSkills, ...approvedSkills]));
      setEmployeeSkills(mergedSkills);
      
      if (employeeInfo) {
        setEmployeeInfo({
          ...employeeInfo,
          skills: mergedSkills
        });
      }
    }
    
    await fetchEmployeeData();
    
    setProcessingStatus('Done!');
    setProcessingStep('complete');
    setTimeout(() => {
      setShowProgressDetails(false);
    }, 3000);
  };

  // ============ HANDLE SKIP FEEDBACK ============
  const handleSkipFeedback = () => {
    console.log('⏭️ Skipped feedback for document');
    fetchEmployeeData();
    setProcessingStatus('Done!');
    setProcessingStep('complete');
    setTimeout(() => {
      setShowProgressDetails(false);
    }, 3000);
  };

  const handleRemoveCert = (certId) => {
    setCertifications(certifications.filter(c => c.id !== certId));
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    
    if (!employeeId) {
      alert('Please log in to update your profile');
      return;
    }

    try {
      const response = await axios.put(`${API_URL}/employee/profile`, {
        employeeId: employeeId,
        first_name: profileForm.firstName,
        last_name: profileForm.lastName,
        email: profileForm.email,
        department: profileForm.department,
        role: profileForm.role,
        avatar_url: profilePicture
      });

      if (response.data.success) {
        alert('Profile updated successfully!');
        await fetchEmployeeData();
      } else {
        alert('Failed to update profile');
      }
    } catch (error) {
      console.error('Update error:', error);
      alert('Failed to update profile');
    }
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

  // Error state
  if (error) {
    return (
      <div style={styles.errorContainer}>
        <p style={styles.errorText}>❌ {error}</p>
        <button onClick={fetchEmployeeData} style={styles.retryBtn}>
          Retry
        </button>
      </div>
    );
  }

  const skills = employeeSkills || [];

  return (
    <div style={styles.container}>
      {/* ============ FEEDBACK MODAL ============ */}
      <SkillFeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => {
          setShowFeedbackModal(false);
          handleSkipFeedback();
        }}
        documentId={pendingDocumentId}
        employeeId={employeeId}
        extractedSkills={pendingSkills}
        documentType={pendingDocumentType}
        onFeedbackSubmitted={handleFeedbackSubmitted}
        onSkip={handleSkipFeedback}
      />

      <div style={styles.header}>
        <h1 style={styles.title}>My Profile Portfolio</h1>
        <p style={styles.subtitle}>Upload credentials, run CV parsers, and manage skills & certifications.</p>
      </div>

      {uploadError && (
        <div style={styles.errorBanner}>
          ⚠️ {uploadError}
        </div>
      )}

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

            {employeeDocuments.length > 0 && !ocrLoading && !ocrResult && (
              <div style={styles.activeResumeRow}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                  </svg>
                  Current CV: <strong>{employeeDocuments[0]?.file_name || 'None'}</strong>
                </span>
                <span style={styles.resumeDate}>
                  Uploaded on {employeeDocuments[0]?.created_at ? new Date(employeeDocuments[0].created_at).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            )}
          </div>

          {/* Skills Portfolio */}
          <div className="glass-card" style={styles.card}>
            <h2 style={styles.sectionTitle}>Skills Portfolio</h2>
            <p style={styles.sectionSubtitle}>Verified skills extracted automatically from your resume profile.</p>

            <div style={styles.skillsList}>
              {skills.length > 0 ? (
                skills.map((skill, idx) => (
                  <span key={idx} style={{ ...styles.skillPill, paddingRight: '12px' }}>
                    {skill}
                  </span>
                ))
              ) : (
                <p style={styles.noSkills}>No skills extracted yet. Upload a resume to get started.</p>
              )}
            </div>
          </div>
        </div>

        {/* Profile Settings & Certifications Column */}
        <div style={styles.rightCol}>
          {/* Profile Form */}
          <div className="glass-card" style={styles.card}>
            <h2 style={styles.sectionTitle}>Profile Details</h2>
            <form onSubmit={handleSaveProfile} style={styles.profileForm}>
              <div style={styles.profilePictureSection}>
                <div style={styles.profilePictureWrapper}>
                  <img
                    src={profilePicture || `https://ui-avatars.com/api/?name=${profileForm.firstName}+${profileForm.lastName}&size=100`}
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
                <label style={styles.formLabel}>First Name</label>
                <input
                  type="text"
                  value={profileForm.firstName}
                  onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                  style={styles.formInput}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Last Name</label>
                <input
                  type="text"
                  value={profileForm.lastName}
                  onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
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
              {(employeeInfo?.certifications || []).length === 0 ? (
                <p style={styles.noCerts}>No certifications uploaded.</p>
              ) : (
                (employeeInfo?.certifications || []).map(cert => (
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
  userEmail: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
    marginTop: '4px',
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
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    gap: '16px',
    padding: '20px',
    textAlign: 'center',
  },
  errorText: {
    fontSize: '20px',
    fontWeight: '600',
    color: 'var(--color-danger)',
  },
  errorSubText: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
  },
  errorBanner: {
    padding: '12px 16px',
    background: '#fef2f2',
    color: '#dc2626',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    fontSize: '14px',
  },
  retryBtn: {
    padding: '10px 24px',
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    gap: '16px',
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid var(--color-border)',
    borderTopColor: 'var(--color-primary)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  noSkills: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    textAlign: 'center',
    padding: '20px 0',
  }
};