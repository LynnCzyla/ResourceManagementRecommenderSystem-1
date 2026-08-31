import React, { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';
import { getProjects, getEmployees, getEmployeeClientFeedback, submitPmEvaluation, getFeedbackRequests } from './pmApi';

const RATING_LABELS = {
  technical_skills_rating: 'Technical Skills',
  communication_rating: 'Communication',
  timeliness_rating: 'Timeliness',
  quality_of_work_rating: 'Quality of Work',
  teamwork_rating: 'Teamwork',
  problem_solving_rating: 'Problem Solving',
};

function resolveUserId(user) {
  if (user?.id) return user.id;
  try {
    const stored = JSON.parse(localStorage.getItem('user') || 'null');
    if (stored?.id) return stored.id;
  } catch (err) {}
  return undefined;
}

function StarInput({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          onClick={() => onChange(n)}
          style={{ cursor: 'pointer', fontSize: 20, color: n <= (value || 0) ? '#f59e0b' : 'var(--color-border)' }}
        >★</span>
      ))}
    </div>
  );
}

export default function PMSendFeedbackTab({ user }) {
  const effectiveUserId = resolveUserId(user);

  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [profileId, setProfileId] = useState('');

  const [clientFeedback, setClientFeedback] = useState([]);
  const [loadingClientFeedback, setLoadingClientFeedback] = useState(false);

  const [form, setForm] = useState({
    rating: 0,
    technical_skills_rating: 0,
    communication_rating: 0,
    timeliness_rating: 0,
    quality_of_work_rating: 0,
    teamwork_rating: 0,
    problem_solving_rating: 0,
    pmAssessment: '',
    strengths: '',
    areasForImprovement: '',
    projectFeedback: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [projectsData, feedbackReqsData] = await Promise.all([
          getProjects(effectiveUserId),
          getFeedbackRequests(effectiveUserId)
        ]);
        
        if (!cancelled) {
          const completedProjectIds = (feedbackReqsData || [])
            .filter(req => req.status === 'completed')
            .map(req => Number(req.projectId));
            
          const filtered = (projectsData || []).filter(p => completedProjectIds.includes(Number(p.id)));
          setProjects(filtered);
        }
      } catch (err) {
        console.error('Failed to load projects or feedback requests:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [effectiveUserId]);

  useEffect(() => {
    if (!projectId) {
      setEmployees([]);
      setProfileId('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await getEmployees(effectiveUserId, undefined, projectId);
        if (!cancelled) {
          setEmployees((data || []).filter(e => e.id !== effectiveUserId));
          setProfileId('');
        }
      } catch (err) {
        console.error('Failed to load project employees:', err);
        if (!cancelled) setEmployees([]);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, effectiveUserId]);

  useEffect(() => {
    if (!profileId) {
      setClientFeedback([]);
      return;
    }
    let cancelled = false;
    setLoadingClientFeedback(true);
    (async () => {
      try {
        const data = await getEmployeeClientFeedback(profileId, projectId);
        if (!cancelled) setClientFeedback(data || []);
      } catch (err) {
        console.error('Failed to load client feedback:', err);
        if (!cancelled) setClientFeedback([]);
      } finally {
        if (!cancelled) setLoadingClientFeedback(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profileId, projectId]);

  const selectedEmployeeName = useMemo(
    () => employees.find(e => e.id === profileId)?.name || '',
    [employees, profileId]
  );

  const handleStar = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const handleText = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectId || !profileId) {
      Swal.fire('Missing fields', 'Select a project and an employee first.', 'warning');
      return;
    }
    if (!form.rating) {
      Swal.fire('Missing rating', 'Give an overall rating before submitting.', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      await submitPmEvaluation({
        profileId,
        projectId,
        feedbackResponseId: clientFeedback[0]?.id || null,
        ...form,
      });
      Swal.fire('Submitted', `Evaluation for ${selectedEmployeeName} saved.`, 'success');
      setForm({
        rating: 0, technical_skills_rating: 0, communication_rating: 0, timeliness_rating: 0,
        quality_of_work_rating: 0, teamwork_rating: 0, problem_solving_rating: 0,
        pmAssessment: '', strengths: '', areasForImprovement: '', projectFeedback: '',
      });
    } catch (err) {
      console.error('Failed to submit evaluation:', err);
      Swal.fire('Error', err.message || 'Failed to submit evaluation', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const styles = {
    container: { padding: '8px 0' },
    card: { padding: '24px', marginBottom: '24px' },
    formGroup: { marginBottom: '16px' },
    label: { display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' },
    select: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' },
    textarea: { width: '100%', minHeight: '70px', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', resize: 'vertical' },
    ratingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' },
    button: { padding: '12px 24px', borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 600, cursor: 'pointer' },
    buttonDisabled: { opacity: 0.6, cursor: 'not-allowed' },
    clientFeedbackItem: { padding: '12px', borderRadius: '8px', background: 'var(--color-bg-secondary)', marginBottom: '10px' },
    emptyNote: { fontSize: '13px', color: 'var(--color-text-muted)' },
  };

  return (
    <div style={styles.container}>
      <div className="glass-card" style={styles.card}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Project *</label>
          <select 
            style={styles.select} 
            value={projectId} 
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>
              -- Select a project --
            </option>
            {projects.map(p => (
              <option 
                key={p.id} 
                value={p.id} 
                style={{ color: '#1f2937', backgroundColor: '#ffffff' }}
              >
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Employee *</label>
          <select 
            style={styles.select} 
            value={profileId} 
            onChange={(e) => setProfileId(e.target.value)} 
            disabled={!projectId}
          >
            <option value="" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>
              -- Select an employee --
            </option>
            {employees.map(e => (
              <option 
                key={e.id} 
                value={e.id} 
                style={{ color: '#1f2937', backgroundColor: '#ffffff' }}
              >
                {e.name} {e.isEvaluated ? '(Complete)' : ''}
              </option>
            ))}
          </select>
        </div>

        {profileId && (
          <div style={{ marginTop: 20 }}>
            <label style={styles.label}>Client Feedback on {selectedEmployeeName}</label>
            {loadingClientFeedback ? (
              <span style={styles.emptyNote}>Loading client feedback…</span>
            ) : clientFeedback.length === 0 ? (
              <span style={styles.emptyNote}>No client feedback submitted yet for this employee.</span>
            ) : (
              clientFeedback.map(cf => (
                <div key={cf.id} style={styles.clientFeedbackItem}>
                  <strong>{cf.clientName}</strong> — Overall: {cf.ratings.rating ?? '—'}/5
                  {cf.strengths && <div style={{ fontSize: 13, marginTop: 4 }}>Strengths: {cf.strengths}</div>}
                  {cf.areasForImprovement && <div style={{ fontSize: 13 }}>Areas for improvement: {cf.areasForImprovement}</div>}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {profileId && (
        <div className="glass-card" style={styles.card}>
          <h3 style={{ marginTop: 0 }}>Final Evaluation for {selectedEmployeeName}</h3>
          <form onSubmit={handleSubmit}>
            <div style={styles.ratingRow}>
              <span>Overall Rating *</span>
              <StarInput value={form.rating} onChange={(v) => handleStar('rating', v)} />
            </div>
            {Object.entries(RATING_LABELS).map(([field, label]) => (
              <div key={field} style={styles.ratingRow}>
                <span>{label}</span>
                <StarInput value={form[field]} onChange={(v) => handleStar(field, v)} />
              </div>
            ))}

            <div style={{ ...styles.formGroup, marginTop: 16 }}>
              <label style={styles.label}>PM Assessment</label>
              <textarea name="pmAssessment" style={styles.textarea} value={form.pmAssessment} onChange={handleText} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Strengths</label>
              <textarea name="strengths" style={styles.textarea} value={form.strengths} onChange={handleText} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Areas for Improvement</label>
              <textarea name="areasForImprovement" style={styles.textarea} value={form.areasForImprovement} onChange={handleText} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Project Feedback</label>
              <textarea name="projectFeedback" style={styles.textarea} value={form.projectFeedback} onChange={handleText} />
            </div>

            <button type="submit" style={{ ...styles.button, ...(submitting ? styles.buttonDisabled : {}) }} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Evaluation'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}