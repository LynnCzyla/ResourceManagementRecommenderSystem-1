import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

const API = 'http://localhost:5000/api/admin';

export default function ProfileSettings({ isOpen, onClose, user, onAvatarUpdate }) {
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
  }, [isOpen]);

    const loadProfile = async () => {
  try {
    // Use user prop directly — no auth call needed
    if (!user?.id) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
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

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setProfileAlert({ type: 'error', message: 'Please select an image file (JPG, PNG, WEBP).' });
      return;
    }
    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setProfileAlert({ type: 'error', message: 'Image must be smaller than 2MB.' });
      return;
    }

    setAvatarFile(file);
    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
    setProfileAlert({ type: '', message: '' });
  };

  const uploadAvatar = async (userId) => {
    if (!avatarFile) return null;

    const fileExt = avatarFile.name.split('.').pop();
    const filePath = `avatars/${userId}/avatar.${fileExt}`;

    // Upload to Supabase Storage bucket "avatars"
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, avatarFile, { upsert: true });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const handleSaveProfile = async () => {
  if (!profileForm.first_name.trim() || !profileForm.last_name.trim()) {
    setProfileAlert({ type: 'error', message: 'First name and last name are required.' });
    return;
  }

  // Use user prop directly — no auth call needed
  if (!user?.id) {
    setProfileAlert({ type: 'error', message: 'Session error. Please re-login.' });
    return;
  }

  setProfileLoading(true);
  setProfileAlert({ type: '', message: '' });

  try {
    // 1. Upload avatar if selected
    let newAvatarUrl = avatarUrl;
    if (avatarFile) {
      newAvatarUrl = await uploadAvatar(user.id);
    }

    // 2. Update profile
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        first_name: profileForm.first_name.trim(),
        middle_name: profileForm.middle_name.trim() || null,
        last_name: profileForm.last_name.trim(),
        contact_number: profileForm.contact_number.trim() || null,
        department_id: profileForm.department_id ? parseInt(profileForm.department_id) : null, // ← parse to int or null
        avatar_url: newAvatarUrl || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (profileError) throw profileError;

    if (newAvatarUrl) {
      setAvatarUrl(newAvatarUrl);
      onAvatarUpdate?.(newAvatarUrl);  // ← notify AdminLayout
    }
    setAvatarFile(null);
    setAvatarPreview(null);
    setProfileAlert({ type: 'success', message: 'Profile updated successfully.' });

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

    if (!passwordForm.newPassword) {
      setPasswordAlert({ type: 'error', message: 'New password is required.' });
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordAlert({ type: 'error', message: 'Password must be at least 8 characters.' });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordAlert({ type: 'error', message: 'New passwords do not match.' });
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
                <select
                  value={profileForm.department_id}
                  onChange={(e) => setProfileForm(f => ({ ...f, department_id: e.target.value }))}
                  style={styles.input}
                >
                  <option value="">— Select department —</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.department_name}</option>
                  ))}
                </select>
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

            {/* Password strength hint */}
            {passwordForm.newPassword && (
              <PasswordStrength password={passwordForm.newPassword} />
            )}

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
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 600,
      marginBottom: 16,
      gap: 8,
      background: isSuccess ? 'var(--color-primary-light)' : '#fee2e2',
      color: isSuccess ? 'var(--color-success)' : '#b91c1c',
      border: `1px solid ${isSuccess ? 'var(--color-primary)' : '#fca5a5'}`,
    }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
        {isSuccess
          ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
          : <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
        }
      </svg>
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14, opacity: 0.7 }}>✕</button>
    </div>
  );
}

function PasswordStrength({ password }) {
  const checks = [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'Uppercase letter (A-Z)', pass: /[A-Z]/.test(password) },
    { label: 'Lowercase letter (a-z)', pass: /[a-z]/.test(password) },
    { label: 'Number (0-9)', pass: /[0-9]/.test(password) },
    { label: 'Special character (!@#$...)', pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const passed = checks.filter(c => c.pass).length;
  const strength = passed <= 2 ? 'Weak' : passed <= 3 ? 'Fair' : passed <= 4 ? 'Good' : 'Strong';
  const strengthColor = passed <= 2 ? '#ef4444' : passed <= 3 ? '#f59e0b' : passed <= 4 ? '#0ea5e9' : '#10b981';

  return (
    <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, background: 'var(--color-bg-root)', border: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Password Strength</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: strengthColor }}>{strength}</span>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= passed ? strengthColor : 'var(--color-border)', transition: 'background-color 0.2s' }} />
        ))}
      </div>
      {checks.map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.pass ? 'var(--color-success)' : 'var(--color-text-muted)', marginBottom: 3 }}>
          <span style={{ fontSize: 13 }}>{c.pass ? '✓' : '○'}</span>
          {c.label}
        </div>
      ))}
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
    // CSS hover handled via className or inline — we use a workaround below
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