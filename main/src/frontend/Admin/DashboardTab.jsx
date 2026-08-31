import React, { useState, useEffect } from 'react';

export default function DashboardTab({ setActiveTab, setUserMgmtOpen }) {
  const navigateTo = (tabName, expandMenu) => {
    setActiveTab(tabName);
    if (expandMenu === 'user') {
      setUserMgmtOpen(true);
    }
  };

  const [statusInfo, setStatusInfo] = useState({
    status: 'Loading...',
    totalUsers: 'Loading...',
    totalDepartments: 'Loading...',
  });

  const [userRolesData, setUserRolesData] = useState([]);
  const [activities, setActivities] = useState([]);
  const [branchInfo, setBranchInfo] = useState(null);
  const [userRole, setUserRole] = useState('');

  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [sessionDuration, setSessionDuration] = useState('00:00');

  // ── Department filter (Total Departments stat) ──────────────────────────────
  const [departments, setDepartments] = useState([]);
  const [selectedDeptId, setSelectedDeptId] = useState('all');
  const [deptPositionCount, setDeptPositionCount] = useState(null);
  const [loadingDeptFilter, setLoadingDeptFilter] = useState(false);

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
    const fetchDashboardStats = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const res = await fetch('http://localhost:5000/api/admin/dashboard/stats', { headers });
        const json = await res.json();

        if (json.success) {
          setStatusInfo({
            status: json.data.status,
            totalUsers: json.data.totalUsers,
            totalDepartments: json.data.totalDepartments,
          });
          setUserRolesData(json.data.userRolesData || []);
          setBranchInfo(json.data.branch || null);
          setUserRole(json.data.user_role || '');
        } else {
          setStatusInfo((prev) => ({ ...prev, status: 'Offline' }));
        }
      } catch (err) {
        console.error('Error fetching dashboard stats:', err);
        setStatusInfo((prev) => ({ ...prev, status: 'Offline' }));
      }
    };

    const fetchActivity = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const res = await fetch('http://localhost:5000/api/admin/dashboard/activity?limit=5', { headers });
        const json = await res.json();

        if (json.success) {
          setActivities(json.data || []);
        }
      } catch (err) {
        console.error('Error fetching recent activity:', err);
      }
    };

    const fetchDepartments = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const res = await fetch('http://localhost:5000/api/admin/departments', { headers });
        const json = await res.json();

        if (json.success) {
          setDepartments(json.data || []);
        }
      } catch (err) {
        console.error('Error fetching departments:', err);
      }
    };

    fetchDashboardStats();
    fetchActivity();
    fetchDepartments();
  }, []);

  // ── Handle department filter change ─────────────────────────────────────────
  const handleDepartmentFilterChange = async (deptId) => {
    setSelectedDeptId(deptId);

    if (deptId === 'all') {
      setDeptPositionCount(null);
      return;
    }

    try {
      setLoadingDeptFilter(true);
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch(`http://localhost:5000/api/admin/positions?dept_id=${deptId}`, { headers });
      const json = await res.json();

      if (json.success) {
        setDeptPositionCount((json.data || []).length);
      } else {
        setDeptPositionCount(null);
      }
    } catch (err) {
      console.error('Error fetching positions for department:', err);
      setDeptPositionCount(null);
    } finally {
      setLoadingDeptFilter(false);
    }
  };

  const selectedDeptName = selectedDeptId === 'all'
    ? null
    : departments.find((d) => String(d.id) === String(selectedDeptId))?.department_name || null;

  // Build cumulative stroke-dasharray/dashoffset for each donut segment.
  let cumulative = 0;
  const donutSegments = userRolesData.map((role) => {
    const dashoffset = 100 - cumulative;
    cumulative += role.percentage;
    return { ...role, dashoffset };
  });

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Get user name from localStorage
  const getUserName = () => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        return user.first_name || user.name || 'Admin';
      }
    } catch (e) {
      return 'Admin';
    }
    return 'Admin';
  };

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{getGreeting()}, {getUserName()}!</h1>
          <p style={styles.subtitle}>
            Resource Management Recommender System for WEA
            {branchInfo && ` — ${branchInfo.name} (${branchInfo.code})`}
            {userRole === 'Super Admin' && ' — Super Admin (All Branches)'}
          </p>
        </div>
        {branchInfo && (
          <div style={styles.branchBadge}>
            <span style={styles.branchBadgeLabel}>Branch:</span>
            <span style={styles.branchBadgeValue}>{branchInfo.name}</span>
          </div>
        )}
        {userRole === 'Super Admin' && (
          <div style={styles.superAdminBadge}>
            <span>👑 Super Admin</span>
          </div>
        )}
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
          <p style={styles.chartSubtitle}>
            {branchInfo ? `Current metrics for ${branchInfo.name}` : 'Current system health and performance metrics'}
          </p>

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

            <div style={{ ...styles.statusItem, alignItems: 'flex-start' }}>
              <div style={{ ...styles.statusIcon, background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </div>
              <div style={{ width: '100%' }}>
                <div style={styles.statusLabel}>
                  Total Departments {branchInfo ? `(${branchInfo.name})` : ''}
                </div>
                <div style={styles.statusValue}>{statusInfo.totalDepartments}</div>

                <select
                  value={selectedDeptId}
                  onChange={(e) => handleDepartmentFilterChange(e.target.value)}
                  style={styles.deptFilterSelect}
                >
                  <option value="all">Filter by department…</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.department_name}
                    </option>
                  ))}
                </select>

                {selectedDeptId !== 'all' && (
                  <div style={styles.deptFilterResult}>
                    {loadingDeptFilter
                      ? 'Loading…'
                      : `${deptPositionCount ?? 0} position${deptPositionCount === 1 ? '' : 's'} in ${selectedDeptName || 'this department'}`}
                  </div>
                )}
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
          <p style={styles.chartSubtitle}>
            {branchInfo ? `Breakdown of accounts in ${branchInfo.name}` : 'Breakdown of system accounts assigned'}
          </p>

          <div style={styles.donutContainer}>
            <svg width="150" height="150" viewBox="0 0 42 42" style={styles.donutSvg}>
              <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="var(--color-border)" strokeWidth="4" />
              {donutSegments.map((seg, idx) => (
                <circle
                  key={idx}
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="transparent"
                  stroke={seg.color}
                  strokeWidth="4"
                  strokeDasharray={`${seg.percentage} ${100 - seg.percentage}`}
                  strokeDashoffset={seg.dashoffset}
                />
              ))}
            </svg>

            <div style={styles.legendContainer}>
              {userRolesData.length === 0 && (
                <span style={styles.legendCount}>No role data yet.</span>
              )}
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
          <p style={styles.chartSubtitle}>
            {branchInfo ? `Recent activity in ${branchInfo.name}` : 'Live trail of audit changes'}
          </p>
          <div style={styles.activityList}>
            {activities.length === 0 && (
              <p style={styles.actText}>No recent activity yet.</p>
            )}
            {activities.map((act, index) => (
              <div
                key={act.id}
                style={{
                  ...styles.activityItem,
                  borderBottom: index === activities.length - 1 ? 'none' : '1px solid var(--color-border)',
                  paddingBottom: index === activities.length - 1 ? 0 : '12px',
                }}
              >
                <div style={styles.actMeta}>
                  <span
                    style={{
                      ...styles.actBadge,
                      backgroundColor: act.user === 'System' ? 'var(--color-primary-light)' : 'var(--color-accent-light)',
                      color: act.user === 'System' ? 'var(--color-primary)' : 'var(--color-accent)',
                    }}
                  >
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
              <span
                style={{
                  ...styles.sessionValueBadge,
                  color: 'var(--color-primary)',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                }}
              >
                Active
              </span>
            </div>
            <div style={styles.sessionRow}>
              <span style={styles.sessionLabel}>Session Duration</span>
              <span style={styles.sessionValueText}>{sessionDuration}</span>
            </div>
            <div style={styles.sessionRow}>
              <span style={styles.sessionLabel}>Current Time</span>
              <span style={styles.sessionValueText}>{currentTime}</span>
            </div>
            <div style={styles.sessionRow}>
              <span style={styles.sessionLabel}>Branch Access</span>
              <span style={styles.sessionValueBadge}>
                {branchInfo ? branchInfo.name : (userRole === 'Super Admin' ? 'All Branches' : 'None')}
              </span>
            </div>
            {userRole && (
              <div style={styles.sessionRow}>
                <span style={styles.sessionLabel}>User Role</span>
                <span style={styles.sessionValueBadge}>{userRole}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  header: {
    marginBottom: '28px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '16px',
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
  branchBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-primary-light)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
  },
  branchBadgeLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  branchBadgeValue: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--color-primary)',
  },
  superAdminBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: 'var(--radius-md)',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: 'var(--color-danger)',
    fontSize: '14px',
    fontWeight: '700',
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
  },
  deptFilterSelect: {
    marginTop: '8px',
    width: '100%',
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    outline: 'none',
  },
  deptFilterResult: {
    marginTop: '6px',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--color-primary)',
  },
};