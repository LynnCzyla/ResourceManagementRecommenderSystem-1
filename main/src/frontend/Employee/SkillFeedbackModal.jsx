import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { supabase } from '../../lib/supabaseClient';

const API_URL = 'http://localhost:5000/api';

export default function SkillFeedbackModal({ 
    isOpen, 
    onClose, 
    documentId, 
    employeeId, 
    extractedSkills = [],
    documentType = 'Resume',
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

    // Initialize with all skills as pending
    useEffect(() => {
        if (isOpen && extractedSkills) {
            setApproved([]);
            setRejected([]);
            // Check for existing feedback
            if (documentId && employeeId) {
                fetchExistingFeedback();
            }
        }
    }, [isOpen, extractedSkills, documentId, employeeId]);

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
        setApproved([...approved, skill]);
        setRejected(rejected.filter(s => s !== skill));
    };

    const handleReject = (skill) => {
        setRejected([...rejected, skill]);
        setApproved(approved.filter(s => s !== skill));
    };

    const handleUndo = (skill) => {
        setApproved(approved.filter(s => s !== skill));
        setRejected(rejected.filter(s => s !== skill));
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const authHeader = await getAuthHeader();
                    const response = await axios.post(
                `${API_URL}/employee/skill-feedback`,
                {
                    documentId,
                    approved_skills: approved,
                    rejected_skills: rejected,
                    document_type: documentType
                },
                { headers: authHeader }
            );

            if (response.data.success) {
                // Callback with approved skills
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

    // Get pending skills (not yet approved or rejected)
    const pendingSkills = extractedSkills.filter(s => 
        !approved.includes(s) && !rejected.includes(s)
    );
    const canSave = !!documentId && !submitting;

    if (!isOpen) return null;

    return (
        <div style={modalStyles.overlay}>
            <div style={modalStyles.modal}>
                <div style={modalStyles.header}>
                    <div style={modalStyles.headerLeft}>
                        <h2 style={modalStyles.title}>📋 Review Extracted Skills</h2>
                        <p style={modalStyles.subtitle}>
                            {documentType === 'Certificate' 
                                ? 'Review skills extracted from your certificate.' 
                                : 'Review skills extracted from your resume.'
                            }
                            {' '}The system will learn from your feedback.
                        </p>
                    </div>
                    <button onClick={onClose} style={modalStyles.closeBtn}>✕</button>
                </div>

                <div style={modalStyles.badgeContainer}>
                    <span style={{...modalStyles.badge, ...modalStyles.badgeApproved}}>
                        ✅ Approved: {approved.length}
                    </span>
                    <span style={{...modalStyles.badge, ...modalStyles.badgeRejected}}>
                        ❌ Rejected: {rejected.length}
                    </span>
                    <span style={{...modalStyles.badge, ...modalStyles.badgePending}}>
                        ⏳ Pending: {pendingSkills.length}
                    </span>
                    {hasExistingFeedback && (
                        <span style={{...modalStyles.badge, ...modalStyles.badgeExisting}}>
                            📝 Previously reviewed
                        </span>
                    )}
                </div>

                <div style={modalStyles.body}>
                    {extractedSkills.length === 0 ? (
                        <div style={modalStyles.empty}>
                            <p style={modalStyles.emptyText}>No skills extracted from this document.</p>
                            <button onClick={onClose} style={modalStyles.doneBtn}>
                                Done
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Pending Skills */}
                            {pendingSkills.map((skill, index) => (
                                <div key={`pending-${index}`} style={modalStyles.skillItem}>
                                    <span style={modalStyles.skillText}>{skill}</span>
                                    <div style={modalStyles.actions}>
                                        <button 
                                            onClick={() => handleApprove(skill)}
                                            style={modalStyles.approveBtn}
                                            title="Approve this skill"
                                        >
                                            ✅ Approve
                                        </button>
                                        <button 
                                            onClick={() => handleReject(skill)}
                                            style={modalStyles.rejectBtn}
                                            title="Reject this skill"
                                        >
                                            ❌ Reject
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {/* Approved Skills */}
                            {approved.length > 0 && (
                                <div style={modalStyles.section}>
                                    <h4 style={modalStyles.sectionTitle}>✅ Approved Skills</h4>
                                    {approved.map((skill, index) => (
                                        <div key={`approved-${index}`} style={modalStyles.skillItemApproved}>
                                            <span style={modalStyles.skillTextApproved}>{skill}</span>
                                            <button 
                                                onClick={() => handleUndo(skill)}
                                                style={modalStyles.undoBtn}
                                            >
                                                ↩️ Undo
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Rejected Skills */}
                            {rejected.length > 0 && (
                                <div style={modalStyles.section}>
                                    <h4 style={modalStyles.sectionTitle}>❌ Rejected Skills</h4>
                                    {rejected.map((skill, index) => (
                                        <div key={`rejected-${index}`} style={modalStyles.skillItemRejected}>
                                            <span style={modalStyles.skillTextRejected}>{skill}</span>
                                            <button 
                                                onClick={() => handleUndo(skill)}
                                                style={modalStyles.undoBtn}
                                            >
                                                ↩️ Undo
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* All Done Message */}
                            {pendingSkills.length === 0 && approved.length > 0 && (
                                <div style={modalStyles.allDone}>
                                    <span style={modalStyles.allDoneText}>🎉 All skills reviewed!</span>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div style={modalStyles.footer}>
                    <button onClick={handleSkip} style={modalStyles.skipBtn}>
                        ⏭️ Skip for now
                    </button>
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
                            {submitting ? '💾 Saving...' : '💾 Save Feedback'}
                        </button>
                    </div>
                </div>

                {pendingSkills.length > 0 && (
                    <div style={modalStyles.footerWarning}>
                        ⚠️ Please review {pendingSkills.length} skill(s) before saving
                    </div>
                )}
            </div>
        </div>
    );
}

// ============ STYLES ============
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
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        maxWidth: '800px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        animation: 'slideUp 0.3s ease-out',
        overflow: 'hidden',
    },
    header: {
        padding: '20px 24px',
        borderBottom: '2px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexShrink: 0,
        backgroundColor: '#fafafa',
    },
    headerLeft: {
        flex: 1,
        marginRight: '16px',
    },
    title: {
        fontSize: '20px',
        fontWeight: '700',
        color: '#1f2937',
        margin: 0,
    },
    subtitle: {
        color: '#6b7280',
        fontSize: '14px',
        marginTop: '4px',
        marginBottom: 0,
    },
    closeBtn: {
        background: 'none',
        border: 'none',
        fontSize: '24px',
        color: '#9ca3af',
        cursor: 'pointer',
        padding: '4px 8px',
        borderRadius: '6px',
        transition: 'all 0.2s',
        flexShrink: 0,
    },
    badgeContainer: {
        display: 'flex',
        gap: '10px',
        padding: '12px 24px',
        borderBottom: '1px solid #e5e7eb',
        flexWrap: 'wrap',
        backgroundColor: '#f9fafb',
        flexShrink: 0,
    },
    badge: {
        padding: '4px 14px',
        borderRadius: '20px',
        fontSize: '13px',
        fontWeight: '600',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
    },
    badgeApproved: {
        backgroundColor: '#d1fae5',
        color: '#065f46',
    },
    badgeRejected: {
        backgroundColor: '#fee2e2',
        color: '#991b1b',
    },
    badgePending: {
        backgroundColor: '#fef3c7',
        color: '#92400e',
    },
    badgeExisting: {
        backgroundColor: '#e0e7ff',
        color: '#3730a3',
    },
    body: {
        padding: '20px 24px',
        overflowY: 'auto',
        flex: 1,
    },
    section: {
        marginTop: '16px',
        borderTop: '1px solid #f3f4f6',
        paddingTop: '16px',
    },
    sectionTitle: {
        fontSize: '13px',
        fontWeight: '600',
        color: '#6b7280',
        marginBottom: '10px',
        marginTop: 0,
    },
    skillItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        marginBottom: '8px',
        backgroundColor: '#f9fafb',
        borderRadius: '10px',
        border: '1px solid #e5e7eb',
        transition: 'all 0.2s',
        gap: '12px',
    },
    skillItemApproved: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        marginBottom: '6px',
        backgroundColor: '#ecfdf5',
        borderRadius: '8px',
        border: '1px solid #a7f3d0',
        gap: '12px',
    },
    skillItemRejected: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        marginBottom: '6px',
        backgroundColor: '#fef2f2',
        borderRadius: '8px',
        border: '1px solid #fca5a5',
        gap: '12px',
    },
    skillText: {
        fontSize: '15px',
        fontWeight: '500',
        color: '#1f2937',
        flex: 1,
        wordBreak: 'break-word',
    },
    skillTextApproved: {
        fontSize: '14px',
        fontWeight: '500',
        color: '#065f46',
        flex: 1,
        wordBreak: 'break-word',
    },
    skillTextRejected: {
        fontSize: '14px',
        fontWeight: '500',
        color: '#991b1b',
        flex: 1,
        wordBreak: 'break-word',
        textDecoration: 'line-through',
    },
    actions: {
        display: 'flex',
        gap: '8px',
        flexShrink: 0,
    },
    approveBtn: {
        padding: '6px 16px',
        backgroundColor: '#10b981',
        color: '#ffffff',
        border: 'none',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
    },
    rejectBtn: {
        padding: '6px 16px',
        backgroundColor: '#ef4444',
        color: '#ffffff',
        border: 'none',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
    },
    undoBtn: {
        padding: '4px 12px',
        backgroundColor: '#e5e7eb',
        color: '#374151',
        border: 'none',
        borderRadius: '6px',
        fontSize: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        flexShrink: 0,
    },
    footer: {
        padding: '16px 24px',
        borderTop: '2px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
        backgroundColor: '#fafafa',
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
        color: '#6b7280',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    cancelBtn: {
        padding: '10px 24px',
        backgroundColor: 'transparent',
        color: '#6b7280',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    submitBtn: {
        padding: '10px 28px',
        backgroundColor: '#3b82f6',
        color: '#ffffff',
        border: 'none',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    footerWarning: {
        padding: '8px 24px 16px 24px',
        color: '#d97706',
        fontSize: '13px',
        fontWeight: '500',
        backgroundColor: '#fffbeb',
        borderTop: '1px solid #fde68a',
        flexShrink: 0,
    },
    empty: {
        textAlign: 'center',
        padding: '40px 20px',
    },
    emptyText: {
        color: '#6b7280',
        fontSize: '16px',
        marginBottom: '16px',
    },
    doneBtn: {
        padding: '10px 32px',
        backgroundColor: '#3b82f6',
        color: '#ffffff',
        border: 'none',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
    },
    allDone: {
        textAlign: 'center',
        padding: '20px',
        marginTop: '12px',
        backgroundColor: '#d1fae5',
        borderRadius: '8px',
    },
    allDoneText: {
        fontSize: '16px',
        fontWeight: '600',
        color: '#065f46',
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