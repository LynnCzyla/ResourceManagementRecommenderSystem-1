import React, { useState, useEffect } from 'react';

export default function DashboardTab({ setActiveTab }) {
  const [stats, setStats] = useState({
    totalAdmins: 0,
    totalBranches: 0,
    totalAccounts: 0,
    totalLogs: 0,
  });

  const [recentLogs, setRecentLogs] = useState([]);

  useEffect(() => {
    // 1. Fetch stats based on mock data sources (using same mock values from other tabs)
    const adminsCount = 2; // John Doe, Jane Smith from AdminManagementTab
    const branchesCount = 3; // Main, North, South from BranchManagementTab
    const accountsCount = 6; // John, Jane, Robert, Emily, Michael, Sarah from AccountManagementTab
    const logsCount = 8; // From AuditLogsTab

    setStats({
      totalAdmins: adminsCount,
      totalBranches: branchesCount,
      totalAccounts: accountsCount,
      totalLogs: logsCount,
    });

    // 2. Fetch mock recent logs
    setRecentLogs([
      { id: 1, action: 'CREATE_ADMIN', actor: 'Super Admin', details: 'Created new admin account for John Doe at Main Branch', timestamp: '10 mins ago' },
      { id: 2, action: 'UPDATE_BRANCH', actor: 'Super Admin', details: 'Updated branch manager to Jane Smith', timestamp: '1 hour ago' },
      { id: 3, action: 'DEACTIVATE_ACCOUNT', actor: 'Super Admin', details: 'Deactivated employee account', timestamp: '3 hours ago' },
      { id: 4, action: 'CREATE_BRANCH', actor: 'Super Admin', details: 'Created new branch at Makati', timestamp: '5 hours ago' },
      { id: 5, action: 'DELETE_ADMIN', actor: 'Super Admin', details: 'Deleted admin account for Sarah Brown', timestamp: '1 day ago' },
    ]);
  }, []);

  const handleQuickAction = (tab) => {
    setActiveTab(tab);
    localStorage.setItem('superAdminActiveTab', tab);
  };

  const getActionColor = (action) => {
    const colors = {
      'CREATE_ADMIN': '#22c55e',
      'UPDATE_BRANCH': '#3b82f6',
      'DEACTIVATE_ACCOUNT': '#f59e0b',
      'CREATE_BRANCH': '#22c55e',
      'DELETE_ADMIN': '#ef4444',
    };
    return colors[action] || '#6b7280';
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>System Overview</h1>
        <p style={styles.subtitle}>Super Admin Control Panel & Diagnostics</p>
      </div>

      {/* Quick Action Cards */}
      <div style={styles.quickActionsGrid}>
        <div onClick={() => handleQuickAction('admin-management')} className="glass-card" style={styles.actionCard}>
          <div style={{ ...styles.iconBg, background: 'rgba(34, 197, 94, 0.15)', color: 'var(--color-primary)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div style={styles.actionTextContainer}>
            <h3 style={styles.actionTitle}>Manage Admin Accounts</h3>
            <p style={styles.actionDesc}>Create, update, or revoke administrator access</p>
          </div>
        </div>

        <div onClick={() => handleQuickAction('branch-management')} className="glass-card" style={styles.actionCard}>
          <div style={{ ...styles.iconBg, background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 21h18"></path>
              <path d="M5 21V7l8-4 8 4v14"></path>
              <path d="M17 21v-8.5a1.5 1.5 0 0 0-3 0V21"></path>
            </svg>
          </div>
          <div style={styles.actionTextContainer}>
            <h3 style={styles.actionTitle}>Configure Branches</h3>
            <p style={styles.actionDesc}>Register and view branch locations across regions</p>
          </div>
        </div>

        <div onClick={() => handleQuickAction('account-management')} className="glass-card" style={styles.actionCard}>
          <div style={{ ...styles.iconBg, background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <div style={styles.actionTextContainer}>
            <h3 style={styles.actionTitle}>System Accounts</h3>
            <p style={styles.actionDesc}>Audit and alter general user roles and permissions</p>
          </div>
        </div>
      </div>

      <div style={styles.dashboardGrid}>
        {/* Statistics Panel */}
        <div className="glass-card" style={styles.card}>
          <h2 style={styles.chartTitle}>Core Metrics</h2>
          <p style={styles.chartSubtitle}>Consolidated counts of active entities in the system</p>
          
          <div style={styles.statsList}>
            <div style={styles.statItem}>
              <div style={{ ...styles.statIcon, background: 'rgba(34, 197, 94, 0.15)', color: 'var(--color-primary)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                </svg>
              </div>
              <div style={styles.statInfo}>
                <span style={styles.statLabel}>Admins Registered</span>
                <span style={styles.statValue}>{stats.totalAdmins}</span>
              </div>
            </div>

            <div style={styles.statItem}>
              <div style={{ ...styles.statIcon, background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 21h18"></path>
                  <path d="M5 21V7l8-4 8 4v14"></path>
                </svg>
              </div>
              <div style={styles.statInfo}>
                <span style={styles.statLabel}>Branches Operational</span>
                <span style={styles.statValue}>{stats.totalBranches}</span>
              </div>
            </div>

            <div style={styles.statItem}>
              <div style={{ ...styles.statIcon, background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </div>
              <div style={styles.statInfo}>
                <span style={styles.statLabel}>Active System Accounts</span>
                <span style={styles.statValue}>{stats.totalAccounts}</span>
              </div>
            </div>

            <div style={styles.statItem}>
              <div style={{ ...styles.statIcon, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
              </div>
              <div style={styles.statInfo}>
                <span style={styles.statLabel}>Audit Log Records</span>
                <span style={styles.statValue}>{stats.totalLogs}</span>
              </div>
            </div>
          </div>
        </div>

        {/* User & Status Summary */}
        <div className="glass-card" style={styles.card}>
          <h2 style={styles.chartTitle}>User & Status Summary</h2>
          <p style={styles.chartSubtitle}>Key operational indicators and admin activity overview</p>

          <div style={styles.sessionMonitorWrapper}>
            <div style={styles.sessionRow}>
              <span style={styles.sessionLabel}>Branch Status</span>
              <span style={{ ...styles.sessionValueBadge, backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>3 Active</span>
            </div>
            <div style={styles.sessionRow}>
              <span style={styles.sessionLabel}>Admin Status</span>
              <span style={{ ...styles.sessionValueBadge, backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>2 Active</span>
            </div>
            <div style={styles.sessionRow}>
              <span style={styles.sessionLabel}>User Account Health</span>
              <span style={{ ...styles.sessionValueBadge, backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>5 Active / 0 Locked</span>
            </div>
            <div style={styles.sessionRow}>
              <span style={styles.sessionLabel}>Pending Review</span>
              <span style={{ ...styles.sessionValueBadge, backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>1 Account</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Logs */}
      <div className="glass-card" style={{ ...styles.card, marginTop: '24px' }}>
        <h2 style={styles.chartTitle}>Recent Admin Activities</h2>
        <p style={styles.chartSubtitle}>Audit trail of modifications made by system administrators</p>

        <div style={styles.activityList}>
          {recentLogs.map((log, index) => (
            <div 
              key={log.id} 
              style={{
                ...styles.activityItem,
                borderBottom: index === recentLogs.length - 1 ? 'none' : '1px solid var(--color-border)',
                paddingBottom: index === recentLogs.length - 1 ? 0 : '12px',
              }}
            >
              <div style={styles.actMeta}>
                <span style={{
                  ...styles.actBadge,
                  backgroundColor: `${getActionColor(log.action)}15`,
                  color: getActionColor(log.action),
                }}>
                  {log.action.replace(/_/g, ' ')}
                </span>
                <span style={styles.actTime}>{log.timestamp}</span>
              </div>
              <p style={styles.actText}>
                <strong>{log.actor}</strong>: {log.details}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  header: {
    marginBottom: '8px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '800',
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.75px',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '15px',
    color: 'var(--color-text-secondary)',
  },
  quickActionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '20px',
    marginBottom: '8px',
  },
  actionCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  iconBg: {
    width: '48px',
    height: '48px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionTextContainer: {
    textAlign: 'left',
  },
  actionTitle: {
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '2px',
  },
  actionDesc: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    lineHeight: '1.3',
  },
  dashboardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: '24px',
  },
  card: {
    padding: '24px',
  },
  chartTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '4px',
    textAlign: 'left',
  },
  chartSubtitle: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    marginBottom: '20px',
    textAlign: 'left',
  },
  statsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 16px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-bg-card-hover)',
    border: '1px solid var(--color-border)',
  },
  statIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statInfo: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'left',
  },
  statLabel: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    fontWeight: '600',
  },
  statValue: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  sessionMonitorWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '10px 0',
  },
  sessionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '10px',
    borderBottom: '1px solid var(--color-border)',
  },
  sessionLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
  },
  sessionValueBadge: {
    fontSize: '12px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '4px',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    color: '#3b82f6',
  },
  sessionValueText: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    fontFamily: 'monospace',
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxHeight: '300px',
    overflowY: 'auto',
    paddingRight: '8px',
  },
  activityItem: {
    textAlign: 'left',
  },
  actMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  actBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: '20px',
  },
  actTime: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  actText: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    margin: 0,
    lineHeight: '1.4',
  },
};
