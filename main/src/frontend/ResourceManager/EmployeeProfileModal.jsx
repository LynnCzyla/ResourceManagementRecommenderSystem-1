// main/src/frontend/ResourceManager/EmployeeProfileModal.jsx
import React, { useState, useEffect } from 'react';
import { fetchEmployeePerformance } from './Rmapi';

const EmployeeProfileModal = ({ 
  employee, 
  onClose, 
  matchedSkills = [], 
  missingSkills = [], 
  performanceRating = 0,
  status = 'Not Recommended',
  hasPerformanceData = false,
  requirementId = null
}) => {
  const [loading, setLoading] = useState(false);
  const [performanceData, setPerformanceData] = useState(null);

  useEffect(() => {
    if (employee && employee.id) {
      loadPerformance();
    }
  }, [employee]);

  const loadPerformance = async () => {
    setLoading(true);
    try {
      const data = await fetchEmployeePerformance(employee.id);
      setPerformanceData(data.data);
    } catch (error) {
      console.error('Error loading performance:', error);
      // Use passed props as fallback
      setPerformanceData({
        averageRating: performanceRating || 0,
        ratingCount: 0,
        hasData: hasPerformanceData,
        ratings: [],
        technicalSkills: 0,
        communication: 0,
        timeliness: 0,
        qualityOfWork: 0,
        teamwork: 0,
        problemSolving: 0,
        strengths: null,
        areasForImprovement: null,
        recentFeedback: []
      });
    } finally {
      setLoading(false);
    }
  };

  if (!employee) return null;

  // ✅ Updated: Check hasData before rendering stars
  const renderStars = (rating, hasData) => {
    if (!hasData || rating === 0) {
      return (
        <span style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>
          No performance data yet
        </span>
      );
    }
    
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5 ? 1 : 0;
    const emptyStars = 5 - fullStars - halfStar;
    
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        {[...Array(fullStars)].map((_, i) => (
          <span key={`full-${i}`} style={{ color: '#f59e0b', fontSize: '20px' }}>★</span>
        ))}
        {halfStar === 1 && <span style={{ color: '#f59e0b', fontSize: '20px' }}>☆</span>}
        {[...Array(emptyStars)].map((_, i) => (
          <span key={`empty-${i}`} style={{ color: '#d1d5db', fontSize: '20px' }}>☆</span>
        ))}
      </span>
    );
  };

  const getStatusColor = (status) => {
    const statusMap = {
      'Strongly Recommended': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
      'Recommended': { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
      'Consider': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
      'Not Recommended': { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' }
    };
    return statusMap[status] || { color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)' };
  };

  const statusInfo = getStatusColor(status);
  
  // Use performance data from API or fallback to props
  const perf = performanceData || {
    averageRating: performanceRating,
    ratingCount: 0,
    hasData: hasPerformanceData,
    technicalSkills: 0,
    communication: 0,
    timeliness: 0,
    qualityOfWork: 0,
    teamwork: 0,
    problemSolving: 0,
    strengths: null,
    areasForImprovement: null,
    recentFeedback: []
  };

  const avgRating = perf.averageRating || performanceRating || 0;
  const hasData = perf.hasData || hasPerformanceData;

  // Render rating bars
  const renderRatingBar = (label, value, max = 5) => {
    const percentage = Math.min((value / max) * 100, 100);
    const color = value >= 4 ? '#22c55e' : value >= 3 ? '#f59e0b' : '#ef4444';
    
    return (
      <div style={barStyles.container}>
        <span style={barStyles.label}>{label}</span>
        <div style={barStyles.barContainer}>
          <div style={{
            ...barStyles.bar,
            width: `${percentage}%`,
            backgroundColor: color,
          }} />
        </div>
        <span style={barStyles.value}>{value.toFixed(1)}</span>
      </div>
    );
  };

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>Employee Profile</h2>
          <button onClick={onClose} style={modalStyles.closeBtn}>×</button>
        </div>

        <div style={modalStyles.content}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div style={modalStyles.loadingSpinner}></div>
              <p style={{ marginTop: '16px', color: 'var(--color-text-muted)' }}>Loading performance data...</p>
            </div>
          ) : (
            <>
              {/* Employee Info */}
              <div style={modalStyles.profileSection}>
                <div style={modalStyles.avatarLarge}>
                  {employee.firstName?.[0]}{employee.lastName?.[0]}
                </div>
                <div style={modalStyles.employeeInfo}>
                  <h3 style={modalStyles.employeeName}>{employee.name}</h3>
                  <p style={modalStyles.employeeRole}>{employee.role || 'Employee'}</p>
                  <p style={modalStyles.employeeDepartment}>{employee.department || 'No Department'}</p>
                </div>
              </div>

              {/* Status & Performance */}
              <div style={modalStyles.statsGrid}>
                <div style={modalStyles.statCard}>
                  <div style={modalStyles.statLabel}>Recommendation Status</div>
                  <div style={{
                    ...modalStyles.statValue,
                    color: statusInfo.color,
                    backgroundColor: statusInfo.bg,
                    padding: '4px 12px',
                    borderRadius: '12px',
                    display: 'inline-block',
                  }}>
                    {status}
                  </div>
                </div>
                <div style={modalStyles.statCard}>
                  <div style={modalStyles.statLabel}>Performance Rating</div>
                  <div style={modalStyles.statValue}>
                    {renderStars(avgRating, hasData)}
                    {hasData && avgRating > 0 && (
                      <span style={{ fontSize: '14px', marginLeft: '8px', color: 'var(--color-text-muted)' }}>
                        ({avgRating.toFixed(1)} / 5.0)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    {hasData && perf.ratingCount > 0 
                      ? `Based on ${perf.ratingCount} ${perf.ratingCount === 1 ? 'review' : 'reviews'}`
                      : 'Waiting for client feedback'
                    }
                  </div>
                </div>
              </div>

              {/* Detailed Ratings - Only show if there's data */}
              {hasData && perf.ratingCount > 0 && (
                <div style={modalStyles.detailedRatings}>
                  <h4 style={modalStyles.sectionTitle}>Detailed Ratings</h4>
                  <div style={barStyles.grid}>
                    {renderRatingBar('Technical Skills', perf.technicalSkills || 0)}
                    {renderRatingBar('Communication', perf.communication || 0)}
                    {renderRatingBar('Timeliness', perf.timeliness || 0)}
                    {renderRatingBar('Quality of Work', perf.qualityOfWork || 0)}
                    {renderRatingBar('Teamwork', perf.teamwork || 0)}
                    {renderRatingBar('Problem Solving', perf.problemSolving || 0)}
                  </div>
                </div>
              )}

              {/* Strengths & Areas for Improvement */}
              {(perf.strengths || perf.areasForImprovement) && (
                <div style={modalStyles.feedbackSection}>
                  {perf.strengths && (
                    <div style={modalStyles.feedbackItem}>
                      <span style={{ color: '#22c55e', fontWeight: '600' }}>✓ Strengths:</span>
                      <span style={{ marginLeft: '8px', color: 'var(--color-text-secondary)' }}>
                        {perf.strengths}
                      </span>
                    </div>
                  )}
                  {perf.areasForImprovement && (
                    <div style={modalStyles.feedbackItem}>
                      <span style={{ color: '#ef4444', fontWeight: '600' }}>○ Areas for Improvement:</span>
                      <span style={{ marginLeft: '8px', color: 'var(--color-text-secondary)' }}>
                        {perf.areasForImprovement}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Skills Match */}
              <div style={modalStyles.skillsSection}>
                <h4 style={modalStyles.sectionTitle}>Skill Match Details</h4>
                
                <div style={modalStyles.skillGroup}>
                  <div style={modalStyles.skillGroupHeader}>
                    <span style={{ color: '#22c55e' }}>✓ Matched Skills ({matchedSkills.length})</span>
                  </div>
                  <div style={modalStyles.skillList}>
                    {matchedSkills.length > 0 ? (
                      matchedSkills.map((skill, i) => (
                        <span key={i} style={modalStyles.matchedSkill}>{skill}</span>
                      ))
                    ) : (
                      <span style={modalStyles.noSkills}>No matched skills</span>
                    )}
                  </div>
                </div>

                <div style={modalStyles.skillGroup}>
                  <div style={modalStyles.skillGroupHeader}>
                    <span style={{ color: '#ef4444' }}>✗ Missing Skills ({missingSkills.length})</span>
                  </div>
                  <div style={modalStyles.skillList}>
                    {missingSkills.length > 0 ? (
                      missingSkills.map((skill, i) => (
                        <span key={i} style={modalStyles.missingSkill}>{skill.skill}</span>
                      ))
                    ) : (
                      <span style={modalStyles.noSkills}>No missing skills</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Recent Feedback - Only show if there's data */}
              {hasData && perf.recentFeedback && perf.recentFeedback.length > 0 && (
                <div style={modalStyles.feedbackSection}>
                  <h4 style={modalStyles.sectionTitle}>Recent Feedback</h4>
                  {perf.recentFeedback.map((fb, i) => (
                    <div key={i} style={modalStyles.feedbackCard}>
                      <div style={modalStyles.feedbackHeader}>
                        <span style={{ fontWeight: '500' }}>
                          {fb.clientName || 'Client'}
                        </span>
                        <span style={modalStyles.feedbackRating}>
                          {renderStars(fb.rating, true)}
                        </span>
                      </div>
                      {fb.feedback && (
                        <p style={modalStyles.feedbackText}>"{fb.feedback}"</p>
                      )}
                      {fb.projectName && (
                        <p style={modalStyles.feedbackProject}>Project: {fb.projectName}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div style={modalStyles.footer}>
          <button onClick={onClose} style={modalStyles.closeBtnLarge}>Close</button>
        </div>
      </div>
    </div>
  );
};

const modalStyles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  modal: {
    background: 'var(--color-bg-card)',
    borderRadius: '16px',
    width: '90%',
    maxWidth: '650px',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
    border: '1px solid var(--color-border)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid var(--color-border)',
    position: 'sticky',
    top: 0,
    background: 'var(--color-bg-card)',
    borderRadius: '16px 16px 0 0',
    zIndex: 1,
  },
  title: {
    fontSize: '20px',
    fontWeight: '700',
    margin: 0,
    color: 'var(--color-text-primary)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '28px',
    cursor: 'pointer',
    color: 'var(--color-text-muted)',
    padding: '0 8px',
    lineHeight: 1,
  },
  content: {
    padding: '24px',
  },
  profileSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
    paddingBottom: '24px',
    borderBottom: '1px solid var(--color-border)',
  },
  avatarLarge: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-primary)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '28px',
    fontWeight: '700',
    flexShrink: 0,
  },
  employeeInfo: {
    flex: 1,
  },
  employeeName: {
    fontSize: '20px',
    fontWeight: '700',
    margin: '0 0 4px 0',
    color: 'var(--color-text-primary)',
  },
  employeeRole: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    margin: '0 0 2px 0',
  },
  employeeDepartment: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    margin: 0,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '24px',
  },
  statCard: {
    background: 'var(--color-bg-root)',
    borderRadius: '12px',
    padding: '16px',
    border: '1px solid var(--color-border)',
  },
  statLabel: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    marginBottom: '8px',
    fontWeight: '500',
  },
  statValue: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
  },
  detailedRatings: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: '600',
    margin: '0 0 12px 0',
    color: 'var(--color-text-primary)',
  },
  skillsSection: {
    marginTop: '8px',
    marginBottom: '24px',
  },
  skillGroup: {
    marginBottom: '12px',
  },
  skillGroupHeader: {
    fontSize: '13px',
    fontWeight: '600',
    marginBottom: '6px',
    color: 'var(--color-text-secondary)',
  },
  skillList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  matchedSkill: {
    fontSize: '12px',
    color: '#22c55e',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    padding: '4px 12px',
    borderRadius: '6px',
    fontWeight: '500',
  },
  missingSkill: {
    fontSize: '12px',
    color: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: '4px 12px',
    borderRadius: '6px',
    fontWeight: '500',
  },
  noSkills: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
  },
  feedbackSection: {
    marginBottom: '24px',
    paddingTop: '16px',
    borderTop: '1px solid var(--color-border)',
  },
  feedbackItem: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    marginBottom: '6px',
    lineHeight: '1.5',
  },
  feedbackCard: {
    backgroundColor: 'var(--color-bg-root)',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '8px',
    border: '1px solid var(--color-border)',
  },
  feedbackHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  feedbackRating: {
    fontSize: '12px',
  },
  feedbackText: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    margin: '4px 0',
    fontStyle: 'italic',
  },
  feedbackProject: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    margin: '4px 0 0 0',
  },
  footer: {
    padding: '16px 24px',
    borderTop: '1px solid var(--color-border)',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  closeBtnLarge: {
    backgroundColor: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    padding: '10px 32px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid var(--color-border)',
    borderTop: '4px solid var(--color-primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};

// Bar Styles
const barStyles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '6px',
  },
  label: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    width: '110px',
    flexShrink: 0,
  },
  barContainer: {
    flex: 1,
    height: '6px',
    backgroundColor: 'var(--color-border)',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.6s ease',
  },
  value: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    width: '32px',
    textAlign: 'right',
    flexShrink: 0,
  },
  grid: {
    marginTop: '8px',
  },
};

export default EmployeeProfileModal;