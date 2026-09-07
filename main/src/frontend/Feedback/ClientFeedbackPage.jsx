import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import weaLogo from '../../assets/WEA_logo_bgremoved.png';

const PUBLIC_BASE = 'http://localhost:5000/api/public';

const RATING_CATEGORIES = [
  { key: 'rating', label: 'Overall Rating' },
  { key: 'technical_skills_rating', label: 'Technical Skills' },
  { key: 'communication_rating', label: 'Communication' },
  { key: 'timeliness_rating', label: 'Timeliness' },
  { key: 'quality_of_work_rating', label: 'Quality of Work' },
  { key: 'teamwork_rating', label: 'Teamwork' },
  { key: 'problem_solving_rating', label: 'Problem Solving' },
];

function emptyEmployeeResponse() {
  const base = { strengths: '', areasForImprovement: '', wouldRecommend: null };
  for (const cat of RATING_CATEGORIES) base[cat.key] = 0;
  return base;
}

function StarRating({ value, onChange, size = 22 }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {[1, 2, 3, 4, 5].map(n => {
        const filled = (hover || value) >= n;
        return (
          <span
            key={n}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(n)}
            role="button"
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            style={{
              cursor: 'pointer',
              fontSize: `${size}px`,
              lineHeight: 1,
              color: filled ? '#eab308' : 'var(--color-border)',
              transition: 'color 0.12s ease',
              userSelect: 'none',
            }}
          >
            ★
          </span>
        );
      })}
    </div>
  );
}

export default function ClientFeedbackPage() {
  const { token } = useParams();

  const [phase, setPhase] = useState('loading'); // loading | invalid | alreadyCompleted | form | thankYou
  const [errorMessage, setErrorMessage] = useState('This feedback request is invalid or has expired.');
  const [requestData, setRequestData] = useState(null);

  const [employeeResponses, setEmployeeResponses] = useState({});
  const [sharedFields, setSharedFields] = useState({
    projectRating: 0,
    deliverablesFeedback: '',
    projectFeedback: '',
    additionalComments: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const loadRequest = useCallback(async () => {
    setPhase('loading');
    try {
      const res = await fetch(`${PUBLIC_BASE}/feedback/${encodeURIComponent(token)}`);
      const body = await res.json();

      if (body.alreadyCompleted) {
        setPhase('alreadyCompleted');
        return;
      }
      if (!res.ok || body.success === false || body.invalid) {
        setErrorMessage(body.message || 'This feedback request is invalid or has expired.');
        setPhase('invalid');
        return;
      }

      setRequestData(body.data);
      const initial = {};
      for (const emp of body.data.employees) {
        initial[emp.id] = emptyEmployeeResponse();
      }
      setEmployeeResponses(initial);
      setPhase('form');
    } catch (err) {
      console.error('Failed to load feedback request:', err);
      setErrorMessage('This feedback request is invalid or has expired.');
      setPhase('invalid');
    }
  }, [token]);

  useEffect(() => {
    if (token) loadRequest();
  }, [token, loadRequest]);

  const updateEmployeeField = (employeeId, field, value) => {
    setFieldErrors(prev => ({ ...prev, [`${employeeId}.${field}`]: undefined }));
    setEmployeeResponses(prev => ({
      ...prev,
      [employeeId]: { ...prev[employeeId], [field]: value },
    }));
  };

  const updateSharedField = (field, value) => {
    setFieldErrors(prev => ({ ...prev, [field]: undefined }));
    setSharedFields(prev => ({ ...prev, [field]: value }));
  };

  const validate = () => {
    const errors = {};
    for (const emp of requestData.employees) {
      const r = employeeResponses[emp.id];
      for (const cat of RATING_CATEGORIES) {
        if (!r[cat.key] || r[cat.key] < 1) {
          errors[`${emp.id}.${cat.key}`] = `${cat.label} is required`;
        }
      }
      if (r.wouldRecommend === null) {
        errors[`${emp.id}.wouldRecommend`] = 'Please select Yes or No';
      }
    }
    if (!sharedFields.projectRating || sharedFields.projectRating < 1) {
      errors.projectRating = 'Overall project rating is required';
    }
    if (!sharedFields.deliverablesFeedback.trim()) {
      errors.deliverablesFeedback = 'Deliverables feedback is required';
    }
    if (!sharedFields.projectFeedback.trim()) {
      errors.projectFeedback = 'Overall project feedback is required';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) {
      Swal.fire({
        title: 'Missing information',
        text: 'Please complete all required ratings before submitting.',
        icon: 'warning',
        confirmButtonColor: 'var(--color-primary)',
        background: 'var(--color-bg-card)',
        color: 'var(--color-text-primary)',
      });
      return;
    }

    setSubmitting(true);
    try {
      const responses = requestData.employees.map(emp => {
        const r = employeeResponses[emp.id];
        const payload = {
          employeeId: emp.id,
          strengths: r.strengths.trim(),
          areasForImprovement: r.areasForImprovement.trim(),
          wouldRecommend: r.wouldRecommend,
        };
        for (const cat of RATING_CATEGORIES) payload[cat.key] = r[cat.key];
        return payload;
      });

      const res = await fetch(`${PUBLIC_BASE}/feedback/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responses,
          projectRating: sharedFields.projectRating,
          deliverablesFeedback: sharedFields.deliverablesFeedback.trim(),
          projectFeedback: sharedFields.projectFeedback.trim(),
          additionalComments: sharedFields.additionalComments.trim(),
        }),
      });
      const body = await res.json();

      if (body.alreadyCompleted) {
        setPhase('alreadyCompleted');
        return;
      }
      if (!res.ok || body.success === false) {
        throw new Error(body.message || 'Failed to submit feedback');
      }

      setPhase('thankYou');
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      Swal.fire({
        title: 'Could not submit',
        text: err.message || 'Something went wrong while submitting your feedback.',
        icon: 'error',
        confirmButtonColor: 'var(--color-primary)',
        background: 'var(--color-bg-card)',
        color: 'var(--color-text-primary)',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const styles = {
    page: {
      minHeight: '100vh',
      background: 'var(--color-bg-root)',
      padding: '40px 16px',
      display: 'flex',
      justifyContent: 'center',
    },
    shell: { width: '100%', maxWidth: '760px' },
    logoRow: { display: 'flex', justifyContent: 'center', marginBottom: '20px' },
    logo: { height: '48px', objectFit: 'contain' },
    centerCard: {
      padding: '48px 32px',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '12px',
    },
    centerTitle: { fontSize: '22px', fontWeight: '700', color: 'var(--color-text-primary)', margin: 0 },
    centerText: { fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0, maxWidth: '440px' },
    header: { marginBottom: '28px', textAlign: 'center' },
    title: { fontSize: '26px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' },
    subtitle: { fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.6 },
    card: { padding: '24px', marginBottom: '20px' },
    employeeName: { fontSize: '17px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '2px' },
    employeeRole: { fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '16px' },
    ratingGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px', marginBottom: '18px' },
    ratingGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
    label: { fontSize: '13px', fontWeight: '600', color: 'var(--color-text-secondary)' },
    fieldError: { fontSize: '12px', color: 'var(--color-danger, #ef4444)' },
    textarea: {
      width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--color-border)',
      background: 'var(--color-bg-root)', color: 'var(--color-text-primary)', fontSize: '14px',
      outline: 'none', minHeight: '80px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
    },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' },
    recommendRow: { display: 'flex', gap: '10px' },
    recommendBtn: (active) => ({
      padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
      border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
      background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
      color: active ? 'var(--color-primary)' : 'var(--color-text-primary)',
    }),
    sectionTitle: { fontSize: '19px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px' },
    sectionNote: { fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' },
    submitBtn: {
      padding: '14px 28px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none',
      borderRadius: '8px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', width: '100%',
    },
    submitBtnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  };

  if (phase === 'loading') {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.logoRow}>
            <img src={weaLogo} alt="WEA logo" style={styles.logo} />
          </div>
          <div className="glass-card" style={styles.centerCard}>
            <p style={styles.centerText}>Loading your feedback request…</p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'invalid') {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.logoRow}>
            <img src={weaLogo} alt="WEA logo" style={styles.logo} />
          </div>
          <div className="glass-card" style={styles.centerCard}>
            <h1 style={styles.centerTitle}>This feedback request is invalid or has expired.</h1>
            <p style={styles.centerText}>
              If you believe this is a mistake, please contact the WEA project manager who sent you this link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'alreadyCompleted') {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.logoRow}>
            <img src={weaLogo} alt="WEA logo" style={styles.logo} />
          </div>
          <div className="glass-card" style={styles.centerCard}>
            <h1 style={styles.centerTitle}>Feedback Already Submitted</h1>
            <p style={styles.centerText}>
              Thank you — feedback for this project has already been recorded. This link can no longer be used to submit again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'thankYou') {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.logoRow}>
            <img src={weaLogo} alt="WEA logo" style={styles.logo} />
          </div>
          <div className="glass-card" style={styles.centerCard}>
            <h1 style={styles.centerTitle}>Thank You!</h1>
            <p style={styles.centerText}>
              Your feedback for {requestData?.projectName} has been submitted successfully. We appreciate you taking
              the time to share your thoughts with the WEA team.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // phase === 'form'
  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.logoRow}>
          <img src={weaLogo} alt="WEA logo" style={styles.logo} />
        </div>

        <div style={styles.header}>
          <h1 style={styles.title}>Project Feedback</h1>
          <p style={styles.subtitle}>
            Hi {requestData.clientName}, please rate each team member who worked on{' '}
            <strong>{requestData.projectName}</strong>. Your feedback helps WEA improve and helps the team grow.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {requestData.employees.map(emp => {
            const r = employeeResponses[emp.id];
            return (
              <div key={emp.id} className="glass-card" style={styles.card}>
                <div style={styles.employeeName}>{emp.name}</div>
                {emp.role && <div style={styles.employeeRole}>{emp.role}</div>}

                <div style={styles.ratingGrid}>
                  {RATING_CATEGORIES.map(cat => (
                    <div key={cat.key} style={styles.ratingGroup}>
                      <label style={styles.label}>{cat.label} *</label>
                      <StarRating
                        value={r[cat.key]}
                        onChange={(val) => updateEmployeeField(emp.id, cat.key, val)}
                      />
                      {fieldErrors[`${emp.id}.${cat.key}`] && (
                        <span style={styles.fieldError}>{fieldErrors[`${emp.id}.${cat.key}`]}</span>
                      )}
                    </div>
                  ))}
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Strengths</label>
                  <textarea
                    style={styles.textarea}
                    placeholder="What did this person do particularly well?"
                    value={r.strengths}
                    onChange={(e) => updateEmployeeField(emp.id, 'strengths', e.target.value)}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Areas for Improvement</label>
                  <textarea
                    style={styles.textarea}
                    placeholder="Any areas where this person could improve?"
                    value={r.areasForImprovement}
                    onChange={(e) => updateEmployeeField(emp.id, 'areasForImprovement', e.target.value)}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Would you recommend this person for future projects? *</label>
                  <div style={styles.recommendRow}>
                    <button
                      type="button"
                      style={styles.recommendBtn(r.wouldRecommend === true)}
                      onClick={() => updateEmployeeField(emp.id, 'wouldRecommend', true)}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      style={styles.recommendBtn(r.wouldRecommend === false)}
                      onClick={() => updateEmployeeField(emp.id, 'wouldRecommend', false)}
                    >
                      No
                    </button>
                  </div>
                  {fieldErrors[`${emp.id}.wouldRecommend`] && (
                    <span style={styles.fieldError}>{fieldErrors[`${emp.id}.wouldRecommend`]}</span>
                  )}
                </div>
              </div>
            );
          })}

          <div className="glass-card" style={styles.card}>
            <div style={styles.sectionTitle}>Overall Project Feedback</div>
            <div style={styles.sectionNote}>These questions apply to the project as a whole, not any one person.</div>

            <div style={{ ...styles.formGroup, marginBottom: '22px' }}>
              <label style={styles.label}>Overall Project Rating *</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px' }}>
                <StarRating
                  value={sharedFields.projectRating}
                  onChange={(val) => updateSharedField('projectRating', val)}
                  size={28}
                />
                {sharedFields.projectRating > 0 && (
                  <span style={{ fontSize: '15px', fontWeight: '700', color: '#eab308' }}>
                    {sharedFields.projectRating} / 5 Stars
                  </span>
                )}
              </div>
              {fieldErrors.projectRating && (
                <span style={{ ...styles.fieldError, marginTop: '4px' }}>{fieldErrors.projectRating}</span>
              )}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Deliverables Feedback *</label>
              <textarea
                style={styles.textarea}
                placeholder="How did the final deliverables meet your expectations?"
                value={sharedFields.deliverablesFeedback}
                onChange={(e) => updateSharedField('deliverablesFeedback', e.target.value)}
              />
              {fieldErrors.deliverablesFeedback && <span style={styles.fieldError}>{fieldErrors.deliverablesFeedback}</span>}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Overall Project Feedback *</label>
              <textarea
                style={styles.textarea}
                placeholder="How was your overall experience with this project?"
                value={sharedFields.projectFeedback}
                onChange={(e) => updateSharedField('projectFeedback', e.target.value)}
              />
              {fieldErrors.projectFeedback && <span style={styles.fieldError}>{fieldErrors.projectFeedback}</span>}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Additional Comments</label>
              <textarea
                style={styles.textarea}
                placeholder="Anything else you'd like to share?"
                value={sharedFields.additionalComments}
                onChange={(e) => updateSharedField('additionalComments', e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            style={{ ...styles.submitBtn, ...(submitting ? styles.submitBtnDisabled : {}) }}
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Submit Feedback'}
          </button>
        </form>
      </div>
    </div>
  );
}