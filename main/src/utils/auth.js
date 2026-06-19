// src/utils/auth.js
import { supabase } from '../lib/supabaseClient';

export const logout = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    
    // Clear local storage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Redirect to login
    window.location.href = '/login';
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
};