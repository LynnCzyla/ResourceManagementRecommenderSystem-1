import React, { useState } from 'react';

export default function SystemSettingsTab() {
  const [ocrThreshold, setOcrThreshold] = useState(75);
  const [nlpMatchMode, setNlpMatchMode] = useState('semantic');
  const [backupSchedule, setBackupSchedule] = useState('daily');
  const [ocrPreprocess, setOcrPreprocess] = useState('binarization');
  
  const [settings, setSettings] = useState({
    skillWeight: 1.0,
    certWeight: 1.5,
    rebuildIndices: true,
    sessionTimeout: 30,
    maxFileSize: 10,
    maxLoginAttempts: 5,
    minPasswordLength: 12,
    requireUppercase: true,
    minUppercase: 1,
    requireLowercase: true,
    minLowercase: 1,
    requireNumber: true,
    minNumber: 1,
    requireSpecial: true,
    minSpecial: 1,
  });

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleInputChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 1000);
  };

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>System Settings</h1>
        <p style={styles.subtitle}>Modify OCR, NLP, database sync, and portal security parameters.</p>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        {saveSuccess && (
          <div style={styles.successAlert}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            System configuration parameters successfully saved and synchronized.
          </div>
        )}

        <div style={styles.grid}>
          <div className="glass-card" style={styles.card}>
            <h3 style={styles.cardTitle}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.cardIcon}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              Security Configuration
            </h3>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Session Expiration (Minutes)</label>
              <input
                type="number"
                min="5"
                max="120"
                value={settings.sessionTimeout}
                onChange={(e) => handleInputChange('sessionTimeout', parseInt(e.target.value))}
                style={styles.numberInput}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Max Login Attempts</label>
              <input
                type="number"
                min="3"
                max="10"
                value={settings.maxLoginAttempts}
                onChange={(e) => handleInputChange('maxLoginAttempts', parseInt(e.target.value))}
                style={styles.numberInput}
              />
              <p style={styles.fieldDesc}>Number of failed login attempts before account is temporarily locked.</p>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Max File Upload Size (MB)</label>
              <input
                type="number"
                min="1"
                max="50"
                value={settings.maxFileSize}
                onChange={(e) => handleInputChange('maxFileSize', parseInt(e.target.value))}
                style={styles.numberInput}
              />
            </div>
          </div>

          <div className="glass-card" style={styles.card}>
            <h3 style={styles.cardTitle}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.cardIcon}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              Password Complexity
            </h3>
            <p style={styles.fieldDesc}>Define the password rules enforced for all user accounts.</p>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Minimum Password Length</label>
              <div style={styles.counterControl}>
                <button
                  type="button"
                  onClick={() => handleInputChange('minPasswordLength', Math.max(8, settings.minPasswordLength - 1))}
                  style={styles.counterBtn}
                >
                  -
                </button>
                <span style={styles.counterValue}>{settings.minPasswordLength} chars</span>
                <button
                  type="button"
                  onClick={() => handleInputChange('minPasswordLength', Math.min(32, settings.minPasswordLength + 1))}
                  style={styles.counterBtn}
                >
                  +
                </button>
              </div>
              <p style={styles.fieldDesc}>Recommended: 12 characters or more</p>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={settings.requireUppercase}
                  onChange={(e) => handleInputChange('requireUppercase', e.target.checked)}
                  style={styles.checkbox}
                />
                Require Uppercase Letter
              </label>
              <p style={styles.fieldDesc}>Require capital letters (A-Z)</p>
              {settings.requireUppercase && (
                <div style={styles.counterControl}>
                  <button
                    type="button"
                    onClick={() => handleInputChange('minUppercase', Math.max(1, settings.minUppercase - 1))}
                    style={styles.counterBtn}
                  >
                    -
                  </button>
                  <span style={styles.counterValue}>{settings.minUppercase}</span>
                  <button
                    type="button"
                    onClick={() => handleInputChange('minUppercase', Math.min(5, settings.minUppercase + 1))}
                    style={styles.counterBtn}
                  >
                    +
                  </button>
                </div>
              )}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={settings.requireLowercase}
                  onChange={(e) => handleInputChange('requireLowercase', e.target.checked)}
                  style={styles.checkbox}
                />
                Require Lowercase Letter
              </label>
              <p style={styles.fieldDesc}>Require small letters (a-z)</p>
              {settings.requireLowercase && (
                <div style={styles.counterControl}>
                  <button
                    type="button"
                    onClick={() => handleInputChange('minLowercase', Math.max(1, settings.minLowercase - 1))}
                    style={styles.counterBtn}
                  >
                    -
                  </button>
                  <span style={styles.counterValue}>{settings.minLowercase}</span>
                  <button
                    type="button"
                    onClick={() => handleInputChange('minLowercase', Math.min(5, settings.minLowercase + 1))}
                    style={styles.counterBtn}
                  >
                    +
                  </button>
                </div>
              )}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={settings.requireNumber}
                  onChange={(e) => handleInputChange('requireNumber', e.target.checked)}
                  style={styles.checkbox}
                />
                Require Number
              </label>
              <p style={styles.fieldDesc}>Require digits (0-9)</p>
              {settings.requireNumber && (
                <div style={styles.counterControl}>
                  <button
                    type="button"
                    onClick={() => handleInputChange('minNumber', Math.max(1, settings.minNumber - 1))}
                    style={styles.counterBtn}
                  >
                    -
                  </button>
                  <span style={styles.counterValue}>{settings.minNumber}</span>
                  <button
                    type="button"
                    onClick={() => handleInputChange('minNumber', Math.min(5, settings.minNumber + 1))}
                    style={styles.counterBtn}
                  >
                    +
                  </button>
                </div>
              )}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={settings.requireSpecial}
                  onChange={(e) => handleInputChange('requireSpecial', e.target.checked)}
                  style={styles.checkbox}
                />
                Require Special Character
              </label>
              <p style={styles.fieldDesc}>Require symbols (!@#$%^&*...)</p>
              {settings.requireSpecial && (
                <div style={styles.counterControl}>
                  <button
                    type="button"
                    onClick={() => handleInputChange('minSpecial', Math.max(1, settings.minSpecial - 1))}
                    style={styles.counterBtn}
                  >
                    -
                  </button>
                  <span style={styles.counterValue}>{settings.minSpecial}</span>
                  <button
                    type="button"
                    onClick={() => handleInputChange('minSpecial', Math.min(5, settings.minSpecial + 1))}
                    style={styles.counterBtn}
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="glass-card" style={styles.card}>
            <h3 style={styles.cardTitle}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.cardIcon}>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              Policy Preview
            </h3>
            <p style={styles.fieldDesc}>Users will be required to create passwords that meet all enabled rules:</p>
            <div style={styles.policyPreview}>
              <div style={styles.policyItem}>
                <span style={styles.policyCheck}>✓</span>
                At least {settings.minPasswordLength} characters in length
              </div>
              {settings.requireUppercase && (
                <div style={styles.policyItem}>
                  <span style={styles.policyCheck}>✓</span>
                  At least {settings.minUppercase} CAPITAL letter (A-Z)
                </div>
              )}
              {settings.requireLowercase && (
                <div style={styles.policyItem}>
                  <span style={styles.policyCheck}>✓</span>
                  At least {settings.minLowercase} small letter (a-z)
                </div>
              )}
              {settings.requireNumber && (
                <div style={styles.policyItem}>
                  <span style={styles.policyCheck}>✓</span>
                  At least {settings.minNumber} number (0-9)
                </div>
              )}
              {settings.requireSpecial && (
                <div style={styles.policyItem}>
                  <span style={styles.policyCheck}>✓</span>
                  At least {settings.minSpecial} special character
                </div>
              )}
              <div style={styles.policyItem}>
                <span style={styles.policyDot}>·</span>
                No password expiration
              </div>
            </div>
            <div style={styles.policyStrength}>
              <span style={styles.policyBadge}>Strong Policy</span>
            </div>
            <div style={styles.exampleSection}>
              <p style={styles.exampleLabel}>Example Valid Password</p>
              <p style={styles.examplePassword}>xAxxaxx!x1xx</p>
              <p style={styles.exampleNote}>* This is just an example. Actual passwords can be different.</p>
            </div>
          </div>
        </div>

        <div style={styles.formActions}>
          <button
            type="submit"
            style={styles.submitBtn}
            className="glow-primary"
            disabled={isSaving}
          >
            {isSaving ? 'Synchronizing settings...' : 'Save Configuration'}
          </button>
        </div>
      </form>
    </div>
  );
}

const styles = {
  header: {
    marginBottom: '28px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '800',
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.75px',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '15px',
    color: 'var(--color-text-secondary)',
  },
  form: {
    textAlign: 'left',
  },
  successAlert: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--color-primary-light)',
    color: 'var(--color-success)',
    border: '1px solid var(--color-primary)',
    padding: '16px',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    marginBottom: '24px',
    fontWeight: '600',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: '24px',
    marginBottom: '32px',
  },
  card: {
    padding: '28px',
  },
  cardTitle: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '20px',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '10px',
  },
  cardIcon: {
    marginRight: '10px',
    color: 'var(--color-primary)',
  },
  formGroup: {
    marginBottom: '20px',
  },
  formLabel: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '6px',
  },
  fieldDesc: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    marginBottom: '8px',
    lineHeight: '1.3',
  },
  slider: {
    width: '100%',
    accentColor: 'var(--color-primary)',
    cursor: 'pointer',
    height: '6px',
    borderRadius: '3px',
    backgroundColor: 'var(--color-border)',
    outline: 'none',
  },
  sliderLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    marginTop: '6px',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  row: {
    display: 'flex',
    gap: '16px',
  },
  numberInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  checkbox: {
    marginRight: '10px',
    width: '16px',
    height: '16px',
    accentColor: 'var(--color-primary)',
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  submitBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '12px 28px',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    '&:hover': {
      backgroundColor: 'var(--color-primary-hover)',
    }
  },
  counterControl: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  counterBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '18px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  counterValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    minWidth: '60px',
    textAlign: 'center',
  },
  policyPreview: {
    background: 'var(--color-bg-root)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '16px',
    marginBottom: '16px',
  },
  policyItem: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    marginBottom: '8px',
    lineHeight: '1.4',
  },
  policyCheck: {
    color: 'var(--color-success)',
    fontWeight: '700',
    marginRight: '8px',
  },
  policyDot: {
    color: 'var(--color-text-muted)',
    marginRight: '8px',
  },
  policyStrength: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  policyBadge: {
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    padding: '6px 16px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  exampleSection: {
    background: 'var(--color-bg-root)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '16px',
  },
  exampleLabel: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  examplePassword: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    marginBottom: '8px',
    letterSpacing: '1px',
  },
  exampleNote: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
  },
};
