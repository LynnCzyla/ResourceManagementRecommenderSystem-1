const supabase = require('../supabase');
const { sendOnboardingOfferEmail } = require('../utils/mailer');

async function testSendOfferClean() {
  const id = 10;
  const { data: emp } = await supabase.from('hired_employees').select('*').eq('id', id).single();
  
  await sendOnboardingOfferEmail({
    to: emp.email,
    applicantName: emp.name,
    position: 'Warehouse Supervisor',
    salary: 4500,
    benefits: 'SSS, PhilHealth, Pag-IBIG',
    employmentType: 'Full-time',
    startDate: '2026-08-17',
    workLocation: 'Main Office Headquarters',
    workingHours: '8:00 AM - 5:00 PM',
    conditions: 'Subject to background check',
    instructions: 'Reply to accept',
    subject: 'Official Job Offer',
    customMessage: 'Dear Romell Ebuen'
  });

  const { data: updatedEmp, error } = await supabase
    .from('hired_employees')
    .update({
      salary: 4500,
      hire_date: '2026-08-17',
      status: 'Active',
    })
    .eq('id', id)
    .select()
    .single();

  console.log('CLEAN SEND OFFER RESULT:', { updatedEmp, error });
}

testSendOfferClean();
