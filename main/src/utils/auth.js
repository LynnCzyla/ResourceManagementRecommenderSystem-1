// src/utils/auth.js
import { supabase } from '../lib/supabaseClient';

export const logout = async () => {
  try {
    // Clear local storage first
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('loginTime');
    
    // Sign out from Supabase
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    
    // Force page reload to clear all state
    window.location.href = '/login';
  } catch (error) {
    console.error('Logout error:', error);
    // Even if there's an error, force redirect to login
    window.location.href = '/login';
  }
};