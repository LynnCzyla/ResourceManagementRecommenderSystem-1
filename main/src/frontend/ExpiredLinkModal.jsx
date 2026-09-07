// frontend/ExpiredLinkModal.jsx
import React from 'react';

export default function ExpiredLinkModal({ onClose, onRequestNewLink, isDark }) {
  return (
    <div 
      style={styles.overlay} 
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={styles.modal}>
        {/* Close button */}
        <button onClick={onClose} style={styles.closeBtn}>✕</button>

        {/* Icon */}
        <div style={styles.iconWrapper}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        {/* Title */}
        <h2 style={styles.title}>Reset Link Expired</h2>

        {/* Description */}
        <p style={styles.description}>
          The password reset link you used has expired. Please request a new one to reset your password.
        </p>

        {/* Actions */}
        <div style={styles.actions}>
          <button onClick={onClose} style={styles.primaryBtn}>
            Go to Login
          </button>
          <button onClick={onRequestNewLink} style={styles.secondaryBtn}>
            Request New Link
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
    padding: '20px',
    backdropFilter: 'blur(4px)',
  },
  modal: {
    backgroundColor: 'var(--color-bg-card, #1e293b)',
    borderRadius: '20px',
    maxWidth: '420px',
    width: '100%',
    padding: '32px 28px',
    textAlign: 'center',
    border: '1px solid var(--color-border, #334155)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    position: 'relative',
    animation: 'modalIn 0.3s ease',
  },
  closeBtn: {
    position: 'absolute',
    top: '12px',
    right: '16px',
    background: 'transparent',
    border: 'none',
    fontSize: '20px',
    color: 'var(--color-text-secondary, #94a3b8)',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '6px',
    transition: 'background 0.2s',
  },
  iconWrapper: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--color-text-primary, #f8fafc)',
    margin: '0 0 8px 0',
  },
  description: {
    fontSize: '14px',
    color: 'var(--color-text-secondary, #94a3b8)',
    lineHeight: '1.6',
    margin: '0 0 24px 0',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  primaryBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: 'var(--color-primary, #3b82f6)',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  secondaryBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid var(--color-border, #334155)',
    background: 'transparent',
    color: 'var(--color-text-primary, #f8fafc)',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
};

// Add keyframes
if (typeof document !== 'undefined') {
  if (!document.getElementById('expired-modal-keyframes')) {
    const style = document.createElement('style');
    style.id = 'expired-modal-keyframes';
    style.innerHTML = `
      @keyframes modalIn { 
        from { 
          opacity: 0; 
          transform: scale(0.95) translateY(-10px); 
        } 
        to { 
          opacity: 1; 
          transform: scale(1) translateY(0); 
        } 
      }
    `;
    document.head.appendChild(style);
  }
}