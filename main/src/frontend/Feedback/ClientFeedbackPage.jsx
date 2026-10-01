import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import weaLogo from '../../assets/WEA_logo_bgremoved.png';
import { API_BASE_URL } from '../../config/api';

const PUBLIC_BASE = `${API_BASE_URL}/api/public`;

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

function StarRating({ value, onChange, size = 26 }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(n => {
        const filled = (hover || value) >= n;
        return (
          <span
            key={n}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(n)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onChange(n); }}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            style={{
              cursor: 'pointer',
              fontSize: `${size}px`,
              lineHeight: 1,
              color: filled ? '#eab308' : 'var(--color-border)',
              transition: 'color 0.12s ease',
              userSelect: 'none',
              minWidth: '44px',
              minHeight: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
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
      const pmTarget = body.data.pm || (body.data.employees || []).find(e => e.isPm) || (body.data.employees || [])[0];
      const initial = {};
      if (pmTarget) {
        initial[pmTarget.id] = emptyEmployeeResponse();
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
    const pmTarget = requestData?.pm || (requestData?.employees || []).find(e => e.isPm) || (requestData?.employees || [])[0];
    if (pmTarget) {
      const r = employeeResponses[pmTarget.id] || emptyEmployeeResponse();
      for (const cat of RATING_CATEGORIES) {
        if (!r[cat.key] || r[cat.key] < 1) {
          errors[`${pmTarget.id}.${cat.key}`] = `${cat.label} is required`;
        }
      }
      if (r.wouldRecommend === null) {
        errors[`${pmTarget.id}.wouldRecommend`] = 'Please select Yes or No';
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
      const pmTarget = requestData?.pm || (requestData?.employees || []).find(e => e.isPm) || (requestData?.employees || [])[0];
      const responses = pmTarget ? [{
        employeeId: pmTarget.id,
        strengths: (employeeResponses[pmTarget.id]?.strengths || '').trim(),
        areasForImprovement: (employeeResponses[pmTarget.id]?.areasForImprovement || '').trim(),
        wouldRecommend: employeeResponses[pmTarget.id]?.wouldRecommend,
        ...(() => {
          const cats = {};
          for (const cat of RATING_CATEGORIES) cats[cat.key] = employeeResponses[pmTarget.id]?.[cat.key] || 0;
          return cats;
        })()
      }] : [];

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
      padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
      minHeight: '44px', minWidth: '72px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
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

  const pmTarget = requestData?.pm || (requestData?.employees || []).find(e => e.isPm) || (requestData?.employees || [])[0];

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.logoRow}>
          <img src={weaLogo} alt="WEA logo" style={styles.logo} />
        </div>

        <div style={styles.header}>
          <h1 style={styles.title}>Project & PM Feedback</h1>
          <p style={styles.subtitle}>
            Hi {requestData.clientName}, please provide your evaluation for{' '}
            <strong>{requestData.projectName}</strong> and the Project Manager{pmTarget ? ` (${pmTarget.name})` : ''}.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Overall Project Feedback Card */}
          <div className="glass-card" style={styles.card}>
            <div style={styles.sectionTitle}>Project Evaluation</div>
            <div style={styles.sectionNote}>Please evaluate the project deliverables and execution as a whole.</div>

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
                placeholder="How did the final deliverables meet your requirements, quality standards, and timelines?"
                value={sharedFields.deliverablesFeedback}
                onChange={(e) => updateSharedField('deliverablesFeedback', e.target.value)}
              />
              {fieldErrors.deliverablesFeedback && <span style={styles.fieldError}>{fieldErrors.deliverablesFeedback}</span>}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Overall Project Feedback *</label>
              <textarea
                style={styles.textarea}
                placeholder="How was your overall experience working on this project?"
                value={sharedFields.projectFeedback}
                onChange={(e) => updateSharedField('projectFeedback', e.target.value)}
              />
              {fieldErrors.projectFeedback && <span style={styles.fieldError}>{fieldErrors.projectFeedback}</span>}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Additional Comments</label>
              <textarea
                style={styles.textarea}
                placeholder="Any additional comments or recommendations for WEA?"
                value={sharedFields.additionalComments}
                onChange={(e) => updateSharedField('additionalComments', e.target.value)}
              />
            </div>
          </div>

          {/* Project Manager Evaluation Card */}
          {pmTarget && (() => {
            const r = employeeResponses[pmTarget.id] || emptyEmployeeResponse();
            return (
              <div key={pmTarget.id} className="glass-card" style={styles.card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                  <div>
                    <div style={styles.sectionTitle}>Project Manager Evaluation</div>
                    <div style={{ ...styles.employeeName, marginTop: '4px' }}>{pmTarget.name}</div>
                  </div>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '700',
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: 'var(--color-primary)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                  }}>
                    Project Manager
                  </span>
                </div>

                <div style={styles.ratingGrid}>
                  {RATING_CATEGORIES.map(cat => (
                    <div key={cat.key} style={styles.ratingGroup}>
                      <label style={styles.label}>{cat.label} *</label>
                      <StarRating
                        value={r[cat.key]}
                        onChange={(val) => updateEmployeeField(pmTarget.id, cat.key, val)}
                      />
                      {fieldErrors[`${pmTarget.id}.${cat.key}`] && (
                        <span style={styles.fieldError}>{fieldErrors[`${pmTarget.id}.${cat.key}`]}</span>
                      )}
                    </div>
                  ))}
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Strengths</label>
                  <textarea
                    style={styles.textarea}
                    placeholder="What did the Project Manager do particularly well (leadership, communication, problem solving)?"
                    value={r.strengths}
                    onChange={(e) => updateEmployeeField(pmTarget.id, 'strengths', e.target.value)}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Areas for Improvement</label>
                  <textarea
                    style={styles.textarea}
                    placeholder="Any areas where the Project Manager could improve?"
                    value={r.areasForImprovement}
                    onChange={(e) => updateEmployeeField(pmTarget.id, 'areasForImprovement', e.target.value)}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Would you recommend this Project Manager for future projects? *</label>
                  <div style={styles.recommendRow}>
                    <button
                      type="button"
                      style={styles.recommendBtn(r.wouldRecommend === true)}
                      onClick={() => updateEmployeeField(pmTarget.id, 'wouldRecommend', true)}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      style={styles.recommendBtn(r.wouldRecommend === false)}
                      onClick={() => updateEmployeeField(pmTarget.id, 'wouldRecommend', false)}
                    >
                      No
                    </button>
                  </div>
                  {fieldErrors[`${pmTarget.id}.wouldRecommend`] && (
                    <span style={styles.fieldError}>{fieldErrors[`${pmTarget.id}.wouldRecommend`]}</span>
                  )}
                </div>
              </div>
            );
          })()}

          <button
            type="submit"
            style={{ ...styles.submitBtn, ...(submitting ? styles.submitBtnDisabled : {}) }}
            disabled={submitting}
          >
            {submitting ? 'Submitting Feedback…' : 'Submit Feedback'}
          </button>
        </form>
      </div>
    </div>
  );
}