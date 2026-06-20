// App.jsx
import React, { useState, useEffect } from 'react';
import Login from './frontend/Login';
import ResetPassword from './frontend/ResetPassword';
import AdminLayout from './frontend/Admin/AdminLayout';
import PMLayout from './frontend/ProjectManager/PMLayout';
import RMLayout from './frontend/ResourceManager/RMLayout';
import EmployeeLayout from './frontend/Employee/EmployeeLayout';
import { supabase, getSession } from './lib/supabaseClient';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isDark, setIsDark] = useState(true);
  const [loading, setLoading] = useState(true); // Add loading state

  // NEW: tracks whether the user arrived via a password-recovery link.
  // When true, we show ResetPassword instead of Login/dashboard,
  // regardless of isLoggedIn state.
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    // Apply dark theme
    if (isDark) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }, [isDark]);

  // NEW: Detect password recovery links as early as possible.
  // Supabase puts #access_token=...&type=recovery in the URL when the
  // user clicks the "Reset Password" link from their email. We check
  // both the URL hash directly (fastest, no async wait) and the
  // PASSWORD_RECOVERY auth event (fires once Supabase parses it).
  useEffect(() => {
    // 1. Immediate check on the URL hash itself
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      console.log('🔑 Recovery link detected in URL hash');
      setIsPasswordRecovery(true);
    }

    // 2. Also listen for the PASSWORD_RECOVERY auth event, in case the
    // hash check above runs before Supabase has parsed/attached the session
    const { data: { subscription: recoverySub } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        console.log('🔑 PASSWORD_RECOVERY event received');
        setIsPasswordRecovery(true);
      }
    });

    return () => recoverySub.unsubscribe();
  }, []);

  // Check for existing session on app load
  useEffect(() => {
    const checkSession = async () => {
      console.log('🔍 Checking for existing session...');
      
      try {
        // 1. Check if user data exists in localStorage
        const storedUser = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        
        if (storedUser && token) {
          console.log('📦 Found stored user data');
          const userData = JSON.parse(storedUser);
          
          // 2. Verify the session is still valid with Supabase
          const session = await getSession();
          
          if (session) {
            console.log('✅ Session is valid, restoring user');
            setCurrentUser(userData);
            setIsLoggedIn(true);
            setLoading(false);
            return;
          } else {
            console.log('⚠️ Session expired or invalid, clearing local storage');
            // Clear invalid session data
            localStorage.removeItem('token');
            localStorage.removeItem('user');
          }
        }
        
        // 3. Try to get session from Supabase directly
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (session && !error) {
          console.log('✅ Found valid Supabase session');
          
          // Get user profile
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
          
          // Store in localStorage
          localStorage.setItem('token', session.access_token);
          localStorage.setItem('user', JSON.stringify({
            id: user.id,
            email: user.email,
            role: user.role
          }));
          
          setCurrentUser(user);
          setIsLoggedIn(true);
        } else {
          console.log('ℹ️ No session found');
        }
      } catch (error) {
        console.error('❌ Error checking session:', error);
        // Clear invalid data
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Listen for auth state changes (e.g., logout in another tab)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔄 Auth state changed:', event);
      
      if (event === 'SIGNED_IN' && session) {
        // User signed in, but we'll let the login flow handle this
        console.log('✅ User signed in');
      } else if (event === 'SIGNED_OUT') {
        console.log('👋 User signed out');
        // Clear everything
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setCurrentUser(null);
        setIsLoggedIn(false);
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('🔄 Token refreshed');
        // Update token in localStorage
        if (session) {
          localStorage.setItem('token', session.access_token);
        }
      }
    });

    // Cleanup subscription
    return () => subscription.unsubscribe();
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  const handleLogin = (userProfile) => {
    console.log('🔍 User logged in:', userProfile);
    console.log('🔍 User role:', userProfile.role);
    
    // Store user data
    localStorage.setItem('user', JSON.stringify({
      id: userProfile.id,
      email: userProfile.email,
      role: userProfile.role
    }));
    
    setCurrentUser(userProfile);
    setIsLoggedIn(true);
  };

  const handleLogout = async () => {
    console.log('👋 Logging out...');
    
    try {
      // Sign out from Supabase
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
    
    // Clear local storage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    setCurrentUser(null);
    setIsLoggedIn(false);
  };

  // NEW: Called when the user finishes resetting their password (or
  // cancels out) from the ResetPassword screen. Clears the recovery
  // flag and the URL hash, then drops them back at the login screen.
  const handleBackToLoginFromReset = () => {
    setIsPasswordRecovery(false);
    // Clean up the #access_token=...&type=recovery hash so refreshing
    // the page doesn't re-trigger recovery mode
    window.history.replaceState(null, '', window.location.pathname);
  };

  // Show loading screen while checking session
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

  // NEW: Password recovery takes priority over everything else.
  // If the user clicked the reset link in their email, show the
  // ResetPassword screen no matter what isLoggedIn/currentUser say.
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
    </>
  );
}

export default App;