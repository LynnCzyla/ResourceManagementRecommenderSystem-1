admins

admins (ALL, public)

audit_logs

Public can delete audit logs (DELETE, public)
Public can insert audit logs (INSERT, public)
Public can update audit logs (UPDATE, public)
Public can view audit logs (SELECT, public)

branches

Allow full access to branches (ALL, public)

contact_requests

Public can delete / insert / update / view contact requests (DELETE / INSERT / UPDATE / SELECT, public)

departments

Public can delete / insert / update / view departments (DELETE / INSERT / UPDATE / SELECT, public)

documents

All policy in table document (ALL, public)

employee_skills

Public can delete / insert / update / view employee skills (DELETE / INSERT / UPDATE / SELECT, public)

feedback_requests

All policy in feedback_requests (ALL, public)

feedback_responses

All policy in feedback_responses (ALL, public)

feedback_training

All policy in skill feedback (ALL, public)

hired_employees

All policy of hired_employees table (ALL, public)

hr_resource_requests

All policy (ALL, public)

interviews

All policy of interviews table (ALL, public)

job_applications

All policy of job_applications table (ALL, public)
public can read own applications by email (SELECT, anon)
public can submit applications (INSERT, anon)

job_postings

All policy of job_postings table (ALL, public)
HR can delete job postings (DELETE, authenticated)

notifications

Service role can insert notifications (INSERT, public)
Users can delete own notifications (DELETE, public)
Users can update own notifications (UPDATE, public)
Users can view own notifications (SELECT, public)

performance_records

All policy performance_records (ALL, public)
Allow select for creator or subject (SELECT, authenticated)

positions

Public can delete / insert / update / view positions (DELETE / INSERT / UPDATE / SELECT, public)

profiles

Public can delete / insert / update / view profiles (DELETE / INSERT / UPDATE / SELECT, public)

project_assignments

Public can delete / insert / update / view project assignments (DELETE / INSERT / UPDATE / SELECT, public)

project_report

project_report_insert_authenticated (INSERT, authenticated)
project_report_select_authenticated (SELECT, authenticated)
project_report_update_authenticated (UPDATE, authenticated)

project_resource_requirements

Public can delete / insert / update / view project resource requirements (DELETE / INSERT / UPDATE / SELECT, public)

project_resource_requirements_history

Allow insert for authenticated users (INSERT, authenticated)

project_tasks

projecttasks (ALL, public)

projects

Public can delete / insert / update / view projects (DELETE / INSERT / UPDATE / SELECT, public)

requirement_skills

Public can delete / insert / update / view requirement skills (DELETE / INSERT / UPDATE / SELECT, public)

skill_aliases

Public can delete / insert / update / view skill aliases (DELETE / INSERT / UPDATE / SELECT, public)

skill_components

Public can delete / insert / update / view skill components (DELETE / INSERT / UPDATE / SELECT, public)

skills

Public can delete / insert / update / view skills (DELETE / INSERT / UPDATE / SELECT, public)

super_admins

No policies (RLS on, so the Data API returns nothing)

system_settings

Allow insert (INSERT, public)
Allow select (SELECT, public)
Allow update (UPDATE, public)

user_login_attempts

Allow all operations (ALL, public)


function
Type	Arguments	Return type	Security
log_prr_status_change	function	none	trigger	Invoker