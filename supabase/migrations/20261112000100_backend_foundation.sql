begin;

-- Configuration is deliberately empty: no account is authorized until an admin
-- sets the singleton using the Dashboard SQL Editor. Never expose this schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete restrict
);
revoke all on private.app_owner from public, anon, authenticated;
alter table private.app_owner enable row level security;

create function public.is_app_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.app_owner where user_id = (select auth.uid()));
$$;
revoke all on function public.is_app_owner() from public;
grant execute on function public.is_app_owner() to anon, authenticated;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.touch_updated_at() from public;

create table public.universities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 300),
  country text not null check (length(btrim(country)) between 1 and 100),
  city text, website text, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (website is null or website ~ '^https?://')
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  university_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 300),
  degree_type text not null default 'masters',
  field_of_study text, intake text, duration text,
  tuition_fee numeric(14,2) check (tuition_fee >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  application_deadline date, official_url text, requirements text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (university_id, user_id) references public.universities(id, user_id) on delete restrict,
  check (tuition_fee is null or currency is not null),
  check (official_url is null or official_url ~ '^https?://')
);

create table public.scholarships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 300),
  provider text, country text,
  funding_type text check (funding_type in ('full', 'partial', 'other')),
  funding_amount numeric(14,2) check (funding_amount >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  eligibility_requirements text, application_deadline date,
  official_url text, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (funding_amount is null or currency is not null),
  check (official_url is null or official_url ~ '^https?://')
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  program_id uuid not null,
  status text not null default 'researching' check (status in (
    'researching', 'preparing', 'ready_to_apply', 'submitted', 'under_review',
    'interview', 'accepted', 'rejected', 'withdrawn'
  )),
  submission_date date, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (program_id, user_id) references public.programs(id, user_id) on delete restrict
);

create table public.application_scholarships (
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  application_id uuid not null, scholarship_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (application_id, scholarship_id),
  foreign key (application_id, user_id) references public.applications(id, user_id) on delete cascade,
  foreign key (scholarship_id, user_id) references public.scholarships(id, user_id) on delete restrict
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  application_id uuid,
  title text not null check (length(btrim(title)) between 1 and 300),
  description text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'completed', 'cancelled')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (application_id, user_id) references public.applications(id, user_id) on delete restrict
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null check (length(btrim(mime_type)) > 0),
  file_size bigint not null check (file_size between 1 and 20971520),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  check (split_part(storage_path, '/', 1) = user_id::text),
  check (split_part(storage_path, '/', 2) = id::text),
  check (storage_path !~ '(^|/)\.\.(/|$)')
);

create table public.application_documents (
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  application_id uuid not null, document_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (application_id, document_id),
  foreign key (application_id, user_id) references public.applications(id, user_id) on delete cascade,
  foreign key (document_id, user_id) references public.documents(id, user_id) on delete restrict
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  application_id uuid,
  title text not null check (length(btrim(title)) between 1 and 300),
  event_type text not null default 'other' check (event_type in ('deadline', 'interview', 'exam', 'appointment', 'other')),
  starts_at timestamptz not null, ends_at timestamptz, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (application_id, user_id) references public.applications(id, user_id) on delete restrict,
  check (ends_at is null or ends_at >= starts_at)
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  task_id uuid, event_id uuid, remind_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'dismissed', 'failed')),
  created_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete restrict,
  foreign key (event_id, user_id) references public.events(id, user_id) on delete restrict,
  check (num_nonnulls(task_id, event_id) <= 1)
);

-- Composite foreign keys prevent cross-owner relationships even outside RLS.
do $$
declare t text;
begin
  foreach t in array array['universities', 'programs', 'scholarships', 'applications',
    'application_scholarships', 'tasks', 'documents', 'application_documents', 'events', 'reminders'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create index %I on public.%I (user_id)', t || '_user_id_idx', t);
    execute format('create policy owner_access on public.%I for all to authenticated
      using ((select public.is_app_owner()) and user_id = (select auth.uid()))
      with check ((select public.is_app_owner()) and user_id = (select auth.uid()))', t);
  end loop;
  foreach t in array array['universities', 'programs', 'scholarships', 'applications', 'tasks', 'events'] loop
    execute format('create trigger touch_updated_at before update on public.%I
      for each row execute function private.touch_updated_at()', t);
  end loop;
end;
$$;

create index programs_university_idx on public.programs(university_id, user_id);
create index programs_deadline_idx on public.programs(user_id, application_deadline);
create index scholarships_deadline_idx on public.scholarships(user_id, application_deadline);
create index applications_program_idx on public.applications(program_id, user_id);
create index applications_recent_idx on public.applications(user_id, created_at desc);
create index applications_status_idx on public.applications(user_id, status);
create index application_scholarships_scholarship_idx on public.application_scholarships(scholarship_id, user_id);
create index application_documents_document_idx on public.application_documents(document_id, user_id);
create index tasks_application_idx on public.tasks(application_id, user_id);
create index tasks_due_idx on public.tasks(user_id, due_date) where status in ('todo', 'in_progress');
create index events_application_idx on public.events(application_id, user_id);
create index events_start_idx on public.events(user_id, starts_at);
create index reminders_task_idx on public.reminders(task_id, user_id);
create index reminders_event_idx on public.reminders(event_id, user_id);
create index reminders_pending_idx on public.reminders(user_id, remind_at) where status = 'pending';

-- Fail on an existing bucket rather than silently adopting or changing it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scholarship-documents', 'scholarship-documents', false, 20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

create policy scholarship_documents_owner on storage.objects for all to authenticated
using (bucket_id = 'scholarship-documents' and (select public.is_app_owner())
  and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'scholarship-documents' and (select public.is_app_owner())
  and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Other projects' permissive storage policies must not widen this bucket's access.
create policy scholarship_documents_guard on storage.objects as restrictive for all to public
using (bucket_id <> 'scholarship-documents' or ((select public.is_app_owner())
  and (storage.foldername(name))[1] = (select auth.uid())::text))
with check (bucket_id <> 'scholarship-documents' or ((select public.is_app_owner())
  and (storage.foldername(name))[1] = (select auth.uid())::text));

commit;
