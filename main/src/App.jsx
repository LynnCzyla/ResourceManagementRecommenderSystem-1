// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import Login from './frontend/Login';
import ResetPassword from './frontend/ResetPassword';
import AdminLayout from './frontend/Admin/AdminLayout';
import PMLayout from './frontend/ProjectManager/PMLayout';
import RMLayout from './frontend/ResourceManager/RMLayout';
import EmployeeLayout from './frontend/Employee/EmployeeLayout';
import { supabase, getSession, establishSessionFromUrl } from './lib/supabaseClient';
import Swal from 'sweetalert2';
import './App.css';

// ── Synchronous boot-time recovery check ──────────────────────────────────────
const BOOT_IS_RECOVERY =
  window.location.hash.includes('type=recovery') ||
  window.location.hash.includes('access_token') ||
  sessionStorage.getItem('wea_password_recovery') === 'true';
// ─────────────────────────────────────────────────────────────────────────────

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isDark, setIsDark] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState(30);
  const [sessionChecked, setSessionChecked] = useState(false);
  
  // Ref to track user activity
  const userActivityRef = useRef(Date.now());
  const logoutTimerRef = useRef(null);
  const forceLogoutTimerRef = useRef(null);
  const refreshTimeoutRef = useRef(null);

  // Fetch session timeout from database
  const fetchSessionTimeout = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/settings/system-settings');
      const result = await response.json();
      
      if (result.success && result.data.sessionTimeout) {
        const newTimeout = result.data.sessionTimeout;
        
        if (newTimeout !== sessionTimeout) {
          console.log(`🔄 Session timeout updated from ${sessionTimeout} to ${newTimeout} minutes`);
          setSessionTimeout(newTimeout);
          showTimeoutUpdateNotification(newTimeout);
        }
      }
    } catch (error) {
      console.error('Failed to fetch session timeout:', error);
    }
  };

  // Show notification when timeout changes
  const showTimeoutUpdateNotification = (newTimeout) => {
    if (isLoggedIn) {
      Swal.fire({
        title: 'Session Timeout Updated',
        text: `Session timeout has been changed to ${newTimeout} minutes.`,
        icon: 'info',
        confirmButtonColor: 'var(--color-primary)',
        confirmButtonText: 'OK',
        background: 'var(--color-bg-card)',
        color: 'var(--color-text-primary)',
        timer: 5000,
        timerProgressBar: true,
        customClass: {
          popup: 'swal-custom-popup',
          confirmButton: 'swal-custom-confirm'
        }
      });
    }
  };

  // Fetch initially and then every 30 seconds
  useEffect(() => {
    fetchSessionTimeout();
    refreshTimeoutRef.current = setInterval(fetchSessionTimeout, 30000);

    return () => {
      if (refreshTimeoutRef.current) {
        clearInterval(refreshTimeoutRef.current);
      }
    };
  }, []);

  // Track user activity across all pages
  useEffect(() => {
    const updateActivity = () => {
      userActivityRef.current = Date.now();
      const loginTime = localStorage.getItem('loginTime');
      if (loginTime) {
        localStorage.setItem('loginTime', Date.now().toString());
        console.log('🔄 Activity detected - session extended');
      }
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'focus'];
    events.forEach(event => {
      window.addEventListener(event, updateActivity);
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, updateActivity);
      });
    };
  }, []);

  // Check for inactivity and auto-logout
  useEffect(() => {
    if (!sessionTimeout || !isLoggedIn) return;

    console.log(`🔔 Session monitoring started with timeout: ${sessionTimeout} minutes`);

    if (logoutTimerRef.current) {
      clearInterval(logoutTimerRef.current);
    }
    if (forceLogoutTimerRef.current) {
      clearInterval(forceLogoutTimerRef.current);
    }

    logoutTimerRef.current = setInterval(() => {
      const lastActivity = userActivityRef.current;
      const now = Date.now();
      const inactiveMinutes = (now - lastActivity) / (1000 * 60);
      
      console.log(`⏱️ Inactive for: ${inactiveMinutes.toFixed(1)} minutes (Timeout: ${sessionTimeout} minutes)`);

      if (inactiveMinutes >= sessionTimeout) {
        console.log('⏰ Session expired due to inactivity, logging out...');
        performLogout();
      }
    }, 10000);

    forceLogoutTimerRef.current = setInterval(() => {
      const loginTime = localStorage.getItem('loginTime');
      if (loginTime) {
        const totalElapsed = (Date.now() - parseInt(loginTime)) / (1000 * 60);
        console.log(`🔍 Total session time: ${totalElapsed.toFixed(1)} minutes (Timeout: ${sessionTimeout} minutes)`);
        
        if (totalElapsed >= sessionTimeout) {
          console.log('⏰ Total session time exceeded, force logging out...');
          performLogout();
        }
      }
    }, 30000);

    return () => {
      if (logoutTimerRef.current) {
        clearInterval(logoutTimerRef.current);
      }
      if (forceLogoutTimerRef.current) {
        clearInterval(forceLogoutTimerRef.current);
      }
    };
  }, [sessionTimeout, isLoggedIn]);

  // Perform logout function
  const performLogout = async () => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('loginTime');
      
      await supabase.auth.signOut();
      
      setCurrentUser(null);
      setIsLoggedIn(false);
      
      if (logoutTimerRef.current) {
        clearInterval(logoutTimerRef.current);
      }
      if (forceLogoutTimerRef.current) {
        clearInterval(forceLogoutTimerRef.current);
      }
      if (refreshTimeoutRef.current) {
        clearInterval(refreshTimeoutRef.current);
      }
      
      window.location.href = '/';
      
    } catch (error) {
      console.error('Logout error:', error);
      window.location.href = '/';
    }
  };

  // Custom SweetAlert design configuration
  const showSuccessAlert = (message, title = 'Success!') => {
    Swal.fire({
      title, text: message, icon: 'success',
      confirmButtonColor: 'var(--color-primary)', confirmButtonText: 'OK',
      background: 'var(--color-bg-card)', color: 'var(--color-text-primary)',
      iconColor: 'var(--color-success)',
      customClass: { popup: 'swal-custom-popup', confirmButton: 'swal-custom-confirm' }
    });
  };

  const showErrorAlert = (message, title = 'Error!') => {
    Swal.fire({
      title, text: message, icon: 'error',
      confirmButtonColor: 'var(--color-danger)', confirmButtonText: 'OK',
      background: 'var(--color-bg-card)', color: 'var(--color-text-primary)',
      iconColor: 'var(--color-danger)',
      customClass: { popup: 'swal-custom-popup', confirmButton: 'swal-custom-confirm' }
    });
  };

  const showConfirmationAlert = (title, text, confirmText = 'Yes, proceed!') => {
    return Swal.fire({
      title, text, icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'var(--color-primary)',
      cancelButtonColor: 'var(--color-text-muted)',
      confirmButtonText: confirmText, cancelButtonText: 'Cancel',
      background: 'var(--color-bg-card)', color: 'var(--color-text-primary)',
      iconColor: 'var(--color-warning)',
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm',
        cancelButton: 'swal-custom-cancel'
      }
    });
  };

  useEffect(() => {
    document.body.classList.toggle('dark-theme', isDark);
  }, [isDark]);

  useEffect(() => {
    let cancelled = false;

    // ── Recovery boot path ──────────────────────────────────────────────────────
    if (BOOT_IS_RECOVERY) {
      console.log('🔑 Recovery mode — establishing session from URL');
      (async () => {
        const result = await establishSessionFromUrl();
        if (cancelled) return;

        if (result.success) {
          console.log('✅ Recovery session ready');
        } else {
          console.error('❌ Could not establish recovery session:', result.error);
          setRecoveryError('This password reset link is invalid or has expired. Please request a new one.');
        }

        setIsPasswordRecovery(true);
        setLoading(false);
      })();

      return () => { cancelled = true; };
    }
    // ────────────────────────────────────────────────────────────────────────────

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔄 Auth state changed:', event);

      if (event === 'PASSWORD_RECOVERY') {
        console.log('🔑 PASSWORD_RECOVERY event');
        sessionStorage.setItem('wea_password_recovery', 'true');
        localStorage.removeItem('sb-wea-auth-token');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setIsPasswordRecovery(true);
        setIsLoggedIn(false);
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      if (event === 'SIGNED_OUT') {
        if (cancelled) return;
        console.log('👋 User signed out');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('loginTime');
        setCurrentUser(null);
        setIsLoggedIn(false);
        setIsPasswordRecovery(false);
        return;
      }

      if (event === 'TOKEN_REFRESHED' && session) {
        if (cancelled) return;
        console.log('🔄 Token refreshed');
        localStorage.setItem('token', session.access_token);
      }
    });

    const checkSession = async () => {
      console.log('🔍 App: Checking for existing session...');
      try {
        // First, try to restore from localStorage
        const storedUser = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        const loginTime = localStorage.getItem('loginTime');
        
        console.log('📦 App: Stored user:', storedUser ? 'Found' : 'Not found');
        console.log('📦 App: Stored token:', token ? 'Found' : 'Not found');
        console.log('📦 App: Login time:', loginTime);
        
        // IMPORTANT: If we have stored user and token, restore them immediately
        // Don't try to verify with Supabase as it might fail on page refresh
        if (storedUser && token) {
          console.log('📦 App: Found stored user data in localStorage');
          const userData = JSON.parse(storedUser);
          
          // Check if loginTime exists and is not expired
          if (loginTime) {
            const elapsedMinutes = (Date.now() - parseInt(loginTime)) / (1000 * 60);
            console.log(`⏰ App: Time elapsed since login: ${elapsedMinutes.toFixed(1)} minutes`);
            
            // Only expire if we have a valid sessionTimeout and it's exceeded
            if (sessionTimeout && elapsedMinutes >= sessionTimeout) {
              console.log(`⏰ App: Session expired (${elapsedMinutes.toFixed(0)} minutes), clearing...`);
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              localStorage.removeItem('loginTime');
              setLoading(false);
              setSessionChecked(true);
              return;
            }
          }
          
          // Restore the user directly from localStorage
          console.log('✅ App: Restoring user from localStorage:', userData.name);
          setCurrentUser(userData);
          setIsLoggedIn(true);
          userActivityRef.current = Date.now();
          // Update login time on refresh
          localStorage.setItem('loginTime', Date.now().toString());
          setLoading(false);
          setSessionChecked(true);
          return;
        }

        // If no localStorage data, try Supabase session as fallback
        const { data: { session }, error } = await supabase.auth.getSession();
        if (cancelled) return;

        if (session && !error) {
          console.log('✅ App: Found valid Supabase session');

          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (cancelled) return;

          const userRole = profileData?.role || 'Employee';
          
          const user = {
            id: session.user.id,
            name: profileData ?
              `${profileData.first_name} ${profileData.middle_name ? profileData.middle_name + ' ' : ''}${profileData.last_name}` :
              session.user.email,
            email: session.user.email,
            role: userRole,
            avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100',
            employee_id: profileData?.employee_id,
            profile: profileData || {},
            first_name: profileData?.first_name,
            last_name: profileData?.last_name,
            middle_name: profileData?.middle_name,
          };

          localStorage.setItem('token', session.access_token);
          localStorage.setItem('user', JSON.stringify(user));
          localStorage.setItem('loginTime', Date.now().toString());

          userActivityRef.current = Date.now();

          setCurrentUser(user);
          setIsLoggedIn(true);
        } else {
          console.log('ℹ️ App: No session found');
        }
      } catch (error) {
        console.error('❌ App: Error checking session:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSessionChecked(true);
        }
      }
    };

    // Only run checkSession if not in recovery mode
    if (!BOOT_IS_RECOVERY) {
      // Small delay to ensure everything is initialized
      setTimeout(() => {
        checkSession();
      }, 200);
    }
    
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [sessionTimeout]);

  // Separate auth state change listener for login events
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔄 App Auth state changed:', event);
      
      if (event === 'SIGNED_IN' && session) {
        console.log('✅ User signed in');
        localStorage.setItem('loginTime', Date.now().toString());
        userActivityRef.current = Date.now();
      } else if (event === 'SIGNED_OUT') {
        console.log('👋 User signed out');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('loginTime');
        setCurrentUser(null);
        setIsLoggedIn(false);
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('🔄 Token refreshed');
        if (session) {
          localStorage.setItem('token', session.access_token);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const toggleTheme = () => setIsDark(!isDark);

  const handleLogin = (userProfile) => {
    console.log('🔍 User logged in:', userProfile);
    console.log('🔍 User role:', userProfile.role);
    
    localStorage.setItem('user', JSON.stringify(userProfile));
    localStorage.setItem('loginTime', Date.now().toString());
    
    userActivityRef.current = Date.now();
    
    setCurrentUser(userProfile);
    setIsLoggedIn(true);
  };

  const handleLogout = async () => {
    const result = await showConfirmationAlert(
      'Logout Confirmation',
      'Are you sure you want to logout? You will need to login again to access your account.',
      'Yes, Logout'
    );
    if (!result.isConfirmed) return;

    await performLogout();
  };

  const handleBackToLoginFromReset = () => {
    sessionStorage.removeItem('wea_password_recovery');
    setIsPasswordRecovery(false);
    setRecoveryError('');
    setIsLoggedIn(false);
    setCurrentUser(null);
    window.history.replaceState(null, '', window.location.pathname);
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center',
        alignItems: 'center', height: '100vh',
        background: 'var(--color-bg-root)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px', height: '40px',
            border: '4px solid var(--color-border)',
            borderTopColor: 'var(--color-primary)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {BOOT_IS_RECOVERY ? 'Verifying your reset link...' : 'Loading your session...'}
          </p>
        </div>
      </div>
    );
  }

  const renderLayout = () => {
    if (!currentUser) return null;
    const role = currentUser.role;
    console.log('🎯 Rendering layout for role:', role);
    
    switch (role) {
      case 'Admin':
        return <AdminLayout user={currentUser} onLogout={handleLogout} isDark={isDark} toggleTheme={toggleTheme} />;
      case 'Project Manager':
        return <PMLayout user={currentUser} onLogout={handleLogout} isDark={isDark} toggleTheme={toggleTheme} />;
      case 'Resource Manager':
        return <RMLayout user={currentUser} onLogout={handleLogout} isDark={isDark} toggleTheme={toggleTheme} />;
      default:
        return <EmployeeLayout user={currentUser} onLogout={handleLogout} isDark={isDark} toggleTheme={toggleTheme} />;
    }
  };

  if (isPasswordRecovery) {
    return (
      <ResetPassword
        onBackToLogin={handleBackToLoginFromReset}
        isDark={isDark}
        toggleTheme={toggleTheme}
        initialError={recoveryError}
      />
    );
  }

  return (
    <>
      {!isLoggedIn ? (
        <Login onLogin={handleLogin} isDark={isDark} toggleTheme={toggleTheme} />
      ) : (
        renderLayout()
      )}

      <style>{`
        .swal-custom-popup {
          border-radius: 16px !important;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3) !important;
          border: 1px solid var(--color-border) !important;
          padding: 2rem !important;
          max-width: 440px !important;
        }
        .swal-custom-popup .swal2-title {
          font-size: 22px !important; font-weight: 700 !important;
          color: var(--color-text-primary) !important; padding: 0 0 8px 0 !important;
        }
        .swal-custom-popup .swal2-html-container {
          font-size: 15px !important; color: var(--color-text-secondary) !important;
          line-height: 1.6 !important; padding: 0 !important; margin: 8px 0 16px 0 !important;
        }
        .swal-custom-confirm {
          border-radius: 8px !important; padding: 10px 28px !important;
          font-weight: 600 !important; transition: all 0.2s ease !important;
          font-size: 14px !important; background: var(--color-primary) !important;
          border: none !important; min-width: 100px !important; color: white !important;
        }
        .swal-custom-confirm:hover { transform: scale(1.02) !important; opacity: 0.9 !important; }
        .swal-custom-cancel {
          border-radius: 8px !important; padding: 10px 28px !important;
          font-weight: 600 !important; background: var(--color-bg-root) !important;
          color: var(--color-text-secondary) !important;
          border: 1px solid var(--color-border) !important;
          transition: all 0.2s ease !important; font-size: 14px !important;
          min-width: 100px !important;
        }
        .swal-custom-cancel:hover { background: var(--color-bg-card-hover) !important; transform: scale(1.02) !important; }
        .swal2-icon.swal2-success { border-color: var(--color-success) !important; }
        .swal2-icon.swal2-success .swal2-success-ring { border-color: var(--color-success) !important; }
        .swal2-icon.swal2-success [class^='swal2-success-line'] { background-color: var(--color-success) !important; }
        .swal2-icon.swal2-error { border-color: var(--color-danger) !important; }
        .swal2-icon.swal2-error .swal2-x-mark { color: var(--color-danger) !important; }
        .swal2-icon.swal2-warning { border-color: var(--color-warning) !important; color: var(--color-warning) !important; }
        .swal2-icon.swal2-warning .swal2-icon-content { color: var(--color-warning) !important; }
        .swal2-icon { margin: 1.5em auto 1em !important; }
        .swal2-actions { gap: 12px !important; margin-top: 8px !important; }
        .dark-theme .swal-custom-popup { background: #1e293b !important; border-color: #334155 !important; }
        .dark-theme .swal-custom-popup .swal2-title { color: #f1f5f9 !important; }
        .dark-theme .swal-custom-popup .swal2-html-container { color: #cbd5e1 !important; }
        .dark-theme .swal-custom-cancel { background: #334155 !important; color: #cbd5e1 !important; border-color: #475569 !important; }
        .dark-theme .swal-custom-cancel:hover { background: #475569 !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

export default App;