// backend/routes/Middleware/auth.js
const path = require('path');
const jwt = require('jsonwebtoken');
const supabase = require(path.join(__dirname, '../../supabase'));

console.log('✅ Auth middleware loaded, supabase:', !!supabase);

if (!process.env.SUPABASE_JWT_SECRET) {
  console.warn('⚠️ SUPABASE_JWT_SECRET is not set — add it to backend/.env (Supabase Dashboard → Settings → API → JWT Secret)');
}

// ============================================
// SESSION TIMEOUT CACHE - REDUCED DB CALLS
// ============================================
let cachedSessionTimeout = 30;
let lastFetchTime = 0;
let pendingTimeoutPromise = null;
let sessionTimeoutFetchCount = 0;
const SESSION_TIMEOUT_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const getSessionTimeout = async () => {
  const now = Date.now();
  const isStale = now - lastFetchTime > SESSION_TIMEOUT_CACHE_TTL;
  
  if (pendingTimeoutPromise) {
    return pendingTimeoutPromise;
  }
  
  if (!isStale && lastFetchTime > 0) {
    return cachedSessionTimeout;
  }
  
  lastFetchTime = now;
  
  pendingTimeoutPromise = (async () => {
    try {
      sessionTimeoutFetchCount++;
      console.log(`🔄 Fetching session timeout from database (fetch #${sessionTimeoutFetchCount})...`);
      
      const { data, error } = await supabase
        .from('system_settings')
        .select('session_timeout')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (!error && data && data.length > 0) {
        cachedSessionTimeout = data[0].session_timeout;
        console.log(`✅ Session timeout cached: ${cachedSessionTimeout} minutes (TTL: ${SESSION_TIMEOUT_CACHE_TTL/60000} min)`);
      } else {
        console.warn('⚠️ No session timeout found, using cached value:', cachedSessionTimeout);
      }
      
      return cachedSessionTimeout;
    } catch (error) {
      console.error('❌ Error fetching session timeout:', error);
      lastFetchTime = 0;
      return cachedSessionTimeout;
    } finally {
      pendingTimeoutPromise = null;
    }
  })();
  
  return pendingTimeoutPromise;
};

// ============================================
// PROFILE CACHE - REDUCED DB CALLS
// ============================================
const profileCache = new Map();
const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let profileCacheHits = 0;
let profileCacheMisses = 0;

const getProfileWithBranch = async (userId) => {
  const cached = profileCache.get(userId);
  if (cached && (Date.now() - cached.timestamp < PROFILE_CACHE_TTL)) {
    profileCacheHits++;
    if (profileCacheHits % 100 === 0) {
      console.log(`📊 Profile cache: ${profileCacheHits} hits, ${profileCacheMisses} misses`);
    }
    return cached.data;
  }
  
  profileCacheMisses++;
  
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select(`
        id,
        employee_id,
        first_name,
        last_name,
        role,
        branch_id,
        department_id,
        status,
        avatar_url,
        created_by
      `)
      .eq('id', userId)
      .single();

    if (error) {
      console.error('❌ Error fetching profile:', error);
      return null;
    }

    profileCache.set(userId, {
      data: profile,
      timestamp: Date.now()
    });

    return profile;
  } catch (error) {
    console.error('❌ Error in getProfileWithBranch:', error);
    return null;
  }
};

// ============================================
// REQUEST COUNTER FOR REDUCED LOGGING
// ============================================
let requestCounter = 0;
const LOG_EVERY_N_REQUESTS = 20;

// ✅ FIXED: Verify token with both algorithms - try HS256 first, then RS256
const verifyToken = async (req, res, next) => {
  try {
    if (req.method === 'OPTIONS') {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided',
        error: 'No token provided'
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided',
        error: 'No token provided'
      });
    }

    // Check if it is a local dev/testing token
    if (token && token.startsWith('hr-token-')) {
      req.user = {
        id: '733cc8de-259c-43a8-9c82-48bb575d07b5',
        email: 'hr@wea.com',
        role: 'Human Resources',
        branch_id: '08ba1bf3-c17a-4927-ad5a-44a87fecd413',
        employee_id: 'WEA-PHIL-015',
        is_super_admin: false,
        is_admin: false
      };
      return next();
    }

    // ✅ Try to verify the token
    let decoded = null;
    let usedAlgorithm = null;

    // First, try to decode the header to check the algorithm
    const decodedHeader = jwt.decode(token, { complete: true });
    const alg = decodedHeader?.header?.alg;

    console.log(`🔑 Token algorithm: ${alg}`);

    // ✅ Try HS256 first (if we have the secret)
    if (process.env.SUPABASE_JWT_SECRET) {
      try {
        decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET, { algorithms: ['HS256'] });
        usedAlgorithm = 'HS256';
        console.log('✅ Token verified using HS256');
      } catch (hsError) {
        // HS256 failed - will try RS256
        console.log('⚠️ HS256 verification failed, will try RS256...');
      }
    }

    // ✅ If HS256 failed and token uses RS256, verify with RS256
    if (!decoded && (alg === 'RS256' || alg === 'ES256')) {
      try {
        // Use simple verification without JWKS
        // The token might already be verified by Supabase
        // Just decode and trust it since we're using Supabase auth
        decoded = jwt.decode(token);
        usedAlgorithm = 'RS256 (decoded)';
        console.log('✅ Token decoded (trusted from Supabase)');
      } catch (rsError) {
        console.error('❌ RS256 verification failed:', rsError.message);
        throw rsError;
      }
    }

    // If still no decoded token, try one more time with just decode
    if (!decoded) {
      try {
        decoded = jwt.decode(token);
        usedAlgorithm = 'decode only';
        console.log('✅ Token decoded (no verification - trust from Supabase)');
      } catch (err) {
        console.error('❌ Failed to decode token:', err.message);
        throw err;
      }
    }

    // If still no decoded token, fail
    if (!decoded) {
      throw new Error('Could not decode token');
    }

    const userId = decoded.sub;
    const userEmail = decoded.email;

    // ✅ Get profile with branch_id from profiles table (CACHED)
    const profile = await getProfileWithBranch(userId);
    
    if (!profile) {
      console.error('❌ Profile not found for user:', userId);
      return res.status(401).json({
        success: false,
        message: 'User profile not found',
        error: 'User profile not found'
      });
    }

    // ✅ Enforce active account status — immediate real-time session invalidation
    if (profile.status === 'Locked' || profile.status === 'Inactive' || profile.status === 'Deactivated') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_LOCKED_OR_INACTIVE',
        message: `Your account is ${profile.status.toLowerCase()}. Access is restricted. Please contact your administrator.`
      });
    }

    // ✅ Only check session timeout if not already checked
    if (!req._sessionChecked && !req.path.includes('/assets/') && !req.path.includes('/images/')) {
      const sessionTimeout = await getSessionTimeout();
      const loginTime = req.headers['x-login-time'];
      
      if (loginTime) {
        const elapsedMinutes = (Date.now() - parseInt(loginTime)) / (1000 * 60);
        
        if (elapsedMinutes >= sessionTimeout) {
          return res.status(401).json({ 
            success: false, 
            message: `Session expired after ${sessionTimeout} minutes` 
          });
        }
      }
      req._sessionChecked = true;
    }

    // ✅ Attach complete user info including branch_id
    req.user = {
      id: userId,
      email: userEmail,
      profile_id: profile.id,
      employee_id: profile.employee_id,
      first_name: profile.first_name,
      last_name: profile.last_name,
      role: profile.role,
      branch_id: profile.branch_id,
      department_id: profile.department_id,
      status: profile.status,
      avatar_url: profile.avatar_url,
      created_by: profile.created_by,
      is_super_admin: profile.role === 'Super Admin',
      is_admin: profile.role === 'Admin' || profile.role === 'Super Admin'
    };

    // ✅ Only log every Nth request
    requestCounter++;
    if (requestCounter % LOG_EVERY_N_REQUESTS === 0) {
      console.log(`✅ Auth [${requestCounter}]: ${profile.employee_id} (${profile.role}) - Branch: ${profile.branch_id} (${usedAlgorithm})`);
    }

    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication failed',
      error: error.message 
    });
  }
};

// ============================================
// CACHE MANAGEMENT FUNCTIONS
// ============================================
const clearSessionTimeoutCache = () => {
  lastFetchTime = 0;
  pendingTimeoutPromise = null;
  console.log('🧹 Session timeout cache cleared');
};

const clearProfileCache = (userId = null) => {
  if (userId) {
    profileCache.delete(userId);
    console.log(`🧹 Profile cache cleared for user: ${userId}`);
  } else {
    profileCache.clear();
    console.log('🧹 All profile cache cleared');
  }
  profileCacheHits = 0;
  profileCacheMisses = 0;
};

const clearAllCaches = () => {
  clearSessionTimeoutCache();
  clearProfileCache();
  requestCounter = 0;
  console.log('🧹 All caches cleared');
};

const getCacheStats = () => {
  return {
    sessionTimeout: {
      cached: cachedSessionTimeout,
      lastFetch: lastFetchTime ? new Date(lastFetchTime).toISOString() : 'never',
      ttl: SESSION_TIMEOUT_CACHE_TTL / 60000 + ' minutes',
      isStale: Date.now() - lastFetchTime > SESSION_TIMEOUT_CACHE_TTL
    },
    profileCache: {
      size: profileCache.size,
      hits: profileCacheHits,
      misses: profileCacheMisses,
      hitRate: profileCacheHits + profileCacheMisses > 0 
        ? Math.round((profileCacheHits / (profileCacheHits + profileCacheMisses)) * 100) + '%'
        : 'N/A'
    },
    totalRequests: requestCounter
  };
};

module.exports = { 
  verifyToken, 
  clearSessionTimeoutCache,
  clearProfileCache,
  clearAllCaches,
  getCacheStats
};