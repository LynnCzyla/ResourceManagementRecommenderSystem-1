// main/src/frontend/Admin/AdminLayout.jsx

import React, { useState, useEffect } from 'react';
import weaLogo from '../../assets/WEA_logo_bgremoved.png';

// Tab components from same directory
import DashboardTab from './DashboardTab';
import UserManagementTab from './UserManagementTab';
// ❌ REMOVED: SystemSettingsTab - Only for Super Admin
import LogsTab from './LogsTab'; // ✅ Keep this - Admins see their branch logs
import ProfileSettings from '../ProfileSettings';
import DepartmentsTab from './DepartmentsTab';
import { API_BASE_URL } from '../../config/api';

const BACKEND_RETRY_DELAY_MS = 5 * 60 * 1000;

export default function AdminLayout({ user, onLogout, isDark, toggleTheme, onProfileUpdate }) {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('adminActiveTab') || 'dashboard';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [isProfileHovered, setIsProfileHovered] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState(user.avatar);

  useEffect(() => {
    if (user?.avatar) setCurrentAvatar(user.avatar);
  }, [user?.avatar]);

  // Submenu states
  const [userMgmtOpen, setUserMgmtOpen] = useState(true);

  const [notifications, setNotifications] = useState([]);
  const [phTime, setPhTime] = useState('');
  const backendUnavailableUntilRef = React.useRef(0);

  useEffect(() => {
    const updateTime = () => {
      const options = {
        timeZone: 'Asia/Manila',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      };
      const formatter = new Intl.DateTimeFormat('en-US', options);
      setPhTime(formatter.format(new Date()));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Add this helper after useState declarations
  const formatTime = (isoString) => {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  // Add this useEffect to fetch notifications
  useEffect(() => {
    if (!user?.id) return;

    if (Date.now() < backendUnavailableUntilRef.current) return;

    const fetchNotifications = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/notifications?userId=${user.id}`);
        const result = await res.json();
        if (result.success) {
          setNotifications(result.data);
        }
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
        backendUnavailableUntilRef.current = Date.now() + BACKEND_RETRY_DELAY_MS;
      }
    };

    fetchNotifications();
    // Poll every 60 seconds, and only while the tab is actually visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchNotifications();
      }
    }, 60000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchNotifications();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!showNotifications) return;

    const handleOutsideClick = (e) => {
      const btn = document.getElementById('notif-btn');
      const dropdown = document.getElementById('notif-dropdown');
      if (
        (btn && btn.contains(e.target)) ||
        (dropdown && dropdown.contains(e.target))
      ) {
        return;
      }
      setShowNotifications(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showNotifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = async () => {
    if (Date.now() < backendUnavailableUntilRef.current) return;
    try {
      await fetch(`${API_BASE_URL}/api/notifications/mark-all-read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const deleteNotification = async (id, e) => {
    e.stopPropagation();
    if (Date.now() < backendUnavailableUntilRef.current) return;
    try {
      await fetch(`${API_BASE_URL}/api/notifications/${id}`, { method: 'DELETE' });
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  // Nav click helper to expand sidebar automatically
  const handleNavClick = (tabName) => {
    setActiveTab(tabName);
    localStorage.setItem('adminActiveTab', tabName);
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
    }
  };

  const toggleCategory = (category) => {
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
    }
    if (category === 'user') {
      setUserMgmtOpen(!userMgmtOpen);
    }
  };

  // Render active component
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardTab setActiveTab={setActiveTab} setUserMgmtOpen={setUserMgmtOpen} />;
      case 'user-accounts':
        return <UserManagementTab activeSubTab="accounts" onSubTabChange={(sub) => handleNavClick(sub === 'accounts' ? 'user-accounts' : sub === 'create' ? 'create-accounts' : sub === 'requests' ? 'contact-requests' : 'locked-accounts')} />;
      case 'create-accounts':
        return <UserManagementTab activeSubTab="create" onSubTabChange={(sub) => handleNavClick(sub === 'accounts' ? 'user-accounts' : sub === 'create' ? 'create-accounts' : sub === 'requests' ? 'contact-requests' : 'locked-accounts')} />;
      case 'contact-requests':
        return <UserManagementTab activeSubTab="requests" onSubTabChange={(sub) => handleNavClick(sub === 'accounts' ? 'user-accounts' : sub === 'create' ? 'create-accounts' : sub === 'requests' ? 'contact-requests' : 'locked-accounts')} />;
      case 'locked-accounts':
        return <UserManagementTab activeSubTab="locked" onSubTabChange={(sub) => handleNavClick(sub === 'accounts' ? 'user-accounts' : sub === 'create' ? 'create-accounts' : sub === 'requests' ? 'contact-requests' : 'locked-accounts')} />;
      case 'audit-logs':
        return <LogsTab />; // ✅ Admins can see their branch logs
      case 'departments':
        return <DepartmentsTab />;
      // ❌ REMOVED: system-settings case - Only for Super Admin
      default:
        return <DashboardTab setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div style={styles.layoutWrapper}>
      {/* Sidebar Navigation - Full Height */}
      <aside style={{
        ...styles.sidebar,
        width: sidebarCollapsed ? '72px' : '260px'
      }}>
        {/* WEA Logo Header inside Sidebar */}
        <div style={{
          ...styles.sidebarHeader,
          justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
        }}>
          <img 
            src={weaLogo} 
            alt="WEA Logo" 
            style={{
              ...styles.sidebarLogo,
              height: sidebarCollapsed ? '32px' : '56px',
              width: 'auto',
              maxWidth: sidebarCollapsed ? '48px' : '180px',
            }} 
          />
        </div>

        {/* Collapse toggle */}
        <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={styles.collapseBtn}>
          {sidebarCollapsed ? '→' : '←'}
        </button>

        <nav style={styles.nav}>
          {/* Dashboard Link */}
          <div 
            onClick={() => handleNavClick('dashboard')} 
            style={{
              ...styles.navItem,
              backgroundColor: activeTab === 'dashboard' ? 'var(--color-primary-light)' : 'transparent',
              borderLeftColor: activeTab === 'dashboard' ? 'var(--color-primary)' : 'transparent',
            }}
            title="Dashboard"
            className="hover-sidebar-item"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.navIcon}>
              <rect x="3" y="3" width="7" height="9"></rect>
              <rect x="14" y="3" width="7" height="5"></rect>
              <rect x="14" y="12" width="7" height="9"></rect>
              <rect x="3" y="16" width="7" height="5"></rect>
            </svg>
            {!sidebarCollapsed && <span style={styles.navText}>Dashboard</span>}
          </div>

          {/* User Management Category */}
          <div>
            <div 
              onClick={() => toggleCategory('user')} 
              style={styles.categoryHeader}
              title="User Management"
              className="hover-sidebar-item"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.navIcon}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              {!sidebarCollapsed && (
                <>
                  <span style={styles.categoryTitle}>User Management</span>
                  <span style={styles.arrowIcon}>{userMgmtOpen ? '▼' : '▲'}</span>
                </>
              )}
            </div>

            {userMgmtOpen && (
              <div style={sidebarCollapsed ? styles.collapsedSubmenu : styles.submenu}>
                <div
                  onClick={() => handleNavClick('user-accounts')}
                  style={{
                    ...styles.submenuItem,
                    color: activeTab === 'user-accounts' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    fontWeight: activeTab === 'user-accounts' ? '700' : '400'
                  }}
                  className="hover-submenu-item"
                >
                  {!sidebarCollapsed ? '• User Accounts' : 'Accs'}
                </div>
                <div
                  onClick={() => handleNavClick('create-accounts')}
                  style={{
                    ...styles.submenuItem,
                    color: activeTab === 'create-accounts' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    fontWeight: activeTab === 'create-accounts' ? '700' : '400'
                  }}
                  className="hover-submenu-item"
                >
                  {!sidebarCollapsed ? '• Create Accounts' : 'Create'}
                </div>
                <div
                  onClick={() => handleNavClick('contact-requests')}
                  style={{
                    ...styles.submenuItem,
                    color: activeTab === 'contact-requests' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    fontWeight: activeTab === 'contact-requests' ? '700' : '400'
                  }}
                  className="hover-submenu-item"
                >
                  {!sidebarCollapsed ? '• Contact Requests' : 'Reqs'}
                </div>
                <div
                  onClick={() => handleNavClick('locked-accounts')}
                  style={{
                    ...styles.submenuItem,
                    color: activeTab === 'locked-accounts' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    fontWeight: activeTab === 'locked-accounts' ? '700' : '400'
                  }}
                  className="hover-submenu-item"
                >
                  {!sidebarCollapsed ? '• Locked Accounts' : 'Locked'}
                </div>
              </div>
            )}
          </div>

          {/* ✅ Audit Logs - Admins see their branch only */}
          <div 
            onClick={() => handleNavClick('audit-logs')} 
            style={{
              ...styles.navItem,
              backgroundColor: activeTab === 'audit-logs' ? 'var(--color-primary-light)' : 'transparent',
              borderLeftColor: activeTab === 'audit-logs' ? 'var(--color-primary)' : 'transparent',
            }}
            title="Audit Logs (Branch Only)"
            className="hover-sidebar-item"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.navIcon}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            {!sidebarCollapsed && <span style={styles.navText}>Audit Logs</span>}
          </div>

          {/* ❌ REMOVED: System Settings - Only for Super Admin */}

          {/* Departments & Positions */}
          <div 
            onClick={() => handleNavClick('departments')} 
            style={{
              ...styles.navItem,
              backgroundColor: activeTab === 'departments' ? 'var(--color-primary-light)' : 'transparent',
              borderLeftColor: activeTab === 'departments' ? 'var(--color-primary)' : 'transparent',
            }}
            title="Departments & Positions"
            className="hover-sidebar-item"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.navIcon}>
              <rect x="2" y="7" width="20" height="14" rx="2"></rect>
              <path d="M16 7V5a2 2 0 0 0-4 0v2"></path>
            </svg>
            {!sidebarCollapsed && <span style={styles.navText}>Departments & Positions</span>}
          </div>

        </nav>

        {!sidebarCollapsed && (
          <div style={styles.sidebarFooter}>
            <span style={{ fontSize: 10, opacity: 0.6 }}>CORE STATUS: ONLINE</span>
            <div style={styles.statusDot}></div>
          </div>
        )}
      </aside>

      {/* Right Column Container */}
      <div style={styles.rightContainer}>
        {/* Topbar next to Sidebar */}
        <header style={styles.topbar}>
          <div style={styles.topbarLeft}>
            <span style={styles.topbarTitle}>Admin Portal</span>
            <div style={styles.phClockContainer}>
              {user?.role !== 'Super Admin' && user?.branch_name && (
                <span style={{ 
                  marginRight: '12px', 
                  fontWeight: '700', 
                  fontSize: '12px', 
                  color: '#ffffff', 
                  backgroundColor: '#8b5cf6', 
                  padding: '2px 8px', 
                  borderRadius: '4px',
                  letterSpacing: '0.5px'
                }}>
                  {user.branch_name}
                </span>
              )}
              <span style={styles.phClockLabel}>UTC+8 / GMT+8:</span>
              <span style={styles.phClockTime}>{phTime}</span>
            </div>
          </div>
          
          <div style={styles.topbarRight}>
            {/* Sliding Switch Toggle for Theme */}
            <div style={styles.topbarSwitchContainer}>
              <span style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)', marginRight: '6px' }}>
                {isDark ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ display: 'block' }} title="Dark Mode">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ display: 'block' }} title="Light Mode">
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                  </svg>
                )}
              </span>
              <label className="theme-switch" style={styles.switch}>
                <input
                  type="checkbox"
                  checked={isDark}
                  onChange={toggleTheme}
                  style={styles.switchInput}
                />
                <span className="theme-slider" style={styles.switchSlider}></span>
              </label>
            </div>

            {/* Notifications Center */}
            <div style={{ position: 'relative' }}>
              <button 
                id="notif-btn"
                onClick={() => setShowNotifications(!showNotifications)} 
                style={styles.iconButton}
                title="Notifications"
                className="hover-icon-button"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
                {unreadCount > 0 && (
                  <span style={styles.badge}>{unreadCount}</span>
                )}
              </button>

              {showNotifications && (
                <div id="notif-dropdown" className="glass-card" style={styles.notificationDropdown}>
                  <div style={styles.notifHeader}>
                    <h4 style={{ margin: 0, fontSize: 14 }}>System Notifications</h4>
                    {unreadCount > 0 && (
                      <span onClick={markAllRead} style={styles.markReadBtn}>Mark all as read</span>
                    )}
                  </div>
                  <div style={styles.notifList}>
                    {notifications.length === 0 ? (
                      <div style={styles.emptyNotif}>No notifications.</div>
                    ) : (
                      notifications.map(n => (
                        <div 
                          key={n.id} 
                          style={{
                            ...styles.notifItem,
                            borderLeftColor: n.type === 'ocr' ? 'var(--color-primary)' : n.type === 'alert' ? 'var(--color-danger)' : 'var(--color-accent)',
                            backgroundColor: n.read ? 'transparent' : 'var(--color-primary-light)'
                          }}
                        >
                          <div style={styles.notifContent}>
                            <p style={{ ...styles.notifText, fontWeight: n.read ? '400' : '600' }}>{n.text}</p>
                            <span style={styles.notifTime}>{n.time}</span>
                          </div>
                          <button onClick={(e) => deleteNotification(n.id, e)} style={styles.deleteNotifBtn}>
                            &times;
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Info */}
            <div style={styles.profilePill}>
              <div
                onClick={() => setShowProfileSettings(true)}
                onMouseEnter={() => setIsProfileHovered(true)}
                onMouseLeave={() => setIsProfileHovered(false)}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '4px 8px',
                  borderRadius: '20px',
                  backgroundColor: isProfileHovered ? 'var(--color-bg-card-hover)' : 'transparent',
                  transition: 'background-color 0.2s ease'
                }}
              >
                <img src={currentAvatar} alt="Profile avatar" style={styles.avatar} />

                <div style={styles.profileInfo}>
                  <span style={styles.profileName}>{user.name}</span>
                  <span style={styles.profileRole}>{user.role}</span>
                </div>
              </div>
              <button onClick={onLogout} style={styles.logoutBtn} title="Log Out" className="hover-logout">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Dynamic content view */}
        <main style={styles.contentContainer}>
          {renderContent()}
        </main>
      </div>

      {/* Profile Settings Modal */}
      <ProfileSettings
        isOpen={showProfileSettings}
        onClose={() => setShowProfileSettings(false)}
        user={user}
        onAvatarUpdate={(newUrl) => setCurrentAvatar(newUrl)}
        onProfileUpdate={onProfileUpdate}
      />
    </div>
  );
}

// Styles remain the same as before...
const styles = {
  layoutWrapper: {
    display: 'flex',
    flexDirection: 'row',
    height: '100vh',
    width: '100vw',
    backgroundColor: 'var(--color-bg-root)',
    overflow: 'hidden',
  },
  rightContainer: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    height: '100vh',
    overflow: 'hidden',
  },
  topbar: {
    height: '64px',
    backgroundColor: 'var(--color-bg-sidebar)',
    borderBottom: '1px solid var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    boxShadow: 'var(--shadow-sm)',
    transition: 'background-color var(--transition-normal), border-color var(--transition-normal)',
  },
  topbarLeft: {
    display: 'flex',
    alignItems: 'center',
  },
  phClockContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginLeft: '20px',
    padding: '4px 12px',
    borderRadius: '20px',
    backgroundColor: 'var(--color-bg-root)',
    border: '1px solid var(--color-border)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
  },
  phClockLabel: {
    fontWeight: '700',
    color: 'var(--color-primary)',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  phClockTime: {
    fontFamily: 'monospace',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
  },
  topbarTitle: {
    fontFamily: 'var(--font-heading)',
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.3px',
  },
  topbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  topbarSwitchContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'var(--color-bg-card-hover)',
    padding: '6px 12px',
    borderRadius: '20px',
    border: '1px solid var(--color-border)',
  },
  switch: {
    position: 'relative',
    display: 'inline-block',
    width: '40px',
    height: '20px',
  },
  switchInput: {
    opacity: 0,
    width: 0,
    height: 0,
  },
  switchSlider: {
    position: 'absolute',
    cursor: 'pointer',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#cbd5e1',
    transition: '.3s',
    borderRadius: '20px',
  },
  iconButton: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    transition: 'all 0.2s',
  },
  badge: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    backgroundColor: 'var(--color-danger)',
    color: '#ffffff',
    fontSize: '9px',
    fontWeight: '700',
    padding: '2px 5px',
    borderRadius: '10px',
  },
  notificationDropdown: {
    position: 'absolute',
    top: '48px',
    right: 0,
    width: '320px',
    padding: '16px',
    zIndex: 200,
    borderRadius: 'var(--radius-md)',
  },
  notifHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '8px',
    marginBottom: '10px',
  },
  markReadBtn: {
    fontSize: '11px',
    color: 'var(--color-primary)',
    cursor: 'pointer',
    fontWeight: '600',
  },
  notifList: {
    maxHeight: '260px',
    overflowY: 'auto',
  },
  emptyNotif: {
    textAlign: 'center',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    padding: '20px 0',
  },
  notifItem: {
    borderLeft: '3px solid transparent',
    padding: '10px 8px',
    borderRadius: 'var(--radius-sm)',
    marginBottom: '6px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    transition: 'background-color 0.2s',
  },
  notifContent: {
    flex: 1,
    paddingRight: '8px',
  },
  notifText: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--color-text-primary)',
    lineHeight: '1.4',
  },
  notifTime: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
  },
  deleteNotifBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    fontSize: '16px',
    lineHeight: 1,
    padding: '0 4px',
    transition: 'color 0.2s',
  },
  profilePill: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '4px 4px 4px 12px',
    border: '1px solid var(--color-border)',
    borderRadius: '30px',
    backgroundColor: 'var(--color-bg-card-hover)',
    marginLeft: '8px',
  },
  avatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  profileInfo: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'left',
    lineHeight: '1.2',
  },
  profileName: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
  },
  profileRole: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
  },
  logoutBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  sidebar: {
    backgroundColor: 'var(--color-bg-sidebar)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    height: '100vh',
    transition: 'width var(--transition-normal)',
    zIndex: 90,
  },
  sidebarHeader: {
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 20px',
    borderBottom: '1px solid var(--color-border)',
    transition: 'all var(--transition-normal)',
  },
  sidebarLogo: {
    height: '32px',
    width: '32px',
    objectFit: 'contain',
  },
  sidebarTitle: {
    fontFamily: 'var(--font-heading)',
    fontSize: '20px',
    fontWeight: '800',
    color: 'var(--color-text-primary)',
  },
  collapseBtn: {
    position: 'absolute',
    top: '20px',
    right: '-12px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-bg-sidebar)',
    color: 'var(--color-text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '10px',
    boxShadow: 'var(--shadow-sm)',
    zIndex: 10,
    outline: 'none',
  },
  nav: {
    padding: '24px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
    overflowY: 'auto',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    borderLeft: '3px solid transparent',
  },
  navIcon: {
    color: 'var(--color-text-secondary)',
    flexShrink: 0,
  },
  navText: {
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--color-text-primary)',
  },
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px 8px 14px',
    cursor: 'pointer',
    borderRadius: 'var(--radius-md)',
    transition: 'all 0.2s',
  },
  categoryTitle: {
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    color: 'var(--color-text-muted)',
    flex: 1,
    textAlign: 'left',
  },
  arrowIcon: {
    fontSize: '8px',
    color: 'var(--color-text-muted)',
  },
  submenu: {
    paddingLeft: '32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    marginBottom: '8px',
  },
  collapsedSubmenu: {
    display: 'none',
  },
  submenuItem: {
    fontSize: '13px',
    padding: '8px 12px',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'left',
  },
  sidebarFooter: {
    padding: '16px',
    borderTop: '1px solid var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-success)',
    boxShadow: '0 0 8px var(--color-success)',
  },
  contentContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '32px',
  }
};