const supabase = require('../supabase');

async function testUpdateWithoutNotes() {
  const { data, error } = await supabase
    .from('hired_employees')
    .update({
      salary: 4500,
      hire_date: '2026-08-17',
      status: 'Active',
    })
    .eq('id', 10)
    .select()
    .single();

  console.log('Update without notes result:', { data, error });
}

testUpdateWithoutNotes();
