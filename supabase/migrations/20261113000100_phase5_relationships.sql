-- Phase 5: additive, forward-only. Nothing is dropped except one CHECK that is replaced by a superset.
-- The app works without this migration (core CRUD uses the Phase 3 schema); it detects the
-- scholarship_programs table and enables preferred/type fields, opening date and linking when present.
begin;

alter table public.universities
  add column if not exists university_type text check (university_type in ('public', 'private')),
  add column if not exists is_preferred boolean not null default false;

alter table public.scholarships add column if not exists opening_date date;

-- Superset of the previous ('full','partial','other'): existing rows stay valid.
alter table public.scholarships drop constraint if exists scholarships_funding_type_check;
alter table public.scholarships add constraint scholarships_funding_type_check
  check (funding_type in ('full', 'partial', 'tuition_waiver', 'stipend', 'other'));

-- Eligibility links. Deliberately separate from application_scholarships (what was applied for).
-- Links are cheap metadata, so they cascade; the records they join stay restricted by their own FKs.
create table public.scholarship_programs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  scholarship_id uuid not null, program_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (scholarship_id, program_id),
  foreign key (scholarship_id, user_id) references public.scholarships(id, user_id) on delete cascade,
  foreign key (program_id, user_id) references public.programs(id, user_id) on delete cascade
);
create table public.scholarship_universities (
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  scholarship_id uuid not null, university_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (scholarship_id, university_id),
  foreign key (scholarship_id, user_id) references public.scholarships(id, user_id) on delete cascade,
  foreign key (university_id, user_id) references public.universities(id, user_id) on delete cascade
);

do $$
declare t text;
begin
  foreach t in array array['scholarship_programs', 'scholarship_universities'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create index %I on public.%I (user_id)', t || '_user_id_idx', t);
    execute format('create policy owner_access on public.%I for all to authenticated
      using ((select public.is_app_owner()) and user_id = (select auth.uid()))
      with check ((select public.is_app_owner()) and user_id = (select auth.uid()))', t);
  end loop;
end;
$$;
create index scholarship_programs_program_idx on public.scholarship_programs(program_id, user_id);
create index scholarship_universities_university_idx on public.scholarship_universities(university_id, user_id);
create index universities_name_idx on public.universities(user_id, lower(name));
create index scholarships_recent_idx on public.scholarships(user_id, created_at desc);

commit;
