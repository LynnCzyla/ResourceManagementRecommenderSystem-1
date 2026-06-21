import React, { useState } from 'react';
import weaLogo from '../../assets/WEA_logo_bgremoved.png';

// Tab components from same directory
import DashboardTab from './DashboardTab';
import UserManagementTab from './UserManagementTab';
import SystemSettingsTab from './SystemSettingsTab';
import LogsTab from './LogsTab';
import ReportsTab from './ReportsTab';
import DbRecordsTab from './DbRecordsTab';
import ProfileSettings from '../ProfileSettings';

export default function AdminLayout({ user, onLogout, isDark, toggleTheme }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [isProfileHovered, setIsProfileHovered] = useState(false);

  // Submenu states
  const [userMgmtOpen, setUserMgmtOpen] = useState(true);
  const [logsOpen, setLogsOpen] = useState(true);

  // Mock notifications
  const [notifications, setNotifications] = useState([
    { id: 1, type: 'ocr', text: 'OCR processing successful for romell_cv.pdf (98.2% Accuracy)', time: '5 mins ago', read: false },
    { id: 2, type: 'user', text: 'User Romell Ebuen assigned role Resource Manager', time: '1 hour ago', read: false },
    { id: 3, type: 'system', text: 'Daily database backup successfully completed', time: '12 hours ago', read: true },
    { id: 4, type: 'alert', text: 'Suspicious login attempt blocked from IP 192.168.1.105', time: '1 day ago', read: true },
  ]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id, e) => {
    e.stopPropagation();
    setNotifications(notifications.filter(n => n.id !== id));
  };

  // Nav click helper to expand sidebar automatically
  const handleNavClick = (tabName) => {
    setActiveTab(tabName);
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
    } else if (category === 'logs') {
      setLogsOpen(!logsOpen);
    }
  };

  // Render active component
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardTab setActiveTab={setActiveTab} setUserMgmtOpen={setUserMgmtOpen} setLogsOpen={setLogsOpen} />;
      case 'user-accounts':
        return <UserManagementTab activeSubTab="accounts" />;
      case 'contact-requests':
        return <UserManagementTab activeSubTab="requests" />;
      case 'locked-accounts':
        return <UserManagementTab activeSubTab="locked" />;
      case 'system-settings':
        return <SystemSettingsTab />;
      case 'ocr-logs':
        return <LogsTab activeSubTab="ocr" />;
      case 'audit-logs':
        return <LogsTab activeSubTab="audit" />;
      case 'reports':
        return <ReportsTab />;
      case 'database-records':
        return <DbRecordsTab />;
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

          {/* System Settings */}
          <div 
            onClick={() => handleNavClick('system-settings')} 
            style={{
              ...styles.navItem,
              backgroundColor: activeTab === 'system-settings' ? 'var(--color-primary-light)' : 'transparent',
              borderLeftColor: activeTab === 'system-settings' ? 'var(--color-primary)' : 'transparent',
            }}
            title="System Settings"
            className="hover-sidebar-item"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.navIcon}>
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            {!sidebarCollapsed && <span style={styles.navText}>System Settings</span>}
          </div>

          {/* Monitoring Logs Category */}
          <div>
            <div 
              onClick={() => toggleCategory('logs')} 
              style={styles.categoryHeader}
              title="Monitoring Logs"
              className="hover-sidebar-item"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.navIcon}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              {!sidebarCollapsed && (
                <>
                  <span style={styles.categoryTitle}>Monitoring Logs</span>
                  <span style={styles.arrowIcon}>{logsOpen ? '▼' : '▲'}</span>
                </>
              )}
            </div>

            {logsOpen && (
              <div style={sidebarCollapsed ? styles.collapsedSubmenu : styles.submenu}>
                <div 
                  onClick={() => handleNavClick('ocr-logs')} 
                  style={{
                    ...styles.submenuItem,
                    color: activeTab === 'ocr-logs' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    fontWeight: activeTab === 'ocr-logs' ? '700' : '400'
                  }}
                  className="hover-submenu-item"
                >
                  {!sidebarCollapsed ? '• OCR/NLP Logs' : 'OCR'}
                </div>
                <div 
                  onClick={() => handleNavClick('audit-logs')} 
                  style={{
                    ...styles.submenuItem,
                    color: activeTab === 'audit-logs' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    fontWeight: activeTab === 'audit-logs' ? '700' : '400'
                  }}
                  className="hover-submenu-item"
                >
                  {!sidebarCollapsed ? '• Activity & Audit' : 'Audit'}
                </div>
              </div>
            )}
          </div>

          {/* Reports */}
          <div 
            onClick={() => handleNavClick('reports')} 
            style={{
              ...styles.navItem,
              backgroundColor: activeTab === 'reports' ? 'var(--color-primary-light)' : 'transparent',
              borderLeftColor: activeTab === 'reports' ? 'var(--color-primary)' : 'transparent',
            }}
            title="Reports"
            className="hover-sidebar-item"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.navIcon}>
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
            {!sidebarCollapsed && <span style={styles.navText}>Reports</span>}
          </div>

          {/* Database Records */}
          <div 
            onClick={() => handleNavClick('database-records')} 
            style={{
              ...styles.navItem,
              backgroundColor: activeTab === 'database-records' ? 'var(--color-primary-light)' : 'transparent',
              borderLeftColor: activeTab === 'database-records' ? 'var(--color-primary)' : 'transparent',
            }}
            title="Database Records"
            className="hover-sidebar-item"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.navIcon}>
              <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
              <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"></path>
            </svg>
            {!sidebarCollapsed && <span style={styles.navText}>Database Records</span>}
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
                <div className="glass-card" style={styles.notificationDropdown}>
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
                <img src={user.avatar} alt="Profile avatar" style={styles.avatar} />
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
    transition: 'background-color var(--transition-normal), border-color var(--transition-normal)',
  },
  topbarLeft: {
    display: 'flex',
    alignItems: 'center',
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
