import React from 'react';

export default function DashboardTab({ setActiveTab, setUserMgmtOpen, setLogsOpen }) {
  const navigateTo = (tabName, expandMenu) => {
    setActiveTab(tabName);
    if (expandMenu === 'user') {
      setUserMgmtOpen(true);
    } else if (expandMenu === 'logs') {
      setLogsOpen(true);
    }
  };

  const systemPerformanceData = [20, 35, 30, 45, 60, 55, 70, 65, 80, 75, 85, 90];
  const userRolesData = [
    { label: 'Resource Managers', count: 3, percentage: 6, color: '#10b981' },
    { label: 'Project Managers', count: 5, percentage: 10, color: '#0ea5e9' },
    { label: 'Skilled Employees', count: 42, percentage: 84, color: '#6366f1' }
  ];

  const activities = [
    { id: 1, text: 'User Romell Ebuen assigned role Resource Manager', time: '2 hours ago', user: 'Admin' },
    { id: 2, text: 'OCR processing successful for romell_cv.pdf (98.2% Accuracy)', time: '3 hours ago', user: 'System' },
    { id: 3, text: 'System configuration "OCR Sensitivity" updated to 85%', time: '6 hours ago', user: 'Admin' },
    { id: 4, text: 'New project "Substation Safety Installation" created', time: '1 day ago', user: 'ProjManager' },
    { id: 5, text: 'Deactivated employee account "John Tester"', time: '2 days ago', user: 'Admin' },
    { id: 6, text: 'NLP synonym dictionary rebuilt (Added 4 new oil & gas terms)', time: '3 days ago', user: 'System' },
  ];

  const databaseStats = [
    { label: 'Resumes', count: 42, color: 'var(--color-primary)' },
    { label: 'Certificates', count: 96, color: 'var(--color-accent)' },
    { label: 'Projects', count: 12, color: '#8b5cf6' },
    { label: 'Audit Logs', count: 340, color: '#f59e0b' }
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

        <div onClick={() => navigateTo('reports')} className="glass-card" style={styles.actionCard}>
          <div style={{ ...styles.iconBg, background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div style={styles.actionTextContainer}>
            <h3 style={styles.actionTitle}>Generate System Report</h3>
          </div>
        </div>

        <div onClick={() => navigateTo('ocr-logs', 'logs')} className="glass-card" style={styles.actionCard}>
          <div style={{ ...styles.iconBg, background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
              <path d="M3 10h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8z"></path>
            </svg>
          </div>
          <div style={styles.actionTextContainer}>
            <h3 style={styles.actionTitle}>Monitor OCR/NLP Logs</h3>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="glass-card">
          <h2 style={styles.chartTitle}>Overall System Performance</h2>
          <p style={styles.chartSubtitle}>Processing efficiency and OCR accuracy index over time</p>
          
          <div style={styles.svgContainer}>
            <svg viewBox="0 0 500 200" width="100%" height="200" style={{ overflow: 'visible' }}>
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              
              <line x1="0" y1="50" x2="500" y2="50" stroke="var(--color-border)" strokeWidth="0.5" strokeDasharray="4" />
              <line x1="0" y1="100" x2="500" y2="100" stroke="var(--color-border)" strokeWidth="0.5" strokeDasharray="4" />
              <line x1="0" y1="150" x2="500" y2="150" stroke="var(--color-border)" strokeWidth="0.5" strokeDasharray="4" />
              
              <path 
                d={`M 0 180 
                    L 0 ${180 - systemPerformanceData[0] * 1.5} 
                    C 45 ${180 - systemPerformanceData[1] * 1.5}, 90 ${180 - systemPerformanceData[2] * 1.5}, 135 ${180 - systemPerformanceData[3] * 1.5}
                    C 180 ${180 - systemPerformanceData[4] * 1.5}, 225 ${180 - systemPerformanceData[5] * 1.5}, 270 ${180 - systemPerformanceData[6] * 1.5}
                    C 315 ${180 - systemPerformanceData[7] * 1.5}, 360 ${180 - systemPerformanceData[8] * 1.5}, 405 ${180 - systemPerformanceData[9] * 1.5}
                    C 450 ${180 - systemPerformanceData[10] * 1.5}, 480 ${180 - systemPerformanceData[11] * 1.5}, 500 ${180 - systemPerformanceData[11] * 1.5}
                    L 500 180 Z`}
                fill="url(#chartGrad)"
              />
              
              <path 
                d={`M 0 ${180 - systemPerformanceData[0] * 1.5} 
                    C 45 ${180 - systemPerformanceData[1] * 1.5}, 90 ${180 - systemPerformanceData[2] * 1.5}, 135 ${180 - systemPerformanceData[3] * 1.5}
                    C 180 ${180 - systemPerformanceData[4] * 1.5}, 225 ${180 - systemPerformanceData[5] * 1.5}, 270 ${180 - systemPerformanceData[6] * 1.5}
                    C 315 ${180 - systemPerformanceData[7] * 1.5}, 360 ${180 - systemPerformanceData[8] * 1.5}, 405 ${180 - systemPerformanceData[9] * 1.5}
                    C 450 ${180 - systemPerformanceData[10] * 1.5}, 480 ${180 - systemPerformanceData[11] * 1.5}, 500 ${180 - systemPerformanceData[11] * 1.5}`}
                fill="none" 
                stroke="var(--color-primary)" 
                strokeWidth="3"
                strokeLinecap="round"
              />

              <circle cx="270" cy={180 - systemPerformanceData[6] * 1.5} r="5" fill="var(--color-primary)" stroke="var(--color-bg-card)" strokeWidth="2" />
              <circle cx="500" cy={180 - systemPerformanceData[11] * 1.5} r="5" fill="var(--color-primary)" stroke="var(--color-bg-card)" strokeWidth="2" />
              
              <text x="5" y="40" fill="var(--color-text-muted)" fontSize="9">90% Max Efficiency</text>
              <text x="5" y="195" fill="var(--color-text-muted)" fontSize="9">Week 1</text>
              <text x="250" y="195" fill="var(--color-text-muted)" fontSize="9">Week 6</text>
              <text x="460" y="195" fill="var(--color-text-muted)" fontSize="9">Current</text>
            </svg>
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
          <h2 style={styles.chartTitle}>Database Health Status</h2>
          <p style={styles.chartSubtitle}>Record distribution across entities (Sync Status: OK)</p>
          
          <div style={styles.dbStatsWrapper}>
            {databaseStats.map((stat, idx) => {
              const maxVal = 340;
              const barHeight = (stat.count / maxVal) * 100;
              return (
                <div key={idx} style={styles.dbStatColumn}>
                  <div style={styles.dbBarTrack}>
                    <div style={{ 
                      ...styles.dbBarFill, 
                      height: `${barHeight}%`, 
                      backgroundColor: stat.color,
                      boxShadow: `0 0 10px ${stat.color}40`
                    }}></div>
                  </div>
                  <span style={styles.dbStatCount}>{stat.count}</span>
                  <span style={styles.dbStatLabel}>{stat.label}</span>
                </div>
              );
            })}
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
  dbStatsWrapper: {
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: '180px',
    paddingBottom: '10px',
  },
  dbStatColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '60px',
  },
  dbBarTrack: {
    width: '18px',
    height: '120px',
    backgroundColor: 'var(--color-border)',
    borderRadius: '10px',
    position: 'relative',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  dbBarFill: {
    width: '100%',
    position: 'absolute',
    bottom: 0,
    borderRadius: '10px',
    transition: 'height 1s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  dbStatCount: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  dbStatLabel: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    marginTop: '2px',
  }
};
