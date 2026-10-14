import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import weaLogo from '../../assets/WEA_logo_bgremoved.png';
import { API_BASE_URL } from '../../config/api';
import { formatMoney } from '../../config/currency';

export default function JobOfferDecisionPage({ isDark = true }) {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [offerData, setOfferData] = useState(null);
  const [errorInfo, setErrorInfo] = useState(null);

  // Pre-select choice from query param (?choice=accept or ?choice=decline)
  const initialChoice = searchParams.get('choice') === 'decline' ? 'decline' : 'accept';
  const [selectedDecision, setSelectedDecision] = useState(initialChoice);
  const [declineReason, setDeclineReason] = useState('');
  const [completedDecision, setCompletedDecision] = useState(null);

  useEffect(() => {
    loadOffer();
  }, [token]);

  const loadOffer = async () => {
    if (!token) {
      setErrorInfo({
        title: 'Missing Offer Token',
        message: 'No offer token was provided in the link. Please check your invitation email.',
        code: 'MISSING_TOKEN',
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(false);
      const res = await fetch(`${API_BASE_URL}/api/public/offer/${token}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorInfo({
          title: data.code === 'EXPIRED' ? 'Offer Link Expired' : 'Unable to Load Offer',
          message: data.error || 'The job offer link is invalid or has expired.',
          code: data.code || 'ERROR',
        });
        return;
      }

      setOfferData(data.data);
      if (data.data?.alreadyResponded) {
        setCompletedDecision(data.data.status === 'Offer Accepted' ? 'accept' : 'decline');
      }
    } catch (err) {
      console.error('Failed to load offer:', err);
      setErrorInfo({
        title: 'Connection Error',
        message: 'Unable to reach the server. Please check your internet connection or try again later.',
        code: 'NETWORK_ERROR',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDecision = async () => {
    if (!selectedDecision || submitting) return;

    const isAccept = selectedDecision === 'accept';
    const result = await Swal.fire({
      title: isAccept ? 'Confirm Offer Acceptance?' : 'Confirm Offer Decline?',
      html: isAccept
        ? `Are you sure you want to <strong>Accept</strong> the employment offer for <strong>${offerData?.position}</strong>?<br/><br/><span style="font-size: 13px; color: var(--color-text-muted, #94a3b8);">Only one answer is allowed and this decision cannot be undone.</span>`
        : `Are you sure you want to <strong>Decline</strong> the employment offer for <strong>${offerData?.position}</strong>?<br/><br/><span style="font-size: 13px; color: #ef4444;">This decision is final and will archive your application.</span>`,
      icon: isAccept ? 'question' : 'warning',
      showCancelButton: true,
      confirmButtonText: isAccept ? 'Yes, I Accept' : 'Yes, I Decline',
      cancelButtonText: 'Cancel & Review',
      confirmButtonColor: isAccept ? '#10b981' : '#ef4444',
      cancelButtonColor: '#64748b',
      background: isDark ? '#1e293b' : '#ffffff',
      color: isDark ? '#f8fafc' : '#1e293b',
      reverseButtons: true,
    });

    if (!result.isConfirmed) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/public/offer/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: selectedDecision,
          reason: selectedDecision === 'decline' ? declineReason.trim() : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit response.');
      }

      setCompletedDecision(selectedDecision);
      setOfferData(prev => ({
        ...prev,
        alreadyResponded: true,
        status: isAccept ? 'Offer Accepted' : 'Offer Declined',
      }));

      Swal.fire({
        title: isAccept ? '🎉 Offer Accepted!' : 'Offer Declined',
        text: data.message || (isAccept ? 'Welcome to WEA! Your response has been recorded.' : 'Your decision has been recorded.'),
        icon: isAccept ? 'success' : 'info',
        confirmButtonColor: 'var(--color-primary, #3b82f6)',
        background: isDark ? '#1e293b' : '#ffffff',
        color: isDark ? '#f8fafc' : '#1e293b',
      });
    } catch (err) {
      console.error('Error submitting response:', err);
      Swal.fire({
        title: 'Submission Failed',
        text: err.message || 'An error occurred while submitting your response. Please try again.',
        icon: 'error',
        confirmButtonColor: '#ef4444',
        background: isDark ? '#1e293b' : '#ffffff',
        color: isDark ? '#f8fafc' : '#1e293b',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const bgRoot = isDark ? '#0f172a' : '#f8fafc';
  const cardBg = isDark ? '#1e293b' : '#ffffff';
  const borderCol = isDark ? '#334155' : '#e2e8f0';
  const textPrimary = isDark ? '#f8fafc' : '#0f172a';
  const textSecondary = isDark ? '#94a3b8' : '#64748b';

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: bgRoot, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', color: textSecondary }}>
          <div style={{ width: '48px', height: '48px', border: `4px solid ${borderCol}`, borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ fontSize: '15px', fontWeight: '500' }}>Loading job offer details...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: bgRoot, color: textPrimary, padding: '32px 16px', fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>

        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <img src={weaLogo} alt="WEA Logo" style={{ height: '54px', objectFit: 'contain', marginBottom: '12px' }} />
          <h1 style={{ fontSize: '26px', fontWeight: '800', margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>
            WEA Resource Management
          </h1>
          <p style={{ fontSize: '14px', color: textSecondary, margin: 0 }}>
            Official Employment Offer Decision Portal
          </p>
        </div>

        {/* Error State */}
        {errorInfo && (
          <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '20px', padding: '36px 24px', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>
              {errorInfo.code === 'EXPIRED' ? '⏳' : '⚠️'}
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', margin: '0 0 10px 0', color: errorInfo.code === 'EXPIRED' ? '#f59e0b' : '#ef4444' }}>
              {errorInfo.title}
            </h2>
            <p style={{ fontSize: '14px', color: textSecondary, lineHeight: '1.6', maxWidth: '440px', margin: '0 auto 24px auto' }}>
              {errorInfo.message}
            </p>
            <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '12px', padding: '16px', maxWidth: '440px', margin: '0 auto', fontSize: '13px', color: textSecondary }}>
              Need assistance? Please contact the <strong>WEA HR Office</strong> directly to discuss your application status.
            </div>
          </div>
        )}

        {/* Offer Loaded Content */}
        {offerData && !errorInfo && (
          <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '20px', overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.15)' }}>

            {/* Status Banner if Already Responded */}
            {offerData.alreadyResponded && (
              <div style={{
                padding: '16px 24px',
                background: completedDecision === 'accept' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                borderBottom: `1px solid ${completedDecision === 'accept' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <span style={{ fontSize: '24px' }}>{completedDecision === 'accept' ? '🎉' : 'ℹ️'}</span>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '15px', color: completedDecision === 'accept' ? '#34d399' : '#f87171' }}>
                    {completedDecision === 'accept' ? 'Offer Accepted' : 'Offer Declined'}
                  </div>
                  <div style={{ fontSize: '13px', color: textSecondary }}>
                    {completedDecision === 'accept'
                      ? 'You have formally accepted this offer. The WEA HR team will be in contact with your onboarding schedule.'
                      : 'You have declined this offer. Thank you for your consideration.'}
                  </div>
                </div>
              </div>
            )}

            {/* Content Area */}
            <div style={{ padding: '32px' }}>
              <div style={{ marginBottom: '24px' }}>
                <p style={{ fontSize: '15px', lineHeight: '1.6', margin: '0 0 8px 0' }}>
                  Dear <strong style={{ color: textPrimary }}>{offerData.applicantName}</strong>,
                </p>
                <p style={{ fontSize: '14px', color: textSecondary, lineHeight: '1.6', margin: 0 }}>
                  We are pleased to extend this formal offer of employment. Below is a summary of the terms and conditions for your position at WEA.
                </p>
              </div>

              {/* Offer Terms Card */}
              <div style={{ background: isDark ? 'rgba(15, 23, 42, 0.5)' : '#f1f5f9', border: `1px solid ${borderCol}`, borderRadius: '16px', padding: '20px', marginBottom: '28px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', margin: '0 0 16px 0', borderBottom: `1px dashed ${borderCol}`, paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Summary of Offer Terms
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: textSecondary, display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>Job Position</span>
                    <strong style={{ fontSize: '15px', color: textPrimary }}>{offerData.position}</strong>
                  </div>
                  <div>
                    <span style={{ color: textSecondary, display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>Compensation</span>
                    <strong style={{ fontSize: '15px', color: '#10b981' }}>
                      {offerData.salary ? `${formatMoney(Number(offerData.salary), offerData.currency)}/month` : 'As discussed'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: textSecondary, display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>Employment Type</span>
                    <span style={{ color: textPrimary, fontWeight: '600' }}>{offerData.employmentType || 'Full-time'}</span>
                  </div>
                  <div>
                    <span style={{ color: textSecondary, display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>Target Start Date</span>
                    <span style={{ color: textPrimary, fontWeight: '600' }}>{offerData.startDate || 'To be scheduled'}</span>
                  </div>
                  <div>
                    <span style={{ color: textSecondary, display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>Work Location / Setup</span>
                    <span style={{ color: textPrimary, fontWeight: '600' }}>{offerData.workLocation || offerData.branchName}</span>
                  </div>
                  <div>
                    <span style={{ color: textSecondary, display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>Working Hours</span>
                    <span style={{ color: textPrimary, fontWeight: '600' }}>{offerData.workingHours || '8:00 AM - 5:00 PM'}</span>
                  </div>
                </div>

                {offerData.benefits && (
                  <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: `1px dashed ${borderCol}`, fontSize: '13px' }}>
                    <span style={{ color: textSecondary, display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '4px' }}>Benefits</span>
                    <span style={{ color: textPrimary }}>{offerData.benefits}</span>
                  </div>
                )}
                {offerData.conditions && (
                  <div style={{ marginTop: '12px', fontSize: '13px' }}>
                    <span style={{ color: textSecondary, display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '4px' }}>Conditions</span>
                    <span style={{ color: textPrimary }}>{offerData.conditions}</span>
                  </div>
                )}
              </div>

              {/* Instructions or Expiration info */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: textSecondary, marginBottom: '24px', flexWrap: 'wrap', gap: '8px' }}>
                <span>Secure 14-day signed response link</span>
                <span>Valid through: {new Date(offerData.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>

              {/* DECISION SECTION (Only if not already responded) */}
              {!offerData.alreadyResponded ? (
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 8px 0', textAlign: 'center' }}>
                    Please Choose Your Decision
                  </h3>
                  <p style={{ fontSize: '13px', color: textSecondary, textAlign: 'center', margin: '0 0 20px 0' }}>
                    Select an option below and click confirm to submit. Only one answer is permitted.
                  </p>

                  {/* Decision Selector Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '24px' }}>

                    {/* Option 1: Accept */}
                    <div
                      onClick={() => setSelectedDecision('accept')}
                      style={{
                        padding: '20px',
                        borderRadius: '14px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        border: selectedDecision === 'accept' ? '2px solid #10b981' : `1px solid ${borderCol}`,
                        background: selectedDecision === 'accept' ? 'rgba(16, 185, 129, 0.08)' : (isDark ? '#0f172a' : '#f8fafc'),
                        boxShadow: selectedDecision === 'accept' ? '0 0 16px rgba(16, 185, 129, 0.2)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontWeight: '700', fontSize: '16px', color: selectedDecision === 'accept' ? '#34d399' : textPrimary }}>
                          Yes, I accept
                        </span>
                        <div style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          border: `2px solid ${selectedDecision === 'accept' ? '#10b981' : borderCol}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {selectedDecision === 'accept' && <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />}
                        </div>
                      </div>
                      <p style={{ fontSize: '12px', color: textSecondary, margin: 0, lineHeight: '1.5' }}>
                        I formally accept the employment terms and look forward to joining WEA.
                      </p>
                    </div>

                    {/* Option 2: Decline */}
                    <div
                      onClick={() => setSelectedDecision('decline')}
                      style={{
                        padding: '20px',
                        borderRadius: '14px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        border: selectedDecision === 'decline' ? '2px solid #ef4444' : `1px solid ${borderCol}`,
                        background: selectedDecision === 'decline' ? 'rgba(239, 68, 68, 0.08)' : (isDark ? '#0f172a' : '#f8fafc'),
                        boxShadow: selectedDecision === 'decline' ? '0 0 16px rgba(239, 68, 68, 0.2)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontWeight: '700', fontSize: '16px', color: selectedDecision === 'decline' ? '#f87171' : textPrimary }}>
                          No, I decline
                        </span>
                        <div style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          border: `2px solid ${selectedDecision === 'decline' ? '#ef4444' : borderCol}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {selectedDecision === 'decline' && <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />}
                        </div>
                      </div>
                      <p style={{ fontSize: '12px', color: textSecondary, margin: 0, lineHeight: '1.5' }}>
                        I respectfully decline this employment offer at this time.
                      </p>
                    </div>
                  </div>

                  {/* Optional Decline Reason */}
                  {selectedDecision === 'decline' && (
                    <div style={{ marginBottom: '24px', animation: 'fadeIn 0.2s ease' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: textSecondary }}>
                        Reason for declining (optional):
                      </label>
                      <textarea
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        placeholder="e.g. Accepted another offer, compensation, location..."
                        rows={3}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: `1px solid ${borderCol}`,
                          background: isDark ? '#0f172a' : '#ffffff',
                          color: textPrimary,
                          fontSize: '13px',
                          resize: 'vertical',
                          boxSizing: 'border-box',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>
                  )}

                  {/* Confirmation Action Button */}
                  <div style={{ textAlign: 'center' }}>
                    <button
                      onClick={handleConfirmDecision}
                      disabled={submitting}
                      style={{
                        background: selectedDecision === 'accept'
                          ? 'linear-gradient(135deg, #10b981, #059669)'
                          : 'linear-gradient(135deg, #ef4444, #dc2626)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '14px 40px',
                        fontSize: '15px',
                        fontWeight: '700',
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        opacity: submitting ? 0.7 : 1,
                        boxShadow: selectedDecision === 'accept'
                          ? '0 6px 20px rgba(16, 185, 129, 0.4)'
                          : '0 6px 20px rgba(239, 68, 68, 0.4)',
                        transition: 'transform 0.15s ease',
                      }}
                    >
                      {submitting
                        ? 'Recording Response...'
                        : selectedDecision === 'accept'
                          ? 'Confirm & Accept Job Offer'
                          : 'Confirm & Decline Job Offer'}
                    </button>
                    <p style={{ fontSize: '12px', color: textSecondary, marginTop: '12px' }}>
                      You will be asked for a final confirmation before this decision is submitted.
                    </p>
                  </div>
                </div>
              ) : (
                /* Already Responded Locked View */
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 18px',
                    borderRadius: '20px',
                    fontSize: '14px',
                    fontWeight: '700',
                    background: completedDecision === 'accept' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: completedDecision === 'accept' ? '#34d399' : '#f87171',
                    border: `1px solid ${completedDecision === 'accept' ? '#10b981' : '#ef4444'}`
                  }}>
                    {completedDecision === 'accept' ? '✓ Response Recorded: Offer Accepted' : '✕ Response Recorded: Offer Declined'}
                  </div>
                  <p style={{ fontSize: '13px', color: textSecondary, marginTop: '12px' }}>
                    If you have questions regarding your record, please contact the HR office.
                  </p>
                </div>
              )}

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
