import React, { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';
import {
  getProjects,
  getEmployees,
  getEmployeeClientFeedback,
  submitPmEvaluation,
  getPmEvaluations,
} from './pmApi';

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
          style={{
            cursor: 'pointer',
            fontSize: 22,
            color: n <= (value || 0) ? '#f59e0b' : 'var(--color-border, #d1d5db)',
            transition: 'color 0.15s ease',
            userSelect: 'none',
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

export default function PMSendFeedbackTab({ user }) {
  const effectiveUserId = resolveUserId(user);

  const [projects, setProjects] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [selectedProfileIds, setSelectedProfileIds] = useState([]);

  const [clientFeedbackMap, setClientFeedbackMap] = useState({});
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);

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

  // Load all projects this PM handles and their existing evaluations
  const loadProjectsAndEvaluations = async () => {
    if (!effectiveUserId) return;
    try {
      const [projectsData, evalsData] = await Promise.all([
        getProjects(effectiveUserId),
        getPmEvaluations(),
      ]);
      setProjects(projectsData || []);
      setEvaluations(evalsData || []);
    } catch (err) {
      console.error('Failed to load projects or evaluations:', err);
    }
  };

  useEffect(() => {
    loadProjectsAndEvaluations();
  }, [effectiveUserId]);

  // Load project employees when projectId changes
  useEffect(() => {
    if (!projectId) {
      setEmployees([]);
      setSelectedProfileIds([]);
      setClientFeedbackMap({});
      return;
    }

    let cancelled = false;
    setLoadingEmployees(true);
    (async () => {
      try {
        const data = await getEmployees(effectiveUserId, undefined, projectId);
        if (!cancelled) {
          const team = (data || []).filter(e => e.id !== effectiveUserId);
          setEmployees(team);
          setSelectedProfileIds([]);
        }
      } catch (err) {
        console.error('Failed to load project employees:', err);
        if (!cancelled) setEmployees([]);
      } finally {
        if (!cancelled) setLoadingEmployees(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, effectiveUserId]);

  // Load client feedback for employees in current project
  useEffect(() => {
    if (!projectId || employees.length === 0) return;
    let cancelled = false;
    setLoadingFeedback(true);
    (async () => {
      try {
        const feedbackEntries = await Promise.all(
          employees.map(async emp => {
            try {
              const cf = await getEmployeeClientFeedback(emp.id, projectId);
              return [emp.id, cf || []];
            } catch {
              return [emp.id, []];
            }
          })
        );
        if (!cancelled) {
          setClientFeedbackMap(Object.fromEntries(feedbackEntries));
        }
      } catch (err) {
        console.error('Failed to load client feedback entries:', err);
      } finally {
        if (!cancelled) setLoadingFeedback(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, employees]);

  // Map of profileId -> existing evaluation for current project
  const projectEvalMap = useMemo(() => {
    const map = {};
    for (const ev of evaluations) {
      if (String(ev.project_id) === String(projectId)) {
        map[ev.profile_id] = ev;
      }
    }
    return map;
  }, [evaluations, projectId]);

  // Calculate evaluation status for each project in dropdown
  const projectsWithStatus = useMemo(() => {
    return projects.map(p => {
      const isProjectComplete = String(p.status || '').toLowerCase() === 'completed';
      const projectEvals = evaluations.filter(ev => String(ev.project_id) === String(p.id));
      const hasEvals = projectEvals.length > 0;

      let statusLabel = '';
      if (isProjectComplete) {
        statusLabel = hasEvals ? `[Completed - Evaluated] ${p.name}` : `[Completed - Needs Eval] ${p.name}`;
      } else {
        statusLabel = hasEvals ? `[Active - Evaluated] ${p.name}` : `[Active - Needs Eval] ${p.name}`;
      }

      return {
        ...p,
        isProjectComplete,
        hasEvals,
        statusLabel,
      };
    }).sort((a, b) => {
      if (a.isProjectComplete !== b.isProjectComplete) return a.isProjectComplete ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [projects, evaluations]);

  const toggleSelectEmployee = (id) => {
    setSelectedProfileIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedProfileIds(employees.map(e => e.id));
  };

  const selectUnevaluated = () => {
    const unevaluatedIds = employees
      .filter(e => !projectEvalMap[e.id])
      .map(e => e.id);
    setSelectedProfileIds(unevaluatedIds);
  };

  const clearSelection = () => {
    setSelectedProfileIds([]);
  };

  const handleStar = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const handleText = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectId) {
      Swal.fire('Missing project', 'Please select a project first.', 'warning');
      return;
    }
    if (selectedProfileIds.length === 0) {
      Swal.fire('No employees selected', 'Please select at least one employee checkbox to evaluate.', 'warning');
      return;
    }
    if (!form.rating) {
      Swal.fire('Missing rating', 'Please give an overall star rating before submitting.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      await submitPmEvaluation({
        profileIds: selectedProfileIds,
        projectId,
        ...form,
      });

      Swal.fire({
        title: 'Evaluations Saved!',
        text: `Successfully saved PM evaluation for ${selectedProfileIds.length} employee(s).`,
        icon: 'success',
        confirmButtonColor: 'var(--color-primary)',
      });

      // Reset form and reload evaluations
      setForm({
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
      setSelectedProfileIds([]);
      await loadProjectsAndEvaluations();
    } catch (err) {
      console.error('Failed to submit evaluation:', err);
      Swal.fire('Error', err.message || 'Failed to submit evaluation', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedProject = useMemo(
    () => projects.find(p => String(p.id) === String(projectId)),
    [projects, projectId]
  );

  const selectedEmployees = useMemo(
    () => employees.filter(e => selectedProfileIds.includes(e.id)),
    [employees, selectedProfileIds]
  );

  const styles = {
    container: { display: 'flex', flexDirection: 'column', gap: '24px' },
    card: { padding: '24px', marginBottom: '24px' },
    formGroup: { marginBottom: '20px' },
    label: { display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' },
    select: {
      width: '100%',
      padding: '12px 14px',
      borderRadius: '8px',
      border: '1px solid var(--color-border)',
      background: 'var(--color-bg-secondary, #1e293b)',
      color: 'var(--color-text-primary)',
      fontSize: '14px',
      outline: 'none',
    },
    textarea: {
      width: '100%',
      minHeight: '80px',
      padding: '10px 12px',
      borderRadius: '8px',
      border: '1px solid var(--color-border)',
      background: 'var(--color-bg-secondary, #1e293b)',
      color: 'var(--color-text-primary)',
      resize: 'vertical',
      fontSize: '14px',
      fontFamily: 'inherit',
    },
    ratingRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid var(--color-border)',
    },
    button: {
      padding: '12px 24px',
      borderRadius: '8px',
      border: 'none',
      background: 'var(--color-primary, #3b82f6)',
      color: '#fff',
      fontWeight: 600,
      cursor: 'pointer',
      fontSize: '14px',
      transition: 'opacity 0.2s',
    },
    buttonDisabled: { opacity: 0.6, cursor: 'not-allowed' },
    smallBtn: {
      padding: '6px 12px',
      borderRadius: '6px',
      border: '1px solid var(--color-border)',
      background: 'rgba(255, 255, 255, 0.05)',
      color: 'var(--color-text-primary)',
      fontSize: '12px',
      fontWeight: 600,
      cursor: 'pointer',
    },
    clientFeedbackItem: {
      padding: '12px',
      borderRadius: '8px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid var(--color-border)',
      marginBottom: '10px',
    },
    emptyNote: { fontSize: '13px', color: 'var(--color-text-muted)' },
  };

  return (
    <div style={styles.container}>
      <div className="glass-card" style={styles.card}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Project (Handled by You) *</label>
          <select 
            style={styles.select} 
            value={projectId} 
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>
              -- Select a project to evaluate team members --
            </option>
            {projectsWithStatus.map(p => (
              <option 
                key={p.id} 
                value={p.id} 
                style={{ color: '#1f2937', backgroundColor: '#ffffff' }}
              >
                {p.statusLabel}
              </option>
            ))}
          </select>
          {projects.length === 0 && (
            <span style={styles.emptyNote}>No projects found for your account.</span>
          )}

          {selectedProject && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              borderRadius: '8px',
              background: String(selectedProject.status || '').toLowerCase() === 'completed'
                ? 'rgba(16, 185, 129, 0.12)'
                : 'rgba(59, 130, 246, 0.08)',
              border: `1px solid ${String(selectedProject.status || '').toLowerCase() === 'completed' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.2)'}`,
              fontSize: '13px',
              color: 'var(--color-text-primary)',
              marginTop: '10px',
            }}>
              <div>
                <strong>{selectedProject.name}</strong> — Status: {selectedProject.status || 'Active'}
              </div>
            </div>
          )}
        </div>

        {projectId && (
          <div style={styles.formGroup}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
              <label style={{ ...styles.label, marginBottom: 0 }}>
                Employees in this Project * (Select one or multiple to evaluate at once)
              </label>
              {employees.length > 0 && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="button" style={styles.smallBtn} onClick={selectAll}>
                    Select All ({employees.length})
                  </button>
                  <button type="button" style={styles.smallBtn} onClick={selectUnevaluated}>
                    Needs Eval Only
                  </button>
                  {selectedProfileIds.length > 0 && (
                    <button type="button" style={styles.smallBtn} onClick={clearSelection}>
                      Clear Selection
                    </button>
                  )}
                </div>
              )}
            </div>

            {loadingEmployees ? (
              <span style={styles.emptyNote}>Loading project team members…</span>
            ) : employees.length === 0 ? (
              <span style={styles.emptyNote}>No employees are assigned to this project yet.</span>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '12px',
                marginTop: '10px',
              }}>
                {employees.map(emp => {
                  const isChecked = selectedProfileIds.includes(emp.id);
                  const existingEval = projectEvalMap[emp.id];
                  const empFeedback = clientFeedbackMap[emp.id] || [];

                  return (
                    <label
                      key={emp.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: isChecked ? '2px solid var(--color-primary, #3b82f6)' : '1px solid var(--color-border)',
                        background: isChecked ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectEmployee(emp.id)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)' }}>
                          {emp.name}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '26px', flexWrap: 'wrap' }}>
                        {existingEval ? (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}>
                            Evaluated ({existingEval.rating || 0}/5)
                          </span>
                        ) : (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: 'rgba(234, 179, 8, 0.15)',
                            color: '#eab308',
                          }}>
                            Needs Evaluation
                          </span>
                        )}

                        {empFeedback.length > 0 && (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            background: 'rgba(168, 85, 247, 0.15)',
                            color: '#a855f7',
                            fontWeight: 500,
                          }}>
                            {empFeedback.length} Client Review{empFeedback.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Client feedback summary for selected employees */}
        {selectedProfileIds.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <label style={styles.label}>
              Client Feedback Insights ({selectedEmployees.map(e => e.name).join(', ')})
            </label>
            {loadingFeedback ? (
              <span style={styles.emptyNote}>Loading client feedback…</span>
            ) : selectedEmployees.every(e => (clientFeedbackMap[e.id] || []).length === 0) ? (
              <span style={styles.emptyNote}>No client feedback submitted yet for the selected employee(s).</span>
            ) : (
              selectedEmployees.map(emp => {
                const reviews = clientFeedbackMap[emp.id] || [];
                if (reviews.length === 0) return null;
                return (
                  <div key={emp.id} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)', marginBottom: 4 }}>
                      {emp.name}:
                    </div>
                    {reviews.map(cf => (
                      <div key={cf.id} style={styles.clientFeedbackItem}>
                        <strong>{cf.clientName}</strong> — Rating: {cf.ratings?.rating ?? '—'}/5
                        {cf.strengths && <div style={{ fontSize: 13, marginTop: 4 }}>Strengths: {cf.strengths}</div>}
                        {cf.areasForImprovement && <div style={{ fontSize: 13, marginTop: 2 }}>Areas for improvement: {cf.areasForImprovement}</div>}
                        {cf.deliverablesFeedback && <div style={{ fontSize: 13, marginTop: 2 }}>Deliverables: {cf.deliverablesFeedback}</div>}
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {selectedProfileIds.length > 0 && (
        <div className="glass-card" style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '18px' }}>
              Final Evaluation for {selectedEmployees.length} Employee{selectedEmployees.length > 1 ? 's' : ''}
            </h3>
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', background: 'rgba(59, 130, 246, 0.1)', padding: '4px 10px', borderRadius: '6px' }}>
              Evaluating: {selectedEmployees.map(e => e.name).join(', ')}
            </span>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={styles.ratingRow}>
              <span style={{ fontWeight: 600 }}>Overall Rating *</span>
              <StarInput value={form.rating} onChange={(v) => handleStar('rating', v)} />
            </div>
            {Object.entries(RATING_LABELS).map(([field, label]) => (
              <div key={field} style={styles.ratingRow}>
                <span>{label}</span>
                <StarInput value={form[field]} onChange={(v) => handleStar(field, v)} />
              </div>
            ))}

            <div style={{ ...styles.formGroup, marginTop: 18 }}>
              <label style={styles.label}>PM Assessment</label>
              <textarea
                name="pmAssessment"
                style={styles.textarea}
                value={form.pmAssessment}
                onChange={handleText}
                placeholder="Overall assessment of contribution and performance..."
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Strengths</label>
              <textarea
                name="strengths"
                style={styles.textarea}
                value={form.strengths}
                onChange={handleText}
                placeholder="Key strengths observed throughout the project..."
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Areas for Improvement</label>
              <textarea
                name="areasForImprovement"
                style={styles.textarea}
                value={form.areasForImprovement}
                onChange={handleText}
                placeholder="Specific recommendations for development..."
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Project Feedback</label>
              <textarea
                name="projectFeedback"
                style={styles.textarea}
                value={form.projectFeedback}
                onChange={handleText}
                placeholder="Feedback specific to this project context..."
              />
            </div>

            <button
              type="submit"
              style={{ ...styles.button, ...(submitting ? styles.buttonDisabled : {}) }}
              disabled={submitting}
            >
              {submitting
                ? 'Submitting Evaluations…'
                : `Submit Evaluation for ${selectedProfileIds.length} Employee${selectedProfileIds.length > 1 ? 's' : ''}`
              }
            </button>
          </form>
        </div>
      )}
    </div>
  );
}