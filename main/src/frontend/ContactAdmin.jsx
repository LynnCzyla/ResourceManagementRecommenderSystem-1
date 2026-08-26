// frontend/ContactAdmin.jsx - Updated with branch selection

import React, { useState, useEffect } from 'react';

export default function ContactAdmin({ isOpen, onClose }) {
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [purpose, setPurpose] = useState('');
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [branchId, setBranchId] = useState(''); // ✅ NEW
  const [branches, setBranches] = useState([]); // ✅ NEW
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // ✅ Fetch branches on mount
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/admin/branches');
        const result = await response.json();
        if (result.success) {
          setBranches(result.data || []);
          // Set default branch if there's only one
          if (result.data && result.data.length === 1) {
            setBranchId(result.data[0].id);
          }
        }
      } catch (err) {
        console.error('Error fetching branches:', err);
      }
    };
    fetchBranches();
  }, []);

  // Reset state whenever the modal is opened fresh
  useEffect(() => {
    if (isOpen) {
      setFirstName('');
      setMiddleName('');
      setLastName('');
      setEmail('');
      setPurpose('');
      setMessage('');
      setPhone('');
      setBranchId('');
      setError('');
      setSuccess(false);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!firstName || !lastName || !email || !purpose || !message) {
      setError('Please fill in all required fields.');
      return;
    }

    if (!branchId) {
      setError('Please select a branch.');
      return;
    }

    setIsLoading(true);

    try {
      console.log('📩 Sending contact admin request:', { firstName, middleName, lastName, email, purpose, phone, branchId });

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/admin/contact-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          firstName, 
          middleName, 
          lastName, 
          email, 
          purpose, 
          message, 
          phone,
          branchId // ✅ NEW
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to send message');
      }

      console.log('✅ Message sent to admin');
      setSuccess(true);
    } catch (err) {
      console.error('❌ Contact admin error:', err);
      setError(err.message || 'Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div className="glass-card" style={styles.modal}>
        <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        {!success ? (
          <>
            <div style={styles.iconWrapper}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>

            <h2 style={styles.title}>Contact Administrator</h2>
            <p style={styles.subtitle}>
              Need an account or having trouble logging in? Send a message and an administrator will get back to you.
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
              <div style={styles.row}>
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.label}>First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Juan"
                    style={styles.input}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.label}>Middle Name <span style={{ color: 'var(--color-text-muted)', fontWeight: '400' }}>(Optional)</span></label>
                  <input
                    type="text"
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                    placeholder="Santos"
                    style={styles.input}
                    disabled={isLoading}
                  />
                </div>
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.label}>Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Dela Cruz"
                    style={styles.input}
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={styles.input}
                  required
                  disabled={isLoading}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Purpose of Request</label>
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Request for account access"
                  style={styles.input}
                  required
                  disabled={isLoading}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Phone Number <span style={{ color: 'var(--color-text-muted)', fontWeight: '400' }}>(Optional)</span></label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+63 912 345 6789"
                  style={styles.input}
                  disabled={isLoading}
                />
              </div>

              {/* ✅ NEW: Branch Selection */}
              <div style={styles.inputGroup}>
                <label style={styles.label}>Branch</label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  style={styles.select}
                  required
                  disabled={isLoading}
                >
                  <option value="">Select a branch...</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} {branch.location ? `(${branch.location})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your issue or request..."
                  style={styles.textarea}
                  rows={4}
                  required
                  disabled={isLoading}
                />
              </div>

              <div style={styles.btnRow}>
                <button
                  type="button"
                  onClick={onClose}
                  style={styles.cancelBtn}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={styles.submitBtn}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span style={styles.spinnerWrapper}>
                      <span style={styles.spinner}></span>
                      Sending...
                    </span>
                  ) : (
                    'Send Message'
                  )}
                </button>
              </div>
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
            <h2 style={styles.title}>Message Sent</h2>
            <p style={styles.subtitle}>
              Thanks, {firstName}. Your message has been sent to the administrator. We'll get back to you at <strong style={{ color: 'var(--color-text-primary)' }}>{email}</strong> shortly.
            </p>
            <button type="button" onClick={onClose} style={styles.submitBtn}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    background: 'rgba(15, 23, 42, 0.55)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
    animation: 'fadeIn 0.2s ease',
  },
  modal: {
    width: '100%',
    maxWidth: '480px',
    maxHeight: '90vh',
    overflowY: 'auto',
    position: 'relative',
    padding: '32px',
    borderRadius: 'var(--radius-lg)',
    animation: 'slideUp 0.25s ease',
  },
  closeBtn: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    background: 'var(--color-bg-root)',
    border: '1px solid var(--color-border)',
    borderRadius: '50%',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  iconWrapper: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: 'var(--color-bg-root)',
    border: '1px solid var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '8px',
    letterSpacing: '-0.3px',
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
  row: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
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
    marginBottom: '16px',
    minWidth: '140px',
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
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    transition: 'all 0.3s ease',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    transition: 'all 0.3s ease',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },
  textarea: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    transition: 'all 0.3s ease',
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  btnRow: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
  },
  cancelBtn: {
    flex: 1,
    padding: '13px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  submitBtn: {
    flex: 1,
    padding: '13px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: 'var(--color-primary)',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  spinnerWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  spinner: {
    width: '14px',
    height: '14px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  successWrapper: {
    textAlign: 'center',
    paddingTop: '8px',
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