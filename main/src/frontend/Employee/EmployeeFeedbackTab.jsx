import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { supabase } from '../../lib/supabaseClient';
import { API_BASE_URL } from '../../config/api';

const RATING_LABELS = {
  rating: 'Overall Rating',
  technical_skills_rating: 'Technical Skills',
  communication_rating: 'Communication',
  timeliness_rating: 'Timeliness',
  quality_of_work_rating: 'Quality of Work',
  teamwork_rating: 'Teamwork',
  problem_solving_rating: 'Problem Solving',
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch (e) {
    return dateStr;
  }
}

function Stars({ value, size = 14 }) {
  const rounded = Math.round(value || 0);
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={n <= rounded ? 'var(--color-warning)' : 'none'}
          stroke={n <= rounded ? 'var(--color-warning)' : 'var(--color-text-muted)'}
          strokeWidth="1.5"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  );
}

export default function EmployeeFeedbackTab({ user }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
    const storedToken = localStorage.getItem('token') || localStorage.getItem('access_token');
    if (storedToken) return { Authorization: `Bearer ${storedToken}` };
    return {};
  };

  const fetchFeedback = async () => {
    setLoading(true);
    setError('');
    try {
      const authHeader = await getAuthHeader();
      const res = await axios.get(`${API_BASE_URL}/api/employee/feedback`, { headers: authHeader });
      if (res.data.success) {
        setSummary(res.data.data.summary);
        setFeedback(res.data.data.feedback || []);
      } else {
        setError(res.data.message || 'Failed to load feedback');
      }
    } catch (err) {
      console.error('Error fetching feedback:', err);
      console.error('Server detail:', err.response?.data); // <-- shows the real Supabase error
      setError(err.response?.data?.message || 'Failed to load feedback');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedFeedback = useMemo(() => {
    const groups = {};
    (feedback || []).forEach(item => {
      const name = item.projectName;
      if (!groups[name]) groups[name] = [];
      groups[name].push(item);
    });

    const result = [];
    Object.keys(groups).forEach(projName => {
      const groupItems = groups[projName];
      const clientItem = groupItems.find(i => i.feedbackSource === 'client');
      const pmItem = groupItems.find(i => i.feedbackSource === 'project_manager');

      if (clientItem && pmItem) {
        const avgOverall = Math.round(((Number(clientItem.ratings?.rating || 0) + Number(pmItem.ratings?.rating || 0)) / 2) * 10) / 10;
        
        const mergedRatings = {};
        Object.keys(RATING_LABELS).forEach(key => {
          const vals = [];
          if (clientItem.ratings?.[key] != null) vals.push(Number(clientItem.ratings[key]));
          if (pmItem.ratings?.[key] != null) vals.push(Number(pmItem.ratings[key]));
          mergedRatings[key] = vals.length > 0 ? (vals.reduce((a,b)=>a+b,0)/vals.length) : null;
        });

        result.push({
          id: `merged_${clientItem.id}_${pmItem.id}`,
          projectName: projName,
          isMerged: true,
          rating: avgOverall,
          ratings: mergedRatings,
          submittedAt: clientItem.submittedAt || pmItem.submittedAt,
          client: clientItem,
          pm: pmItem,
        });
      } else {
        const single = clientItem || pmItem;
        result.push({
          id: single.id,
          projectName: projName,
          isMerged: false,
          rating: single.ratings?.rating || 0,
          ratings: single.ratings || {},
          submittedAt: single.submittedAt,
          feedbackSource: single.feedbackSource,
          clientName: single.clientName,
          client: single.feedbackSource === 'client' ? single : null,
          pm: single.feedbackSource === 'project_manager' ? single : null,
        });
      }
    });

    // Sort by latest date
    return result.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
  }, [feedback]);

  if (loading) {
    return <div style={styles.centerMsg}>Loading your feedback…</div>;
  }

  if (error) {
    return (
      <div style={styles.centerMsg}>
        <p style={{ color: 'var(--color-danger)' }}>{error}</p>
        <button onClick={fetchFeedback} style={styles.retryBtn}>Retry</button>
      </div>
    );
  }

  const hasFeedback = summary && summary.totalReviews > 0;

  return (
    <div>
      <div style={styles.pageHeader}>
        <h2 style={styles.pageTitle}>My Client Feedback</h2>
        <p style={styles.pageSubtitle}>
          See how clients have rated your work on past projects, and where you can improve.
        </p>
      </div>

      {!hasFeedback ? (
        <div style={styles.emptyState}>
          <p>No client feedback yet. Once a client completes a feedback form for a project you worked on, it will show up here.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={styles.summaryGrid}>
            <div style={{ ...styles.summaryCard, ...styles.overallCard }}>
              <span style={styles.summaryLabel}>Overall Rating</span>
              <span style={styles.overallNumber}>
                {summary.averages.rating != null ? summary.averages.rating.toFixed(1) : '—'}
              </span>
              <Stars value={summary.averages.rating} size={18} />
              <span style={styles.reviewCount}>
                Based on {summary.totalReviews} review{summary.totalReviews !== 1 ? 's' : ''}
              </span>
              {summary.recommendPercent != null && (
                <span style={styles.recommendPill}>
                  {summary.recommendPercent}% would recommend you for future projects
                </span>
              )}
            </div>

            {Object.entries(RATING_LABELS)
              .filter(([key]) => key !== 'rating')
              .map(([key, label]) => (
                <div key={key} style={styles.summaryCard}>
                  <span style={styles.summaryLabel}>{label}</span>
                  <span style={styles.categoryNumber}>
                    {summary.averages[key] != null ? summary.averages[key].toFixed(1) : '—'}
                  </span>
                  <Stars value={summary.averages[key]} />
                </div>
              ))}
          </div>

          {/* Individual feedback list */}
          <h3 style={styles.sectionTitle}>Feedback History</h3>
          <div style={styles.feedbackList}>
            {groupedFeedback.map((item) => {
              const isExpanded = expandedId === item.id;
              return (
                <div key={item.id} style={styles.feedbackCard}>
                  <div
                    style={styles.feedbackCardHeader}
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  >
                    <div>
                      <span style={styles.feedbackProject}>{item.projectName}</span>
                      <span style={styles.feedbackMeta}>
                        {item.isMerged ? (
                          <span style={{ 
                            fontWeight: 600, 
                            color: '#8b5cf6',
                            marginRight: 4 
                          }}>
                            [Client & PM Evaluated]
                          </span>
                        ) : (
                          <span style={{ 
                            fontWeight: 600, 
                            color: item.feedbackSource === 'project_manager' ? 'var(--color-primary)' : 'var(--color-success)',
                            marginRight: 4 
                          }}>
                            [{item.feedbackSource === 'project_manager' ? 'Project Manager' : 'Client'}]
                          </span>
                        )}
                        {item.isMerged ? '' : `by ${item.clientName}`} · {formatDate(item.submittedAt)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Stars value={item.rating} />
                      <span style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={styles.feedbackCardBody}>
                      {item.isMerged ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                          {/* Client Evaluation */}
                          <div style={{ padding: 12, borderBottom: '1px dashed var(--color-border)' }}>
                            <h4 style={{ margin: '0 0 8px 0', color: '#3b82f6', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px' }}>
                              Client Feedback ({item.client.clientName})
                            </h4>
                            
                            <div style={styles.ratingBreakdown}>
                              {Object.entries(RATING_LABELS)
                                .filter(([key]) => key !== 'rating')
                                .map(([key, label]) => (
                                  <div key={key} style={styles.ratingRow}>
                                    <span style={styles.ratingLabel}>{label}</span>
                                    <Stars value={item.client.ratings?.[key]} size={13} />
                                  </div>
                                ))}
                            </div>

                            {item.client.detailFeedback && (
                              <div style={styles.commentBlock}>
                                <span style={styles.commentLabel}>General Comments</span>
                                <p style={styles.commentText}>{item.client.detailFeedback}</p>
                              </div>
                            )}

                            {item.client.strengths && (
                              <div style={styles.commentBlock}>
                                <span style={styles.commentLabel}>Strengths</span>
                                <p style={styles.commentText}>{item.client.strengths}</p>
                              </div>
                            )}

                            {item.client.areasForImprovement && (
                              <div style={styles.commentBlock}>
                                <span style={styles.commentLabel}>Areas for Improvement</span>
                                <p style={styles.commentText}>{item.client.areasForImprovement}</p>
                              </div>
                            )}

                            {item.client.wouldRecommend != null && (
                              <div style={{
                                ...styles.recommendBadge,
                                color: item.client.wouldRecommend ? 'var(--color-success)' : 'var(--color-danger)',
                                borderColor: item.client.wouldRecommend ? 'var(--color-success)' : 'var(--color-danger)',
                              }}>
                                {item.client.wouldRecommend ? '✓ Recommended for future projects' : '✗ Not recommended for future projects'}
                              </div>
                            )}
                          </div>

                          {/* PM Evaluation */}
                          <div style={{ padding: 12 }}>
                            <h4 style={{ margin: '0 0 8px 0', color: '#10b981', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px' }}>
                              Project Manager Evaluation ({item.pm.clientName})
                            </h4>

                            <div style={styles.ratingBreakdown}>
                              {Object.entries(RATING_LABELS)
                                .filter(([key]) => key !== 'rating')
                                .map(([key, label]) => (
                                  <div key={key} style={styles.ratingRow}>
                                    <span style={styles.ratingLabel}>{label}</span>
                                    <Stars value={item.pm.ratings?.[key]} size={13} />
                                  </div>
                                ))}
                            </div>

                            {item.pm.detailFeedback && (
                              <div style={styles.commentBlock}>
                                <span style={styles.commentLabel}>General Comments</span>
                                <p style={styles.commentText}>{item.pm.detailFeedback}</p>
                              </div>
                            )}

                            {item.pm.strengths && (
                              <div style={styles.commentBlock}>
                                <span style={styles.commentLabel}>Strengths</span>
                                <p style={styles.commentText}>{item.pm.strengths}</p>
                              </div>
                            )}

                            {item.pm.areasForImprovement && (
                              <div style={styles.commentBlock}>
                                <span style={styles.commentLabel}>Areas for Improvement</span>
                                <p style={styles.commentText}>{item.pm.areasForImprovement}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: 12 }}>
                          <div style={styles.ratingBreakdown}>
                            {Object.entries(RATING_LABELS)
                              .filter(([key]) => key !== 'rating')
                              .map(([key, label]) => (
                                <div key={key} style={styles.ratingRow}>
                                  <span style={styles.ratingLabel}>{label}</span>
                                  <Stars value={item.ratings[key]} size={13} />
                                </div>
                              ))}
                          </div>

                          {item.client?.detailFeedback && (
                            <div style={styles.commentBlock}>
                              <span style={styles.commentLabel}>General Comments</span>
                              <p style={styles.commentText}>{item.client.detailFeedback}</p>
                            </div>
                          )}
                          {item.pm?.detailFeedback && (
                            <div style={styles.commentBlock}>
                              <span style={styles.commentLabel}>General Comments</span>
                              <p style={styles.commentText}>{item.pm.detailFeedback}</p>
                            </div>
                          )}

                          {item.client?.strengths && (
                            <div style={styles.commentBlock}>
                              <span style={styles.commentLabel}>Strengths</span>
                              <p style={styles.commentText}>{item.client.strengths}</p>
                            </div>
                          )}
                          {item.pm?.strengths && (
                            <div style={styles.commentBlock}>
                              <span style={styles.commentLabel}>Strengths</span>
                              <p style={styles.commentText}>{item.pm.strengths}</p>
                            </div>
                          )}

                          {item.client?.areasForImprovement && (
                            <div style={styles.commentBlock}>
                              <span style={styles.commentLabel}>Areas for Improvement</span>
                              <p style={styles.commentText}>{item.client.areasForImprovement}</p>
                            </div>
                          )}
                          {item.pm?.areasForImprovement && (
                            <div style={styles.commentBlock}>
                              <span style={styles.commentLabel}>Areas for Improvement</span>
                              <p style={styles.commentText}>{item.pm.areasForImprovement}</p>
                            </div>
                          )}

                          {item.client?.wouldRecommend != null && (
                            <div style={{
                              ...styles.recommendBadge,
                              color: item.client.wouldRecommend ? 'var(--color-success)' : 'var(--color-danger)',
                              borderColor: item.client.wouldRecommend ? 'var(--color-success)' : 'var(--color-danger)',
                            }}>
                              {item.client.wouldRecommend ? '✓ Recommended for future projects' : '✗ Not recommended for future projects'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  pageHeader: { marginBottom: 24 },
  pageTitle: {
    fontFamily: 'var(--font-heading)',
    fontSize: 24,
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  pageSubtitle: {
    fontSize: 13,
    color: 'var(--color-text-secondary)',
    marginTop: 6,
  },
  centerMsg: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '60px 0',
    color: 'var(--color-text-secondary)',
  },
  retryBtn: {
    padding: '8px 16px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card-hover)',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
  },
  emptyState: {
    padding: '40px 24px',
    textAlign: 'center',
    color: 'var(--color-text-secondary)',
    border: '1px dashed var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 14,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 16,
    marginBottom: 32,
  },
  summaryCard: {
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '18px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  overallCard: {
    gridColumn: 'span 1',
  },
  summaryLabel: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  overallNumber: {
    fontSize: 32,
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    lineHeight: 1.1,
  },
  categoryNumber: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    lineHeight: 1.1,
  },
  reviewCount: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
    marginTop: 4,
  },
  recommendPill: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-primary)',
    background: 'var(--color-primary-light)',
    padding: '4px 10px',
    borderRadius: 20,
    width: 'fit-content',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    marginBottom: 14,
  },
  feedbackList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  feedbackCard: {
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  },
  feedbackCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px',
    cursor: 'pointer',
  },
  feedbackProject: {
    display: 'block',
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  feedbackMeta: {
    display: 'block',
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    marginTop: 2,
  },
  expandIcon: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
  },
  feedbackCardBody: {
    padding: '0 18px 18px 18px',
    borderTop: '1px solid var(--color-border)',
    paddingTop: 14,
  },
  ratingBreakdown: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 10,
    marginBottom: 14,
  },
  ratingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  ratingLabel: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
  },
  commentBlock: {
    marginBottom: 12,
  },
  commentLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  commentText: {
    fontSize: 13,
    color: 'var(--color-text-primary)',
    marginTop: 4,
    lineHeight: 1.5,
  },
  recommendBadge: {
    display: 'inline-block',
    fontSize: 12,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 20,
    border: '1px solid',
  },
};