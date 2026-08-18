// supabase.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

console.log('🔑 Using Supabase key type:',
  process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE (present)' : 'MISSING'
);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = supabase;