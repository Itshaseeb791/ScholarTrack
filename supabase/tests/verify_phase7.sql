-- Read-only: confirms the Phase 7 objects exist. Run in the Supabase SQL Editor; every row should say ok = true.
select 'column ' || t.table_name || '.' || t.column_name as item,
  exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = t.column_name) as ok
from (values ('tasks','due_time'),('tasks','completed_at'),
  ('events','all_day'),('events','start_date'),('events','end_date'),('events','location'),('events','meeting_url'),
  ('reminders','application_id'),('reminders','scholarship_id'),('reminders','program_id'),('reminders','requirement_id'),
  ('reminders','offset_days'),('reminders','enabled'),('reminders','acknowledged_at'),('reminders','dismissed_at'),
  ('reminders','delivered_at'),('reminders','last_attempt_at'),('reminders','attempts')) as t(table_name, column_name)
union all
select 'constraint ' || n, exists (select 1 from pg_constraint where conname = n and connamespace = 'public'::regnamespace)
from unnest(array['tasks_priority_check','tasks_time_needs_date','tasks_description_length','events_event_type_check',
  'events_time_model','events_notes_length','reminders_one_source','reminders_one_schedule']) as n
union all
select 'index ' || i, exists (select 1 from pg_indexes where schemaname = 'public' and indexname = i)
from unnest(array['reminders_unique_offset','reminders_unique_custom','reminders_active_idx','reminders_application_idx',
  'reminders_scholarship_idx','reminders_program_idx','reminders_requirement_idx','events_all_day_idx',
  'tasks_due_all_idx','requirements_due_range_idx','scholarships_deadline_range_idx']) as i
union all
select 'cascade FK reminders -> ' || r, exists (
  select 1 from pg_constraint c where c.conrelid = 'public.reminders'::regclass and c.contype = 'f'
    and c.confrelid = ('public.' || r)::regclass and c.confdeltype = 'c')
from unnest(array['tasks','events','applications','scholarships','programs','application_requirements']) as r
union all
select 'trigger tasks.set_completed_at', exists (select 1 from pg_trigger where tgname = 'set_completed_at' and tgrelid = 'public.tasks'::regclass)
order by 1;
