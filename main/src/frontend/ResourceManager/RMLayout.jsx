import React, { useState, useEffect } from 'react';
import weaLogo from '../../assets/WEA_logo_bgremoved.png';

import RMDashboardTab from './RMDashboardTab';
import RMEmployeeDirectoryTab from './RMEmployeeDirectoryTab';
import RMProjectsTab from './RMProjectsTab';
import RMRequestsTab from './RMRequestsTab';
import RMResourceRequestFormTab from './RMResourceRequestFormTab';
import ProfileSettings from '../ProfileSettings';
import RMFeedbackReportTab from './RMFeedbackReportTab';
// Isolated so its 1s tick doesn't re-render RMLayout (and therefore every tab) every second.
function PHClock({ user }) {
  const [phTime, setPhTime] = useState('');
  useEffect(() => {
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
    const updateTime = () => setPhTime(formatter.format(new Date()));
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
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
  );
}

export default function RMLayout({ user, onLogout, isDark, toggleTheme, onProfileUpdate }) {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('rmActiveTab') || 'dashboard';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [isProfileHovered, setIsProfileHovered] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState(user.avatar);

  useEffect(() => {
    if (user?.avatar) setCurrentAvatar(user.avatar);
  }, [user?.avatar]);

  // Mock notifications for Resource Manager
  const [notifications, setNotifications] = useState([
    { id: 1, type: 'request', text: 'New resource allocation request for Substation Lighting design.', time: '5 mins ago', read: false },
    { id: 2, type: 'ocr', text: 'New employee Javier Santos profile parsed with 97.8% OCR confidence.', time: '2 hours ago', read: true }
  ]);
  useEffect(() => {
    setCurrentAvatar(user.avatar);
  }, [user.avatar]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id, e) => {
    e.stopPropagation();
    setNotifications(notifications.filter(n => n.id !== id));
  };

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

  const handleNavClick = (tabName) => {
    setActiveTab(tabName);
    localStorage.setItem('rmActiveTab', tabName);
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
    }
  };

  // All four tabs stay mounted the whole session; we just show/hide with CSS.
  // Switching tabs used to unmount the previous tab and mount a fresh one,
  // which meant every single click refired fetchEmployees()/fetchProjects()/etc.
  // from scratch and showed the "Loading…" screen again, even if you'd already
  // loaded that tab seconds earlier. Now each tab loads once and stays cached
  // in memory until the RM Portal session ends (logout / refresh).
  const tabVisibility = (tabName) => ({
    display: activeTab === tabName ? 'contents' : 'none',
  });

  return (
    <div style={styles.layoutWrapper}>
      {/* Sidebar Navigation */}
      <aside style={{
        ...styles.sidebar,
        width: sidebarCollapsed ? '72px' : '260px'
      }}>
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

        <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={styles.collapseBtn}>
          {sidebarCollapsed ? '→' : '←'}
        </button>

        <nav style={styles.nav}>
          {/* Dashboard */}
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

          {/* Employee Directory */}
          <div 
            onClick={() => handleNavClick('directory')} 
            style={{
              ...styles.navItem,
              backgroundColor: activeTab === 'directory' ? 'var(--color-primary-light)' : 'transparent',
              borderLeftColor: activeTab === 'directory' ? 'var(--color-primary)' : 'transparent',
            }}
            title="Employee Directory"
            className="hover-sidebar-item"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.navIcon}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            {!sidebarCollapsed && <span style={styles.navText}>Employee Directory</span>}
          </div>

          {/* Projects */}
          <div 
            onClick={() => handleNavClick('projects')} 
            style={{
              ...styles.navItem,
              backgroundColor: activeTab === 'projects' ? 'var(--color-primary-light)' : 'transparent',
              borderLeftColor: activeTab === 'projects' ? 'var(--color-primary)' : 'transparent',
            }}
            title="Projects Management"
            className="hover-sidebar-item"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.navIcon}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            {!sidebarCollapsed && <span style={styles.navText}>Projects Management</span>}
          </div>

          {/* Resource Requests */}
          <div 
            onClick={() => handleNavClick('requests')} 
            style={{
              ...styles.navItem,
              backgroundColor: activeTab === 'requests' ? 'var(--color-primary-light)' : 'transparent',
              borderLeftColor: activeTab === 'requests' ? 'var(--color-primary)' : 'transparent',
            }}
            title="Resource Requests"
            className="hover-sidebar-item"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.navIcon}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            {!sidebarCollapsed && <span style={styles.navText}>Resource Requests</span>}
          </div>

          {/* Request Form */}
          <div 
            onClick={() => handleNavClick('requestForm')} 
            style={{
              ...styles.navItem,
              backgroundColor: activeTab === 'requestForm' ? 'var(--color-primary-light)' : 'transparent',
              borderLeftColor: activeTab === 'requestForm' ? 'var(--color-primary)' : 'transparent',
            }}
            title="Request Form"
            className="hover-sidebar-item"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.navIcon}>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            {!sidebarCollapsed && <span style={styles.navText}>Request Form</span>}
          </div>

          {/* Feedback Report */}
          <div 
            onClick={() => handleNavClick('feedbackReport')} 
            style={{
              ...styles.navItem,
              backgroundColor: activeTab === 'feedbackReport' ? 'var(--color-primary-light)' : 'transparent',
              borderLeftColor: activeTab === 'feedbackReport' ? 'var(--color-primary)' : 'transparent'
            }}
            title="Feedback Report"
            className="hover-sidebar-item"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.navIcon}>
              <path d="M9 11l3 3L22 4"></path>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
            </svg>
            {!sidebarCollapsed && <span style={styles.navText}>Feedback Report</span>}
          </div>
        </nav>

        {!sidebarCollapsed && (
          <div style={styles.sidebarFooter}>
            <span style={{ fontSize: 10, opacity: 0.6 }}>RM PORTAL: ACTIVE</span>
            <div style={styles.statusDot}></div>
          </div>
        )}
      </aside>

      {/* Main Content Pane */}
      <div style={styles.rightContainer}>
        <header style={styles.topbar}>
          <div style={styles.topbarLeft}>
            <span style={styles.topbarTitle}>Resource Manager Portal</span>
            <PHClock user={user} />
          </div>
          
          <div style={styles.topbarRight}>
            {/* Theme Toggle */}
            <div style={styles.topbarSwitchContainer}>
              <span style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)', marginRight: '6px' }}>
                {isDark ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" title="Dark Mode">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" title="Light Mode">
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

            {/* Notifications */}
            <div style={{ position: 'relative' }}>
              <button 
                id="notif-btn"
                onClick={() => setShowNotifications(!showNotifications)} 
                style={styles.iconButton}
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
                    <h4 style={{ margin: 0, fontSize: 14 }}>Notifications</h4>
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
                            borderLeftColor: n.type === 'request' ? 'var(--color-primary)' : 'var(--color-accent)',
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

            {/* Profile Avatar */}
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
                <img src={currentAvatar} alt="Avatar" style={styles.avatar} />
                <div style={styles.profileInfo}>
                  <span style={styles.profileName}>{user.name}</span>
                  <span style={styles.profileRole}>{user.role}</span>
                </div>
              </div>
              <button onClick={onLogout} style={styles.logoutBtn} className="hover-logout">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>
        </header>

        <main style={styles.contentContainer}>
          <div style={tabVisibility('dashboard')}><RMDashboardTab /></div>
          <div style={tabVisibility('directory')}><RMEmployeeDirectoryTab /></div>
          <div style={tabVisibility('projects')}><RMProjectsTab /></div>
          <div style={tabVisibility('requests')}><RMRequestsTab /></div>
          <div style={tabVisibility('requestForm')}><RMResourceRequestFormTab /></div>
          <div style={tabVisibility('feedbackReport')}><RMFeedbackReportTab /></div>
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
  },
  sidebarLogo: {
    height: '32px',
    width: '32px',
    objectFit: 'contain',
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