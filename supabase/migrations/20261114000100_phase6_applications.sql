-- Phase 6: application tracking. Additive and forward-only: no table or column is dropped.
-- The only replaced object is the applications.status CHECK, which becomes a strict superset
-- (adds 'waitlisted'); existing status values keep their exact meaning.
-- Rollback (manual, only if nothing depends on it): see the comment block at the end of this file.
begin;

-- ---------------------------------------------------------------------------------------------
-- 1. applications: application-specific metadata (university is derived through program_id)
-- ---------------------------------------------------------------------------------------------
alter table public.applications
  add column if not exists application_deadline date,               -- override; program deadline is never modified
  add column if not exists portal_url text check (portal_url is null or portal_url ~ '^https?://'),
  add column if not exists reference_number text check (reference_number is null or length(btrim(reference_number)) between 1 and 100),
  add column if not exists application_fee numeric(14,2) check (application_fee >= 0),
  add column if not exists currency text check (currency ~ '^[A-Z]{3}$'),
  add column if not exists intake text check (intake is null or length(btrim(intake)) between 1 and 100),
  add column if not exists decision_date date,
  add column if not exists expected_response_date date;
alter table public.applications add constraint applications_fee_currency_check
  check (application_fee is null or currency is not null);

alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check check (status in (
  'researching', 'preparing', 'ready_to_apply', 'submitted', 'under_review',
  'interview', 'accepted', 'rejected', 'waitlisted', 'withdrawn'));

-- Scholarship outcome per application. Deliberately separate from the admission status.
alter table public.application_scholarships
  add column if not exists outcome text not null default 'not_applied'
  check (outcome in ('not_applied', 'preparing', 'applied', 'awarded', 'rejected', 'withdrawn'));

-- ---------------------------------------------------------------------------------------------
-- 2. Status history (append-only for the app: select + insert only)
-- ---------------------------------------------------------------------------------------------
create table public.application_status_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  application_id uuid not null,
  from_status text,
  to_status text not null,
  note text check (note is null or length(note) <= 1000),
  changed_at timestamptz not null default now(),
  check (from_status is null or from_status in ('researching', 'preparing', 'ready_to_apply', 'submitted', 'under_review',
    'interview', 'accepted', 'rejected', 'waitlisted', 'withdrawn')),
  check (to_status in ('researching', 'preparing', 'ready_to_apply', 'submitted', 'under_review',
    'interview', 'accepted', 'rejected', 'waitlisted', 'withdrawn')),
  foreign key (application_id, user_id) references public.applications(id, user_id) on delete cascade
);

-- The trigger runs in the same transaction as the status write, so a status can never change without
-- its history row. The optional note travels in a transaction-local setting (see change_application_status).
create function private.log_application_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_status_history (user_id, application_id, from_status, to_status, note)
    values (new.user_id, new.id, null, new.status, nullif(current_setting('app.status_note', true), ''));
  elsif new.status is distinct from old.status then
    insert into public.application_status_history (user_id, application_id, from_status, to_status, note)
    values (new.user_id, new.id, old.status, new.status, nullif(current_setting('app.status_note', true), ''));
  end if;
  return null;
end;
$$;
revoke all on function private.log_application_status() from public;
create trigger log_status_insert after insert on public.applications
  for each row execute function private.log_application_status();
create trigger log_status_update after update of status on public.applications
  for each row execute function private.log_application_status();

-- Existing applications (if any) get an initial history row so every timeline starts somewhere.
insert into public.application_status_history (user_id, application_id, from_status, to_status, note, changed_at)
select a.user_id, a.id, null, a.status, 'Existing application', a.created_at from public.applications a
where not exists (select 1 from public.application_status_history h where h.application_id = a.id);

-- ---------------------------------------------------------------------------------------------
-- 3. Requirements checklist (application specific; nothing is imposed on any application)
-- ---------------------------------------------------------------------------------------------
create table public.application_requirements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  application_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 300),
  notes text check (notes is null or length(notes) <= 2000),
  due_date date,
  is_complete boolean not null default false,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (is_complete or completed_at is null),
  foreign key (application_id, user_id) references public.applications(id, user_id) on delete cascade
);

create function private.set_requirement_completed_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.is_complete then
    if tg_op = 'INSERT' or not old.is_complete then new.completed_at := now(); end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.set_requirement_completed_at() from public;
create trigger set_completed_at before insert or update on public.application_requirements
  for each row execute function private.set_requirement_completed_at();
create trigger touch_updated_at before update on public.application_requirements
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- 4. RLS: owner-only, same pattern as Phase 3
-- ---------------------------------------------------------------------------------------------
alter table public.application_status_history enable row level security;
alter table public.application_status_history force row level security;
revoke all on public.application_status_history from anon, authenticated;
grant select, insert on public.application_status_history to authenticated;
create policy owner_read on public.application_status_history for select to authenticated
  using ((select public.is_app_owner()) and user_id = (select auth.uid()));
create policy owner_insert on public.application_status_history for insert to authenticated
  with check ((select public.is_app_owner()) and user_id = (select auth.uid()));

alter table public.application_requirements enable row level security;
alter table public.application_requirements force row level security;
revoke all on public.application_requirements from anon, authenticated;
grant select, insert, update, delete on public.application_requirements to authenticated;
create policy owner_access on public.application_requirements for all to authenticated
  using ((select public.is_app_owner()) and user_id = (select auth.uid()))
  with check ((select public.is_app_owner()) and user_id = (select auth.uid()));

create index application_status_history_idx on public.application_status_history(application_id, user_id, changed_at desc);
create index application_status_history_user_idx on public.application_status_history(user_id);
create index application_requirements_idx on public.application_requirements(application_id, user_id, sort_order);
create index application_requirements_user_idx on public.application_requirements(user_id);
create index application_requirements_due_idx on public.application_requirements(user_id, due_date) where not is_complete;
create index applications_deadline_idx on public.applications(user_id, application_deadline);
create index applications_updated_idx on public.applications(user_id, updated_at desc);

-- ---------------------------------------------------------------------------------------------
-- 5. Functions: atomic multi-step writes (SECURITY INVOKER, so RLS and ownership still apply)
-- ---------------------------------------------------------------------------------------------
-- Status change + dates + history in one transaction. p_today is the caller's calendar day (Asia/Karachi),
-- used only to fill a missing submission/decision date; existing dates are never overwritten.
create function public.change_application_status(p_id uuid, p_status text, p_note text default null, p_today date default null)
returns void language plpgsql set search_path = '' as $$
declare cur_status text;
begin
  select status into cur_status from public.applications where id = p_id;
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;
  if cur_status = p_status then raise exception 'status unchanged' using errcode = '22023'; end if;
  perform set_config('app.status_note', coalesce(p_note, ''), true);
  update public.applications set
    status = p_status,
    submission_date = case when p_status = 'submitted' then coalesce(submission_date, p_today) else submission_date end,
    decision_date = case when p_status in ('accepted', 'rejected') then coalesce(decision_date, p_today) else decision_date end
  where id = p_id;
end;
$$;
revoke all on function public.change_application_status(uuid, text, text, date) from public, anon;
grant execute on function public.change_application_status(uuid, text, text, date) to authenticated;

-- Application + optional starter checklist in one transaction.
create function public.create_application(p_data jsonb, p_requirements text[] default '{}')
returns uuid language plpgsql set search_path = '' as $$
declare r public.applications; new_id uuid;
begin
  r := jsonb_populate_record(null::public.applications, p_data);
  insert into public.applications (program_id, status, application_deadline, portal_url, reference_number,
    application_fee, currency, intake, submission_date, decision_date, expected_response_date, notes)
  values (r.program_id, coalesce(r.status, 'researching'), r.application_deadline, r.portal_url, r.reference_number,
    r.application_fee, r.currency, r.intake, r.submission_date, r.decision_date, r.expected_response_date, r.notes)
  returning id into new_id;
  insert into public.application_requirements (application_id, title, sort_order)
  select new_id, btrim(x.t), x.n::integer from unnest(p_requirements) with ordinality as x(t, n) where btrim(x.t) <> '';
  return new_id;
end;
$$;
revoke all on function public.create_application(jsonb, text[]) from public, anon;
grant execute on function public.create_application(jsonb, text[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. Read model: one bounded, indexed query for the list (search, filters, sort, counts)
-- ---------------------------------------------------------------------------------------------
create view public.application_overview with (security_invoker = true) as
select a.id, a.user_id, a.program_id, a.status, a.application_deadline, a.portal_url, a.reference_number,
  a.application_fee, a.currency, a.intake, a.submission_date, a.decision_date, a.expected_response_date,
  a.notes, a.created_at, a.updated_at,
  p.name as program_name, p.application_deadline as program_deadline, p.university_id,
  u.name as university_name, u.country as university_country,
  coalesce(a.application_deadline, p.application_deadline) as effective_deadline,
  (select count(*) from public.application_requirements r where r.application_id = a.id and r.user_id = a.user_id)::integer as requirements_total,
  (select count(*) from public.application_requirements r where r.application_id = a.id and r.user_id = a.user_id and r.is_complete)::integer as requirements_done
from public.applications a
join public.programs p on p.id = a.program_id and p.user_id = a.user_id
join public.universities u on u.id = p.university_id and u.user_id = p.user_id;
revoke all on public.application_overview from public, anon, authenticated;
grant select on public.application_overview to authenticated;

commit;

-- Rollback (manual, destroys Phase 6 data; the status CHECK stays widened, which is harmless):
--   drop view public.application_overview;
--   drop function public.create_application(jsonb, text[]);
--   drop function public.change_application_status(uuid, text, text, date);
--   drop table public.application_requirements; drop table public.application_status_history;
--   drop function private.set_requirement_completed_at(); drop function private.log_application_status();
--   alter table public.application_scholarships drop column outcome;
--   alter table public.applications drop constraint applications_fee_currency_check, drop column application_deadline,
--     drop column portal_url, drop column reference_number, drop column application_fee, drop column currency,
--     drop column intake, drop column decision_date, drop column expected_response_date;
