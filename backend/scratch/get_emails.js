const supabase = require('../supabase');

async function main() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error('Error fetching auth users:', error);
  } else {
    console.log('Auth Users:', data.users.map(u => ({ id: u.id, email: u.email })));
  }
}

main();
