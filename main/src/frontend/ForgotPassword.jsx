// frontend/ForgotPassword.jsx
import React, { useState } from 'react';
import weaLogo from '../assets/WEA_logo_bgremoved.png';
import { supabase } from '../lib/supabaseClient';

export default function ForgotPassword({ onBackToLogin, isDark, toggleTheme }) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [noAccount, setNoAccount] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNoAccount(false);

    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    setIsLoading(true);

    try {
      console.log('🔐 Sending password reset email to:', email);

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            email,
            redirectOrigin: window.location.origin   // ← NEW: e.g. "http://localhost:3000"
        }),
        });

        const result = await response.json();

        // Explicit "no account" case from the backend — show a warning
        // instead of the success screen.
        if (result.accountExists === false) {
          console.log('⚠️ No account.');
          setNoAccount(true);
          setIsLoading(false);
          return;
        }

        if (!result.success) {
        throw new Error(result.error || 'Failed to send reset email');
        }
      console.log('✅ Password reset request processed');
      setSuccess(true);
    } catch (err) {
      console.error('❌ Password reset error:', err);
      setError(err.message || 'Failed to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Blobs */}
      <div style={{ ...styles.blob, ...styles.blob1 }}></div>
      <div style={{ ...styles.blob, ...styles.blob2 }}></div>

      {/* Theme Toggle */}
      <div style={styles.themeToggleContainer}>
        <span style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)', marginRight: '6px' }}>
          {isDark ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          )}
        </span>
        <label className="theme-switch" style={styles.switch}>
          <input type="checkbox" checked={isDark} onChange={toggleTheme} style={styles.switchInput} />
          <span className="theme-slider" style={styles.switchSlider}></span>
        </label>
      </div>

      {/* Forgot Password Card */}
      <div className="glass-card" style={styles.card}>
        <div style={styles.logoContainer}>
          <img src={weaLogo} alt="WEA Logo" style={styles.logo} />
        </div>

        {!success ? (
          <>
            <h2 style={styles.title}>Forgot Password?</h2>
            <p style={styles.subtitle}>
              Enter your email address and we'll send you a link to reset your password.
            </p>

            {error && (
              <div style={styles.errorAlert}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8, flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                {error}
              </div>
            )}

            {noAccount && (
              <div style={styles.warningAlert}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 10, flexShrink: 0, marginTop: 2 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <span>
                  No account found <strong style={{ wordBreak: 'break-all' }}></strong>.
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Email Address</label>
                <div style={styles.inputWrapper}>
                  <svg style={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setNoAccount(false); }}
                    placeholder="Enter your email"
                    style={styles.input}
                    required
                    disabled={isLoading}
                    autoFocus
                  />
                </div>
              </div>

              <button type="submit" style={styles.submitBtn} disabled={isLoading}>
                {isLoading ? (
                  <span style={styles.spinnerWrapper}>
                    <span style={styles.spinner}></span>
                    Sending Reset Link...
                  </span>
                ) : (
                  'Send Reset Link'
                )}
              </button>

              <button
                type="button"
                onClick={onBackToLogin}
                style={styles.backBtn}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                Back to Login
              </button>
            </form>
          </>
        ) : (
          <div style={styles.successWrapper}>
            <div style={styles.successIconWrapper}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-success, #16a34a)" strokeWidth="2.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h2 style={styles.title}>Check Your Email</h2>
            <p style={styles.subtitle}>
              If an account exists for <strong style={{ color: 'var(--color-text-primary)' }}>{email}</strong>,
              we've sent a password reset link to it. Please check your inbox (and spam folder).
            </p>

            <button
              type="button"
              onClick={onBackToLogin}
              style={styles.submitBtn}
            >
              Back to Login
            </button>

            <button
              type="button"
              onClick={() => { setSuccess(false); setEmail(''); }}
              style={styles.backBtn}
            >
              Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    width: '100%',
    padding: '20px',
    position: 'relative',
    background: 'var(--color-bg-root)',
    transition: 'background 0.5s ease',
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    borderRadius: '50%',
    filter: 'blur(100px)',
    opacity: 0.15,
    zIndex: 0,
  },
  blob1: {
    width: '400px',
    height: '400px',
    top: '-10%',
    right: '-10%',
    background: 'var(--color-primary)',
  },
  blob2: {
    width: '350px',
    height: '350px',
    bottom: '-10%',
    left: '-10%',
    background: 'var(--color-accent)',
  },
  themeToggleContainer: {
    position: 'absolute',
    top: '24px',
    right: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    zIndex: 10,
    background: 'var(--color-bg-card)',
    padding: '8px 12px',
    borderRadius: '30px',
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--shadow-sm)',
    transition: 'all 0.3s ease',
  },
  switch: {
    position: 'relative',
    display: 'inline-block',
    width: '40px',
    height: '20px',
  },
  switchInput: {
    opacity: 0,
    width: 0,
    height: 0,
  },
  switchSlider: {
    position: 'absolute',
    cursor: 'pointer',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#cbd5e1',
    transition: '.3s',
    borderRadius: '20px',
  },
  card: {
    width: '100%',
    maxWidth: '440px',
    position: 'relative',
    zIndex: 1,
    textAlign: 'center',
    padding: '25px 32px 32px 32px',
    borderRadius: 'var(--radius-lg)',
  },
  logoContainer: {
    marginBottom: '5px',
    display: 'inline-block',
  },
  logo: {
    height: '90px',
    objectFit: 'contain',
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '8px',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    marginBottom: '24px',
    lineHeight: '1.5',
  },
  form: {
    textAlign: 'left',
  },
  errorAlert: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--color-danger-light)',
    color: 'var(--color-danger)',
    border: '1px solid var(--color-danger)',
    padding: '12px',
    borderRadius: 'var(--radius-sm)',
    fontSize: '13px',
    marginBottom: '20px',
    textAlign: 'left',
  },
  warningAlert: {
    display: 'flex',
    alignItems: 'flex-start',
    background: 'rgba(245, 158, 11, 0.1)',
    color: '#f59e0b',
    border: '1px solid #f59e0b',
    padding: '12px',
    borderRadius: 'var(--radius-sm)',
    fontSize: '13px',
    lineHeight: '1.5',
    marginBottom: '20px',
    textAlign: 'left',
  },
  inputGroup: {
    marginBottom: '24px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-text-secondary)',
    marginBottom: '8px',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: '14px',
    color: 'var(--color-text-muted)',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    padding: '12px 14px 12px 42px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '15px',
    outline: 'none',
    transition: 'all 0.3s ease',
  },
  submitBtn: {
    width: '100%',
    padding: '14px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: 'var(--color-primary)',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    padding: '12px',
    marginTop: '12px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  spinnerWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  successWrapper: {
    textAlign: 'center',
  },
  successIconWrapper: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'var(--color-bg-root)',
    border: '2px solid var(--color-success, #16a34a)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
  },
};

// Add keyframe styles
if (typeof document !== 'undefined' && !document.getElementById('forgot-password-keyframes')) {
  const style = document.createElement('style');
  style.id = 'forgot-password-keyframes';
  style.innerHTML = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}