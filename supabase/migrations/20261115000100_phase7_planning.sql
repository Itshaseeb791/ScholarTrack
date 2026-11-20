-- Phase 7: tasks, calendar events and reminders. Additive and forward-only: no table or column is dropped.
-- Replaced objects (all strict supersets): tasks_priority_check (adds 'urgent'), events_event_type_check (more
-- categories), the two reminders foreign keys to tasks/events (RESTRICT -> CASCADE, so deleting a task or event
-- removes its reminders instead of being blocked by them). tasks/events/reminders were empty when this was written.
-- Rollback (manual; destroys Phase 7 data): see the comment block at the end of this file.
begin;

-- ---------------------------------------------------------------------------------------------
-- 1. tasks: optional due time and a completion timestamp maintained by the database
-- ---------------------------------------------------------------------------------------------
alter table public.tasks
  add column if not exists due_time time,                  -- wall-clock time in the app timezone (Asia/Karachi)
  add column if not exists completed_at timestamptz;
alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check check (priority in ('low', 'medium', 'high', 'urgent'));
alter table public.tasks add constraint tasks_time_needs_date check (due_time is null or due_date is not null);
alter table public.tasks add constraint tasks_description_length check (description is null or length(description) <= 5000);

create function private.set_task_completed_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status <> 'completed' then new.completed_at := now(); end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.set_task_completed_at() from public;
create trigger set_completed_at before insert or update on public.tasks
  for each row execute function private.set_task_completed_at();

-- ---------------------------------------------------------------------------------------------
-- 2. events: all-day events use date-only columns (never UTC-midnight timestamps); timed events keep timestamptz
-- ---------------------------------------------------------------------------------------------
alter table public.events
  add column if not exists all_day boolean not null default false,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists location text check (location is null or length(location) <= 300),
  add column if not exists meeting_url text check (meeting_url is null or meeting_url ~ '^https?://');
alter table public.events alter column starts_at drop not null;
alter table public.events drop constraint if exists events_event_type_check;
alter table public.events add constraint events_event_type_check check (event_type in (
  'deadline', 'interview', 'exam', 'appointment', 'webinar', 'consultation', 'study', 'other'));
alter table public.events add constraint events_time_model check (
  (all_day and start_date is not null and starts_at is null and ends_at is null and (end_date is null or end_date >= start_date))
  or (not all_day and starts_at is not null and start_date is null and end_date is null));
alter table public.events add constraint events_notes_length check (notes is null or length(notes) <= 5000);

-- ---------------------------------------------------------------------------------------------
-- 3. reminders: one validated source per row (no free-form source references) + schedule + state
-- ---------------------------------------------------------------------------------------------
-- The Phase 3 foreign keys to tasks/events were RESTRICT; look the names up rather than guessing them.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid = 'public.reminders'::regclass and contype = 'f'
      and confrelid in ('public.tasks'::regclass, 'public.events'::regclass)
  loop
    execute format('alter table public.reminders drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.reminders
  add column if not exists application_id uuid,
  add column if not exists scholarship_id uuid,
  add column if not exists program_id uuid,
  add column if not exists requirement_id uuid,
  -- Either a relative offset from the source's current date (follows the source if its date changes)
  -- or an absolute custom time, never both.
  add column if not exists offset_days integer check (offset_days between 0 and 365),
  add column if not exists enabled boolean not null default true,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists dismissed_at timestamptz,
  add column if not exists delivered_at timestamptz,       -- reserved for push delivery; in-app reminders never set it
  add column if not exists last_attempt_at timestamptz,
  add column if not exists attempts integer not null default 0 check (attempts >= 0);
alter table public.reminders alter column remind_at drop not null;

-- Composite owner foreign keys: a reminder can only point at the same owner's rows. Reminders go with their source.
alter table public.reminders
  add foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade,
  add foreign key (event_id, user_id) references public.events(id, user_id) on delete cascade,
  add foreign key (application_id, user_id) references public.applications(id, user_id) on delete cascade,
  add foreign key (scholarship_id, user_id) references public.scholarships(id, user_id) on delete cascade,
  add foreign key (program_id, user_id) references public.programs(id, user_id) on delete cascade,
  add foreign key (requirement_id, user_id) references public.application_requirements(id, user_id) on delete cascade;
-- NOT VALID: enforced for every new or changed row without re-checking legacy rows (there are none).
alter table public.reminders add constraint reminders_one_source
  check (num_nonnulls(task_id, event_id, application_id, scholarship_id, program_id, requirement_id) = 1) not valid;
alter table public.reminders add constraint reminders_one_schedule
  check ((offset_days is null) <> (remind_at is null)) not valid;

-- Idempotency: the same source cannot get the same offset (or the same custom time) twice.
create unique index reminders_unique_offset on public.reminders
  (user_id, (coalesce(task_id, event_id, application_id, scholarship_id, program_id, requirement_id)), offset_days)
  where offset_days is not null;
create unique index reminders_unique_custom on public.reminders
  (user_id, (coalesce(task_id, event_id, application_id, scholarship_id, program_id, requirement_id)), remind_at)
  where remind_at is not null;
create index reminders_active_idx on public.reminders(user_id)
  where enabled and acknowledged_at is null and dismissed_at is null;
create index reminders_application_idx on public.reminders(application_id, user_id) where application_id is not null;
create index reminders_scholarship_idx on public.reminders(scholarship_id, user_id) where scholarship_id is not null;
create index reminders_program_idx on public.reminders(program_id, user_id) where program_id is not null;
create index reminders_requirement_idx on public.reminders(requirement_id, user_id) where requirement_id is not null;

-- ---------------------------------------------------------------------------------------------
-- 4. indexes for date-range calendar queries
-- ---------------------------------------------------------------------------------------------
create index events_all_day_idx on public.events(user_id, start_date) where all_day;
create index tasks_due_all_idx on public.tasks(user_id, due_date) where due_date is not null;
create index requirements_due_range_idx on public.application_requirements(user_id, due_date) where due_date is not null;
create index scholarships_deadline_range_idx on public.scholarships(user_id, application_deadline) where application_deadline is not null;

commit;

-- Rollback (manual, destroys Phase 7 data; widened checks are harmless and can stay):
--   drop index reminders_unique_offset, reminders_unique_custom, reminders_active_idx, reminders_application_idx,
--     reminders_scholarship_idx, reminders_program_idx, reminders_requirement_idx, events_all_day_idx,
--     tasks_due_all_idx, requirements_due_range_idx, scholarships_deadline_range_idx;
--   alter table public.reminders drop constraint reminders_one_source, drop constraint reminders_one_schedule,
--     drop column application_id, drop column scholarship_id, drop column program_id, drop column requirement_id,
--     drop column offset_days, drop column enabled, drop column acknowledged_at, drop column dismissed_at,
--     drop column delivered_at, drop column last_attempt_at, drop column attempts;
--   (re-add the RESTRICT foreign keys on reminders(task_id,user_id) / reminders(event_id,user_id) if needed)
--   drop trigger set_completed_at on public.tasks; drop function private.set_task_completed_at();
--   alter table public.tasks drop column due_time, drop column completed_at, drop constraint tasks_time_needs_date;
--   alter table public.events drop constraint events_time_model, drop column all_day, drop column start_date,
--     drop column end_date, drop column location, drop column meeting_url;
