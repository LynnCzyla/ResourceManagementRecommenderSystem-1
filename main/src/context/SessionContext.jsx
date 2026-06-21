// src/context/SessionContext.jsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

const SessionContext = createContext();

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};

export const SessionProvider = ({ children }) => {
  const [sessionTimeout, setSessionTimeout] = useState(30);
  const [isActive, setIsActive] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const userActivityRef = useRef(Date.now());
  const logoutTimerRef = useRef(null);

  // Fetch session timeout from database
  useEffect(() => {
    const fetchSessionTimeout = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/settings/system-settings');
        const result = await response.json();
        
        if (result.success && result.data.sessionTimeout) {
          setSessionTimeout(result.data.sessionTimeout);
          console.log(`⏰ Session timeout: ${result.data.sessionTimeout} minutes`);
        }
      } catch (error) {
        console.error('Failed to fetch session timeout:', error);
      } finally {
        setIsInitialized(true);
      }
    };

    fetchSessionTimeout();
  }, []);

  // Track user activity across all pages
  useEffect(() => {
    const updateActivity = () => {
      userActivityRef.current = Date.now();
      setIsActive(true);
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
    if (!sessionTimeout || !isInitialized) return;

    if (logoutTimerRef.current) {
      clearInterval(logoutTimerRef.current);
    }

    logoutTimerRef.current = setInterval(() => {
      // Check if user is on login page
      if (window.location.pathname === '/login') {
        return; // Don't auto-logout on login page
      }

      const lastActivity = userActivityRef.current;
      const now = Date.now();
      const inactiveMinutes = (now - lastActivity) / (1000 * 60);
      
      console.log(`⏱️ Inactive for: ${inactiveMinutes.toFixed(1)} minutes (Timeout: ${sessionTimeout} minutes)`);

      if (inactiveMinutes >= sessionTimeout) {
        console.log('⏰ Session expired due to inactivity, logging out...');
        handleLogout();
      }
    }, 10000);

    return () => {
      if (logoutTimerRef.current) {
        clearInterval(logoutTimerRef.current);
      }
    };
  }, [sessionTimeout, isInitialized]);

  const handleLogout = async () => {
    // Clear all session data
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('loginTime');
    
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
    
    // Force redirect to login
    window.location.href = '/login';
  };

  const value = {
    sessionTimeout,
    isActive,
    setIsActive,
    isInitialized,
    handleLogout,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};