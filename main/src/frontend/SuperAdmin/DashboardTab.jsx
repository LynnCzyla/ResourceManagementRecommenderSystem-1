import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/superadmin`;

export default function DashboardTab({ setActiveTab }) {
  const [stats, setStats] = useState({
    totalAdmins: 0,
    activeAdmins: 0,
    totalBranches: 0,
    activeBranches: 0,
    branchesTableAvailable: true,
    totalAccounts: 0,
    activeAccounts: 0,
    inactiveAccounts: 0,
    lockedAccounts: 0,
    totalLogs: 0,
  });

  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeaders();

      const [statsRes, activityRes] = await Promise.all([
        fetch(`${API_BASE}/dashboard/stats`, { headers }),
        fetch(`${API_BASE}/dashboard/activity?limit=5`, { headers }),
      ]);

      const statsJson = await statsRes.json();
      const activityJson = await activityRes.json();

      if (statsJson.success) {
        setStats(statsJson.data);
      } else {
        throw new Error(statsJson.error || 'Failed to load dashboard stats');
      }

      if (activityJson.success) {
        setRecentLogs(activityJson.data || []);
      } else {
        throw new Error(activityJson.error || 'Failed to load recent activity');
      }
    } catch (err) {
      console.error('Error loading super admin dashboard:', err);
      setError('Unable to reach the server. Showing what is currently cached.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleQuickAction = (tab) => {
    setActiveTab(tab);
    localStorage.setItem('superAdminActiveTab', tab);
  };

  const getActionColor = (action) => {
    const normalized = (action || '').toLowerCase();
    if (normalized.includes('delete') || normalized.includes('deactivat')) return '#ef4444';
    if (normalized.includes('lock')) return '#f59e0b';
    if (normalized.includes('creat')) return '#22c55e';
    if (normalized.includes('updat') || normalized.includes('edit')) return '#3b82f6';
    return '#6b7280';
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>System Overview</h1>
        <p style={styles.subtitle}>Super Admin Control Panel & Diagnostics</p>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          {error}
        </div>
      )}

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
                <span style={styles.statValue}>{loading ? '—' : stats.totalAdmins}</span>
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
                <span style={styles.statLabel}>
                  Branches Operational
                  {!loading && !stats.branchesTableAvailable && (
                    <span style={styles.setupBadge}> · Not set up</span>
                  )}
                </span>
                <span style={styles.statValue}>{loading ? '—' : stats.totalBranches}</span>
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
                <span style={styles.statValue}>{loading ? '—' : stats.activeAccounts}</span>
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
                <span style={styles.statValue}>{loading ? '—' : stats.totalLogs}</span>
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
              <span style={{ ...styles.sessionValueBadge, backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>
                {loading ? '—' : `${stats.activeBranches} Active / ${stats.totalBranches} Total`}
              </span>
            </div>
            <div style={styles.sessionRow}>
              <span style={styles.sessionLabel}>Admin Status</span>
              <span style={{ ...styles.sessionValueBadge, backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
                {loading ? '—' : `${stats.activeAdmins} Active / ${stats.totalAdmins} Total`}
              </span>
            </div>
            <div style={styles.sessionRow}>
              <span style={styles.sessionLabel}>User Account Health</span>
              <span style={{ ...styles.sessionValueBadge, backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>
                {loading ? '—' : `${stats.activeAccounts} Active / ${stats.lockedAccounts} Locked`}
              </span>
            </div>
            <div style={styles.sessionRow}>
              <span style={styles.sessionLabel}>Inactive Accounts</span>
              <span style={{ ...styles.sessionValueBadge, backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                {loading ? '—' : `${stats.inactiveAccounts} Account${stats.inactiveAccounts === 1 ? '' : 's'}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Logs */}
      <div className="glass-card" style={{ ...styles.card, marginTop: '24px' }}>
        <h2 style={styles.chartTitle}>Recent Admin Activities</h2>
        <p style={styles.chartSubtitle}>Audit trail of modifications made by system administrators</p>

        <div style={styles.activityList}>
          {loading ? (
            <p style={styles.emptyText}>Loading recent activity…</p>
          ) : recentLogs.length === 0 ? (
            <p style={styles.emptyText}>No audit log activity yet.</p>
          ) : (
            recentLogs.map((log, index) => (
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
                    {(log.action || 'Activity').toString().replace(/_/g, ' ')}
                  </span>
                  <span style={styles.actTime}>{log.timestamp}</span>
                </div>
                <p style={styles.actText}>
                  <strong>{log.actor}</strong>: {log.details}
                </p>
              </div>
            ))
          )}
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
  errorBanner: {
    padding: '12px 16px',
    borderRadius: 'var(--radius-md)',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    fontSize: '13px',
    fontWeight: '600',
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
  setupBadge: {
    color: '#f59e0b',
    fontWeight: '700',
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
  emptyText: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    textAlign: 'center',
    padding: '16px 0',
  },
};