import React, { useState, useEffect, useMemo } from 'react';
import { fetchGlobalFeedbackReport } from './Rmapi';

const styles = {
  container: { padding: '8px 0' },
  filterBar: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
  select: { padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' },
  card: { padding: '20px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '10px', textAlign: 'left', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 600 },
  td: { padding: '10px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: 14 },
  badge: (source) => ({
    padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
    background: source === 'merged' 
      ? 'rgba(139, 92, 246, 0.15)'
      : source === 'client' 
        ? 'rgba(59,130,246,0.15)' 
        : 'rgba(16,185,129,0.15)',
    color: source === 'merged'
      ? '#8b5cf6'
      : source === 'client' 
        ? '#3b82f6' 
        : '#10b981',
  }),
  expandRow: { background: 'var(--color-bg-secondary)' },
  expandCell: { padding: '14px', fontSize: 13, color: 'var(--color-text-secondary)' },
  emptyNote: { fontSize: '13px', color: 'var(--color-text-muted)', padding: '20px 0' },
};

export default function RMFeedbackReportTab() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ projectId: '', pmId: '', empId: '', feedbackSource: '' });
  const [selectedRecord, setSelectedRecord] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchGlobalFeedbackReport(filters);
      setRecords(data?.data || []);
    } catch (err) {
      console.error('Failed to load global feedback report:', err);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const projectOptions = useMemo(
    () => [...new Map(records.map(r => [r.projectId, r.projectName])).entries()],
    [records]
  );

  const handleFilterChange = (field, value) => setFilters(prev => ({ ...prev, [field]: value }));

  return (
    <div style={styles.container}>
      <div style={styles.filterBar}>
        <select style={styles.select} value={filters.projectId} onChange={(e) => handleFilterChange('projectId', e.target.value)}>
          <option value="" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>All Projects</option>
          {projectOptions.map(([id, name]) => (
            <option key={id} value={id} style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>{name}</option>
          ))}
        </select>
        <select style={styles.select} value={filters.feedbackSource} onChange={(e) => handleFilterChange('feedbackSource', e.target.value)}>
          <option value="" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>All Sources</option>
          <option value="client" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>Client</option>
          <option value="project_manager" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>Project Manager</option>
        </select>
        <input
          style={styles.select}
          placeholder="Filter by PM profile ID"
          value={filters.pmId}
          onChange={(e) => handleFilterChange('pmId', e.target.value)}
        />
        <input
          style={styles.select}
          placeholder="Filter by Employee profile ID"
          value={filters.empId}
          onChange={(e) => handleFilterChange('empId', e.target.value)}
        />
        <button style={{ ...styles.select, cursor: 'pointer' }} onClick={load}>Apply Filters</button>
      </div>

      <div className="glass-card" style={styles.card}>
        {loading ? (
          <span style={styles.emptyNote}>Loading feedback records…</span>
        ) : records.length === 0 ? (
          <span style={styles.emptyNote}>No feedback records found.</span>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Employee / PM</th>
                <th style={styles.th}>Project</th>
                <th style={styles.th}>Evaluator Source</th>
                <th style={styles.th}>Rating</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td style={styles.td}>
                    {r.subjectName}
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.subjectRole}</div>
                  </td>
                  <td style={styles.td}>{r.projectName}</td>
                  <td style={styles.td}>
                    <span style={styles.badge(r.evaluatorSource)}>
                      {r.evaluatorSource === 'merged' ? 'PM & Client (Merged)' : r.evaluatorSource === 'client' ? `Client (${r.evaluatorName})` : `PM (${r.evaluatorName})`}
                    </span>
                  </td>
                  <td style={styles.td}>{r.rating ?? '—'}/5</td>
                  <td style={styles.td}>{r.status}</td>
                  <td style={styles.td}>{r.ratedAt ? new Date(r.ratedAt).toLocaleDateString() : '—'}</td>
                  <td style={styles.td}>
                    <button
                      style={{
                        padding: '6px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 6,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-primary-light)',
                        color: 'var(--color-primary)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onClick={() => setSelectedRecord(r)}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Feedback Details Modal ── */}
      {selectedRecord && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setSelectedRecord(null)}
        >
          <div
            className="glass-card"
            style={{
              width: '100%',
              maxWidth: selectedRecord.isMerged ? '800px' : '550px',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '28px',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--color-border)', paddingBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                  Feedback Details
                </h3>
                <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  {selectedRecord.subjectName} ({selectedRecord.subjectRole}) • {selectedRecord.projectName}
                </span>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                style={{ background: 'transparent', border: 'none', fontSize: '24px', color: 'var(--color-text-muted)', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            {selectedRecord.isMerged ? (
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                {/* Client Evaluation */}
                <div style={{ flex: '1 1 320px', padding: '16px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#3b82f6', fontSize: '16px', borderBottom: '1px solid rgba(59, 130, 246, 0.2)', paddingBottom: '8px' }}>
                    Client Evaluation ({selectedRecord.client?.evaluatorName})
                  </h4>
                  <div style={{ marginBottom: '10px', fontSize: '15px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                    Rating: <span style={{ color: '#3b82f6' }}>{selectedRecord.client?.rating}/5</span>
                  </div>
                  {selectedRecord.client?.strengths && (
                    <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                      <strong style={{ color: 'var(--color-text-secondary)' }}>Strengths:</strong>
                      <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.client?.strengths}</p>
                    </div>
                  )}
                  {selectedRecord.client?.areasForImprovement && (
                    <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                      <strong style={{ color: 'var(--color-text-secondary)' }}>Areas for Improvement:</strong>
                      <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.client?.areasForImprovement}</p>
                    </div>
                  )}
                  {selectedRecord.client?.clientFeedback && (
                    <div style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
                      <strong style={{ color: 'var(--color-text-secondary)' }}>Feedback:</strong>
                      <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.client?.clientFeedback}</p>
                    </div>
                  )}
                </div>

                {/* PM Evaluation */}
                <div style={{ flex: '1 1 320px', padding: '16px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#10b981', fontSize: '16px', borderBottom: '1px solid rgba(16, 185, 129, 0.2)', paddingBottom: '8px' }}>
                    PM Evaluation ({selectedRecord.pm?.evaluatorName})
                  </h4>
                  <div style={{ marginBottom: '10px', fontSize: '15px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                    Rating: <span style={{ color: '#10b981' }}>{selectedRecord.pm?.rating}/5</span>
                  </div>
                  {selectedRecord.pm?.strengths && (
                    <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                      <strong style={{ color: 'var(--color-text-secondary)' }}>Strengths:</strong>
                      <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.pm?.strengths}</p>
                    </div>
                  )}
                  {selectedRecord.pm?.areasForImprovement && (
                    <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                      <strong style={{ color: 'var(--color-text-secondary)' }}>Areas for Improvement:</strong>
                      <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.pm?.areasForImprovement}</p>
                    </div>
                  )}
                  {selectedRecord.pm?.pmAssessment && (
                    <div style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
                      <strong style={{ color: 'var(--color-text-secondary)' }}>Assessment:</strong>
                      <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.pm?.pmAssessment}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding: '16px', borderRadius: '12px', background: selectedRecord.evaluatorSource === 'client' ? 'rgba(59, 130, 246, 0.06)' : 'rgba(16, 185, 129, 0.06)', border: `1px solid ${selectedRecord.evaluatorSource === 'client' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)'}` }}>
                <h4 style={{ margin: '0 0 12px 0', color: selectedRecord.evaluatorSource === 'client' ? '#3b82f6' : '#10b981', fontSize: '16px', borderBottom: `1px solid ${selectedRecord.evaluatorSource === 'client' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`, paddingBottom: '8px' }}>
                  {selectedRecord.evaluatorSource === 'client' ? `Client Evaluation (${selectedRecord.evaluatorName})` : `PM Evaluation (${selectedRecord.evaluatorName})`}
                </h4>
                {selectedRecord.client && (
                  <>
                    <div style={{ marginBottom: '10px', fontSize: '15px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                      Rating: <span style={{ color: '#3b82f6' }}>{selectedRecord.client.rating}/5</span>
                    </div>
                    {selectedRecord.client.strengths && (
                      <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        <strong style={{ color: 'var(--color-text-secondary)' }}>Strengths:</strong>
                        <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.client.strengths}</p>
                      </div>
                    )}
                    {selectedRecord.client.areasForImprovement && (
                      <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        <strong style={{ color: 'var(--color-text-secondary)' }}>Areas for Improvement:</strong>
                        <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.client.areasForImprovement}</p>
                      </div>
                    )}
                    {selectedRecord.client.clientFeedback && (
                      <div style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        <strong style={{ color: 'var(--color-text-secondary)' }}>Feedback:</strong>
                        <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.client.clientFeedback}</p>
                      </div>
                    )}
                  </>
                )}
                {selectedRecord.pm && (
                  <>
                    <div style={{ marginBottom: '10px', fontSize: '15px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                      Rating: <span style={{ color: '#10b981' }}>{selectedRecord.pm.rating}/5</span>
                    </div>
                    {selectedRecord.pm.strengths && (
                      <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        <strong style={{ color: 'var(--color-text-secondary)' }}>Strengths:</strong>
                        <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.pm.strengths}</p>
                      </div>
                    )}
                    {selectedRecord.pm.areasForImprovement && (
                      <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        <strong style={{ color: 'var(--color-text-secondary)' }}>Areas for Improvement:</strong>
                        <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.pm.areasForImprovement}</p>
                      </div>
                    )}
                    {selectedRecord.pm.pmAssessment && (
                      <div style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        <strong style={{ color: 'var(--color-text-secondary)' }}>Assessment:</strong>
                        <p style={{ margin: '4px 0 0 0', lineHeight: 1.5 }}>{selectedRecord.pm.pmAssessment}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Modal Footer */}
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedRecord(null)}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-primary)',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}