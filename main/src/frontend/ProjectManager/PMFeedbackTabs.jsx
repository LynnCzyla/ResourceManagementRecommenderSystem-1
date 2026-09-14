import React, { useState } from 'react';
import PMFeedbackFormTab from './PMFeedbackFormTab';
import PMSendFeedbackTab from './PMSendFeedbackTab';

export default function PMFeedbackTabs({ user }) {
  const [subTab, setSubTab] = useState('request'); // 'request' | 'evaluate'
  const [hoveredTab, setHoveredTab] = useState(null);

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
    },
    header: {
      marginBottom: '0px',
    },
    title: {
      fontSize: '28px',
      fontWeight: '800',
      letterSpacing: '-0.75px',
      marginBottom: '4px',
      color: 'var(--color-text-primary)',
    },
    subtitle: {
      fontSize: '15px',
      color: 'var(--color-text-secondary)',
    },
    tabsRow: {
      display: 'flex',
      gap: '8px',
      borderBottom: '1px solid var(--color-border)',
      marginTop: '-4px',
    },
    tabBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      background: 'transparent',
      border: 'none',
      borderBottom: '2px solid transparent',
      padding: '10px 4px',
      marginRight: '16px',
      fontSize: '14px',
      fontWeight: '700',
      color: 'var(--color-text-secondary)',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    tabBtnActive: {
      color: 'var(--color-primary)',
      borderBottom: '2px solid var(--color-primary)',
    },
    tabBtnHovered: {
      color: 'var(--color-text-primary)',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Client Feedback Form</h1>
        <p style={styles.subtitle}>Manage client evaluations and team performance reviews</p>
      </div>

      <div style={styles.tabsRow}>
        <button
          type="button"
          onClick={() => setSubTab('request')}
          onMouseEnter={() => setHoveredTab('request')}
          onMouseLeave={() => setHoveredTab(null)}
          style={{
            ...styles.tabBtn,
            ...(subTab === 'request' ? styles.tabBtnActive : hoveredTab === 'request' ? styles.tabBtnHovered : {})
          }}
        >
          Request Client Feedback
        </button>
        <button
          type="button"
          onClick={() => setSubTab('evaluate')}
          onMouseEnter={() => setHoveredTab('evaluate')}
          onMouseLeave={() => setHoveredTab(null)}
          style={{
            ...styles.tabBtn,
            ...(subTab === 'evaluate' ? styles.tabBtnActive : hoveredTab === 'evaluate' ? styles.tabBtnHovered : {})
          }}
        >
          Evaluate Team Member
        </button>
      </div>

      <div>
        {subTab === 'request' ? (
          <PMFeedbackFormTab user={user} />
        ) : (
          <PMSendFeedbackTab user={user} />
        )}
      </div>
    </div>
  );
}
