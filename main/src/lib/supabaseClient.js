// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('🔍 Checking environment variables:');
console.log('VITE_SUPABASE_URL:', supabaseUrl || '❌ NOT SET');
console.log('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ SET' : '❌ NOT SET');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables!');
}

// ── Detect recovery mode BEFORE creating the client ───────────────────────────
const _hash = window.location.hash;
const _isRecovery =
  _hash.includes('type=recovery') ||
  _hash.includes('access_token') ||
  sessionStorage.getItem('wea_password_recovery') === 'true';

if (_isRecovery) {
  // Wipe app-level "logged in" state so the UI never treats this as a normal
  // session. We do NOT rely on Supabase's automatic detectSessionInUrl for
  // the actual recovery session — that's handled manually below via
  // establishSessionFromUrl(), which is more reliable.
  localStorage.removeItem('sb-wea-auth-token');
  localStorage.removeItem('sb-wea-auth-token-code-verifier');
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.setItem('wea_password_recovery', 'true');
  console.log('🔑 [supabaseClient] Recovery mode — wiped all auth storage');
}
// ─────────────────────────────────────────────────────────────────────────────

let supabase;
try {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL or Anon Key is missing');
  }

  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      // We handle recovery tokens manually (see establishSessionFromUrl),
      // so disable automatic parsing during recovery to avoid both paths
      // racing to consume the same hash. Normal flows keep it enabled.
      detectSessionInUrl: !_isRecovery,
      storage: localStorage,
      storageKey: 'sb-wea-auth-token'
    }
  });
  console.log('✅ Supabase client initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Supabase client:', error);
  supabase = {
    auth: {
      signInWithPassword: () => Promise.reject(new Error('Supabase not initialized: ' + error.message)),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: () => Promise.resolve({ error: null }),
      resetPasswordForEmail: () => Promise.resolve({ error: null }),
      setSession: () => Promise.resolve({ data: { session: null }, error: new Error('Supabase not initialized') })
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

// ── Manually establish a session from a recovery link's URL hash ─────────────
// Parses #access_token=...&refresh_token=...&type=recovery and explicitly
// calls setSession(). This avoids relying on detectSessionInUrl's automatic
// background parsing, which has shown timing/version-dependent inconsistencies.
export const establishSessionFromUrl = async () => {
  try {
    const rawHash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(rawHash);

    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    const type = params.get('type');

    if (!access_token || !refresh_token) {
      console.warn('⚠️ No access_token/refresh_token found in URL hash');
      return { success: false, type, error: new Error('Missing tokens in URL') };
    }

    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token
    });

    // Strip the tokens out of the URL now that they've been consumed
    window.history.replaceState(null, '', window.location.pathname);

    if (error) {
      console.error('❌ Failed to establish session from URL:', error.message);
      return { success: false, type, error };
    }

    console.log('✅ Recovery session established from URL');
    return { success: true, type, session: data.session };
  } catch (err) {
    console.error('❌ establishSessionFromUrl error:', err);
    return { success: false, error: err };
  }
};
// ─────────────────────────────────────────────────────────────────────────────

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
    return { 'Content-Type': 'application/json', 'Authorization': '' };
  }
};

export default supabase;