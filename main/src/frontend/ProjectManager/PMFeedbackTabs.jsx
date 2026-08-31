import React, { useState } from 'react';
import PMFeedbackFormTab from './PMFeedbackFormTab';
import PMSendFeedbackTab from './PMSendFeedbackTab';

export default function PMFeedbackTabs({ user }) {
  const [subTab, setSubTab] = useState('request'); // 'request' | 'evaluate'

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    },
    tabBar: {
      display: 'flex',
      gap: '12px',
      borderBottom: '1px solid var(--color-border)',
      paddingBottom: '8px',
    },
    tabButton: (isActive) => ({
      padding: '8px 16px',
      borderRadius: '8px',
      border: 'none',
      background: isActive ? 'var(--color-primary-light)' : 'transparent',
      color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  };

  return (
    <div style={styles.container}>
      <div style={styles.tabBar}>
        <button
          style={styles.tabButton(subTab === 'request')}
          onClick={() => setSubTab('request')}
        >
          Request Client Feedback
        </button>
        <button
          style={styles.tabButton(subTab === 'evaluate')}
          onClick={() => setSubTab('evaluate')}
        >
          Evaluate Team Member
        </button>
      </div>

      <div style={{ marginTop: '8px' }}>
        {subTab === 'request' ? (
          <PMFeedbackFormTab user={user} />
        ) : (
          <PMSendFeedbackTab user={user} />
        )}
      </div>
    </div>
  );
}
