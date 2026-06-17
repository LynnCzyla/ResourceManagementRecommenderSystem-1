import React, { useState } from 'react';
import weaLogo from '../assets/WEA_logo_bgremoved.png';

export default function Login({ onLogin, isDark, toggleTheme }) {
  const [email, setEmail] = useState('admin@wea.com');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    if (email === 'admin@wea.com' && password === 'admin123') {
      setIsLoading(true);
      // Simulate API verification call
      setTimeout(() => {
        setIsLoading(false);
        onLogin({
          name: 'Rodolfo Mirabel Jr.',
          role: 'System Administrator',
          email: 'admin@wea.com',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100'
        });
      }, 1200);
    } else {
      setError('Invalid credentials. Hint: use admin@wea.com / admin123');
    }
  };

  const fillMockCredentials = () => {
    setEmail('admin@wea.com');
    setPassword('admin123');
    setError('');
  };

  return (
    <div style={styles.container}>
      {/* Background elements for depth */}
      <div style={{...styles.blob, ...styles.blob1}}></div>
      <div style={{...styles.blob, ...styles.blob2}}></div>

      {/* Floating Theme Switch Container */}
      <div style={styles.themeToggleContainer}>
        <span style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)', marginRight: '6px' }}>
          {isDark ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ display: 'block' }} title="Dark Mode">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ display: 'block' }} title="Light Mode">
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
          <input
            type="checkbox"
            checked={isDark}
            onChange={toggleTheme}
            style={styles.switchInput}
          />
          <span className="theme-slider" style={styles.switchSlider}></span>
        </label>
      </div>

      <div className="glass-card" style={styles.card}>
        <div style={styles.logoContainer}>
          <img src={weaLogo} alt="WEA Logo" style={styles.logo} />
        </div>

        <h2 style={styles.title}>Resource Management</h2>
        <p style={styles.subtitle}>Recommender System Admin Portal</p>

        {error && (
          <div style={styles.errorAlert}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: 8}}>
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
                placeholder="admin@wea.com"
                style={styles.input}
                required
                disabled={isLoading}
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
                placeholder="••••••••"
                style={styles.input}
                required
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
                title={showPassword ? 'Hide password' : 'Show password'}
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
            <label style={styles.rememberLabel}>
              <input type="checkbox" style={styles.checkbox} defaultChecked />
              Keep me logged in
            </label>
            <span onClick={fillMockCredentials} style={styles.demoFill}>
              Fill Demo Login
            </span>
          </div>

          <button
            type="submit"
            style={styles.submitBtn}
            className="glow-primary"
            disabled={isLoading}
          >
            {isLoading ? (
              <span style={styles.spinnerWrapper}>
                <span style={styles.spinner}></span>
                Verifying Credentials...
              </span>
            ) : (
              'Login'
            )}
          </button>
        </form>

        <div style={styles.footer}>
          <p>© {new Date().getFullYear()} WEA Industrial Distribution. All rights reserved.</p>
          <p style={{marginTop: 4, fontSize: '10px', color: 'var(--color-text-muted)'}}>
            System Security: ISO/IEC 25010 Evaluated | AY 2026-2027
          </p>
        </div>
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
    width: '44px',
    height: '24px',
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
    borderRadius: '24px',
  },
  card: {
    width: '100%',
    maxWidth: '440px',
    position: 'relative',
    zIndex: 1,
    textAlign: 'center',
    padding: '40px 32px 32px 32px',
    borderRadius: 'var(--radius-lg)',
  },
  logoContainer: {
    marginBottom: '20px',
    display: 'inline-block',
  },
  logo: {
    height: '60px',
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
    '&:focus': {
      borderColor: 'var(--color-primary)',
      boxShadow: '0 0 0 3px var(--color-primary-light)',
    }
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
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '13px',
    marginBottom: '24px',
  },
  rememberLabel: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
  },
  checkbox: {
    marginRight: '8px',
    accentColor: 'var(--color-primary)',
  },
  demoFill: {
    color: 'var(--color-primary)',
    cursor: 'pointer',
    fontWeight: '600',
    transition: 'color 0.2s',
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
  footer: {
    marginTop: '32px',
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  }
};

// Add standard keyframe spin styles for inline spinner
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}
