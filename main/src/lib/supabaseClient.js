// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// Use VITE_ prefix for Vite (not REACT_APP_)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Debug: Log environment variables
console.log('🔍 Checking environment variables:');
console.log('VITE_SUPABASE_URL:', supabaseUrl || '❌ NOT SET');
console.log('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ SET' : '❌ NOT SET');

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables!');
  console.error('Please check your .env file in the project root.');
  console.error('Required variables:');
  console.error('  VITE_SUPABASE_URL=your_supabase_url');
  console.error('  VITE_SUPABASE_ANON_KEY=your_supabase_anon_key');
}

// Create Supabase client
let supabase;
try {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL or Anon Key is missing');
  }
  
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: localStorage,
      storageKey: 'sb-wea-auth-token'
    }
  });
  console.log('✅ Supabase client initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Supabase client:', error);
  // Create a fallback dummy client to prevent crashes
  supabase = {
    auth: {
      signInWithPassword: () => Promise.reject(new Error('Supabase not initialized: ' + error.message)),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: () => Promise.resolve({ error: null }),
      resetPasswordForEmail: () => Promise.resolve({ error: null })
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null })
        })
      })
    })
  };
}

export { supabase };

// Helper functions
export const getSession = async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
};

export const getCurrentUser = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
};

export const getAuthHeaders = async () => {
  try {
    const session = await getSession();
    const token = session?.access_token || localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  } catch (error) {
    console.error('Error getting auth headers:', error);
    return {
      'Content-Type': 'application/json',
      'Authorization': '',
    };
  }
};

export default supabase;