-- M1: anvil_compat_archive_legacy_schema
-- Moves the retired legacy objects into a sealed, non-API-exposed schema (no DROP, no CASCADE) so the supplied
-- application schema can be installed. temp_mail_sessions and temp_mail_rate_limits deliberately STAY in public:
-- the deployed Edge Function `temp-mail` and pg_cron jobs 1 and 2 use them in their current shape.
do $anvil_m1$
declare
  t text;
begin
  -- Preconditions: this must be the legacy layout, and nothing from the application schema may exist yet.
  if exists (select 1 from pg_namespace where nspname = 'legacy_archive') then
    raise exception 'M1 abort: schema legacy_archive already exists';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='tools' and column_name='category_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='categories' and column_name='label')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='temp_mail_rate_limits' and column_name='ip_hash') then
    raise exception 'M1 abort: public schema is not in the expected legacy layout';
  end if;
  if to_regclass('public.posts') is not null or to_regclass('public.contact_requests') is not null then
    raise exception 'M1 abort: application schema objects already exist';
  end if;

  create schema legacy_archive;
  revoke all on schema legacy_archive from public, anon, authenticated, service_role;
  comment on schema legacy_archive is 'Retired pre-workspace Anvil Tools objects, preserved intact. Not exposed to the Data API; no API-role privileges.';

  alter table public.tools            set schema legacy_archive;
  alter table public.categories       set schema legacy_archive;
  alter table public.profiles         set schema legacy_archive;
  alter table public.blog_posts       set schema legacy_archive;
  alter table public.contact_messages set schema legacy_archive;
  alter table public.analytics_events set schema legacy_archive;
  alter table public.consent_stats    set schema legacy_archive;
  alter function public.is_site_admin() set schema legacy_archive;
  alter function public.set_updated_at() set schema legacy_archive;

  -- The moved SECURITY DEFINER helper must keep reading the ARCHIVED profiles table, never the new public.profiles.
  create or replace function legacy_archive.is_site_admin() returns boolean language sql stable security definer
    set search_path to 'legacy_archive' as $fn$
    select exists (select 1 from legacy_archive.profiles where id = auth.uid());
  $fn$;

  revoke all on all tables    in schema legacy_archive from public, anon, authenticated, service_role;
  revoke all on all functions in schema legacy_archive from public, anon, authenticated, service_role;
  revoke all on all sequences in schema legacy_archive from public, anon, authenticated, service_role;

  -- Tables kept in public for the temp-mail Edge Function: remove browser roles only (service_role keeps access).
  revoke all on public.temp_mail_sessions, public.temp_mail_rate_limits from public, anon, authenticated;
  comment on table public.temp_mail_rate_limits is 'Owned by Edge Function temp-mail (ip_hash/count shape) and pg_cron job 2. Do not alter. The application limiter is public.temp_mail_client_limits.';

  -- Postconditions (any failure aborts the whole migration).
  foreach t in array array['tools','categories','profiles','blog_posts','contact_messages','analytics_events','consent_stats'] loop
    if to_regclass('public.'||t) is not null then raise exception 'M1 verify: % still in public', t; end if;
    if to_regclass('legacy_archive.'||t) is null then raise exception 'M1 verify: % missing from archive', t; end if;
    if has_table_privilege('anon', 'legacy_archive.'||t, 'select,insert,update,delete,truncate,references,trigger')
       or has_table_privilege('authenticated', 'legacy_archive.'||t, 'select,insert,update,delete,truncate,references,trigger')
       or has_table_privilege('service_role', 'legacy_archive.'||t, 'select,insert,update,delete,truncate,references,trigger') then
      raise exception 'M1 verify: API role still has privileges on legacy_archive.%', t;
    end if;
  end loop;
  if (select count(*) from legacy_archive.tools) <> 12 or (select count(*) from legacy_archive.categories) <> 6
     or (select count(*) from legacy_archive.blog_posts) <> 4 or (select count(*) from legacy_archive.consent_stats) <> 4
     or (select count(*) from legacy_archive.profiles) <> 0 or (select count(*) from legacy_archive.contact_messages) <> 0
     or (select count(*) from legacy_archive.analytics_events) <> 0 then
    raise exception 'M1 verify: archived row counts differ from the pre-migration export';
  end if;
  if has_schema_privilege('anon','legacy_archive','usage') or has_schema_privilege('authenticated','legacy_archive','usage')
     or has_schema_privilege('service_role','legacy_archive','usage') then
    raise exception 'M1 verify: API role has USAGE on legacy_archive';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'legacy_archive'::regnamespace and (
       has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
       or has_function_privilege('service_role', p.oid, 'execute'))) then
    raise exception 'M1 verify: API role can execute an archived function';
  end if;
  if to_regclass('public.temp_mail_sessions') is null or to_regclass('public.temp_mail_rate_limits') is null
     or (select count(*) from information_schema.columns where table_schema='public' and table_name='temp_mail_rate_limits'
         and column_name in ('ip_hash','window_start','count')) <> 3
     or (select count(*) from cron.job where command like '%temp_mail_sessions%' or command like '%temp_mail_rate_limits%') <> 2 then
    raise exception 'M1 verify: temp-mail dependencies are not intact';
  end if;
end
$anvil_m1$;
