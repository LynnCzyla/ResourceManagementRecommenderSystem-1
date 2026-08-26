// backend/routes/Middleware/auth.js
const path = require('path');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const supabase = require(path.join(__dirname, '../../supabase'));

const client = jwksClient({
  jwksUri: `${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

console.log('✅ Auth middleware loaded, supabase:', !!supabase);

if (!process.env.SUPABASE_JWT_SECRET) {
  console.warn('⚠️ SUPABASE_JWT_SECRET is not set — add it to backend/.env (Supabase Dashboard → Settings → API → JWT Secret)');
}

// Cache with pending promise lock to prevent stampede
let cachedSessionTimeout = 30;
let lastFetchTime = 0;
let pendingTimeoutPromise = null;

const getSessionTimeout = async () => {
  const now = Date.now();
  const isStale = now - lastFetchTime > 5 * 60 * 1000;
  
  if (pendingTimeoutPromise) {
    console.log('⏳ Waiting for pending session timeout fetch...');
    return pendingTimeoutPromise;
  }
  
  if (!isStale) {
    return cachedSessionTimeout;
  }
  
  lastFetchTime = now;
  
  pendingTimeoutPromise = (async () => {
    try {
      console.log('🔄 Fetching session timeout from database...');
      
      const { data, error } = await supabase
        .from('system_settings')
        .select('session_timeout')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (!error && data && data.length > 0) {
        cachedSessionTimeout = data[0].session_timeout;
        console.log(`✅ Session timeout cached: ${cachedSessionTimeout} minutes`);
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

// ✅ FIXED: Get profile with branch_id from profiles table
const getProfileWithBranch = async (userId) => {
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

    return profile;
  } catch (error) {
    console.error('❌ Error in getProfileWithBranch:', error);
    return null;
  }
};

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const token = authHeader.split(' ')[1];

    // Check if it is a local dev/testing token
    if (token && token.startsWith('hr-token-')) {
      req.user = {
        id: '733cc8de-259c-43a8-9c82-48bb575d07b5',
        email: 'hr@wea.com',
        role: 'Human Resources'
      };
      return next();
    }

    // Verify token using appropriate algorithm
    let decoded;
    try {
      const decodedHeader = jwt.decode(token, { complete: true });
      const alg = decodedHeader?.header?.alg;

      if (alg === 'HS256') {
        if (!process.env.SUPABASE_JWT_SECRET) {
          throw new Error('SUPABASE_JWT_SECRET is not configured on the server');
        }
        decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET, { algorithms: ['HS256'] });
      } else if (alg === 'RS256' || alg === 'ES256') {
        decoded = await new Promise((resolve, reject) => {
          jwt.verify(token, getKey, { algorithms: ['RS256', 'ES256'] }, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
      } else {
        throw new Error(`Unsupported JWT algorithm: ${alg}`);
      }
    } catch (err) {
      console.error('❌ JWT Verify failed:', err.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        error: err.message
      });
    }

    const userId = decoded.sub;
    const userEmail = decoded.email;

    // ✅ FIXED: Get profile with branch_id from profiles table
    const profile = await getProfileWithBranch(userId);
    
    if (!profile) {
      console.error('❌ Profile not found for user:', userId);
      return res.status(401).json({
        success: false,
        message: 'User profile not found'
      });
    }

    // Check session timeout from database
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

    // ✅ FIXED: Attach complete user info including branch_id
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

    console.log(`✅ Auth: ${profile.employee_id} (${profile.role}) - Branch: ${profile.branch_id}`);

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication failed' 
    });
  }
};

// Cache clear function for admin use
const clearSessionTimeoutCache = () => {
  lastFetchTime = 0;
  pendingTimeoutPromise = null;
  console.log('🧹 Session timeout cache cleared');
};

module.exports = { verifyToken, clearSessionTimeoutCache };