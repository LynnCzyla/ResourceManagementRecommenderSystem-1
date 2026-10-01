## Table `departments`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `department_name` | `text` |  |
| `description` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `branch_id` | `uuid` |  Nullable |

## Table `positions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `department_id` | `int8` |  |
| `position_name` | `text` |  |
| `description` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `profiles`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `employee_id` | `text` |  Unique |
| `first_name` | `text` |  |
| `middle_name` | `text` |  Nullable |
| `last_name` | `text` |  |
| `contact_number` | `varchar` |  Nullable |
| `position_id` | `int8` |  Nullable |
| `role` | `text` |  |
| `availability_status` | `text` |  Nullable |
| `join_date` | `date` |  Nullable |
| `status` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |
| `department_id` | `int8` |  Nullable |
| `avatar_url` | `text` |  Nullable |
| `branch_id` | `uuid` |  Nullable |
| `created_by` | `uuid` |  Nullable |

## Table `contact_requests`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `email` | `text` |  |
| `request_type` | `text` |  Nullable |
| `message` | `text` |  |
| `status` | `text` |  Nullable |
| `processed_by` | `uuid` |  Nullable |
| `processed_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `phone` | `text` |  Nullable |
| `first_name` | `text` |  |
| `middle_name` | `text` |  Nullable |
| `last_name` | `text` |  Nullable |
| `branch_id` | `uuid` |  Nullable |

## Table `audit_logs`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `user_id` | `uuid` |  Nullable |
| `action` | `text` |  |
| `system_category` | `text` |  |
| `log_description` | `text` |  |
| `created_at` | `timestamptz` |  Nullable |

## Table `projects`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `project_code` | `text` |  Nullable Unique |
| `project_name` | `text` |  |
| `project_description` | `text` |  Nullable |
| `team_size` | `int4` |  Nullable |
| `duration_days` | `int4` |  Nullable |
| `start_date` | `date` |  |
| `end_date` | `date` |  |
| `priority` | `text` |  Nullable |
| `status` | `text` |  Nullable |
| `created_by` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |

## Table `skills`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `skill_name` | `text` |  Unique |
| `created_at` | `timestamptz` |  Nullable |

## Table `employee_skills`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `profile_id` | `uuid` |  Nullable |
| `skill_id` | `int8` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `project_resource_requirements`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `project_id` | `int8` |  |
| `position_id` | `int8` |  Nullable |
| `quantity_needed` | `int4` |  |
| `assignment_type` | `text` |  Nullable |
| `justification` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `role_title` | `text` |  Nullable |
| `start_date` | `date` |  Nullable |
| `end_date` | `date` |  Nullable |
| `status` | `text` |  Nullable |

## Table `requirement_skills`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `requirement_id` | `int8` |  |
| `skills` | `text` |  Nullable |
| `skill_type` | `text` |  |

## Table `project_assignments`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `project_id` | `int8` |  |
| `profile_id` | `uuid` |  |
| `requirement_id` | `int8` |  Nullable |
| `assigned_role` | `text` |  Nullable |
| `start_date` | `date` |  Nullable |
| `end_date` | `date` |  Nullable |
| `status` | `text` |  Nullable |
| `assigned_by` | `uuid` |  Nullable |
| `assigned_at` | `timestamptz` |  Nullable |

## Table `system_settings`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `session_timeout` | `int4` |  |
| `max_login_attempts` | `int4` |  |
| `max_file_upload_size` | `int4` |  |
| `min_password_length` | `int4` |  |
| `require_uppercase` | `bool` |  |
| `min_uppercase` | `int4` |  |
| `require_lowercase` | `bool` |  |
| `min_lowercase` | `int4` |  |
| `require_number` | `bool` |  |
| `min_number` | `int4` |  |
| `require_special` | `bool` |  |
| `min_special` | `int4` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `user_login_attempts`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `user_id` | `uuid` |  Unique |
| `failed_attempts` | `int4` |  |
| `last_failed_at` | `timestamptz` |  Nullable |
| `locked` | `bool` |  |
| `locked_by` | `uuid` |  Nullable |
| `locked_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `notifications`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `recipient_id` | `uuid` |  Nullable |
| `type` | `text` |  |
| `text` | `text` |  |
| `read` | `bool` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `documents`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `employee_id` | `text` |  |
| `document_type` | `text` |  |
| `file_name` | `text` |  |
| `file_path` | `text` |  |
| `file_size` | `int4` |  Nullable |
| `mime_type` | `text` |  Nullable |
| `raw_ocr_text` | `text` |  Nullable |
| `cleaned_ocr_text` | `text` |  Nullable |
| `ocr_confidence` | `numeric` |  Nullable |
| `word_count` | `int4` |  Nullable |
| `char_count` | `int4` |  Nullable |
| `document_hash` | `text` |  Nullable |
| `processed_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `extraction_method` | `text` |  Nullable |
| `extracted_skills` | `text` |  Nullable |
| `skills_approved` | `bool` |  Nullable |
| `feedback_pending` | `bool` |  Nullable |
| `approved_skills` | `text` |  Nullable |
| `rejected_skills` | `text` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |

## Table `project_tasks`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `project_id` | `int8` |  |
| `profile_id` | `uuid` |  Nullable |
| `title` | `text` |  |
| `description` | `text` |  Nullable |
| `priority` | `text` |  Nullable |
| `status` | `text` |  Nullable |
| `due_date` | `date` |  Nullable |
| `progress_logs` | `jsonb` |  Nullable |
| `created_by` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |

## Table `feedback_training`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `phrase` | `text` |  |
| `label` | `text` |  |
| `confidence` | `numeric` |  Nullable |
| `prediction` | `text` |  Nullable |
| `reviewed_by` | `uuid` |  Nullable |
| `reviewed_at` | `timestamptz` |  Nullable |
| `document_id` | `uuid` |  Nullable |
| `employee_id` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `feedback_requests`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `project_id` | `int8` |  |
| `created_by` | `uuid` |  |
| `client_name` | `varchar` |  |
| `client_email` | `varchar` |  |
| `employee_ids` | `_uuid` |  |
| `access_token` | `uuid` |  Unique |
| `status` | `varchar` |  Nullable |
| `email_sent_at` | `timestamptz` |  Nullable |
| `viewed_at` | `timestamptz` |  Nullable |
| `completed_at` | `timestamptz` |  Nullable |
| `expires_at` | `timestamptz` |  |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |

## Table `feedback_responses`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `feedback_request_id` | `uuid` |  |
| `profile_id` | `uuid` |  |
| `rating` | `numeric` |  |
| `technical_skills_rating` | `numeric` |  Nullable |
| `communication_rating` | `numeric` |  Nullable |
| `timeliness_rating` | `numeric` |  Nullable |
| `quality_of_work_rating` | `numeric` |  Nullable |
| `teamwork_rating` | `numeric` |  Nullable |
| `problem_solving_rating` | `numeric` |  Nullable |
| `deliverables_feedback` | `text` |  Nullable |
| `strengths` | `text` |  Nullable |
| `areas_for_improvement` | `text` |  Nullable |
| `additional_comments` | `text` |  Nullable |
| `project_feedback` | `text` |  Nullable |
| `would_recommend` | `bool` |  Nullable |
| `submitted_at` | `timestamptz` |  Nullable |
| `ip_address` | `varchar` |  Nullable |
| `user_agent` | `text` |  Nullable |
| `reviewed_by` | `uuid` |  Nullable |
| `reviewed_at` | `timestamptz` |  Nullable |
| `pm_notes` | `text` |  Nullable |
| `pm_rating_adjustment` | `numeric` |  Nullable |
| `review_status` | `varchar` |  Nullable |

## Table `performance_records`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `profile_id` | `uuid` |  |
| `project_id` | `int8` |  |
| `created_by` | `uuid` |  |
| `client_name` | `varchar` |  Nullable |
| `client_email` | `varchar` |  Nullable |
| `feedback_response_id` | `uuid` |  Nullable |
| `feedback_request_id` | `uuid` |  Nullable |
| `rating` | `numeric` |  |
| `client_original_rating` | `numeric` |  Nullable |
| `technical_skills_rating` | `numeric` |  Nullable |
| `communication_rating` | `numeric` |  Nullable |
| `timeliness_rating` | `numeric` |  Nullable |
| `quality_of_work_rating` | `numeric` |  Nullable |
| `teamwork_rating` | `numeric` |  Nullable |
| `problem_solving_rating` | `numeric` |  Nullable |
| `deliverables_feedback` | `text` |  Nullable |
| `client_feedback` | `text` |  Nullable |
| `strengths` | `text` |  Nullable |
| `areas_for_improvement` | `text` |  Nullable |
| `pm_assessment` | `text` |  Nullable |
| `project_feedback` | `text` |  Nullable |
| `feedback_source` | `varchar` |  Nullable |
| `feedback_status` | `varchar` |  Nullable |
| `rated_at` | `timestamptz` |  Nullable |
| `reviewed_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |

## Table `skill_components`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `skill_id` | `int8` |  |
| `component_name` | `text` |  |
| `created_at` | `timestamptz` |  Nullable |

## Table `skill_aliases`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `master_skill_id` | `int8` |  |
| `alias_skill_id` | `int8` |  |
| `similarity` | `numeric` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `job_postings`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `title` | `text` |  |
| `description` | `text` |  Nullable |
| `department_id` | `int8` |  Nullable |
| `position_id` | `int8` |  Nullable |
| `location` | `text` |  Nullable |
| `employment_type` | `text` |  Nullable |
| `salary_min` | `numeric` |  Nullable |
| `salary_max` | `numeric` |  Nullable |
| `requirements` | `text` |  Nullable |
| `responsibilities` | `text` |  Nullable |
| `benefits` | `text` |  Nullable |
| `status` | `text` |  Nullable |
| `closing_date` | `date` |  Nullable |
| `posted_date` | `timestamptz` |  Nullable |
| `created_by` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |
| `source_request_id` | `int8` |  Nullable |

## Table `job_applications`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `job_posting_id` | `int8` |  Nullable |
| `applicant_user_id` | `uuid` |  Nullable |
| `first_name` | `text` |  |
| `middle_name` | `text` |  Nullable |
| `last_name` | `text` |  |
| `email` | `text` |  |
| `phone` | `text` |  Nullable |
| `position_applied` | `text` |  |
| `department` | `text` |  Nullable |
| `experience` | `text` |  Nullable |
| `education` | `text` |  Nullable |
| `skills` | `text` |  Nullable |
| `cover_letter` | `text` |  Nullable |
| `resume_path` | `text` |  Nullable |
| `status` | `text` |  Nullable |
| `notes` | `text` |  Nullable |
| `reviewed_by` | `uuid` |  Nullable |
| `applied_date` | `timestamptz` |  Nullable |
| `branch_id` | `uuid` |  Nullable |
| `location` | `text` |  Nullable |

## Table `interviews`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `application_id` | `int8` |  |
| `interview_date` | `date` |  |
| `interview_time` | `text` |  |
| `interviewer` | `text` |  |
| `interview_type` | `text` |  Nullable |
| `location` | `text` |  Nullable |
| `status` | `text` |  Nullable |
| `notes` | `text` |  Nullable |
| `created_by` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `hired_employees`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `application_id` | `int8` |  Nullable |
| `interview_id` | `int8` |  Nullable |
| `name` | `text` |  |
| `email` | `text` |  |
| `phone` | `text` |  Nullable |
| `position_id` | `int8` |  Nullable |
| `department_id` | `int8` |  Nullable |
| `hire_date` | `date` |  Nullable |
| `salary` | `numeric` |  Nullable |
| `status` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `hr_resource_requests`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `request_title` | `text` |  |
| `department_name` | `text` |  |
| `position_title` | `text` |  |
| `quantity_needed` | `int4` |  |
| `required_skills` | `text` |  Nullable |
| `experience_level` | `text` |  Nullable |
| `start_date` | `date` |  |
| `end_date` | `date` |  |
| `urgency` | `text` |  Nullable |
| `reason` | `text` |  |
| `status` | `text` |  |
| `requested_by` | `uuid` |  |
| `reviewed_by` | `uuid` |  Nullable |
| `reviewed_at` | `timestamptz` |  Nullable |
| `hr_notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |

## Table `super_admins`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `profile_id` | `uuid` |  Unique |
| `granted_by` | `uuid` |  Nullable |
| `granted_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `admins`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `profile_id` | `uuid` |  Unique |
| `created_by` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |
| `branch_id` | `uuid` |  Nullable |

## Table `branches`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `name` | `text` |  |
| `location` | `text` |  Nullable |
| `address` | `text` |  Nullable |
| `contact_number` | `text` |  Nullable |
| `manager_name` | `text` |  Nullable |
| `status` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |
| `manager_id` | `uuid` |  Nullable |
| `currency_code` | `text` |  |

## Table `project_report`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `task_id` | `int8` |  |
| `project_id` | `int8` |  |
| `employee_id` | `uuid` |  Nullable |
| `task_title` | `text` |  Nullable |
| `task_description` | `text` |  Nullable |
| `employee_name` | `text` |  Nullable |
| `project_name` | `text` |  Nullable |
| `percentage` | `int4` |  |
| `log_date` | `date` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `project_resource_requirements_history`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary |
| `requirement_id` | `int8` |  Nullable |
| `status` | `text` |  |
| `changed_at` | `timestamptz` |  Nullable |

## RLS Policies

### `audit_logs`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public can view audit logs` | SELECT | public | PERMISSIVE | `true` | — |
| `Public can insert audit logs` | INSERT | public | PERMISSIVE | — | `true` |
| `Public can update audit logs` | UPDATE | public | PERMISSIVE | `true` | `true` |
| `Public can delete audit logs` | DELETE | public | PERMISSIVE | `true` | — |

### `contact_requests`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public can view contact requests` | SELECT | public | PERMISSIVE | `true` | — |
| `Public can insert contact requests` | INSERT | public | PERMISSIVE | — | `true` |
| `Public can update contact requests` | UPDATE | public | PERMISSIVE | `true` | `true` |
| `Public can delete contact requests` | DELETE | public | PERMISSIVE | `true` | — |

### `departments`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public can view departments` | SELECT | public | PERMISSIVE | `true` | — |
| `Public can insert departments` | INSERT | public | PERMISSIVE | — | `true` |
| `Public can update departments` | UPDATE | public | PERMISSIVE | `true` | `true` |
| `Public can delete departments` | DELETE | public | PERMISSIVE | `true` | — |

### `employee_skills`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public can view employee skills` | SELECT | public | PERMISSIVE | `true` | — |
| `Public can insert employee skills` | INSERT | public | PERMISSIVE | — | `true` |
| `Public can update employee skills` | UPDATE | public | PERMISSIVE | `true` | `true` |
| `Public can delete employee skills` | DELETE | public | PERMISSIVE | `true` | — |

### `positions`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public can view positions` | SELECT | public | PERMISSIVE | `true` | — |
| `Public can insert positions` | INSERT | public | PERMISSIVE | — | `true` |
| `Public can update positions` | UPDATE | public | PERMISSIVE | `true` | `true` |
| `Public can delete positions` | DELETE | public | PERMISSIVE | `true` | — |

### `profiles`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public can view profiles` | SELECT | public | PERMISSIVE | `true` | — |
| `Public can insert profiles` | INSERT | public | PERMISSIVE | — | `true` |
| `Public can update profiles` | UPDATE | public | PERMISSIVE | `true` | `true` |
| `Public can delete profiles` | DELETE | public | PERMISSIVE | `true` | — |

### `project_assignments`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public can view project assignments` | SELECT | public | PERMISSIVE | `true` | — |
| `Public can insert project assignments` | INSERT | public | PERMISSIVE | — | `true` |
| `Public can update project assignments` | UPDATE | public | PERMISSIVE | `true` | `true` |
| `Public can delete project assignments` | DELETE | public | PERMISSIVE | `true` | — |

### `project_resource_requirements`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public can view project resource requirements` | SELECT | public | PERMISSIVE | `true` | — |
| `Public can insert project resource requirements` | INSERT | public | PERMISSIVE | — | `true` |
| `Public can update project resource requirements` | UPDATE | public | PERMISSIVE | `true` | `true` |
| `Public can delete project resource requirements` | DELETE | public | PERMISSIVE | `true` | — |

### `projects`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public can view projects` | SELECT | public | PERMISSIVE | `true` | — |
| `Public can insert projects` | INSERT | public | PERMISSIVE | — | `true` |
| `Public can update projects` | UPDATE | public | PERMISSIVE | `true` | `true` |
| `Public can delete projects` | DELETE | public | PERMISSIVE | `true` | — |

### `requirement_skills`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public can view requirement skills` | SELECT | public | PERMISSIVE | `true` | — |
| `Public can insert requirement skills` | INSERT | public | PERMISSIVE | — | `true` |
| `Public can update requirement skills` | UPDATE | public | PERMISSIVE | `true` | `true` |
| `Public can delete requirement skills` | DELETE | public | PERMISSIVE | `true` | — |

### `skills`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public can view skills` | SELECT | public | PERMISSIVE | `true` | — |
| `Public can insert skills` | INSERT | public | PERMISSIVE | — | `true` |
| `Public can update skills` | UPDATE | public | PERMISSIVE | `true` | `true` |
| `Public can delete skills` | DELETE | public | PERMISSIVE | `true` | — |

### `system_settings`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Allow select` | SELECT | public | PERMISSIVE | `true` | — |
| `Allow insert` | INSERT | public | PERMISSIVE | — | `true` |
| `Allow update` | UPDATE | public | PERMISSIVE | `true` | `true` |

### `user_login_attempts`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Allow all operations` | ALL | public | PERMISSIVE | `true` | `true` |

### `notifications`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Users can view own notifications` | SELECT | public | PERMISSIVE | `(auth.uid() = recipient_id)` | — |
| `Users can update own notifications` | UPDATE | public | PERMISSIVE | `(auth.uid() = recipient_id)` | — |
| `Users can delete own notifications` | DELETE | public | PERMISSIVE | `(auth.uid() = recipient_id)` | — |
| `Service role can insert notifications` | INSERT | public | PERMISSIVE | — | `true` |

### `documents`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `All policy in table document` | ALL | public | PERMISSIVE | `true` | `true` |

### `feedback_training`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `All policy in skill feedback` | ALL | public | PERMISSIVE | `true` | `true` |

### `project_tasks`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `projecttasks` | ALL | public | PERMISSIVE | `true` | `true` |

### `performance_records`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `All policy performance_records` | ALL | public | PERMISSIVE | `true` | `true` |
| `Allow select for creator or subject` | SELECT | authenticated | PERMISSIVE | `((auth.uid() = created_by) OR (auth.uid() = profile_id))` | — |

### `feedback_responses`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `All policy in feedback_responses` | ALL | public | PERMISSIVE | `true` | `true` |

### `feedback_requests`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `All policy in feedback_requests` | ALL | public | PERMISSIVE | `true` | `true` |

### `skill_components`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public can view skill components` | SELECT | public | PERMISSIVE | `true` | — |
| `Public can insert skill components` | INSERT | public | PERMISSIVE | — | `true` |
| `Public can update skill components` | UPDATE | public | PERMISSIVE | `true` | — |
| `Public can delete skill components` | DELETE | public | PERMISSIVE | `true` | — |

### `skill_aliases`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public can view skill aliases` | SELECT | public | PERMISSIVE | `true` | — |
| `Public can insert skill aliases` | INSERT | public | PERMISSIVE | — | `true` |
| `Public can update skill aliases` | UPDATE | public | PERMISSIVE | `true` | — |
| `Public can delete skill aliases` | DELETE | public | PERMISSIVE | `true` | — |

### `job_applications`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public can submit applications` | INSERT | anon | PERMISSIVE | — | `true` |
| `public can read own applications by email` | SELECT | anon | PERMISSIVE | `true` | — |
| `All policy of job_applications table` | ALL | public | PERMISSIVE | `true` | `true` |

### `job_postings`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `All policy of job_postings table ` | ALL | public | PERMISSIVE | `true` | `true` |
| `HR can delete job postings` | DELETE | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'Super Admin'::text) OR ((profiles.role = 'HR'::text) AND (profiles.branch_id = ( SELECT p2.branch_id            FROM profiles p2           WHERE (p2.id = job_postings.created_by))))))))` | — |

### `interviews`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `All policy of interviews table` | ALL | public | PERMISSIVE | `true` | `true` |

### `hired_employees`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `All policy of hired_employees table` | ALL | public | PERMISSIVE | `true` | `true` |

### `branches`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Allow full access to branches` | ALL | public | PERMISSIVE | `true` | `true` |

### `admins`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `admins` | ALL | public | PERMISSIVE | `true` | `true` |

### `hr_resource_requests`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `All policy` | ALL | public | PERMISSIVE | `true` | `true` |

### `project_report`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `project_report_select_authenticated` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `project_report_insert_authenticated` | INSERT | authenticated | PERMISSIVE | — | `true` |
| `project_report_update_authenticated` | UPDATE | authenticated | PERMISSIVE | `true` | `true` |

### `project_resource_requirements_history`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Allow insert for authenticated users` | INSERT | authenticated | PERMISSIVE | — | `true` |

