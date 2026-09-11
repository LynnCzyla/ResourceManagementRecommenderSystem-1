import React, { useState, useEffect } from 'react';
import weaLogo from '../../assets/WEA_logo_bgremoved.png';
import ApplicantJobPostingsTab from './ApplicantJobPostingsTab';

export default function ApplicantLayout({ user, onLogout, isDark, toggleTheme }) {
  const [showMyApplications, setShowMyApplications] = useState(false);

  return (
    <div style={styles.container}>
      {/* Header */}
      <header className="applicant-header" style={styles.header}>
        <div className="applicant-header-left" style={styles.headerLeft}>
          <img src={weaLogo} alt="WEA Logo" style={styles.logo} />
          <div style={styles.headerTitle}>
            <h1 style={styles.title}>WEA Careers</h1>
            <p style={styles.subtitle}>Find your next opportunity</p>
          </div>
        </div>
        <div className="applicant-header-right" style={styles.headerRight}>
          <button
            onClick={() => setShowMyApplications(!showMyApplications)}
            style={{
              ...styles.navButton,
              backgroundColor: showMyApplications ? 'var(--color-primary)' : 'transparent',
              color: showMyApplications ? 'white' : 'var(--color-text-primary)'
            }}
          >
            {showMyApplications ? '← Back to Jobs' : 'My Applications'}
          </button>
          <div style={styles.themeToggle}>
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
        </div>
      </header>

      {/* Main Content */}
      <main className="applicant-main-container" style={styles.main}>
        <ApplicantJobPostingsTab showMyApplications={showMyApplications} />
      </main>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: 'var(--color-bg-root)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    backgroundColor: 'var(--color-bg-sidebar)',
    borderBottom: '1px solid var(--color-border)',
    padding: '16px 32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: 'var(--shadow-sm)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  logo: {
    height: '48px',
    width: 'auto',
  },
  headerTitle: {
    display: 'flex',
    flexDirection: 'column',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    margin: 0,
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    margin: 0,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  navButton: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'transparent',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  logoutButton: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: '1px solid var(--color-danger)',
    backgroundColor: 'transparent',
    color: 'var(--color-danger)',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  themeToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'var(--color-bg-card-hover)',
    padding: '6px 12px',
    borderRadius: '20px',
    border: '1px solid var(--color-border)',
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
    backgroundColor: 'var(--color-text-muted)',
    transition: '0.3s',
    borderRadius: '20px',
  },
  main: {
    flex: 1,
    padding: '32px',
    maxWidth: '1400px',
    margin: '0 auto',
    width: '100%',
  },
};
