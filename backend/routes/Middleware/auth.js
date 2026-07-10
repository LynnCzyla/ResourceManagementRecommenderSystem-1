// middleware/auth.js
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

console.log('✅ Auth middleware loaded, supabase:', !!supabase); // debug

if (!process.env.SUPABASE_JWT_SECRET) {
  console.warn('⚠️ SUPABASE_JWT_SECRET is not set — add it to backend/.env (Supabase Dashboard → Settings → API → JWT Secret)');
}

let cachedSessionTimeout = 30;
let lastFetchTime = 0;

const getSessionTimeout = async () => {
  const now = Date.now();
  // Refresh cache every 5 minutes
  if (now - lastFetchTime > 5 * 60 * 1000) {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('session_timeout')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (!error && data && data.length > 0) {
        cachedSessionTimeout = data[0].session_timeout;
        lastFetchTime = now;
        console.log(`Session timeout: ${cachedSessionTimeout} minutes`);
      }
    } catch (error) {
      console.error('Error fetching session timeout:', error);
    }
  }
  return cachedSessionTimeout;
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

    // Verify token using Supabase's public JWKS (supports ES256/RS256 signing keys)
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

module.exports = { verifyToken };