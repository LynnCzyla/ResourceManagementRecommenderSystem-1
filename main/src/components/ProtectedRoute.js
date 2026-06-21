// src/components/ProtectedRoute.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          // Check if session hasn't expired
          const loginTime = localStorage.getItem('loginTime');
          if (loginTime) {
            // Fetch session timeout from backend
            const response = await fetch('http://localhost:5000/api/settings/system-settings');
            const result = await response.json();
            
            if (result.success) {
              const timeout = result.data.sessionTimeout || 30;
              const elapsedMinutes = (Date.now() - parseInt(loginTime)) / (1000 * 60);
              
              if (elapsedMinutes >= timeout) {
                console.log('⏰ Session expired');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                localStorage.removeItem('loginTime');
                await supabase.auth.signOut();
                window.location.href = '/login';
                return;
              }
            }
          }
          
          setAuthenticated(true);
        } else {
          window.location.href = '/login';
        }
      } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/login';
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        window.location.href = '/login';
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
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
          <p style={{ color: 'var(--color-text-secondary)' }}>Checking authentication...</p>
        </div>
      </div>
    );
  }

  return authenticated ? children : null;
}