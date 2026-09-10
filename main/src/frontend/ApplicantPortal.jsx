import React, { useState, useEffect } from 'react';
import weaLogo from '../assets/WEA_logo_bgremoved.png';
import ApplicantLayout from './Applicant/ApplicantLayout';

export default function ApplicantPortal({ isDark, toggleTheme }) {
  // ✅ Check if we should show the landing page or the portal
  const [showPortal, setShowPortal] = useState(() => {
    // Only auto-skip to the full portal when we're actually on the
    // dedicated /applicant-portal route (i.e. the tab opened via
    // "Enter Applicant Portal"). The landing page rendered from the
    // Login screen should always show the intro + button, even if a
    // previous visit in this tab already set the "entered" flag.
    const onPortalRoute = window.location.pathname === '/applicant-portal';
    const hasEntered = sessionStorage.getItem('applicant_portal_entered') === 'true';
    const params = new URLSearchParams(window.location.search);
    const hasEnterParam = params.get('enter') === 'true';

    return !(onPortalRoute && (hasEntered || hasEnterParam));
  });

  const handleEnterPortal = () => {
    // ✅ Store flag in sessionStorage so it persists across refreshes
    sessionStorage.setItem('applicant_portal_entered', 'true');
    // Open in a new tab
    window.open('/applicant-portal?enter=true', '_blank');
  };

  const handleBackToLanding = () => {
    // Clear the flag when exiting
    sessionStorage.removeItem('applicant_portal_entered');
    // Close the tab or go back
    if (window.opener) {
      window.close();
    } else {
      window.location.href = '/';
    }
  };

  // Check URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('enter') === 'true') {
      // Store in sessionStorage so it persists after refresh
      sessionStorage.setItem('applicant_portal_entered', 'true');
      setShowPortal(false);
      // Clean up the URL but keep the flag in sessionStorage
      window.history.replaceState(null, '', '/applicant-portal');
    }
  }, []);

  // If in the portal view, show the ApplicantLayout
  if (!showPortal) {
    return (
      <ApplicantLayout 
        user={{ name: 'Guest Applicant', role: 'Applicant', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100' }}
        onLogout={handleBackToLanding}
        isDark={isDark}
        toggleTheme={toggleTheme}
      />
    );
  }

  // Show the landing page
  return (
    <div style={styles.container}>
      <div style={{ ...styles.blob, ...styles.blob1 }}></div>
      <div style={{ ...styles.blob, ...styles.blob2 }}></div>

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

      <div className="glass-card" style={styles.card}>
        <div style={styles.logoContainer}>
          <img src={weaLogo} alt="WEA Logo" style={styles.logo} />
        </div>

        <h2 style={styles.title}>Resource Management Recommender System</h2>
        <p style={styles.subtitle}>Applicant Portal</p>

        <div style={styles.infoSection}>
          <h3 style={styles.infoTitle}>Welcome to Our Career Portal</h3>
          <p style={styles.infoText}>
            Browse available job opportunities and submit your application to join our team. 
            Our AI-powered recommendation system will help match your skills with the right positions.
          </p>
        </div>

        <div style={styles.features}>
          <div style={styles.feature}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" style={styles.featureIcon}>
              <rect x="2" y="7" width="20" height="14" rx="2"></rect>
              <path d="M16 7V5a2 2 0 0 0-4 0v2"></path>
            </svg>
            <h4 style={styles.featureTitle}>Browse Job Postings</h4>
            <p style={styles.featureText}>View all available positions across departments</p>
          </div>
          <div style={styles.feature}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" style={styles.featureIcon}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            <h4 style={styles.featureTitle}>Easy Application</h4>
            <p style={styles.featureText}>Submit applications with your resume and cover letter</p>
          </div>
          <div style={styles.feature}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" style={styles.featureIcon}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <h4 style={styles.featureTitle}>AI-Powered Matching</h4>
            <p style={styles.featureText}>Our system matches your skills to suitable roles</p>
          </div>
        </div>

        <button onClick={handleEnterPortal} style={styles.enterBtn}>
          Enter Applicant Portal
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: '8px' }}>
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>

        <div style={styles.footer}>
          <a href="/" style={styles.backLink}>← Back to Login</a>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    background: 'var(--color-bg-root)',
    position: 'relative',
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    borderRadius: '50%',
    filter: 'blur(80px)',
    opacity: 0.3,
    zIndex: 0,
  },
  blob1: {
    width: '400px',
    height: '400px',
    background: 'var(--color-primary)',
    top: '-100px',
    right: '-100px',
  },
  blob2: {
    width: '300px',
    height: '300px',
    background: 'var(--color-accent)',
    bottom: '-50px',
    left: '-50px',
  },
  themeToggleContainer: {
    position: 'absolute',
    top: '20px',
    right: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'var(--color-bg-card-hover)',
    padding: '6px 12px',
    borderRadius: '20px',
    border: '1px solid var(--color-border)',
    zIndex: 10,
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
  card: {
    width: '100%',
    maxWidth: '500px',
    padding: '40px',
    zIndex: 1,
  },
  logoContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '24px',
  },
  logo: {
    height: '80px',
    objectFit: 'contain',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    textAlign: 'center',
    marginBottom: '8px',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    marginBottom: '32px',
  },
  infoSection: {
    marginBottom: '32px',
    padding: '20px',
    backgroundColor: 'var(--color-bg-root)',
    borderRadius: '12px',
    border: '1px solid var(--color-border)',
  },
  infoTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    marginBottom: '8px',
  },
  infoText: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.6',
    margin: 0,
  },
  features: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
    marginBottom: '32px',
  },
  feature: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '8px',
  },
  featureIcon: {
    marginBottom: '4px',
  },
  featureTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  featureText: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    margin: 0,
    lineHeight: '1.4',
  },
  enterBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '14px 24px',
    backgroundColor: 'var(--color-primary)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: '16px',
  },
  footer: {
    textAlign: 'center',
  },
  backLink: {
    color: 'var(--color-text-secondary)',
    textDecoration: 'none',
    fontSize: '14px',
    cursor: 'pointer',
  },
};