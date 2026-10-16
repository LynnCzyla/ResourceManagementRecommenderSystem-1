import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import RMAvatar from './RMAvatar';

const SEVERITY_CONFIG = {
  Critical: {
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.3)',
    label: 'Critical',
  },
  High: {
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.15)',
    border: 'rgba(245, 158, 11, 0.3)',
    label: 'High',
  },
  Medium: {
    color: '#eab308',
    bg: 'rgba(234, 179, 8, 0.15)',
    border: 'rgba(234, 179, 8, 0.3)',
    label: 'Medium',
  },
  Covered: {
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.15)',
    border: 'rgba(34, 197, 94, 0.3)',
    label: 'Covered',
  },
};

export default function SkillGapChart({ skills = [], summary = null }) {
  const [selectedSkill, setSelectedSkill] = useState(null);

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedSkill(null);
      }
    };
    if (selectedSkill) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSkill]);

  // Empty state
  if (!skills || skills.length === 0) {
    return (
      <div style={styles.insufficientDataCard}>
        <span style={styles.insufficientDataText}>Insufficient data</span>
        <span style={styles.insufficientDataSubtext}>
          No open PM requests with skill requirements.
        </span>
      </div>
    );
  }

  // Shared max scale for visual bar alignment
  const maxVal = Math.max(
    1,
    ...skills.map((s) => Math.max(Number(s.demand) || 0, Number(s.supply) || 0))
  );

  const criticalCount = summary?.critical ?? skills.filter((s) => s.severity === 'Critical').length;
  const highCount = summary?.high ?? skills.filter((s) => s.severity === 'High').length;
  const coveredCount = summary?.covered ?? skills.filter((s) => s.severity === 'Covered').length;
  const requestsAffected = summary?.requestsAffected ?? 0;

  // Filter skills requiring attention (Critical, High, Medium gaps)
  const skillsNeedingAttention = skills.filter((s) => s.gap > 0 || s.severity !== 'Covered');

  // Overall Coverage calculation: total positions filled vs required demand
  const totalDemandPositions = skills.reduce((acc, s) => acc + (Number(s.demand) || 0), 0);
  const totalMetPositions = skills.reduce(
    (acc, s) => acc + Math.min(Number(s.demand) || 0, Number(s.supply) || 0),
    0
  );
  const coveragePct =
    summary?.coveragePct != null
      ? summary.coveragePct
      : totalDemandPositions > 0
      ? Math.round((totalMetPositions / totalDemandPositions) * 100)
      : summary?.covered && summary?.totalSkills
      ? Math.round((summary.covered / summary.totalSkills) * 100)
      : 50;

  return (
    <div style={styles.metricCard}>
      {/* ── 3rd Pic: Keep the KPI Strip at the Top ── */}
      <div style={styles.kpiStrip}>
        <div style={styles.kpiItem} title="Primary skills needed with 0 available staff in this branch">
          <span style={styles.kpiLabel}>CRITICAL GAPS</span>
          <span style={{ ...styles.kpiVal, color: 'var(--color-danger, #ef4444)' }}>
            {criticalCount}
          </span>
        </div>
        <div style={styles.kpiItem} title="Primary skills where demand exceeds available staff">
          <span style={styles.kpiLabel}>HIGH PRIORITY</span>
          <span style={{ ...styles.kpiVal, color: 'var(--color-warning, #f59e0b)' }}>
            {highCount}
          </span>
        </div>
        <div style={styles.kpiItem} title="Skills with adequate available branch workforce">
          <span style={styles.kpiLabel}>COVERED SKILLS</span>
          <span style={{ ...styles.kpiVal, color: 'var(--color-success, #22c55e)' }}>
            {coveredCount}
          </span>
        </div>
        <div style={styles.kpiItem} title="Total distinct open PM requests requiring skills">
          <span style={styles.kpiLabel}>REQUESTS AFFECTED</span>
          <span style={{ ...styles.kpiVal, color: '#38bdf8' }}>
            {requestsAffected}
          </span>
        </div>
      </div>

      {/* ── 1st Pic: Section 1. Demand vs. Available Supply (Scrollable) ── */}
      <div style={styles.sectionBlock}>
        <div style={styles.sectionHeader}>
          <h4 style={styles.sectionTitle}>1. Demand vs. Available Supply</h4>
          <span style={styles.sectionSubtitle}>
            Unfulfilled demand vs. available branch workforce by skill.
          </span>
        </div>

        {/* Scrollable Container so it doesn't make the card too long */}
        <div style={styles.scrollableListSection}>
          {skills.map((item, index) => {
            const demand = Number(item.demand) || 0;
            const supply = Number(item.supply) || 0;
            const demandWidth = Math.max(4, (demand / maxVal) * 100);
            const supplyWidth = (supply / maxVal) * 100;

            return (
              <div key={`demand-supply-${item.skill}-${index}`} style={styles.skillItemRow}>
                {/* Name on left, "X/Y available" and clean eye icon (Pic 3) on right */}
                <div style={styles.skillRowHeader}>
                  <div style={styles.skillNameGroup}>
                    <span style={styles.skillNameText} title={item.skill}>
                      {item.skill}
                    </span>
                    {/* Clean eye icon button matching Pic 3 (no box/border) */}
                    <button
                      type="button"
                      onClick={() => setSelectedSkill(item)}
                      style={styles.cleanEyeBtn}
                      title={`View details for "${item.skill}"`}
                      aria-label={`View details for ${item.skill}`}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  </div>

                  <span style={styles.availableCountText}>
                    {supply}/{demand} available
                  </span>
                </div>

                {/* Stacked Bars: Blue Demand Bar + Green Available Supply Bar */}
                <div style={styles.dualBarWrap}>
                  {/* Demand bar (blue) */}
                  <div style={styles.barTrackBackground}>
                    <div
                      style={{
                        ...styles.singleBar,
                        width: `${demandWidth}%`,
                        backgroundColor: '#3b82f6',
                      }}
                      title={`Demand: ${demand}`}
                    />
                  </div>

                  {/* Available supply bar (green) */}
                  <div style={styles.barTrackBackground}>
                    <div
                      style={{
                        ...styles.singleBar,
                        width: `${supplyWidth}%`,
                        backgroundColor: '#22c55e',
                      }}
                      title={`Available supply: ${supply}`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Section 1 Legend (from 1st Pic) */}
        <div style={styles.subLegendRow}>
          <div style={styles.legendItem}>
            <span style={{ ...styles.legendBox, backgroundColor: '#3b82f6' }} />
            <span style={styles.legendLabelText}>Demand</span>
          </div>
          <div style={styles.legendItem}>
            <span style={{ ...styles.legendBox, backgroundColor: '#22c55e' }} />
            <span style={styles.legendLabelText}>Available supply</span>
          </div>
        </div>
      </div>

      <div style={styles.dividerLine} />

      {/* ── 1st Pic: Section 2. Top Skills Requiring Attention (Scrollable, NO view icon) ── */}
      <div style={styles.sectionBlock}>
        <div style={styles.sectionHeader}>
          <h4 style={styles.sectionTitle}>2. Top Skills Requiring Attention</h4>
          <span style={styles.sectionSubtitle}>
            A ranked list of skills with the largest shortages, with critical gaps first.
          </span>
        </div>

        <div style={styles.scrollableAttentionSection}>
          {skillsNeedingAttention.length === 0 ? (
            <div style={styles.emptyAttentionState}>
              All open skill requirements are currently covered by available staff.
            </div>
          ) : (
            skillsNeedingAttention.map((item, index) => {
              const cfg = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.Critical;
              return (
                <div key={`attention-${item.skill}-${index}`} style={styles.attentionRow}>
                  <div style={styles.attentionLeftGroup}>
                    <span style={styles.attentionSkillName} title={item.skill}>
                      {item.skill}
                    </span>
                  </div>

                  <span
                    style={{
                      ...styles.severityPillBadge,
                      color: cfg.color,
                      backgroundColor: cfg.bg,
                    }}
                  >
                    {cfg.label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div style={styles.dividerLine} />

      {/* ── 1st Pic: Section 3. Overall Skill Coverage ── */}
      <div style={styles.sectionBlock}>
        <div style={styles.sectionHeader}>
          <h4 style={styles.sectionTitle}>3. Overall Skill Coverage</h4>
        </div>

        <div style={styles.coverageRow}>
          <span style={styles.coverageLabel}>Covered</span>
          <span style={styles.coveragePctText}>{coveragePct}%</span>
        </div>

        <div style={styles.coverageTrack}>
          <div
            style={{
              ...styles.coverageBarFill,
              width: `${Math.min(100, Math.max(0, coveragePct))}%`,
            }}
          />
        </div>

        <span style={styles.coverageFooterNote}>
          Calculated using actual covered and total requirements.
        </span>
      </div>

      {/* ── Interactive Skill Detail Breakdown Modal (Rendered via Portal onto document.body) ── */}
      {selectedSkill && typeof document !== 'undefined' && createPortal(
        <div
          style={styles.modalOverlay}
          onClick={() => setSelectedSkill(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={styles.modalHeader}>
              <div style={styles.modalTitleGroup}>
                <h3 style={styles.modalTitle}>{selectedSkill.skill}</h3>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span
                    style={{
                      ...styles.typeBadge,
                      backgroundColor:
                        selectedSkill.type === 'Primary'
                          ? 'rgba(59, 130, 246, 0.15)'
                          : 'rgba(100, 116, 139, 0.15)',
                      color:
                        selectedSkill.type === 'Primary'
                          ? '#38bdf8'
                          : '#94a3b8',
                    }}
                  >
                    {selectedSkill.type} Requirement
                  </span>
                  <span
                    style={{
                      ...styles.severityPillBadge,
                      backgroundColor: (SEVERITY_CONFIG[selectedSkill.severity] || SEVERITY_CONFIG.Covered).bg,
                      color: (SEVERITY_CONFIG[selectedSkill.severity] || SEVERITY_CONFIG.Covered).color,
                    }}
                  >
                    {selectedSkill.severity} Status
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSkill(null)}
                style={styles.modalCloseBtn}
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Modal Quick KPI Strip */}
            <div style={styles.modalKpiGrid}>
              <div style={styles.modalKpiCard}>
                <span style={styles.modalKpiLabel}>Required Demand</span>
                <span style={{ ...styles.modalKpiVal, color: '#38bdf8' }}>
                  {selectedSkill.demand} position{selectedSkill.demand !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={styles.modalKpiCard}>
                <span style={styles.modalKpiLabel}>Available Supply</span>
                <span style={{ ...styles.modalKpiVal, color: '#22c55e' }}>
                  {selectedSkill.supply} employee{selectedSkill.supply !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={styles.modalKpiCard}>
                <span style={styles.modalKpiLabel}>Net Gap / Deficit</span>
                <span
                  style={{
                    ...styles.modalKpiVal,
                    color:
                      selectedSkill.gap > 0
                        ? '#ef4444'
                        : '#22c55e',
                  }}
                >
                  {selectedSkill.gap > 0 ? `-${selectedSkill.gap}` : '0 (Covered)'}
                </span>
              </div>
              <div style={styles.modalKpiCard}>
                <span style={styles.modalKpiLabel}>Open Requests</span>
                <span style={{ ...styles.modalKpiVal, color: '#f8fafc' }}>
                  {selectedSkill.requests} request{selectedSkill.requests !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Recognized Aliases / Wordings */}
            {selectedSkill.aliases && selectedSkill.aliases.length > 0 && (
              <div style={styles.modalSection}>
                <div style={styles.modalSectionTitle}>Recognized Equivalent Wordings &amp; Aliases</div>
                <div style={styles.tagWrap}>
                  {selectedSkill.aliases.map((alias, i) => (
                    <span key={i} style={styles.aliasChip}>
                      🏷️ {alias}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Section 1: Demanding PM Requests */}
            <div style={styles.modalSection}>
              <div style={styles.modalSectionTitle}>
                Active PM Requests Needing This Skill ({selectedSkill.requestDetails?.length || selectedSkill.requests})
              </div>
              <div style={styles.modalTableWrap}>
                <table style={styles.modalTable}>
                  <thead>
                    <tr>
                      <th style={styles.modalTh}>Project</th>
                      <th style={styles.modalTh}>Role Title</th>
                      <th style={styles.modalTh}>Needed</th>
                      <th style={styles.modalTh}>Type</th>
                      <th style={styles.modalTh}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedSkill.requestDetails || []).map((req, i) => (
                      <tr key={req.id || i} style={styles.modalTr}>
                        <td style={styles.modalTd}>
                          <span style={{ fontWeight: '600', color: '#f8fafc' }}>
                            {req.projectName}
                          </span>
                        </td>
                        <td style={styles.modalTd}>{req.roleTitle}</td>
                        <td style={styles.modalTd}>
                          <strong style={{ color: '#f8fafc' }}>{req.quantityNeeded}</strong>
                        </td>
                        <td style={styles.modalTd}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: '600',
                              color: req.type === 'Primary' ? '#38bdf8' : '#94a3b8',
                            }}
                          >
                            {req.type}
                          </span>
                        </td>
                        <td style={styles.modalTd}>
                          <span style={styles.statusBadge}>{req.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 2: Available Branch Staff with Matched Wording */}
            <div style={styles.modalSection}>
              <div style={styles.modalSectionTitle}>
                Available Branch Staff ({selectedSkill.matchedEmployees?.length || selectedSkill.supply})
              </div>

              {(!selectedSkill.matchedEmployees || selectedSkill.matchedEmployees.length === 0) ? (
                <div style={styles.noStaffCard}>
                  <span style={styles.noStaffTitle}>No available staff in this branch</span>
                  <span style={styles.noStaffSubtext}>
                    Zero branch employees possess &quot;{selectedSkill.skill}&quot; or compatible equivalents.
                    {selectedSkill.type === 'Primary'
                      ? ' Immediate external hiring or cross-branch reallocation is recommended.'
                      : ' Consider task pairing or skill training.'}
                  </span>
                </div>
              ) : (
                <div style={styles.empListGrid}>
                  {selectedSkill.matchedEmployees.map((emp) => (
                    <div key={emp.id} style={styles.empCard}>
                      <RMAvatar name={emp.name} src={emp.avatar} size={34} />
                      <div style={styles.empInfoCol}>
                        <div style={styles.empNameRow}>
                          <span style={styles.empName}>{emp.name}</span>
                          <span
                            style={{
                              ...styles.workloadBadge,
                              color:
                                emp.workloadStatus === 'Available'
                                  ? '#22c55e'
                                  : '#f59e0b',
                              backgroundColor:
                                emp.workloadStatus === 'Available'
                                  ? 'rgba(34, 197, 94, 0.15)'
                                  : 'rgba(245, 158, 11, 0.15)',
                            }}
                          >
                            {emp.workloadStatus}
                          </span>
                        </div>
                        <div style={styles.empMetaRow}>
                          <span>{emp.role} • {emp.department}</span>
                        </div>
                        {emp.matchedSkill && (
                          <div style={styles.matchedSkillRow} title={`Profile wording: "${emp.matchedSkill}"`}>
                            <span style={styles.matchedSkillLabel}>Profile Skill:</span>
                            <span style={styles.matchedSkillValue}>&ldquo;{emp.matchedSkill}&rdquo;</span>
                            {emp.matchReason && (
                              <span style={styles.matchReasonTag}>({emp.matchReason})</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const styles = {
  insufficientDataCard: {
    border: '1px dashed var(--color-border)',
    borderRadius: '10px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  insufficientDataText: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--color-text-secondary)',
  },
  insufficientDataSubtext: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    textAlign: 'center',
  },
  metricCard: {
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '20px',
    backgroundColor: 'rgba(255, 255, 255, 0.015)',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    marginTop: '8px',
    textAlign: 'left',
  },

  // KPI Strip (from 3rd pic)
  kpiStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '16px',
  },
  kpiItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    textAlign: 'left',
  },
  kpiLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--color-text-secondary, #94a3b8)',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  kpiVal: {
    fontSize: '24px',
    fontWeight: '800',
    cursor: 'default',
    lineHeight: 1.1,
  },

  // Section Block Styles (from 1st pic)
  sectionBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  sectionHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  sectionSubtitle: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    lineHeight: '1.4',
  },

  // Scrollable container for Section 1
  scrollableListSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    maxHeight: '260px',
    overflowY: 'auto',
    paddingRight: '6px',
  },
  skillItemRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  skillRowHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  skillNameGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
    flex: 1,
  },
  skillNameText: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  // Clean Eye Button matching Pic 3 (no box/border)
  cleanEyeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-secondary, #94a3b8)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: '2px',
    lineHeight: 1,
    flexShrink: 0,
    borderRadius: '3px',
    transition: 'color 0.15s ease, transform 0.15s ease',
  },

  availableCountText: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontWeight: '500',
    flexShrink: 0,
  },
  dualBarWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  barTrackBackground: {
    width: '100%',
    height: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  singleBar: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },

  // Legend under Section 1
  subLegendRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    marginTop: '6px',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  legendBox: {
    width: '10px',
    height: '10px',
    borderRadius: '2px',
    display: 'inline-block',
  },
  legendLabelText: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    fontWeight: '500',
  },

  dividerLine: {
    height: '1px',
    backgroundColor: 'var(--color-border)',
    width: '100%',
    margin: '4px 0',
  },

  // Scrollable container for Section 2 (NO view icon)
  scrollableAttentionSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxHeight: '190px',
    overflowY: 'auto',
    paddingRight: '6px',
  },
  emptyAttentionState: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
    padding: '8px 0',
  },
  attentionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '4px 0',
  },
  attentionLeftGroup: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    flex: 1,
  },
  attentionSkillName: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  severityPillBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '3px 10px',
    borderRadius: '30px',
    textTransform: 'capitalize',
    letterSpacing: '0.2px',
    flexShrink: 0,
  },

  // Section 3: Overall Skill Coverage
  coverageRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2px',
  },
  coverageLabel: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  coveragePctText: {
    fontSize: '14px',
    fontWeight: '800',
    color: '#22c55e',
  },
  coverageTrack: {
    width: '100%',
    height: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  coverageBarFill: {
    height: '100%',
    backgroundColor: '#22c55e',
    borderRadius: '4px',
    transition: 'width 0.4s ease',
  },
  coverageFooterNote: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    marginTop: '3px',
  },

  typeBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },

  // Modal Styles (Rendered via createPortal to document.body)
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(5px)',
    WebkitBackdropFilter: 'blur(5px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  },
  modalCard: {
    width: '90%',
    maxWidth: '680px',
    maxHeight: '85vh',
    overflowY: 'auto',
    padding: '26px',
    borderRadius: '14px',
    backgroundColor: '#0f172a',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    textAlign: 'left',
    color: '#f8fafc',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    paddingBottom: '14px',
  },
  modalTitleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  modalTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '800',
    color: '#ffffff',
  },
  modalCloseBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '18px',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '4px 8px',
    lineHeight: 1,
    borderRadius: '4px',
  },
  modalKpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '10px',
  },
  modalKpiCard: {
    padding: '10px 12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  modalKpiLabel: {
    fontSize: '10px',
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#94a3b8',
    letterSpacing: '0.3px',
  },
  modalKpiVal: {
    fontSize: '14px',
    fontWeight: '800',
    color: '#ffffff',
  },
  modalSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  modalSectionTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  tagWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  aliasChip: {
    fontSize: '11px',
    fontWeight: '600',
    padding: '3px 8px',
    borderRadius: '4px',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.25)',
  },
  modalTableWrap: {
    overflowX: 'auto',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  modalTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
  },
  modalTh: {
    padding: '10px 12px',
    textAlign: 'left',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  modalTr: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  modalTd: {
    padding: '10px 12px',
    color: '#cbd5e1',
    verticalAlign: 'middle',
  },
  statusBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: '30px',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    color: '#f59e0b',
    display: 'inline-block',
  },
  noStaffCard: {
    padding: '16px',
    borderRadius: '8px',
    border: '1px dashed rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  noStaffTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#ef4444',
  },
  noStaffSubtext: {
    fontSize: '12px',
    color: '#94a3b8',
    lineHeight: 1.5,
  },
  empListGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '10px',
  },
  empCard: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  },
  empInfoCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    minWidth: 0,
    flex: 1,
  },
  empNameRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  empName: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#ffffff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  workloadBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '2px 6px',
    borderRadius: '4px',
    flexShrink: 0,
  },
  empMetaRow: {
    fontSize: '11px',
    color: '#94a3b8',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  matchedSkillRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginTop: '3px',
    fontSize: '11px',
    flexWrap: 'wrap',
  },
  matchedSkillLabel: {
    color: '#64748b',
    fontSize: '10px',
  },
  matchedSkillValue: {
    fontWeight: '600',
    color: '#e2e8f0',
  },
  matchReasonTag: {
    fontSize: '9px',
    fontWeight: '600',
    padding: '1px 4px',
    borderRadius: '3px',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    color: '#38bdf8',
  },
};
