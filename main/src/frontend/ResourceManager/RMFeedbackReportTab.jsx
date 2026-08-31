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
  const [expandedId, setExpandedId] = useState(null);

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
        <button style={styles.select} onClick={load}>Apply Filters</button>
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
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <React.Fragment key={r.id}>
                  <tr>
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
                        style={{ ...styles.select, padding: '4px 10px', fontSize: 12 }}
                        onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                      >
                        {expandedId === r.id ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr style={styles.expandRow}>
                      <td colSpan={7} style={styles.expandCell}>
                        {r.isMerged ? (
                          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                            {/* Client Evaluation */}
                            <div style={{ flex: '1 1 300px', padding: '12px', borderRight: '1px solid var(--color-border)' }}>
                              <h4 style={{ margin: '0 0 8px 0', color: '#3b82f6', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px' }}>
                                Client Evaluation ({r.client?.evaluatorName})
                              </h4>
                              <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>Rating: {r.client?.rating}/5</div>
                              {r.client?.strengths && <div style={{ marginBottom: '6px' }}><strong>Strengths:</strong> {r.client?.strengths}</div>}
                              {r.client?.areasForImprovement && <div style={{ marginBottom: '6px' }}><strong>Areas for Improvement:</strong> {r.client?.areasForImprovement}</div>}
                              {r.client?.clientFeedback && <div><strong>Feedback:</strong> {r.client?.clientFeedback}</div>}
                            </div>
                            
                            {/* PM Evaluation */}
                            <div style={{ flex: '1 1 300px', padding: '12px' }}>
                              <h4 style={{ margin: '0 0 8px 0', color: '#10b981', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px' }}>
                                PM Evaluation ({r.pm?.evaluatorName})
                              </h4>
                              <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>Rating: {r.pm?.rating}/5</div>
                              {r.pm?.strengths && <div style={{ marginBottom: '6px' }}><strong>Strengths:</strong> {r.pm?.strengths}</div>}
                              {r.pm?.areasForImprovement && <div style={{ marginBottom: '6px' }}><strong>Areas for Improvement:</strong> {r.pm?.areasForImprovement}</div>}
                              {r.pm?.pmAssessment && <div><strong>Assessment:</strong> {r.pm?.pmAssessment}</div>}
                            </div>
                          </div>
                        ) : (
                          <div style={{ padding: '12px' }}>
                            <h4 style={{ margin: '0 0 8px 0', color: r.evaluatorSource === 'client' ? '#3b82f6' : '#10b981', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px' }}>
                              {r.evaluatorSource === 'client' ? `Client Evaluation (${r.evaluatorName})` : `PM Evaluation (${r.evaluatorName})`}
                            </h4>
                            {r.client && (
                              <>
                                <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>Rating: {r.client.rating}/5</div>
                                {r.client.strengths && <div style={{ marginBottom: '6px' }}><strong>Strengths:</strong> {r.client.strengths}</div>}
                                {r.client.areasForImprovement && <div style={{ marginBottom: '6px' }}><strong>Areas for Improvement:</strong> {r.client.areasForImprovement}</div>}
                                {r.client.clientFeedback && <div><strong>Feedback:</strong> {r.client.clientFeedback}</div>}
                              </>
                            )}
                            {r.pm && (
                              <>
                                <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>Rating: {r.pm.rating}/5</div>
                                {r.pm.strengths && <div style={{ marginBottom: '6px' }}><strong>Strengths:</strong> {r.pm.strengths}</div>}
                                {r.pm.areasForImprovement && <div style={{ marginBottom: '6px' }}><strong>Areas for Improvement:</strong> {r.pm.areasForImprovement}</div>}
                                {r.pm.pmAssessment && <div><strong>Assessment:</strong> {r.pm.pmAssessment}</div>}
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}