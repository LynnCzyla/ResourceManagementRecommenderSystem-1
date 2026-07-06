import React, { useState, useEffect } from 'react';

export default function DashboardTab({ setActiveTab, setUserMgmtOpen }) {
  const navigateTo = (tabName, expandMenu) => {
    setActiveTab(tabName);
    if (expandMenu === 'user') {
      setUserMgmtOpen(true);
    }
  };

  const [statusInfo, setStatusInfo] = useState({
    status: 'Online',
    totalUsers: 'Loading...',
    totalDepartments: 'Loading...'
  });

  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [sessionDuration, setSessionDuration] = useState('00:00');

  useEffect(() => {
    const startTime = Date.now();
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
      const diff = Date.now() - startTime;
      const secs = Math.floor((diff / 1000) % 60);
      const mins = Math.floor((diff / (1000 * 60)) % 60);
      setSessionDuration(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchSystemInfo = async () => {
      let isOnline = 'Offline';
      try {
        const res = await fetch('http://localhost:5000/api/health');
        if (res.ok) {
          isOnline = 'Online';
        }
      } catch (err) {
        console.error('Error checking API health:', err);
      }

      let userCount = 0;
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch('http://localhost:5000/api/users', { headers });
        const users = await res.json();
        if (Array.isArray(users)) {
          userCount = users.length;
        } else if (users && Array.isArray(users.data)) {
          userCount = users.data.length;
        }
      } catch (err) {
        console.error('Error fetching users count:', err);
      }

      let deptCount = 0;
      try {
        const res = await fetch('http://localhost:5000/api/admin/departments');
        if (res.ok) {
          const depts = await res.json();
          if (Array.isArray(depts)) {
            deptCount = depts.length;
          }
        }
      } catch (err) {
        console.error('Error fetching departments count:', err);
      }

      setStatusInfo({
        status: isOnline,
        totalUsers: userCount,
        totalDepartments: deptCount
      });
    };

    fetchSystemInfo();
  }, []);

  const userRolesData = [
    { label: 'Resource Managers', count: 3, percentage: 6, color: '#10b981' },
    { label: 'Project Managers', count: 5, percentage: 10, color: '#0ea5e9' },
    { label: 'Skilled Employees', count: 42, percentage: 84, color: '#6366f1' }
  ];

  const activities = [
    { id: 1, text: 'User Romell Ebuen assigned role Resource Manager', time: '2 hours ago', user: 'Admin' },
    { id: 2, text: 'New project "Substation Safety Installation" created', time: '3 hours ago', user: 'ProjManager' },
    { id: 3, text: 'System configuration updated', time: '6 hours ago', user: 'Admin' },
    { id: 4, text: 'Deactivated employee account "John Tester"', time: '1 day ago', user: 'Admin' },
    { id: 5, text: 'New user account created for Maria Santos', time: '2 days ago', user: 'Admin' },
  ];

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>System Overview</h1>
        <p style={styles.subtitle}>Resource Management Recommender System for WEA</p>
      </div>

      <div style={styles.quickActionsGrid}>
        <div onClick={() => navigateTo('user-accounts', 'user')} className="glass-card" style={styles.actionCard}>
          <div style={{ ...styles.iconBg, background: 'rgba(16, 185, 129, 0.15)', color: 'var(--color-primary)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <line x1="19" y1="8" x2="19" y2="14"></line>
              <line x1="22" y1="11" x2="16" y2="11"></line>
            </svg>
          </div>
          <div style={styles.actionTextContainer}>
            <h3 style={styles.actionTitle}>Create User Account</h3>
          </div>
        </div>

        <div onClick={() => navigateTo('system-settings')} className="glass-card" style={styles.actionCard}>
          <div style={{ ...styles.iconBg, background: 'rgba(2, 132, 199, 0.15)', color: 'var(--color-accent)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </div>
          <div style={styles.actionTextContainer}>
            <h3 style={styles.actionTitle}>Edit System Settings</h3>
          </div>
        </div>

      </div>

      <div className="dashboard-grid">
        <div className="glass-card">
          <h2 style={styles.chartTitle}>System Status</h2>
          <p style={styles.chartSubtitle}>Current system health and performance metrics</p>
          
          <div style={styles.statusGrid}>
            <div style={styles.statusItem}>
              <div style={{ ...styles.statusIcon, background: 'rgba(16, 185, 129, 0.15)', color: 'var(--color-primary)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              </div>
              <div>
                <div style={styles.statusLabel}>Status</div>
                <div style={{ ...styles.statusValue, color: 'var(--color-primary)' }}>{statusInfo.status}</div>
              </div>
            </div>
            
            <div style={styles.statusItem}>
              <div style={{ ...styles.statusIcon, background: 'rgba(2, 132, 199, 0.15)', color: 'var(--color-accent)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              </div>
              <div>
                <div style={styles.statusLabel}>System Version</div>
                <div style={styles.statusValue}>v1.0.0</div>
              </div>
            </div>
            
            <div style={styles.statusItem}>
              <div style={{ ...styles.statusIcon, background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </div>
              <div>
                <div style={styles.statusLabel}>Total Departments</div>
                <div style={styles.statusValue}>{statusInfo.totalDepartments}</div>
              </div>
            </div>
            
            <div style={styles.statusItem}>
              <div style={{ ...styles.statusIcon, background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
              </div>
              <div>
                <div style={styles.statusLabel}>Registered Accounts</div>
                <div style={styles.statusValue}>{statusInfo.totalUsers}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card">
          <h2 style={styles.chartTitle}>Active Users by Role</h2>
          <p style={styles.chartSubtitle}>Breakdown of system accounts assigned</p>
          
          <div style={styles.donutContainer}>
            <svg width="150" height="150" viewBox="0 0 42 42" style={styles.donutSvg}>
              <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="var(--color-border)" strokeWidth="4" />
              <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#6366f1" strokeWidth="4" 
                strokeDasharray="84 16" strokeDashoffset="100" />
              <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#0ea5e9" strokeWidth="4" 
                strokeDasharray="10 90" strokeDashoffset="16" />
              <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#10b981" strokeWidth="4" 
                strokeDasharray="6 94" strokeDashoffset="6" />
            </svg>
            
            <div style={styles.legendContainer}>
              {userRolesData.map((role, idx) => (
                <div key={idx} style={styles.legendItem}>
                  <div style={{ ...styles.legendDot, backgroundColor: role.color }}></div>
                  <div style={styles.legendTextContainer}>
                    <span style={styles.legendLabel}>{role.label}</span>
                    <span style={styles.legendCount}>{role.count} ({role.percentage}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid" style={{ marginTop: '24px' }}>
        <div className="glass-card">
          <h2 style={styles.chartTitle}>Recent Portal Activity</h2>
          <p style={styles.chartSubtitle}>Live trail of audit changes on WEA recommender database</p>
          <div style={styles.activityList}>
            {activities.map((act, index) => (
              <div key={act.id} style={{
                ...styles.activityItem,
                borderBottom: index === activities.length - 1 ? 'none' : '1px solid var(--color-border)',
                paddingBottom: index === activities.length - 1 ? 0 : '12px'
              }}>
                <div style={styles.actMeta}>
                  <span style={{ 
                    ...styles.actBadge, 
                    backgroundColor: act.user === 'System' ? 'var(--color-primary-light)' : 'var(--color-accent-light)',
                    color: act.user === 'System' ? 'var(--color-primary)' : 'var(--color-accent)',
                  }}>
                    {act.user}
                  </span>
                  <span style={styles.actTime}>{act.time}</span>
                </div>
                <p style={styles.actText}>{act.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card">
          <h2 style={styles.chartTitle}>Admin Session Monitor</h2>
          <p style={styles.chartSubtitle}>Real-time frontend session diagnostics</p>
          
          <div style={styles.sessionMonitorWrapper}>
            <div style={styles.sessionRow}>
              <span style={styles.sessionLabel}>Environment</span>
              <span style={styles.sessionValueBadge}>Development</span>
            </div>
            <div style={styles.sessionRow}>
              <span style={styles.sessionLabel}>Database Link</span>
              <span style={{ ...styles.sessionValueBadge, color: 'var(--color-primary)', backgroundColor: 'rgba(16, 185, 129, 0.15)' }}>Active</span>
            </div>
            <div style={styles.sessionRow}>
              <span style={styles.sessionLabel}>Session Duration</span>
              <span style={styles.sessionValueText}>{sessionDuration}</span>
            </div>
            <div style={styles.sessionRow}>
              <span style={styles.sessionLabel}>Current Time</span>
              <span style={styles.sessionValueText}>{currentTime}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  header: {
    marginBottom: '28px',
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
    marginBottom: '32px',
  },
  actionCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    '&:hover': {
      transform: 'translateY(-2px)',
      borderColor: 'var(--color-primary)',
      backgroundColor: 'var(--color-bg-card-hover)',
    }
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
  chartTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '4px',
  },
  chartSubtitle: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    marginBottom: '20px',
  },
  svgContainer: {
    position: 'relative',
    width: '100%',
    paddingTop: '10px',
  },
  donutContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '28px',
    padding: '20px 0',
  },
  donutSvg: {
    transform: 'rotate(-90deg)',
    flexShrink: 0,
  },
  legendContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    textAlign: 'left',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  legendDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  legendTextContainer: {
    display: 'flex',
    flexDirection: 'column',
    lineHeight: 1.2,
  },
  legendLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
  },
  legendCount: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxHeight: '220px',
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
    marginBottom: '4px',
  },
  actBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '2px 6px',
    borderRadius: '4px',
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
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    color: 'var(--color-accent)',
  },
  sessionValueText: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    fontFamily: 'monospace',
  },
  statusGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px',
    padding: '8px 0',
  },
  statusItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-bg-root)',
    border: '1px solid var(--color-border)',
  },
  statusIcon: {
    width: '40px',
    height: '40px',
    borderRadius: 'var(--radius-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statusLabel: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    marginBottom: '4px',
  },
  statusValue: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  }
};
