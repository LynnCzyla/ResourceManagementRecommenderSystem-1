const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

console.log('SUPABASE_JWT_SECRET:', process.env.SUPABASE_JWT_SECRET);
const secret = process.env.SUPABASE_JWT_SECRET;
const isBase64 = secret && /^[A-Za-z0-9+/=]+$/.test(secret);
const verificationSecret = isBase64 ? Buffer.from(secret, 'base64') : secret;
console.log('isBase64:', isBase64);
console.log('decoded length:', verificationSecret.length);
