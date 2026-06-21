// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import Login from './frontend/Login';
import ResetPassword from './frontend/ResetPassword';
import AdminLayout from './frontend/Admin/AdminLayout';
import PMLayout from './frontend/ProjectManager/PMLayout';
import RMLayout from './frontend/ResourceManager/RMLayout';
import EmployeeLayout from './frontend/Employee/EmployeeLayout';
import { supabase, getSession } from './lib/supabaseClient';
import Swal from 'sweetalert2';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isDark, setIsDark] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState(30);
  
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
        
        // Only update if value changed
        if (newTimeout !== sessionTimeout) {
          console.log(`🔄 Session timeout updated from ${sessionTimeout} to ${newTimeout} minutes`);
          setSessionTimeout(newTimeout);
          
          // Show notification to user
          showTimeoutUpdateNotification(newTimeout);
        }
      }
    } catch (error) {
      console.error('Failed to fetch session timeout:', error);
    }
  };

  // Show notification when timeout changes
  const showTimeoutUpdateNotification = (newTimeout) => {
    // Only show if user is logged in
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
    // Initial fetch
    fetchSessionTimeout();

    // Refresh every 30 seconds
    refreshTimeoutRef.current = setInterval(fetchSessionTimeout, 30000);

    return () => {
      if (refreshTimeoutRef.current) {
        clearInterval(refreshTimeoutRef.current);
      }
    };
  }, []); // Run once on mount

  // Track user activity across all pages
  useEffect(() => {
    const updateActivity = () => {
      userActivityRef.current = Date.now();
      // Update login time to extend session
      const loginTime = localStorage.getItem('loginTime');
      if (loginTime) {
        localStorage.setItem('loginTime', Date.now().toString());
        console.log('🔄 Activity detected - session extended');
      }
    };

    // Update activity on user interactions
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

    // Clear any existing timers
    if (logoutTimerRef.current) {
      clearInterval(logoutTimerRef.current);
    }
    if (forceLogoutTimerRef.current) {
      clearInterval(forceLogoutTimerRef.current);
    }

    // Check inactivity every 10 seconds
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

    // FORCE CHECK: Also check total session time every 30 seconds
    forceLogoutTimerRef.current = setInterval(() => {
      const loginTime = localStorage.getItem('loginTime');
      if (loginTime) {
        const totalElapsed = (Date.now() - parseInt(loginTime)) / (1000 * 60);
        console.log(`🔍 Total session time: ${totalElapsed.toFixed(1)} minutes (Timeout: ${sessionTimeout} minutes)`);
        
        // If total session time exceeds timeout, force logout
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
      // Clear local storage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('loginTime');
      
      // Sign out from Supabase
      await supabase.auth.signOut();
      
      // Reset state
      setCurrentUser(null);
      setIsLoggedIn(false);
      
      // Clear timers
      if (logoutTimerRef.current) {
        clearInterval(logoutTimerRef.current);
      }
      if (forceLogoutTimerRef.current) {
        clearInterval(forceLogoutTimerRef.current);
      }
      if (refreshTimeoutRef.current) {
        clearInterval(refreshTimeoutRef.current);
      }
      
      // Force redirect to login
      window.location.href = '/login';
      
    } catch (error) {
      console.error('Logout error:', error);
      // Even if there's an error, force redirect
      window.location.href = '/login';
    }
  };

  // Custom SweetAlert design configuration
  const showSuccessAlert = (message, title = 'Success!') => {
    Swal.fire({
      title: title,
      text: message,
      icon: 'success',
      confirmButtonColor: 'var(--color-primary)',
      confirmButtonText: 'OK',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
      iconColor: 'var(--color-success)',
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm'
      }
    });
  };

  const showErrorAlert = (message, title = 'Error!') => {
    Swal.fire({
      title: title,
      text: message,
      icon: 'error',
      confirmButtonColor: 'var(--color-danger)',
      confirmButtonText: 'OK',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
      iconColor: 'var(--color-danger)',
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm'
      }
    });
  };

  const showConfirmationAlert = (title, text, confirmText = 'Yes, proceed!') => {
    return Swal.fire({
      title: title,
      text: text,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'var(--color-primary)',
      cancelButtonColor: 'var(--color-text-muted)',
      confirmButtonText: confirmText,
      cancelButtonText: 'Cancel',
      background: 'var(--color-bg-card)',
      color: 'var(--color-text-primary)',
      iconColor: 'var(--color-warning)',
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm',
        cancelButton: 'swal-custom-cancel'
      }
    });
  };

  useEffect(() => {
    if (isDark) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }, [isDark]);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      console.log('🔑 Recovery link detected in URL hash');
      setIsPasswordRecovery(true);
    }

    const { data: { subscription: recoverySub } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        console.log('🔑 PASSWORD_RECOVERY event received');
        setIsPasswordRecovery(true);
      }
    });

    return () => recoverySub.unsubscribe();
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      console.log('🔍 Checking for existing session...');
      
      try {
        const storedUser = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        const loginTime = localStorage.getItem('loginTime');
        
        if (storedUser && token) {
          console.log('📦 Found stored user data');
          const userData = JSON.parse(storedUser);
          
          // Check if session has expired
          if (loginTime) {
            const elapsedMinutes = (Date.now() - parseInt(loginTime)) / (1000 * 60);
            
            if (elapsedMinutes >= sessionTimeout) {
              console.log(`⏰ Session expired (${elapsedMinutes.toFixed(0)} minutes)`);
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              localStorage.removeItem('loginTime');
              setLoading(false);
              return;
            }
          }
          
          const session = await getSession();
          
          if (session) {
            console.log('✅ Session is valid, restoring user');
            // Update activity time
            userActivityRef.current = Date.now();
            setCurrentUser(userData);
            setIsLoggedIn(true);
            setLoading(false);
            return;
          } else {
            console.log('⚠️ Session expired or invalid, clearing local storage');
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('loginTime');
          }
        }
        
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (session && !error) {
          console.log('✅ Found valid Supabase session');
          
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

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
            profile: profileData || {}
          };
          
          localStorage.setItem('token', session.access_token);
          localStorage.setItem('user', JSON.stringify({
            id: user.id,
            email: user.email,
            role: user.role
          }));
          localStorage.setItem('loginTime', Date.now().toString());
          
          // Update activity time
          userActivityRef.current = Date.now();
          
          setCurrentUser(user);
          setIsLoggedIn(true);
        } else {
          console.log('ℹ️ No session found');
        }
      } catch (error) {
        console.error('❌ Error checking session:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('loginTime');
      } finally {
        setLoading(false);
      }
    };

    if (sessionTimeout) {
      checkSession();
    }
  }, [sessionTimeout]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔄 Auth state changed:', event);
      
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

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  const handleLogin = (userProfile) => {
    console.log('🔍 User logged in:', userProfile);
    console.log('🔍 User role:', userProfile.role);
    
    localStorage.setItem('user', JSON.stringify({
      id: userProfile.id,
      email: userProfile.email,
      role: userProfile.role
    }));
    localStorage.setItem('loginTime', Date.now().toString());
    
    // Update activity time
    userActivityRef.current = Date.now();
    
    setCurrentUser(userProfile);
    setIsLoggedIn(true);
  };

  const handleLogout = async () => {
    // Show confirmation before logging out
    const result = await showConfirmationAlert(
      'Logout Confirmation',
      'Are you sure you want to logout? You will need to login again to access your account.',
      'Yes, Logout'
    );

    if (!result.isConfirmed) {
      return; // User cancelled logout
    }

    await performLogout();
  };

  const handleBackToLoginFromReset = () => {
    setIsPasswordRecovery(false);
    window.history.replaceState(null, '', window.location.pathname);
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'var(--color-bg-root)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid var(--color-border)',
            borderTopColor: 'var(--color-primary)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <p style={{ color: 'var(--color-text-secondary)' }}>Loading your session...</p>
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
      />
    );
  }

  return (
    <>
      {!isLoggedIn ? (
        <Login 
          onLogin={handleLogin} 
          isDark={isDark} 
          toggleTheme={toggleTheme} 
        />
      ) : (
        renderLayout()
      )}

      {/* SweetAlert2 Custom Styles */}
      <style>{`
        .swal-custom-popup {
          border-radius: 16px !important;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3) !important;
          border: 1px solid var(--color-border) !important;
          padding: 2rem !important;
          max-width: 440px !important;
        }

        .swal-custom-popup .swal2-title {
          font-size: 22px !important;
          font-weight: 700 !important;
          color: var(--color-text-primary) !important;
          padding: 0 0 8px 0 !important;
        }

        .swal-custom-popup .swal2-html-container {
          font-size: 15px !important;
          color: var(--color-text-secondary) !important;
          line-height: 1.6 !important;
          padding: 0 !important;
          margin: 8px 0 16px 0 !important;
        }

        .swal-custom-confirm {
          border-radius: 8px !important;
          padding: 10px 28px !important;
          font-weight: 600 !important;
          transition: all 0.2s ease !important;
          font-size: 14px !important;
          background: var(--color-primary) !important;
          border: none !important;
          min-width: 100px !important;
          color: white !important;
        }

        .swal-custom-confirm:hover {
          transform: scale(1.02) !important;
          opacity: 0.9 !important;
        }

        .swal-custom-cancel {
          border-radius: 8px !important;
          padding: 10px 28px !important;
          font-weight: 600 !important;
          background: var(--color-bg-root) !important;
          color: var(--color-text-secondary) !important;
          border: 1px solid var(--color-border) !important;
          transition: all 0.2s ease !important;
          font-size: 14px !important;
          min-width: 100px !important;
        }

        .swal-custom-cancel:hover {
          background: var(--color-bg-card-hover) !important;
          transform: scale(1.02) !important;
        }

        /* SweetAlert Icon Colors */
        .swal2-icon.swal2-success {
          border-color: var(--color-success) !important;
        }

        .swal2-icon.swal2-success .swal2-success-ring {
          border-color: var(--color-success) !important;
        }

        .swal2-icon.swal2-success [class^='swal2-success-line'] {
          background-color: var(--color-success) !important;
        }

        .swal2-icon.swal2-error {
          border-color: var(--color-danger) !important;
        }

        .swal2-icon.swal2-error .swal2-x-mark {
          color: var(--color-danger) !important;
        }

        .swal2-icon.swal2-warning {
          border-color: var(--color-warning) !important;
          color: var(--color-warning) !important;
        }

        .swal2-icon.swal2-warning .swal2-icon-content {
          color: var(--color-warning) !important;
        }

        .swal2-icon {
          margin: 1.5em auto 1em !important;
        }

        .swal2-actions {
          gap: 12px !important;
          margin-top: 8px !important;
        }

        /* Dark theme overrides for SweetAlert */
        .dark-theme .swal-custom-popup {
          background: #1e293b !important;
          border-color: #334155 !important;
        }

        .dark-theme .swal-custom-popup .swal2-title {
          color: #f1f5f9 !important;
        }

        .dark-theme .swal-custom-popup .swal2-html-container {
          color: #cbd5e1 !important;
        }

        .dark-theme .swal-custom-cancel {
          background: #334155 !important;
          color: #cbd5e1 !important;
          border-color: #475569 !important;
        }

        .dark-theme .swal-custom-cancel:hover {
          background: #475569 !important;
        }

        /* Spinner animation */
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

export default App;