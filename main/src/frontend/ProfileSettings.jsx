import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../config/api';

const API = `${API_BASE_URL}/api/admin`;

export default function ProfileSettings({ isOpen, onClose, user, onAvatarUpdate, onProfileUpdate }) {
  const [activeTab, setActiveTab] = useState('profile');

  // ── Profile state ──────────────────────────────────────────────────────────
  const [departments, setDepartments] = useState([]);
  const [profileForm, setProfileForm] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    email: '',
    contact_number: '',
    department_id: '',
  });
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileAlert, setProfileAlert] = useState({ type: '', message: '' });
  const fileInputRef = useRef(null);

  // ── Password state ─────────────────────────────────────────────────────────
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordAlert, setPasswordAlert] = useState({ type: '', message: '' });
  
  // ── Password requirements state ────────────────────────────────────────────
  const [passwordRequirements, setPasswordRequirements] = useState(null);
  const [requirements, setRequirements] = useState({
    minLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSpecial: false,
    minUppercase: false,
    minLowercase: false,
    minNumber: false,
    minSpecial: false,
  });

  // ── Load password requirements ─────────────────────────────────────────────
  useEffect(() => {
    const fetchRequirements = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('min_password_length, require_uppercase, min_uppercase, require_lowercase, min_lowercase, require_number, min_number, require_special, min_special')
          .limit(1)
          .single();

        if (error) throw error;
        setPasswordRequirements(data);
      } catch (err) {
        console.error('Error fetching password requirements:', err);
        // Set default requirements if fetch fails
        setPasswordRequirements({
          min_password_length: 8,
          require_uppercase: true,
          min_uppercase: 1,
          require_lowercase: true,
          min_lowercase: 1,
          require_number: true,
          min_number: 1,
          require_special: true,
          min_special: 1,
        });
      }
    };

    fetchRequirements();
  }, []);

  // ── Validate password in real-time ────────────────────────────────────────
  useEffect(() => {
    if (!passwordRequirements || !passwordForm.newPassword) {
      setRequirements({
        minLength: false,
        hasUppercase: false,
        hasLowercase: false,
        hasNumber: false,
        hasSpecial: false,
        minUppercase: false,
        minLowercase: false,
        minNumber: false,
        minSpecial: false,
      });
      return;
    }

    const password = passwordForm.newPassword;
    const minLength = password.length >= passwordRequirements.min_password_length;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    
    // Count occurrences
    const uppercaseCount = (password.match(/[A-Z]/g) || []).length;
    const lowercaseCount = (password.match(/[a-z]/g) || []).length;
    const numberCount = (password.match(/[0-9]/g) || []).length;
    const specialCount = (password.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) || []).length;

    const minUppercase = passwordRequirements.require_uppercase 
      ? uppercaseCount >= passwordRequirements.min_uppercase 
      : true;
    const minLowercase = passwordRequirements.require_lowercase 
      ? lowercaseCount >= passwordRequirements.min_lowercase 
      : true;
    const minNumber = passwordRequirements.require_number 
      ? numberCount >= passwordRequirements.min_number 
      : true;
    const minSpecial = passwordRequirements.require_special 
      ? specialCount >= passwordRequirements.min_special 
      : true;

    setRequirements({
      minLength,
      hasUppercase,
      hasLowercase,
      hasNumber,
      hasSpecial,
      minUppercase,
      minLowercase,
      minNumber,
      minSpecial,
    });
  }, [passwordForm.newPassword, passwordRequirements]);

  // ── Load data on open ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('profile');
    setProfileAlert({ type: '', message: '' });
    setPasswordAlert({ type: '', message: '' });
    setAvatarFile(null);
    setAvatarPreview(null);
    loadProfile();
    loadDepartments();
    // Reset password form when opening
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
  }, [isOpen]);

  const loadProfile = async () => {
    try {
      if (!user?.id) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select(`
          first_name, 
          middle_name, 
          last_name, 
          contact_number, 
          department_id, 
          avatar_url,
          role,
          departments ( department_name ),
          positions ( position_name ),
          branches:profiles_branch_id_fkey ( name )
        `)
        .eq('id', user.id)
        .single();

      if (profile) {
        setProfileForm({
          first_name: profile.first_name || '',
          middle_name: profile.middle_name || '',
          last_name: profile.last_name || '',
          email: user.email || '',
          contact_number: profile.contact_number || '',
          department_id: profile.department_id || '',
          role: profile.role || 'Employee',
          position_name: profile.positions?.position_name || 'N/A',
          department_name: profile.departments?.department_name || 'N/A',
          branch_name: profile.branches?.name || 'N/A',
        });

        if (profile.avatar_url) {
          setAvatarUrl(profile.avatar_url);
        }
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    }
  };

  const loadDepartments = async () => {
    try {
      const res = await fetch(`${API}/departments`);
      const data = await res.json();
      if (data.success) setDepartments(data.data);
    } catch (err) {
      console.error('Error loading departments:', err);
    }
  };

  // ── Avatar handling ────────────────────────────────────────────────────────
  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProfileAlert({ type: 'error', message: 'Please select an image file (JPG, PNG, WEBP).' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileAlert({ type: 'error', message: 'Image must be smaller than 2MB.' });
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
    setProfileAlert({ type: '', message: '' });
  };

  const uploadAvatar = async (userId) => {
    if (!avatarFile) return null;

    const fileExt = avatarFile.name.split('.').pop();
    const filePath = `avatars/${userId}/avatar.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, avatarFile, { upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const showSuccessAlert = (message, title = 'Success!') => {
    Swal.fire({
      title,
      text: message,
      icon: 'success',
      zIndex: 10050,
      confirmButtonColor: 'var(--color-primary)',
      confirmButtonText: 'OK',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
      iconColor: 'var(--color-success)',
      customClass: {
        container: 'swal-custom-container',
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm'
      },
      didOpen: () => {
        const container = Swal.getContainer();
        if (container) {
          container.style.zIndex = '10050';
        }
      }
    });
  };

  const handleSaveProfile = async () => {
    if (!profileForm.first_name.trim() || !profileForm.last_name.trim()) {
      setProfileAlert({ type: 'error', message: 'First name and last name are required.' });
      return;
    }

    if (!user?.id) {
      setProfileAlert({ type: 'error', message: 'Session error. Please re-login.' });
      return;
    }

    setProfileLoading(true);
    setProfileAlert({ type: '', message: '' });

    try {
      let newAvatarUrl = avatarUrl;
      if (avatarFile) {
        newAvatarUrl = await uploadAvatar(user.id);
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          first_name: profileForm.first_name.trim(),
          middle_name: profileForm.middle_name.trim() || null,
          last_name: profileForm.last_name.trim(),
          contact_number: profileForm.contact_number.trim() || null,
          department_id: profileForm.department_id ? parseInt(profileForm.department_id) : null,
          avatar_url: newAvatarUrl || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      const updatedFields = {
        first_name: profileForm.first_name.trim(),
        middle_name: profileForm.middle_name.trim() || null,
        last_name: profileForm.last_name.trim(),
        contact_number: profileForm.contact_number.trim() || null,
        department_id: profileForm.department_id ? parseInt(profileForm.department_id) : null,
        avatar_url: newAvatarUrl || null,
      };

      try {
        const stored = JSON.parse(localStorage.getItem('user') || '{}');
        const updatedUser = {
          ...stored,
          ...updatedFields,
          name: `${updatedFields.first_name} ${updatedFields.last_name}`.trim(),
          avatar: updatedFields.avatar_url || stored.avatar
        };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        onProfileUpdate?.(updatedUser);
        window.dispatchEvent(new Event('userProfileUpdated'));
      } catch (lsErr) {
        console.warn('Could not update localStorage user:', lsErr);
      }

      if (newAvatarUrl) {
        setAvatarUrl(newAvatarUrl);
        onAvatarUpdate?.(newAvatarUrl);
      }
      setAvatarFile(null);
      setAvatarPreview(null);
      setProfileAlert({ type: '', message: '' });
      showSuccessAlert('Profile updated successfully.');

    } catch (err) {
      console.error('Save profile error:', err);
      setProfileAlert({ type: 'error', message: err.message || 'Failed to save profile.' });
    } finally {
      setProfileLoading(false);
    }
  };

  // ── Change Password ────────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    setPasswordAlert({ type: '', message: '' });

    // Validate current password
    if (!passwordForm.currentPassword) {
      setPasswordAlert({ type: 'error', message: 'Current password is required.' });
      return;
    }

    // Validate new password
    if (!passwordForm.newPassword) {
      setPasswordAlert({ type: 'error', message: 'New password is required.' });
      return;
    }

     // ✅ ADD THIS: Validate confirm password is not empty
    if (!passwordForm.confirmPassword) {
      setPasswordAlert({ type: 'error', message: 'Please confirm your new password.' });
      return;
    }

    // Check password requirements
    if (passwordRequirements) {
      const isPasswordValid = Object.values(requirements).every(req => req === true);
      if (!isPasswordValid) {
        setPasswordAlert({ type: 'error', message: 'New password does not meet all requirements.' });
        return;
      }
    } else if (passwordForm.newPassword.length < 8) {
      setPasswordAlert({ type: 'error', message: 'Password must be at least 8 characters.' });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordAlert({ type: 'error', message: 'New passwords do not match.' });
      return;
    }

    // Verify current password matches
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passwordForm.currentPassword,
      });

      if (signInError) {
        setPasswordAlert({ type: 'error', message: 'Current password is incorrect.' });
        return;
      }
    } catch (err) {
      setPasswordAlert({ type: 'error', message: 'Failed to verify current password. Please try again.' });
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword,
      });

      if (error) throw error;

      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordAlert({ type: 'success', message: 'Password changed successfully.' });
      
      // Sign out after password change (optional - user can stay logged in)
      // await supabase.auth.signOut();
    } catch (err) {
      console.error('Change password error:', err);
      setPasswordAlert({ type: 'error', message: err.message || 'Failed to change password.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const displayAvatar = avatarPreview || avatarUrl || user?.avatar;
  const initials = `${profileForm.first_name?.[0] || ''}${profileForm.last_name?.[0] || ''}`.toUpperCase() || 'AD';

  const clearAlert = (tab) => {
    if (tab === 'profile') setProfileAlert({ type: '', message: '' });
    else setPasswordAlert({ type: '', message: '' });
  };

  // ── Render requirement item ───────────────────────────────────────────────
  const renderRequirement = (label, isMet) => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '3px 0',
      color: isMet ? 'var(--color-success, #16a34a)' : 'var(--color-text-muted)',
      fontSize: '12px',
      transition: 'color 0.3s ease',
    }}>
      <span style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        border: `2px solid ${isMet ? 'var(--color-success, #16a34a)' : 'var(--color-border)'}`,
        backgroundColor: isMet ? 'var(--color-success, #16a34a)' : 'transparent',
        color: isMet ? 'white' : 'transparent',
        transition: 'all 0.3s ease',
        fontSize: '10px',
        flexShrink: 0,
      }}>
        {isMet && '✓'}
      </span>
      {label}
    </div>
  );

  // ── Get requirement labels ────────────────────────────────────────────────
  const getRequirementLabels = () => {
    if (!passwordRequirements) return [];

    const labels = [];
    
    labels.push({
      label: `At least ${passwordRequirements.min_password_length} characters`,
      met: requirements.minLength
    });

    if (passwordRequirements.require_uppercase) {
      labels.push({
        label: `At least ${passwordRequirements.min_uppercase} uppercase letter${passwordRequirements.min_uppercase > 1 ? 's' : ''}`,
        met: requirements.minUppercase
      });
    }

    if (passwordRequirements.require_lowercase) {
      labels.push({
        label: `At least ${passwordRequirements.min_lowercase} lowercase letter${passwordRequirements.min_lowercase > 1 ? 's' : ''}`,
        met: requirements.minLowercase
      });
    }

    if (passwordRequirements.require_number) {
      labels.push({
        label: `At least ${passwordRequirements.min_number} number${passwordRequirements.min_number > 1 ? 's' : ''}`,
        met: requirements.minNumber
      });
    }

    if (passwordRequirements.require_special) {
      labels.push({
        label: `At least ${passwordRequirements.min_special} special character${passwordRequirements.min_special > 1 ? 's' : ''}`,
        met: requirements.minSpecial
      });
    }

    return labels;
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="glass-card" style={styles.modal}>

        {/* Close Button */}
        <button onClick={onClose} style={styles.closeBtn}>✕</button>

        {/* Avatar Section */}
        <div style={styles.avatarSection}>
          <div style={styles.avatarWrapper} onClick={handleAvatarClick} title="Click to change photo">
            {displayAvatar ? (
              <img src={displayAvatar} alt="Profile" style={styles.avatarImg} />
            ) : (
              <div style={styles.avatarFallback}>{initials}</div>
            )}
            <div style={styles.avatarOverlay}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleAvatarChange}
            style={{ display: 'none' }}
          />
          {avatarPreview && (
            <p style={styles.avatarHint}>New photo selected — save to apply</p>
          )}
        </div>

        {/* Title */}
        <div style={styles.titleSection}>
          <h2 style={styles.title}>Profile Settings</h2>
          <p style={styles.subtitle}>Update your personal information and contact details.</p>
        </div>

        {/* Tabs */}
        <div style={styles.tabsRow}>
          <button
            onClick={() => { setActiveTab('profile'); clearAlert('profile'); }}
            style={{
              ...styles.tabBtn,
              borderBottomColor: activeTab === 'profile' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'profile' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: activeTab === 'profile' ? '700' : '500',
            }}
          >
            Profile
          </button>
          <button
            onClick={() => { setActiveTab('password'); clearAlert('password'); }}
            style={{
              ...styles.tabBtn,
              borderBottomColor: activeTab === 'password' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'password' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: activeTab === 'password' ? '700' : '500',
            }}
          >
            Change Password
          </button>
        </div>

        {/* ── PROFILE TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'profile' && (
          <div style={styles.tabContent}>
            <Alert
              type={profileAlert.type}
              message={profileAlert.message}
              onClose={() => setProfileAlert({ type: '', message: '' })}
            />

            {/* Name Row */}
            <div style={styles.threeCol}>
              <div style={styles.formGroup}>
                <label style={styles.label}>FIRST NAME <span style={styles.req}>*</span></label>
                <input
                  type="text"
                  value={profileForm.first_name}
                  onChange={(e) => setProfileForm(f => ({ ...f, first_name: e.target.value }))}
                  style={styles.input}
                  placeholder="First name"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>MIDDLE NAME</label>
                <input
                  type="text"
                  value={profileForm.middle_name}
                  onChange={(e) => setProfileForm(f => ({ ...f, middle_name: e.target.value }))}
                  style={styles.input}
                  placeholder="Middle name"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>LAST NAME <span style={styles.req}>*</span></label>
                <input
                  type="text"
                  value={profileForm.last_name}
                  onChange={(e) => setProfileForm(f => ({ ...f, last_name: e.target.value }))}
                  style={styles.input}
                  placeholder="Last name"
                />
              </div>
            </div>

            {/* Email */}
            <div style={styles.formGroup}>
              <label style={styles.label}>EMAIL ADDRESS <span style={styles.req}>*</span></label>
              <input
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm(f => ({ ...f, email: e.target.value }))}
                style={styles.input}
                placeholder="your@email.com"
                disabled
              />
            </div>

            {/* Phone + Department Row */}
            <div style={styles.twoCol}>
              <div style={styles.formGroup}>
                <label style={styles.label}>PHONE NUMBER</label>
                <input
                  type="text"
                  value={profileForm.contact_number}
                  onChange={(e) => setProfileForm(f => ({ ...f, contact_number: e.target.value }))}
                  style={styles.input}
                  placeholder="+63 912 345 6789"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>DEPARTMENT</label>
                <input
                  type="text"
                  value={profileForm.department_name}
                  style={styles.input}
                  disabled
                />
              </div>
            </div>

            {/* Read-only Role + Position + Branch details */}
            <div style={styles.threeCol}>
              <div style={styles.formGroup}>
                <label style={styles.label}>ROLE</label>
                <input
                  type="text"
                  value={profileForm.role}
                  style={styles.input}
                  disabled
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>POSITION</label>
                <input
                  type="text"
                  value={profileForm.position_name}
                  style={styles.input}
                  disabled
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>ASSIGNED BRANCH</label>
                <input
                  type="text"
                  value={profileForm.branch_name}
                  style={styles.input}
                  disabled
                />
              </div>
            </div>

            {/* Actions */}
            <div style={styles.actions}>
              <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
              <button
                onClick={handleSaveProfile}
                style={styles.saveBtn}
                disabled={profileLoading}
                className="glow-primary"
              >
                {profileLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {/* ── PASSWORD TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'password' && (
          <div style={styles.tabContent}>
            <Alert
              type={passwordAlert.type}
              message={passwordAlert.message}
              onClose={() => setPasswordAlert({ type: '', message: '' })}
            />

            {/* Current Password */}
            <div style={styles.formGroup}>
              <label style={styles.label}>CURRENT PASSWORD <span style={styles.req}>*</span></label>
              <div style={styles.passwordWrapper}>
                <input
                  type={showPasswords.current ? 'text' : 'password'}
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))}
                  style={{ ...styles.input, paddingRight: 44 }}
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(p => ({ ...p, current: !p.current }))}
                  style={styles.eyeBtn}
                >
                  {showPasswords.current ? <EyeOff /> : <EyeOn />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div style={styles.formGroup}>
              <label style={styles.label}>NEW PASSWORD <span style={styles.req}>*</span></label>
              <div style={styles.passwordWrapper}>
                <input
                  type={showPasswords.new ? 'text' : 'password'}
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                  style={{ ...styles.input, paddingRight: 44 }}
                  placeholder="Enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(p => ({ ...p, new: !p.new }))}
                  style={styles.eyeBtn}
                >
                  {showPasswords.new ? <EyeOff /> : <EyeOn />}
                </button>
              </div>
            </div>

            {/* Password Requirements */}
            {passwordForm.newPassword && passwordRequirements && (
              <div style={styles.requirementsContainer}>
                {getRequirementLabels().map((req, index) => (
                  <div key={index}>
                    {renderRequirement(req.label, req.met)}
                  </div>
                ))}
              </div>
            )}

            {/* Confirm Password */}
            <div style={styles.formGroup}>
              <label style={styles.label}>CONFIRM NEW PASSWORD <span style={styles.req}>*</span></label>
              <div style={styles.passwordWrapper}>
                <input
                  type={showPasswords.confirm ? 'text' : 'password'}
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  style={{ ...styles.input, paddingRight: 44 }}
                  placeholder="Confirm new password"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(p => ({ ...p, confirm: !p.confirm }))}
                  style={styles.eyeBtn}
                >
                  {showPasswords.confirm ? <EyeOff /> : <EyeOn />}
                </button>
              </div>
            </div>

            <div style={styles.actions}>
              <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
              <button
                onClick={handleChangePassword}
                style={styles.saveBtn}
                disabled={passwordLoading}
                className="glow-primary"
              >
                {passwordLoading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Alert({ type, message, onClose }) {
  if (!message) return null;
  const isSuccess = type === 'success';
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '12px 14px',
      borderRadius: 'var(--radius-md, 8px)',
      fontSize: 13,
      fontWeight: 600,
      marginBottom: 16,
      gap: 8,
      backgroundColor: isSuccess 
        ? 'var(--color-success-light, #dcfce7)' 
        : 'var(--color-danger-light, #fee2e2)',
      color: isSuccess 
        ? 'var(--color-success, #16a34a)' 
        : 'var(--color-danger, #dc2626)',
      border: `1px solid ${
        isSuccess 
          ? 'var(--color-success, #16a34a)' 
          : 'var(--color-danger, #dc2626)'
      }`,
    }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
        {isSuccess
          ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
          : <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
        }
      </svg>
      <span style={{ flex: 1 }}>{message}</span>
      <button 
        onClick={onClose} 
        style={{ 
          background: 'none', 
          border: 'none', 
          cursor: 'pointer', 
          color: 'inherit', 
          fontSize: 14, 
          opacity: 0.7,
          padding: '0 4px',
        }}
      >
        ✕
      </button>
    </div>
  );
}

const EyeOn = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const EyeOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
);

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 16,
  },
  modal: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: '32px 32px 28px',
    position: 'relative',
    borderRadius: 20,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    background: 'var(--color-bg-root)',
    border: '1px solid var(--color-border)',
    borderRadius: '50%',
    width: 30,
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: 14,
    color: 'var(--color-text-secondary)',
    lineHeight: 1,
  },

  // Avatar
  avatarSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarWrapper: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: '50%',
    cursor: 'pointer',
    overflow: 'hidden',
    border: '3px solid var(--color-primary)',
    flexShrink: 0,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 26,
    fontWeight: 800,
  },
  avatarOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    opacity: 0,
    transition: 'opacity 0.2s',
  },
  avatarHint: {
    fontSize: 11,
    color: 'var(--color-primary)',
    marginTop: 8,
    fontWeight: 600,
  },

  // Title
  titleSection: {
    textAlign: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 800,
    color: 'var(--color-text-primary)',
    margin: '0 0 4px 0',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--color-text-secondary)',
    margin: 0,
  },

  // Tabs
  tabsRow: {
    display: 'flex',
    borderBottom: '1px solid var(--color-border)',
    marginBottom: 24,
    gap: 24,
  },
  tabBtn: {
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '10px 0',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  // Tab content
  tabContent: { textAlign: 'left' },
  threeCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 12,
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  formGroup: { marginBottom: 14 },
  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.5px',
    marginBottom: 6,
  },
  req: { color: 'var(--color-danger, #ef4444)' },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },

  // Password
  passwordWrapper: { position: 'relative' },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-text-muted)',
    display: 'flex',
    alignItems: 'center',
    padding: 0,
  },
  requirementsContainer: {
    marginTop: '-8px',
    marginBottom: 16,
    padding: '12px 16px',
    backgroundColor: 'var(--color-bg-card)',
    borderRadius: 8,
    border: '1px solid var(--color-border)',
  },

  // Actions
  actions: {
    display: 'flex',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-secondary)',
    padding: '10px 20px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  saveBtn: {
    background: 'var(--color-primary)',
    border: 'none',
    color: '#fff',
    padding: '10px 24px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
};