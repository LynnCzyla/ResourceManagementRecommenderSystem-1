import React, { useState, useEffect } from 'react';
import weaLogo from '../../assets/WEA_logo_bgremoved.png';

// Tab components from same directory
import DashboardTab from './DashboardTab';
import AdminManagementTab from './AdminManagementTab';
import BranchManagementTab from './BranchManagementTab';
import AccountManagementTab from './AccountManagementTab';
import AuditLogsTab from './AuditLogsTab';
import SystemSettingsTab from './SystemSettingsTab'; // ✅ ADD THIS IMPORT
import ProfileSettings from '../ProfileSettings';

export default function SuperAdminLayout({ user, onLogout, isDark, toggleTheme, onProfileUpdate }) {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('superAdminActiveTab') || 'dashboard';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [isProfileHovered, setIsProfileHovered] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState(user.avatar);

  useEffect(() => {
    if (user?.avatar) setCurrentAvatar(user.avatar);
  }, [user?.avatar]);

  const [phTime, setPhTime] = useState('');

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

  const handleNavClick = (tabName) => {
    setActiveTab(tabName);
    localStorage.setItem('superAdminActiveTab', tabName);
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardTab setActiveTab={setActiveTab} />;
      case 'admin-management':
        return <AdminManagementTab />;
      case 'branch-management':
        return <BranchManagementTab />;
      case 'account-management':
        return <AccountManagementTab />;
      case 'audit-logs':
        return <AuditLogsTab />;
      case 'system-settings': // ✅ ADD THIS CASE
        return <SystemSettingsTab />;
      default:
        return <DashboardTab setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div style={styles.layoutWrapper}>
      {/* Sidebar Navigation */}
      <aside style={{
        ...styles.sidebar,
        width: sidebarCollapsed ? '72px' : '260px'
      }}>
        {/* WEA Logo Header */}
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

          {/* Admin Management */}
          <div 
            onClick={() => handleNavClick('admin-management')} 
            style={{
              ...styles.navItem,
              backgroundColor: activeTab === 'admin-management' ? 'var(--color-primary-light)' : 'transparent',
              borderLeftColor: activeTab === 'admin-management' ? 'var(--color-primary)' : 'transparent',
            }}
            title="Admin Management"
            className="hover-sidebar-item"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.navIcon}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            {!sidebarCollapsed && <span style={styles.navText}>Admin Management</span>}
          </div>

          {/* Branch Management */}
          <div 
            onClick={() => handleNavClick('branch-management')} 
            style={{
              ...styles.navItem,
              backgroundColor: activeTab === 'branch-management' ? 'var(--color-primary-light)' : 'transparent',
              borderLeftColor: activeTab === 'branch-management' ? 'var(--color-primary)' : 'transparent',
            }}
            title="Branch Management"
            className="hover-sidebar-item"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.navIcon}>
              <path d="M3 21h18"></path>
              <path d="M5 21V7l8-4 8 4v14"></path>
              <path d="M17 21v-8.5a1.5 1.5 0 0 0-3 0V21"></path>
            </svg>
            {!sidebarCollapsed && <span style={styles.navText}>Branch Management</span>}
          </div>

          {/* Account Management */}
          <div 
            onClick={() => handleNavClick('account-management')} 
            style={{
              ...styles.navItem,
              backgroundColor: activeTab === 'account-management' ? 'var(--color-primary-light)' : 'transparent',
              borderLeftColor: activeTab === 'account-management' ? 'var(--color-primary)' : 'transparent',
            }}
            title="Account Management"
            className="hover-sidebar-item"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.navIcon}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            {!sidebarCollapsed && <span style={styles.navText}>Account Management</span>}
          </div>

          {/* Audit Logs */}
          <div 
            onClick={() => handleNavClick('audit-logs')} 
            style={{
              ...styles.navItem,
              backgroundColor: activeTab === 'audit-logs' ? 'var(--color-primary-light)' : 'transparent',
              borderLeftColor: activeTab === 'audit-logs' ? 'var(--color-primary)' : 'transparent',
            }}
            title="Audit Logs"
            className="hover-sidebar-item"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.navIcon}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            {!sidebarCollapsed && <span style={styles.navText}>Audit Logs</span>}
          </div>

          {/* ✅ ADDED: System Settings - Only for Super Admin */}
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
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l-.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            {!sidebarCollapsed && <span style={styles.navText}>System Settings</span>}
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
        {/* Topbar */}
        <header style={styles.topbar}>
          <div style={styles.topbarLeft}>
            <span style={styles.topbarTitle}>Super Admin Portal</span>
            <div style={styles.phClockContainer}>
              <span style={styles.phClockLabel}>UTC+8 / GMT+8:</span>
              <span style={styles.phClockTime}>{phTime}</span>
            </div>
          </div>
          
          <div style={styles.topbarRight}>
            {/* Theme Toggle */}
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