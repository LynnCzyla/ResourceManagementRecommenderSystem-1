import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { supabase } from '../../lib/supabaseClient';

const API_URL = 'http://localhost:5000/api';

export default function SkillFeedbackModal({ 
    isOpen, 
    onClose, 
    documentId, 
    employeeId, 
    needsReview = [],      // ← Only pending skills
    // Original ML prediction/confidence per needs-review skill, e.g.
    // { "Electrical Design": { prediction: "Skill", confidence: 0.82 } }.
    // Comes straight from the backend (nlp.needs_review_predictions) -
    // never regenerated here.
    needsReviewPredictions = {},
    // Same idea, for skills the backend ML-auto-approved (>= 0.85
    // confidence) - previously had no prediction/confidence carried
    // anywhere; comes from nlp.auto_approved_predictions.
    autoApprovedPredictions = {},
    autoApproved = [],     // ← Already approved skills
    documentType = 'Resume',
    documentName = '',     // ← Name of the uploaded file, shown next to the title
    onFeedbackSubmitted,
    onSkip
}) {
    const [approved, setApproved] = useState([]);
    const [rejected, setRejected] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [hasExistingFeedback, setHasExistingFeedback] = useState(false);

    const getAuthHeader = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
        const token = localStorage.getItem('token') || localStorage.getItem('access_token') || localStorage.getItem('sb-wea-auth-token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    // ============ HELPER: Extract skill name from object or string ============
    const getSkillName = (skill) => {
        if (typeof skill === 'string') return skill;
        if (typeof skill === 'object' && skill !== null) {
            return skill.skill_name || skill.skill_tag || skill.skill || skill.name || String(skill);
        }
        return String(skill);
    };

    // ============ HELPER: Normalize skills array ============
    const normalizeSkills = (skills) => {
        if (!Array.isArray(skills)) return [];
        return skills.map(s => getSkillName(s));
    };

    const skillKey = (skill) => getSkillName(skill).toLowerCase().replace(/\s+/g, ' ').trim();

    // ============ HELPER: look up the ORIGINAL ML prediction for a skill ============
    // Case/whitespace-insensitive match against the needsReviewPredictions AND
    // autoApprovedPredictions props (merged - a skill only ever appears in one
    // of the two, but the lookup shouldn't care which). Never computes a new
    // prediction - only reads what the backend already sent.
    const mlPredictionMap = React.useMemo(() => {
        const map = new Map();
        const sources = [needsReviewPredictions, autoApprovedPredictions];
        for (const source of sources) {
            if (source && typeof source === 'object') {
                for (const [name, meta] of Object.entries(source)) {
                    if (meta && typeof meta === 'object') {
                        map.set(skillKey(name), {
                            prediction: meta.prediction ?? null,
                            confidence: typeof meta.confidence === 'number' ? meta.confidence : null
                        });
                    }
                }
            }
        }
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [needsReviewPredictions, autoApprovedPredictions]);

    // ============ FIX: Only reset/refetch when the modal opens for a NEW document ============
    // The old version watched `needsReview` (an array prop). Arrays are recreated on every
    // parent re-render even when their contents haven't changed, so React saw a "new" array
    // on almost every render and re-ran this effect — wiping out `approved`/`rejected` state
    // (setApproved([]); setRejected([]);) while the user was still mid-review. That's why
    // things you'd already approved or rejected kept popping back into the pending list.
    //
    // We only need this effect to run when the modal is opened, or when it's opened for a
    // different document/employee. `needsReview`/`autoApproved` are read directly in the
    // render below and don't need to be dependencies here.
    useEffect(() => {
        if (isOpen && documentId && employeeId) {
            setApproved([]);
            setRejected([]);
            setHasExistingFeedback(false);
            fetchExistingFeedback();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, documentId, employeeId]);

    const fetchExistingFeedback = async () => {
        try {
            const authHeader = await getAuthHeader();
            const response = await axios.get(
                `${API_URL}/employee/pending-feedback/${documentId}?employeeId=${employeeId}`,
                { headers: authHeader }
            );
            if (response.data.success && response.data.data.has_feedback) {
                const data = response.data.data;
                setApproved(data.approved_skills || []);
                setRejected(data.rejected_skills || []);
                setHasExistingFeedback(true);
            }
        } catch (error) {
            console.error('Error fetching existing feedback:', error);
        }
    };

    const handleApprove = (skill) => {
        const skillName = getSkillName(skill);
        const key = skillKey(skillName);
        setApproved(prev => {
            if (prev.some(s => skillKey(s) === key)) return prev;
            return [...prev, skillName];
        });
        setRejected(prev => prev.filter(s => skillKey(s) !== key));
    };

    const handleReject = (skill) => {
        const skillName = getSkillName(skill);
        const key = skillKey(skillName);
        setRejected(prev => {
            if (prev.some(s => skillKey(s) === key)) return prev;
            return [...prev, skillName];
        });
        setApproved(prev => prev.filter(s => skillKey(s) !== key));
    };

    const handleUndo = (skill) => {
        const skillName = getSkillName(skill);
        const key = skillKey(skillName);
        setApproved(prev => prev.filter(s => skillKey(s) !== key));
        setRejected(prev => prev.filter(s => skillKey(s) !== key));
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const authHeader = await getAuthHeader();
            // Auto-approved skills (matched from the knowledge base) must always be
            // saved alongside whatever the user manually approved — otherwise they
            // never reach the employee_skills table.
            const skillsToApprove = nothingToReview
                ? normalizedAutoApproved
                : [...new Set([...normalizedAutoApproved, ...approved])];

            // Build skill_predictions ONLY for the skills being submitted, carrying
            // forward the ORIGINAL ML prediction/confidence unchanged so the backend
            // can store it separately from the human label. Skills with no known ML
            // metadata (e.g. auto-approved ones never went through needs-review) are
            // simply omitted here - the backend stores prediction/confidence as NULL
            // for those rather than inventing a value.
            const skillPredictions = {};
            for (const skillName of [...skillsToApprove, ...rejected]) {
                const meta = mlPredictionMap.get(skillKey(skillName));
                if (meta) {
                    skillPredictions[skillName] = meta;
                }
            }

            const response = await axios.post(
                `${API_URL}/employee/skill-feedback`,
                {
                    documentId,
                    approved_skills: skillsToApprove,
                    rejected_skills: rejected,
                    document_type: documentType,
                    skill_predictions: skillPredictions
                },
                { headers: authHeader }
            );

            if (response.data.success) {
                if (onFeedbackSubmitted) {
                    onFeedbackSubmitted(approved);
                }
                onClose();
            } else {
                alert('Failed to save feedback. Please try again.');
            }
        } catch (error) {
            console.error('Error submitting feedback:', error);
            alert(error.response?.data?.error || 'Failed to save feedback. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSkip = () => {
        if (onSkip) {
            onSkip();
        }
        onClose();
    };

    // ============ Normalize all skill arrays ============
    const rawNormalizedAutoApproved = normalizeSkills(autoApproved);
    const rawNormalizedNeedsReview = normalizeSkills(needsReview);

    // De-duplicate: some skills come back in BOTH the auto-approved list and the
    // needs-review list (same name, different casing/whitespace). If a skill was
    // already auto-approved, it should never also sit in the pending list.
    const autoApprovedKeySet = new Set(
        rawNormalizedAutoApproved.map(s => skillKey(s))
    );
    const normalizedAutoApproved = rawNormalizedAutoApproved;
    const normalizedNeedsReview = rawNormalizedNeedsReview.filter(
        s => !autoApprovedKeySet.has(skillKey(s))
    );

    // Get pending skills (not yet approved or rejected)
    const pendingSkills = normalizedNeedsReview.filter(s => 
        !approved.some(a => skillKey(a) === skillKey(s)) &&
        !rejected.some(r => skillKey(r) === skillKey(s))
    );
    const canSave = !!documentId && !submitting;

    // Nothing needed manual review — every extracted skill matched the knowledge base
    // and was auto-approved. No noise to clean up, so skip the full review UI.
    const nothingToReview = normalizedNeedsReview.length === 0 && normalizedAutoApproved.length > 0;
    // Truly nothing was extracted at all (no auto-approved, no pending)
    const nothingExtracted = normalizedNeedsReview.length === 0 && normalizedAutoApproved.length === 0;

    if (!isOpen) return null;

    return (
        <div style={modalStyles.overlay}>
            <div style={modalStyles.modal}>
                <div style={nothingToReview ? modalStyles.headerSimple : modalStyles.headerSimple}>
                    <div style={modalStyles.headerLeft}>
                        <div style={modalStyles.titleRow}>
                            <h2 style={modalStyles.title}>
                                {nothingToReview ? 'Extracted Skills' : 'Review Extracted Skills'}
                            </h2>
                            {documentName && (
                                <span style={modalStyles.titleFileName}>{documentName}</span>
                            )}
                        </div>
                        <p style={modalStyles.subtitle}>
                            {nothingToReview ? (
                                'Every skill we found already matched your knowledge base — nothing needs your review. It has been saved to your profile.'
                            ) : (
                                <>
                                    {documentType === 'Certificate'
                                        ? 'Review skills extracted from your certificate.'
                                        : 'Review skills extracted from your resume.'
                                    }
                                    {' '}The system will learn from your feedback.
                                </>
                            )}
                        </p>
                    </div>
                    <button onClick={onClose} style={modalStyles.closeBtn}>✕</button>
                </div>

                {/* Badge row is only useful while there's something to review — hide it
                    entirely once everything auto-matched and there's nothing pending.
                    Kept to a single neutral style (like the simple view) instead of
                    four different fill colors, so it reads as calm status text rather
                    than a wall of colored pills. */}
                {!nothingToReview && (
                    <div style={modalStyles.badgeContainer}>
                        {normalizedAutoApproved.length > 0 && (
                            <span style={modalStyles.badge}>
                                Auto-Approved: <strong>{normalizedAutoApproved.length}</strong>
                            </span>
                        )}
                        <span style={modalStyles.badge}>
                            Approved: <strong>{approved.length}</strong>
                        </span>
                        <span style={modalStyles.badge}>
                            Rejected: <strong>{rejected.length}</strong>
                        </span>
                        <span style={{...modalStyles.badge, ...modalStyles.badgePending}}>
                            Pending: <strong>{pendingSkills.length}</strong>
                        </span>
                        {hasExistingFeedback && (
                            <span style={modalStyles.badge}>
                                Previously reviewed
                            </span>
                        )}
                    </div>
                )}

                {nothingToReview ? (
                    /* ============ SIMPLE "EXTRACTED SKILLS" VIEW ============
                       Nothing needs review — just a clean summary list, no
                       badges, no sidebar, no approve/reject controls. */
                    <div style={modalStyles.simpleBody}>
                        <h3 style={modalStyles.simpleHeading}>
                            Approved Skills: {normalizedAutoApproved.length}
                        </h3>
                        <ul style={modalStyles.simpleList}>
                            {normalizedAutoApproved.map((skill, index) => (
                                <li key={index} style={modalStyles.simpleListItem}>
                                    {skill}
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <div style={modalStyles.contentRow}>
                        <div style={modalStyles.body}>
                            {nothingExtracted ? (
                                <div style={modalStyles.empty}>
                                    <p style={modalStyles.emptyText}>
                                        No skills extracted from this document.
                                    </p>
                                    <button onClick={onClose} style={modalStyles.doneBtn}>
                                        Done
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {/* Pending Skills — same neutral card as the simple view,
                                        with quiet outlined actions instead of solid color blocks */}
                                    {pendingSkills.map((skill, index) => (
                                        <div key={`pending-${index}`} style={modalStyles.skillItem}>
                                            <span style={modalStyles.skillText}>{skill}</span>
                                            <div style={modalStyles.actions}>
                                                <button 
                                                    onClick={() => handleApprove(skill)}
                                                    style={modalStyles.approveBtn}
                                                    title="Approve this skill"
                                                >
                                                    Approve
                                                </button>
                                                <button 
                                                    onClick={() => handleReject(skill)}
                                                    style={modalStyles.rejectBtn}
                                                    title="Reject this skill"
                                                >
                                                    Reject
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Approved Skills */}
                                    {approved.length > 0 && (
                                        <div style={modalStyles.section}>
                                            <h4 style={modalStyles.sectionTitle}>Approved Skills</h4>
                                            {approved.map((skill, index) => (
                                                <div key={`approved-${index}`} style={modalStyles.skillItemNeutral}>
                                                    <span style={modalStyles.skillTextApproved}>{skill}</span>
                                                    <button 
                                                        onClick={() => handleUndo(skill)}
                                                        style={modalStyles.undoBtn}
                                                    >
                                                        Undo
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Rejected Skills */}
                                    {rejected.length > 0 && (
                                        <div style={modalStyles.section}>
                                            <h4 style={modalStyles.sectionTitle}>Rejected Skills</h4>
                                            {rejected.map((skill, index) => (
                                                <div key={`rejected-${index}`} style={modalStyles.skillItemNeutral}>
                                                    <span style={modalStyles.skillTextRejected}>{skill}</span>
                                                    <button 
                                                        onClick={() => handleUndo(skill)}
                                                        style={modalStyles.undoBtn}
                                                    >
                                                        Undo
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* All Done Message */}
                                    {pendingSkills.length === 0 && approved.length > 0 && (
                                        <div style={modalStyles.allDone}>
                                            <span style={modalStyles.allDoneText}>All skills reviewed!</span>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {normalizedAutoApproved.length > 0 && (
                            <div style={modalStyles.autoApprovedSidebar}>
                                <div style={modalStyles.autoApprovedHeader}>
                                    <span>Auto-Approved Skills (from knowledge base)</span>
                                </div>
                                <div style={modalStyles.autoApprovedList}>
                                    {normalizedAutoApproved.map((skill, index) => (
                                        <span key={index} style={modalStyles.autoApprovedTag}>
                                            {skill}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div style={modalStyles.footer}>
                    <div style={modalStyles.footerRight}>
                        <button onClick={onClose} style={modalStyles.cancelBtn}>
                            Cancel
                        </button>
                        <button 
                            onClick={handleSubmit} 
                            style={{
                                ...modalStyles.submitBtn,
                                opacity: canSave ? 1 : 0.5,
                                cursor: canSave ? 'pointer' : 'not-allowed'
                            }}
                            disabled={!canSave}
                        >
                            {submitting ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>

                {pendingSkills.length > 0 && (
                    <div style={modalStyles.footerWarning}>
                        Please review {pendingSkills.length} skill(s) before saving
                    </div>
                )}
            </div>
        </div>
    );
}


// ============ STYLES (uses the app's theme CSS variables so it matches
// light/dark mode automatically instead of being hardcoded white) ============
//
// Palette rules for a calmer "Review Extracted Skills" view (matches the
// simple "Extracted Skills" summary view):
//  - Cards are always the same neutral bg/border, whether pending, approved,
//    or rejected — the state is communicated by the small text color +
//    undo/approve/reject controls, not by a big colored panel.
//  - Status badges are neutral text pills except "Pending", which keeps a
//    single warm accent because it's the one that blocks saving.
//  - Approve/Reject buttons are quiet outlined pills (colored border + text
//    on a neutral background) instead of solid color blocks.
const modalStyles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.2s ease-out',
        padding: '20px',
    },
    modal: {
        backgroundColor: 'var(--color-bg-card)',
        color: 'var(--color-text-primary)',
        fontFamily: 'var(--font-body)',
        borderRadius: 'var(--radius-lg)',
        maxWidth: '1000px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--color-border)',
        animation: 'slideUp 0.3s ease-out',
        overflow: 'hidden',
    },
    headerSimple: {
        padding: '20px 24px',
        borderBottom: '3px solid var(--color-primary)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexShrink: 0,
        backgroundColor: 'var(--color-bg-card-hover)',
    },
    headerLeft: {
        flex: 1,
        marginRight: '16px',
    },
    titleRow: {
        display: 'flex',
        alignItems: 'baseline',
        gap: '10px',
        flexWrap: 'wrap',
    },
    title: {
        fontFamily: 'var(--font-heading)',
        fontSize: '20px',
        fontWeight: '700',
        color: 'var(--color-text-primary)',
        margin: 0,
    },
    titleFileName: {
        fontSize: '13px',
        fontWeight: '500',
        color: 'var(--color-text-muted)',
    },
    subtitle: {
        color: 'var(--color-text-secondary)',
        fontSize: '14px',
        marginTop: '4px',
        marginBottom: 0,
    },
    closeBtn: {
        background: 'none',
        border: 'none',
        fontSize: '24px',
        color: 'var(--color-text-muted)',
        cursor: 'pointer',
        padding: '4px 8px',
        borderRadius: 'var(--radius-sm)',
        transition: 'all 0.2s',
        flexShrink: 0,
    },
    badgeContainer: {
        display: 'flex',
        gap: '10px',
        padding: '12px 24px',
        borderBottom: '1px solid var(--color-border)',
        flexWrap: 'wrap',
        backgroundColor: 'var(--color-bg-root)',
        flexShrink: 0,
    },
    // Neutral badge: same card look everywhere (bg-card-hover + border),
    // no per-status fill color. Keeps the header calm like the simple view.
    badge: {
        padding: '4px 14px',
        borderRadius: '20px',
        fontSize: '13px',
        fontWeight: '500',
        color: 'var(--color-text-secondary)',
        backgroundColor: 'var(--color-bg-card-hover)',
        border: '1px solid var(--color-border)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
    },
    // The one exception — pending count keeps a soft accent since it's the
    // status that actually blocks saving.
    badgePending: {
        color: 'var(--color-warning)',
        borderColor: 'var(--color-warning)',
    },
    contentRow: {
        display: 'flex',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
    },
    // Sidebar widened (was 260px) with a bit more breathing room around the tags.
    autoApprovedSidebar: {
        width: '320px',
        flexShrink: 0,
        borderLeft: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-root)',
        padding: '20px',
        overflowY: 'auto',
    },
    autoApprovedHeader: {
        fontSize: '13px',
        fontWeight: '600',
        color: 'var(--color-text-secondary)',
        marginBottom: '12px',
    },
    autoApprovedList: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
    },
    // Tags now match the neutral card style instead of a bright accent fill.
    autoApprovedTag: {
        padding: '5px 14px',
        backgroundColor: 'var(--color-bg-card-hover)',
        color: 'var(--color-text-primary)',
        borderRadius: '16px',
        fontSize: '13px',
        border: '1px solid var(--color-border)',
    },
    body: {
        padding: '20px 24px',
        overflowY: 'auto',
        flex: 1,
        minWidth: 0,
    },
    simpleBody: {
        padding: '24px',
        overflowY: 'auto',
        flex: 1,
    },
    simpleHeading: {
        fontFamily: 'var(--font-heading)',
        fontSize: '16px',
        fontWeight: '700',
        color: 'var(--color-text-primary)',
        margin: '0 0 16px 0',
    },
    simpleList: {
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
    },
    simpleListItem: {
        fontSize: '14px',
        color: 'var(--color-text-primary)',
        padding: '10px 14px',
        backgroundColor: 'var(--color-bg-card-hover)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
    },
    section: {
        marginTop: '16px',
        borderTop: '1px solid var(--color-border)',
        paddingTop: '16px',
    },
    sectionTitle: {
        fontSize: '13px',
        fontWeight: '600',
        color: 'var(--color-text-muted)',
        marginBottom: '10px',
        marginTop: 0,
    },
    // Same neutral card as simpleListItem — used for pending, approved, and
    // rejected rows alike so the list doesn't turn into a rainbow.
    skillItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        marginBottom: '8px',
        backgroundColor: 'var(--color-bg-card-hover)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        transition: 'all 0.2s',
        gap: '12px',
    },
    skillItemNeutral: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        marginBottom: '6px',
        backgroundColor: 'var(--color-bg-card-hover)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border)',
        gap: '12px',
    },
    skillText: {
        fontSize: '15px',
        fontWeight: '500',
        color: 'var(--color-text-primary)',
        flex: 1,
        wordBreak: 'break-word',
    },
    skillTextApproved: {
        fontSize: '14px',
        fontWeight: '500',
        color: 'var(--color-primary)',
        flex: 1,
        wordBreak: 'break-word',
    },
    skillTextRejected: {
        fontSize: '14px',
        fontWeight: '500',
        color: 'var(--color-danger)',
        flex: 1,
        wordBreak: 'break-word',
        textDecoration: 'line-through',
    },
    actions: {
        display: 'flex',
        gap: '8px',
        flexShrink: 0,
    },
    // Quiet outlined pills instead of solid color blocks.
    approveBtn: {
        padding: '6px 16px',
        backgroundColor: 'transparent',
        color: 'var(--color-primary)',
        border: '1px solid var(--color-primary)',
        borderRadius: 'var(--radius-sm)',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
    },
    rejectBtn: {
        padding: '6px 16px',
        backgroundColor: 'transparent',
        color: 'var(--color-danger)',
        border: '1px solid var(--color-danger)',
        borderRadius: 'var(--radius-sm)',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
    },
    undoBtn: {
        padding: '4px 12px',
        backgroundColor: 'var(--color-bg-card-hover)',
        color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        fontSize: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        flexShrink: 0,
    },
    footer: {
        padding: '16px 24px',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
        backgroundColor: 'var(--color-bg-card-hover)',
        flexWrap: 'wrap',
        gap: '12px',
    },
    footerRight: {
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
    },
    skipBtn: {
        padding: '10px 20px',
        backgroundColor: 'transparent',
        color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        fontSize: '14px',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    cancelBtn: {
        padding: '10px 24px',
        backgroundColor: 'transparent',
        color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    submitBtn: {
        padding: '10px 28px',
        backgroundColor: 'var(--color-primary)',
        color: '#ffffff',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    footerWarning: {
        padding: '8px 24px 16px 24px',
        color: 'var(--color-warning)',
        fontSize: '13px',
        fontWeight: '500',
        backgroundColor: 'var(--color-bg-card-hover)',
        borderTop: '1px solid var(--color-border)',
        flexShrink: 0,
    },
    empty: {
        textAlign: 'center',
        padding: '40px 20px',
    },
    emptyText: {
        color: 'var(--color-text-secondary)',
        fontSize: '16px',
        marginBottom: '16px',
    },
    doneBtn: {
        padding: '10px 32px',
        backgroundColor: 'var(--color-primary)',
        color: '#ffffff',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
    },
    allDone: {
        textAlign: 'center',
        padding: '20px',
        marginTop: '12px',
        backgroundColor: 'var(--color-bg-card-hover)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-primary)',
    },
    allDoneText: {
        fontSize: '16px',
        fontWeight: '600',
        color: 'var(--color-primary)',
    },
};

// ============ ADD CSS ANIMATIONS ============
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    @keyframes slideUp {
        from { 
            opacity: 0;
            transform: translateY(30px) scale(0.98);
        }
        to { 
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }
`;
document.head.appendChild(styleSheet);