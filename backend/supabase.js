// supabase.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

console.log('🔑 Using Supabase key type:',
  process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE (present)' : 'MISSING'
);

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder_key';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️ Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in backend/.env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;