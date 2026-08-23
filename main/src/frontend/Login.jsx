// src/frontend/Login.jsx
import React, { useState, useEffect } from 'react';
import weaLogo from '../assets/WEA_logo_bgremoved.png';
import { supabase, getSession } from '../lib/supabaseClient';
import ForgotPassword from './ForgotPassword';
import ContactAdmin from './ContactAdmin';

export default function Login({ onLogin, isDark, toggleTheme, onApplicantPortal }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [view, setView] = useState('login');
  const [showContactModal, setShowContactModal] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState(30);
  const [timeoutLoaded, setTimeoutLoaded] = useState(true);
  
  // Login attempts states
  const [isLocked, setIsLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState('');

  // Check existing session on load
  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const token = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');
        const loginTime = localStorage.getItem('loginTime');
        
        console.log('🔍 Checking session on login page');
        console.log('📦 Token exists:', !!token);
        console.log('📦 User exists:', !!storedUser);
        console.log('📦 Login time:', loginTime);
        
        // If no token or user, show login page
        if (!token || !storedUser) {
          console.log('ℹ️ No stored session found');
          setCheckingAuth(false);
          return;
        }
        
        // Check if session has expired - only if we have the timeout loaded
        if (loginTime && timeoutLoaded && sessionTimeout !== null) {
          const elapsedMinutes = (Date.now() - parseInt(loginTime)) / (1000 * 60);
          console.log(`⏰ Elapsed since login: ${elapsedMinutes.toFixed(1)} minutes`);
          console.log(`⏰ Session timeout: ${sessionTimeout} minutes`);
          
          if (elapsedMinutes >= sessionTimeout) {
            console.log(`⏰ Session expired (${elapsedMinutes.toFixed(0)} minutes)`);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('loginTime');
            setCheckingAuth(false);
            return;
          }
        }
        
        // Verify session with Supabase
        console.log('🔍 Verifying session with Supabase...');
        const session = await getSession();
        if (session) {
          console.log('✅ Valid session found, restoring user');
          const userData = JSON.parse(storedUser);
          window.history.replaceState(null, '', '/dashboard');
          onLogin(userData);
          return;
        } else {
          console.log('⚠️ No valid session from Supabase');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('loginTime');
          setCheckingAuth(false);
        }
      } catch (error) {
        console.error('Error checking session:', error);
        setCheckingAuth(false);
      }
    };

    checkExistingSession();
  }, [onLogin, sessionTimeout, timeoutLoaded]);

  // Prevent back button on login page
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    
    const handlePopState = (event) => {
      const token = localStorage.getItem('token');
      const user = localStorage.getItem('user');
      
      if (token && user) {
        window.history.pushState(null, '', window.location.href);
        window.location.href = '/dashboard';
      } else {
        window.history.back();
      }
    };
    
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Show forgot password view
  if (view === 'forgot-password') {
    return (
      <>
        <ForgotPassword
          onBackToLogin={() => setView('login')}
          isDark={isDark}
          toggleTheme={toggleTheme}
        />
      </>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    setIsLocked(false);
    setLockMessage('');

    try {
      // Hardcoded Super Admin credentials for frontend testing
      if (email === 'superadmin@wea.com' && password === 'superadmin123') {
        const superAdminUser = {
          id: 'super-admin-001',
          name: 'Super Administrator',
          email: 'superadmin@wea.com',
          role: 'Super Admin',
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=100',
        };
        
        const loginTime = Date.now();
        localStorage.setItem('user', JSON.stringify(superAdminUser));
        localStorage.setItem('token', 'super-admin-token-' + Date.now());
        localStorage.setItem('loginTime', loginTime.toString());
        
        window.history.replaceState(null, '', '/dashboard');
        onLogin(superAdminUser);
        setIsLoading(false);
        return;
      }

      // Hardcoded HR credentials for frontend testing
      if (email === 'hr@wea.com' && password === 'hr123') {
        const hrUser = {
          id: 'hr-user-001',
          name: 'HR Administrator',
          email: 'hr@wea.com',
          role: 'HR',
          avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=100',
        };
        
        const loginTime = Date.now();
        localStorage.setItem('user', JSON.stringify(hrUser));
        localStorage.setItem('token', 'hr-token-' + Date.now());
        localStorage.setItem('loginTime', loginTime.toString());
        
        window.history.replaceState(null, '', '/dashboard');
        onLogin(hrUser);
        setIsLoading(false);
        return;
      }

      // Call backend API for login with attempts tracking
      const response = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        data = { success: false, message: 'Invalid response from server' };
      }

      if (response.ok && data.success) {
        // Login successful
        const { user, session, token } = data;

        const loginTime = Date.now();
        localStorage.setItem('user', JSON.stringify(user));

        // 👇 USE THE CUSTOM TOKEN FROM YOUR BACKEND
        if (token) {
          localStorage.setItem('token', token);  // ← Use the custom token
        } else if (session?.access_token) {
          // Fallback to Supabase token if custom token isn't available
          localStorage.setItem('token', session.access_token);
        }

        localStorage.setItem('loginTime', loginTime.toString());

        // Keep Supabase session for other features
        if (session?.access_token && session?.refresh_token) {
          await supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token
          });
        }

        window.history.replaceState(null, '', '/dashboard');
        onLogin(user);
      } else {
        // Handle errors
        if (data.locked) {
          setIsLocked(true);
          setLockMessage(data.message || 'Account locked. Please contact an administrator.');
          setError(data.message || 'Account locked. Please contact an administrator.');
        } else {
          setError(data.message || 'Invalid credentials');
        }
      }
    } catch (error) {
      setError('Cannot reach the admin server right now. Please start the backend and try again.');
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

      {/* Login Card */}
      <div className="glass-card" style={styles.card}>
        <div style={styles.logoContainer}>
          <img src={weaLogo} alt="WEA Logo" style={styles.logo} />
        </div>

        <h2 style={styles.title}>Resource Management Recommender System</h2>
        <p style={styles.subtitle}>Admin Portal</p>

        {error && (
          <div style={styles.errorAlert}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            {error}
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
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                style={styles.input}
                required
                disabled={isLoading || isLocked}
              />
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <div style={styles.inputWrapper}>
              <svg style={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                style={styles.input}
                required
                disabled={isLoading || isLocked}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
                disabled={isLocked}
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

          <div style={styles.optionsRow}>
            <a
              href="#"
              style={{ color: 'var(--color-primary)', textDecoration: 'underline', fontWeight: '600', fontSize: '13px' }}
              onClick={(e) => {
                e.preventDefault();
                setError('');
                setView('forgot-password');
              }}
            >
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            style={{
              ...styles.submitBtn,
              opacity: isLocked ? 0.5 : 1,
              cursor: isLocked ? 'not-allowed' : 'pointer'
            }}
            disabled={isLoading || isLocked}
          >
            {isLoading ? (
              <span style={styles.spinnerWrapper}>
                <span style={styles.spinner}></span>
                Verifying Credentials...
              </span>
            ) : isLocked ? (
              'Account Locked'
            ) : (
              'Login'
            )}
          </button>
          <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Don't have an account?{' '}
            <a
              href="#"
              style={{ color: 'var(--color-primary)', textDecoration: 'underline', fontWeight: '600' }}
              onClick={(e) => {
                e.preventDefault();
                setShowContactModal(true);
              }}
            >
              Contact Administrator
            </a>
          </div>

          <div style={{ marginTop: '12px', textAlign: 'center', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Looking for job opportunities?{' '}
            <a
              href="#"
              style={{ color: 'var(--color-accent)', textDecoration: 'underline', fontWeight: '600' }}
              onClick={(e) => {
                e.preventDefault();
                onApplicantPortal();
              }}
            >
              Go to Applicant Portal
            </a>
          </div>

          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px dashed var(--color-border)', textAlign: 'center' }}>
            <a
              href="https://wea-asia.com/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 16px',
                borderRadius: '20px',
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                textDecoration: 'none',
                fontSize: '12px',
                fontWeight: '600',
                letterSpacing: '0.3px',
                transition: 'all 0.3s ease',
                border: '1px solid rgba(16, 185, 129, 0.2)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)';
                e.currentTarget.style.transform = 'translateY(-1px)';
                const arrow = e.currentTarget.querySelector('.wea-arrow');
                if (arrow) arrow.style.transform = 'translateX(3px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--color-primary-light)';
                e.currentTarget.style.transform = 'translateY(0)';
                const arrow = e.currentTarget.querySelector('.wea-arrow');
                if (arrow) arrow.style.transform = 'translateX(0)';
              }}
            >
              Visit Wholesale Electric Asia (WEA) Website
              <svg
                className="wea-arrow"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginLeft: '6px', transition: 'transform 0.2s ease' }}
              >
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </a>
          </div>
        </form>
      </div>

      {/* Contact Administrator modal */}
      <ContactAdmin
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
      />
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
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '4px',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    marginBottom: '24px',
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
    padding: '12px 14px 12px 42px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '15px',
    outline: 'none',
    transition: 'all 0.3s ease',
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
  optionsRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    fontSize: '13px',
    marginBottom: '24px',
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
};

// Add keyframe styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}