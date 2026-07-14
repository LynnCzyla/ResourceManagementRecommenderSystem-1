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

// ✅ FIXED: Cache with pending promise lock to prevent stampede
let cachedSessionTimeout = 30;
let lastFetchTime = 0;
let pendingTimeoutPromise = null;

const getSessionTimeout = async () => {
  const now = Date.now();
  const isStale = now - lastFetchTime > 5 * 60 * 1000;
  
  // If there's already a pending fetch, wait for it
  if (pendingTimeoutPromise) {
    console.log('⏳ Waiting for pending session timeout fetch...');
    return pendingTimeoutPromise;
  }
  
  // If cache is fresh, return cached value
  if (!isStale) {
    return cachedSessionTimeout;
  }
  
  // Set lastFetchTime BEFORE the query starts to prevent stampede
  lastFetchTime = now;
  
  // Create the pending promise
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
        // If error or no data, keep existing cached value
        console.warn('⚠️ No session timeout found, using cached value:', cachedSessionTimeout);
      }
      
      return cachedSessionTimeout;
    } catch (error) {
      console.error('❌ Error fetching session timeout:', error);
      // Roll back lastFetchTime so next request retries
      lastFetchTime = 0;
      return cachedSessionTimeout;
    } finally {
      pendingTimeoutPromise = null;
    }
  })();
  
  return pendingTimeoutPromise;
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

    // Verify token using Supabase's public JWKS
    let decoded;
    try {
      decoded = await new Promise((resolve, reject) => {
        jwt.verify(token, getKey, { algorithms: ['ES256', 'RS256'] }, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
    } catch (err) {
      console.error('❌ JWT Verify failed:', err.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        error: err.message
      });
    }

    const user = { id: decoded.sub, email: decoded.email, role: decoded.role };

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

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication failed' 
    });
  }
};

// ✅ Add cache clear function for admin use
const clearSessionTimeoutCache = () => {
  lastFetchTime = 0;
  pendingTimeoutPromise = null;
  console.log('🧹 Session timeout cache cleared');
};

module.exports = { verifyToken, clearSessionTimeoutCache };