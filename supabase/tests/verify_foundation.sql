-- Run as postgres in the SQL Editor AFTER migration + owner configuration.
-- All fixture rows are rolled back. An exception means verification FAILED.
begin;

do $$
declare t text;
begin
  if not exists (select 1 from private.app_owner) then
    raise exception 'Configure private.app_owner before verification';
  end if;
  foreach t in array array['universities','programs','scholarships','applications',
    'application_scholarships','tasks','documents','application_documents','events','reminders'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception 'RLS missing on %', t;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
      and policyname = 'owner_access' and qual is not null and with_check is not null) then
      raise exception 'Owner policy missing on %', t;
    end if;
  end loop;
  if not exists (select 1 from storage.buckets where id = 'scholarship-documents'
    and not public and file_size_limit = 20971520) then
    raise exception 'Private bucket configuration is incorrect';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'scholarship_documents_guard' and permissive = 'RESTRICTIVE') then
    raise exception 'Restrictive storage guard missing';
  end if;
end;
$$;

select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true)
from private.app_owner;
select set_config('request.jwt.claim.sub', user_id::text, true) from private.app_owner;
set local role authenticated;

do $$
declare fixture uuid; program uuid; application uuid; document uuid; t text; blocked boolean := false;
begin
  if not public.is_app_owner() then raise exception 'Owner not recognized'; end if;
  insert into public.universities(name, country) values ('Rollback verification fixture', 'Test') returning id into fixture;
  update public.universities set city = 'Verified' where id = fixture;
  if not exists (select 1 from public.universities where id = fixture and city = 'Verified') then
    raise exception 'Owner CRUD failed';
  end if;
  begin
    update public.universities set user_id = gen_random_uuid() where id = fixture;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Owner impersonation was allowed'; end if;
  insert into public.programs(university_id, name) values (fixture, 'Test program') returning id into program;
  insert into public.applications(program_id) values (program) returning id into application;
  blocked := false;
  begin
    delete from public.universities where id = fixture;
  exception when foreign_key_violation then blocked := true;
  end;
  if not blocked then raise exception 'Parent deletion did not protect dependent application data'; end if;
  blocked := false;
  begin
    insert into public.tasks(title, application_id) values ('Invalid relation', gen_random_uuid());
  exception when foreign_key_violation then blocked := true;
  end;
  if not blocked then raise exception 'Invalid application relation was accepted'; end if;
  delete from public.applications where id = application;
  delete from public.programs where id = program;
  delete from public.universities where id = fixture;
end;
$$;

reset role;
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (current_setting('request.jwt.claims')::jsonb ->> 'sub'), true);
set local role authenticated;

do $$
declare t text; found_rows bigint; affected bigint; blocked boolean := false;
begin
  if public.is_app_owner() then raise exception 'Non-owner recognized as owner'; end if;
  foreach t in array array['universities','programs','scholarships','applications',
    'application_scholarships','tasks','documents','application_documents','events','reminders'] loop
    execute format('select count(*) from public.%I', t) into found_rows;
    if found_rows <> 0 then raise exception 'Non-owner can read %', t; end if;
    execute format('update public.%I set user_id = user_id', t);
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Non-owner can update %', t; end if;
    execute format('delete from public.%I', t);
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Non-owner can delete %', t; end if;
  end loop;
  begin
    insert into public.universities(name, country) values ('Forbidden', 'Test');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Non-owner insert accepted'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'scholarship-documents') then
    raise exception 'Non-owner can read document objects';
  end if;
  blocked := false;
  begin
    perform user_id from private.app_owner;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Non-owner can read owner configuration'; end if;
end;
$$;

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$
declare t text; blocked boolean;
begin
  if public.is_app_owner() then raise exception 'Anonymous owner check passed'; end if;
  foreach t in array array['universities','programs','scholarships','applications',
    'application_scholarships','tasks','documents','application_documents','events','reminders'] loop
    blocked := false;
    begin
      execute format('select 1 from public.%I limit 1', t);
    exception when insufficient_privilege then blocked := true;
    end;
    if not blocked then raise exception 'Anonymous table access allowed: %', t; end if;
  end loop;
end;
$$;
reset role;
rollback;
-- Successful execution validates the SQL checks above, not password login or
-- Storage API operations. Complete those separately as described in README.
