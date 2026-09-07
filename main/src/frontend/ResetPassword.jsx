// frontend/ResetPassword.jsx
import React, { useState, useEffect } from 'react';
import weaLogo from '../assets/WEA_logo_bgremoved.png';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function ResetPassword({ onBackToLogin, isDark, toggleTheme }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
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

  const navigate = useNavigate();

  // Fetch password requirements from database
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
          min_password_length: 6,
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

  // Validate password in real-time
  useEffect(() => {
    if (!passwordRequirements || !password) {
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
  }, [password, passwordRequirements]);

  // Wait for recovery session to be established from URL token
  useEffect(() => {
    const checkSession = async () => {
      try {
        // Check if there's an error in the URL - if so, redirect to login
        const hash = window.location.hash;
        if (hash) {
          const params = new URLSearchParams(hash.substring(1));
          const error = params.get('error');
          const errorCode = params.get('error_code');
          const errorDescription = params.get('error_description');
          
          // Check for expired or invalid token errors
          if (error === 'access_denied' || 
              errorCode === 'otp_expired' || 
              errorCode === 'invalid_grant' ||
              (errorDescription && (
                errorDescription.toLowerCase().includes('expired') ||
                errorDescription.toLowerCase().includes('invalid')
              ))) {
            console.log('🔴 Expired or invalid reset link detected - redirecting to login');
            // Redirect to login where the modal will be shown
            navigate('/login');
            return;
          }
        }

        // Also check URL search params
        const searchParams = new URLSearchParams(window.location.search);
        const errorParam = searchParams.get('error');
        const errorCodeParam = searchParams.get('error_code');
        const errorDescParam = searchParams.get('error_description');

        if (errorParam === 'access_denied' || 
            errorCodeParam === 'otp_expired' || 
            errorCodeParam === 'invalid_grant' ||
            (errorDescParam && (
              errorDescParam.toLowerCase().includes('expired') ||
              errorDescParam.toLowerCase().includes('invalid')
            ))) {
          console.log('🔴 Expired link detected in search params - redirecting to login');
          navigate('/login');
          return;
        }

        // Give Supabase time to parse the recovery token from URL
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (session) {
          console.log('✅ Recovery session established');
          setSessionReady(true);
        } else {
          console.error('❌ No recovery session found - redirecting to login');
          // Redirect to login where the modal will be shown
          navigate('/login');
        }
      } catch (err) {
        console.error('Error checking session:', err);
        navigate('/login');
      }
    };

    checkSession();
  }, [navigate]);

  // Sign out the recovery session THEN go to login
  const handleCancel = async () => {
    setIsCancelling(true);
    await supabase.auth.signOut();
    onBackToLogin();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate all requirements before submission
    if (passwordRequirements) {
      const isPasswordValid = Object.values(requirements).every(req => req === true);
      
      if (!isPasswordValid) {
        setError('Password does not meet all requirements.');
        return;
      }
    } else if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!sessionReady) {
      setError('Recovery session not established. Please request a new password reset link.');
      return;
    }

    setIsLoading(true);

    try {
      console.log('🔐 Updating password...');

      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) {
        // Check if error is about expired token
        if (updateError.message?.toLowerCase().includes('expired') || 
            updateError.status === 400 || 
            updateError.code === 'invalid_grant' ||
            updateError.message?.toLowerCase().includes('invalid') ||
            updateError.message?.toLowerCase().includes('token')) {
          // Redirect to login where the modal will be shown
          navigate('/login');
          return;
        }
        throw new Error(updateError.message);
      }

      console.log('✅ Password updated successfully');

      await supabase.auth.signOut();

      setSuccess(true);
    } catch (err) {
      console.error('❌ Reset password error:', err);
      const errorMessage = err.message || 'Failed to reset password. Please try again.';
      
      // Check for expired-related errors in the caught error
      if (errorMessage.toLowerCase().includes('expired') || 
          errorMessage.toLowerCase().includes('invalid') ||
          errorMessage.toLowerCase().includes('token')) {
        // Redirect to login where the modal will be shown
        navigate('/login');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Render requirement item with checkmark
  const renderRequirement = (label, isMet) => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '4px 0',
      color: isMet ? 'var(--color-success, #16a34a)' : 'var(--color-text-muted)',
      fontSize: '13px',
      transition: 'color 0.3s ease',
    }}>
      <span style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        border: `2px solid ${isMet ? 'var(--color-success, #16a34a)' : 'var(--color-border)'}`,
        backgroundColor: isMet ? 'var(--color-success, #16a34a)' : 'transparent',
        color: isMet ? 'white' : 'transparent',
        transition: 'all 0.3s ease',
        fontSize: '11px',
        flexShrink: 0,
      }}>
        {isMet && '✓'}
      </span>
      {label}
    </div>
  );

  // Build requirement labels based on database settings
  const getRequirementLabels = () => {
    if (!passwordRequirements) return [];

    const labels = [];
    
    // Minimum length
    labels.push({
      label: `At least ${passwordRequirements.min_password_length} characters`,
      met: requirements.minLength
    });

    // Uppercase requirements
    if (passwordRequirements.require_uppercase) {
      labels.push({
        label: `At least ${passwordRequirements.min_uppercase} uppercase letter${passwordRequirements.min_uppercase > 1 ? 's' : ''}`,
        met: requirements.minUppercase
      });
    }

    // Lowercase requirements
    if (passwordRequirements.require_lowercase) {
      labels.push({
        label: `At least ${passwordRequirements.min_lowercase} lowercase letter${passwordRequirements.min_lowercase > 1 ? 's' : ''}`,
        met: requirements.minLowercase
      });
    }

    // Number requirements
    if (passwordRequirements.require_number) {
      labels.push({
        label: `At least ${passwordRequirements.min_number} number${passwordRequirements.min_number > 1 ? 's' : ''}`,
        met: requirements.minNumber
      });
    }

    // Special character requirements
    if (passwordRequirements.require_special) {
      labels.push({
        label: `At least ${passwordRequirements.min_special} special character${passwordRequirements.min_special > 1 ? 's' : ''}`,
        met: requirements.minSpecial
      });
    }

    return labels;
  };

  return (
    <div style={styles.container}>
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

      {/* Reset Password Card */}
      <div className="glass-card" style={styles.card}>
        <div style={styles.logoContainer}>
          <img src={weaLogo} alt="WEA Logo" style={styles.logo} />
        </div>

        {!success ? (
          <>
            <h2 style={styles.title}>Set New Password</h2>
            <p style={styles.subtitle}>
              Please enter a new password for your account.
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

            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>New Password</label>
                <div style={styles.inputWrapper}>
                  <svg style={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter new password"
                    style={styles.input}
                    required
                    disabled={isLoading}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Password Requirements */}
              {password && passwordRequirements && (
                <div style={styles.requirementsContainer}>
                  {getRequirementLabels().map((req, index) => (
                    <div key={index}>
                      {renderRequirement(req.label, req.met)}
                    </div>
                  ))}
                </div>
              )}

              <div style={styles.inputGroup}>
                <label style={styles.label}>Confirm New Password</label>
                <div style={styles.inputWrapper}>
                  <svg style={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    style={styles.input}
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={styles.eyeBtn}
                  >
                    {showConfirmPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button type="submit" style={styles.submitBtn} disabled={isLoading || isCancelling || !sessionReady}>
                {isLoading ? (
                  <span style={styles.spinnerWrapper}>
                    <span style={styles.spinner}></span>
                    Updating Password...
                  </span>
                ) : !sessionReady ? (
                  'Validating Reset Link...'
                ) : (
                  'Update Password'
                )}
              </button>

              <button
                type="button"
                onClick={handleCancel}
                disabled={isLoading || isCancelling}
                style={styles.backBtn}
              >
                {isCancelling ? (
                  <span style={styles.spinnerWrapper}>
                    <span style={{ ...styles.spinner, borderTopColor: 'var(--color-text-secondary)', border: '2px solid rgba(0,0,0,0.1)', borderTopColor: 'var(--color-text-secondary)' }}></span>
                    Cancelling...
                  </span>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
                      <line x1="19" y1="12" x2="5" y2="12"></line>
                      <polyline points="12 19 5 12 12 5"></polyline>
                    </svg>
                    Cancel
                  </>
                )}
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
            <h2 style={styles.title}>Password Updated!</h2>
            <p style={styles.subtitle}>
              Your password has been changed successfully. Please log in with your new password.
            </p>
            <button type="button" onClick={onBackToLogin} style={styles.submitBtn}>
              Go to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── STYLES ────────────────────────────────────────────────────────────────────
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
  inputGroup: {
    marginBottom: '20px',
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
    padding: '12px 42px 12px 42px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '15px',
    outline: 'none',
    transition: 'all 0.3s ease',
    boxSizing: 'border-box',
  },
  eyeBtn: {
    position: 'absolute',
    right: '12px',
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    padding: '4px',
  },
  requirementsContainer: {
    marginTop: '-10px',
    marginBottom: '20px',
    padding: '12px 16px',
    backgroundColor: 'var(--color-bg-card)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
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

// Keyframes
if (typeof document !== 'undefined' && !document.getElementById('reset-password-keyframes')) {
  const style = document.createElement('style');
  style.id = 'reset-password-keyframes';
  style.innerHTML = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}