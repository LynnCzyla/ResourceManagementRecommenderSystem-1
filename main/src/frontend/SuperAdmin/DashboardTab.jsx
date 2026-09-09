import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../../config/api';

const API_BASE = `${API_BASE_URL}/api/superadmin`;

// Cache helper functions - with versioning for smart refresh
const CACHE_KEY = 'superadmin_dashboard_cache';
const CACHE_VERSION_KEY = 'superadmin_dashboard_cache_version';

// Track cache version - increment this when you want to force refresh all users
let cacheVersion = 1;

const getCachedData = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached);
      // Check if cache version matches
      const storedVersion = localStorage.getItem(CACHE_VERSION_KEY);
      if (storedVersion && parseInt(storedVersion) === cacheVersion) {
        return data;
      }
    }
    return null;
  } catch {
    return null;
  }
};

const setCachedData = (data) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_VERSION_KEY, String(cacheVersion));
  } catch {
    // Ignore cache errors
  }
};

// Force clear all cache (call this when you want to force a refresh globally)
export const clearDashboardCache = () => {
  cacheVersion++;
  localStorage.setItem(CACHE_VERSION_KEY, String(cacheVersion));
  localStorage.removeItem(CACHE_KEY);
};

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

  const [roleBreakdown, setRoleBreakdown] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Refs for caching and preventing duplicate requests
  const isMounted = useRef(true);
  const fetchInProgress = useRef(false);
  const initialLoadComplete = useRef(false);
  const backgroundRefreshTimeout = useRef(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Helper function to generate mock role data
  const generateMockRoleData = useCallback((totalAccounts) => {
    const total = totalAccounts || 50;
    const mockRoles = [
      { role: 'Super Admin', count: Math.max(1, Math.floor(total * 0.02)), color: '#ef4444' },
      { role: 'Admin', count: Math.max(1, Math.floor(total * 0.08)), color: '#f59e0b' },
      { role: 'Human Resources', count: Math.max(1, Math.floor(total * 0.15)), color: '#8b5cf6' },
      { role: 'Project Manager', count: Math.max(1, Math.floor(total * 0.20)), color: '#3b82f6' },
      { role: 'Resource Manager', count: Math.max(1, Math.floor(total * 0.25)), color: '#22c55e' },
      { role: 'Employee', count: Math.max(1, Math.floor(total * 0.30)), color: '#6b7280' },
    ];
    
    const totalCount = mockRoles.reduce((sum, r) => sum + r.count, 0);
    return mockRoles.map(role => ({
      ...role,
      percentage: Math.round((role.count / totalCount) * 100)
    }));
  }, []);

  const fetchDashboardData = useCallback(async (forceRefresh = false, silent = false) => {
    // Prevent multiple simultaneous fetches
    if (fetchInProgress.current) return;

    // If data is already loaded and not forcing refresh, skip
    if (initialLoadComplete.current && !forceRefresh) {
      console.log('✅ Dashboard data already loaded, skipping fetch');
      return;
    }

    // Check cache first (only if not forcing refresh)
    if (!forceRefresh) {
      const cachedData = getCachedData();
      if (cachedData) {
        console.log('📦 Loading dashboard data from cache');
        if (isMounted.current) {
          setStats(cachedData.stats || stats);
          setRoleBreakdown(cachedData.roleBreakdown || []);
          setRecentLogs(cachedData.recentLogs || []);
          setLoading(false);
          initialLoadComplete.current = true;
          
          // Schedule a background refresh to get fresh data
          if (backgroundRefreshTimeout.current) {
            clearTimeout(backgroundRefreshTimeout.current);
          }
          backgroundRefreshTimeout.current = setTimeout(() => {
            if (isMounted.current && !fetchInProgress.current) {
              console.log('🔄 Background refresh: fetching fresh dashboard data');
              fetchDashboardData(true, true);
            }
          }, 5000); // Refresh after 5 seconds in background
          
          return;
        }
      }
    }

    fetchInProgress.current = true;
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    
    try {
      const headers = getAuthHeaders();

      // Fetch stats
      const statsRes = await fetch(`${API_BASE}/dashboard/stats`, { headers });
      const statsJson = await statsRes.json();

      let updatedStats = stats;
      if (statsJson.success && isMounted.current) {
        updatedStats = statsJson.data;
        setStats(updatedStats);
      } else if (isMounted.current) {
        throw new Error(statsJson.error || 'Failed to load dashboard stats');
      }

      let updatedRoleBreakdown = [];
      // Fetch role breakdown - with error handling for 404
      try {
        const roleRes = await fetch(`${API_BASE}/dashboard/role-breakdown`, { headers });
        
        if (roleRes.ok && isMounted.current) {
          const roleJson = await roleRes.json();
          if (roleJson.success) {
            updatedRoleBreakdown = roleJson.data || [];
            setRoleBreakdown(updatedRoleBreakdown);
          } else {
            updatedRoleBreakdown = generateMockRoleData(updatedStats.totalAccounts || updatedStats.activeAccounts + updatedStats.inactiveAccounts + updatedStats.lockedAccounts);
            setRoleBreakdown(updatedRoleBreakdown);
          }
        } else if (isMounted.current) {
          console.log('Role breakdown endpoint not found, using mock data');
          updatedRoleBreakdown = generateMockRoleData(updatedStats.totalAccounts || updatedStats.activeAccounts + updatedStats.inactiveAccounts + updatedStats.lockedAccounts);
          setRoleBreakdown(updatedRoleBreakdown);
        }
      } catch (roleErr) {
        console.log('Error fetching role breakdown, using mock data:', roleErr.message);
        if (isMounted.current) {
          updatedRoleBreakdown = generateMockRoleData(updatedStats.totalAccounts || updatedStats.activeAccounts + updatedStats.inactiveAccounts + updatedStats.lockedAccounts);
          setRoleBreakdown(updatedRoleBreakdown);
        }
      }

      let updatedRecentLogs = [];
      // Fetch activity
      try {
        const activityRes = await fetch(`${API_BASE}/dashboard/activity?limit=10`, { headers });
        if (activityRes.ok && isMounted.current) {
          const activityJson = await activityRes.json();
          if (activityJson.success) {
            updatedRecentLogs = activityJson.data || [];
            setRecentLogs(updatedRecentLogs);
          }
        }
      } catch (activityErr) {
        console.log('Error fetching activity:', activityErr.message);
        // Keep empty logs
      }

      // Save to cache
      const cacheData = {
        stats: updatedStats,
        roleBreakdown: updatedRoleBreakdown,
        recentLogs: updatedRecentLogs,
      };
      setCachedData(cacheData);

      if (isMounted.current) {
        initialLoadComplete.current = true;
        // Clear any pending background refresh
        if (backgroundRefreshTimeout.current) {
          clearTimeout(backgroundRefreshTimeout.current);
          backgroundRefreshTimeout.current = null;
        }
      }

    } catch (err) {
      console.error('Error loading super admin dashboard:', err);
      if (isMounted.current) {
        if (!silent) {
          setError('Unable to reach the server. Showing cached data if available.');
        }
        
        // Try to load from cache as fallback
        const cachedData = getCachedData();
        if (cachedData) {
          console.log('📦 Loading cached data as fallback');
          setStats(cachedData.stats || stats);
          setRoleBreakdown(cachedData.roleBreakdown || []);
          setRecentLogs(cachedData.recentLogs || []);
          initialLoadComplete.current = true;
        } else if (!silent) {
          // Generate mock data if no cache
          const total = stats.totalAccounts || 50;
          const mockRoles = generateMockRoleData(total);
          setRoleBreakdown(mockRoles);
        }
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
      fetchInProgress.current = false;
    }
  }, [stats, generateMockRoleData]);

  // Initial load - show cache immediately, then refresh
  useEffect(() => {
    // Try to load cached data immediately
    const cachedData = getCachedData();
    if (cachedData) {
      console.log('📦 Loading cached dashboard on mount');
      setStats(cachedData.stats || stats);
      setRoleBreakdown(cachedData.roleBreakdown || []);
      setRecentLogs(cachedData.recentLogs || []);
      setLoading(false);
      initialLoadComplete.current = true;
      
      // Fetch fresh data in background
      setTimeout(() => {
        if (isMounted.current && !fetchInProgress.current) {
          console.log('🔄 Initial background refresh for dashboard');
          fetchDashboardData(true, true);
        }
      }, 1000);
    } else {
      // No cache, load fresh
      fetchDashboardData();
    }

    // Cleanup function
    return () => {
      isMounted.current = false;
      if (backgroundRefreshTimeout.current) {
        clearTimeout(backgroundRefreshTimeout.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only runs once

  // Refresh function that can be called manually
  const refreshData = useCallback(() => {
    if (!isRefreshing) {
      setIsRefreshing(true);
      localStorage.removeItem(CACHE_KEY);
      initialLoadComplete.current = false;
      fetchDashboardData(true);
    }
  }, [fetchDashboardData, isRefreshing]);

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

  // Calculate total accounts
  const totalAccounts = stats.totalAccounts || (stats.activeAccounts + stats.inactiveAccounts + stats.lockedAccounts);

  // Build cumulative stroke-dasharray/dashoffset for donut segments
  let cumulative = 0;
  const donutSegments = roleBreakdown.map((role) => {
    const percentage = role.percentage || (role.count / totalAccounts * 100);
    const dashoffset = 100 - cumulative;
    cumulative += percentage;
    return { ...role, dashoffset, percentage };
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>System Overview</h1>
          <p style={styles.subtitle}>Super Admin Control Panel & Diagnostics</p>
        </div>

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
                <span style={styles.statLabel}>Total Accounts</span>
                <span style={styles.statValue}>{loading ? '—' : totalAccounts}</span>
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
              <span style={styles.sessionLabel}>Account Breakdown</span>
              <span style={{ ...styles.sessionValueBadge, backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>
                {loading ? '—' : `${stats.activeAccounts} Active / ${stats.inactiveAccounts} Inactive`}
              </span>
            </div>
            <div style={styles.sessionRow}>
              <span style={styles.sessionLabel}>Locked Accounts</span>
              <span style={{ ...styles.sessionValueBadge, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                {loading ? '—' : stats.lockedAccounts}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Role Breakdown Chart */}
      <div className="glass-card" style={{ ...styles.card, marginTop: '24px' }}>
        <h2 style={styles.chartTitle}>Accounts by Role</h2>
        <p style={styles.chartSubtitle}>Distribution of system accounts across all roles</p>

        <div style={styles.donutContainer}>
          {loading ? (
            <p style={styles.emptyText}>Loading role breakdown…</p>
          ) : roleBreakdown.length === 0 ? (
            <p style={styles.emptyText}>No role data available.</p>
          ) : (
            <>
              <svg width="180" height="180" viewBox="0 0 42 42" style={styles.donutSvg}>
                <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="var(--color-border)" strokeWidth="4" />
                {donutSegments.map((seg, idx) => {
                  const percent = seg.percentage || (seg.count / totalAccounts * 100);
                  return (
                    <circle
                      key={idx}
                      cx="21"
                      cy="21"
                      r="15.915"
                      fill="transparent"
                      stroke={seg.color || '#6b7280'}
                      strokeWidth="4"
                      strokeDasharray={`${percent} ${100 - percent}`}
                      strokeDashoffset={seg.dashoffset}
                    />
                  );
                })}
              </svg>

              <div style={styles.legendContainer}>
                {roleBreakdown.map((role, idx) => (
                  <div key={idx} style={styles.legendItem}>
                    <div style={{ ...styles.legendDot, backgroundColor: role.color || '#6b7280' }}></div>
                    <div style={styles.legendTextContainer}>
                      <span style={styles.legendLabel}>{role.role}</span>
                      <span style={styles.legendCount}>{role.count} ({Math.round(role.percentage || (role.count / totalAccounts * 100))}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
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
                key={log.id || index}
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
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
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
  refreshBtn: {
    padding: '8px 16px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
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
  donutContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '40px',
    padding: '20px 0',
    flexWrap: 'wrap',
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
    minWidth: '160px',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  legendDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  legendTextContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
    flex: 1,
  },
  legendLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
  },
  legendCount: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontWeight: '500',
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