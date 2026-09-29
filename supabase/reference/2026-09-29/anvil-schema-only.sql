-- =====================================================================================================
-- Anvil Tools - SANITIZED SCHEMA-ONLY EXPORT (reference documentation, NOT a migration)
-- Project ref: epxzxcqsonxscyvbopqt   Exported: 2026-09-29 from the live catalog (pg_catalog / information_schema).
-- Contains no rows, no secrets, no keys. Do NOT run this against the live project: it describes objects that
-- already exist. Use it to understand the deployed contract or to stand up a scratch database.
-- Live migration history (names only): 20260928115942 001_core_schema | 20260928120037 002_rls_policies |
--   20260928120052 003_seed_real_content | 20260928120122 004_temp_mail_rate_limit |
--   20260928201313 anvil_compat_archive_legacy_schema | 20260928201441 anvil_app_schema_bootstrap |
--   20260928201504 anvil_map_legacy_content.
-- Roles: anon / authenticated have NO privileges on any table here except authenticated SELECT on public.profiles
--   (own row via RLS). service_role has full table privileges on public.* and NONE on legacy_archive.*.
-- =====================================================================================================

-- ------------------------------ PUBLIC (active application schema) ------------------------------------
create table public.tools (
  id text primary key,
  slug text not null unique,
  name text not null,
  category text not null,
  description text not null default '',
  status text not null default 'active' check (status in ('active','inactive')),
  views bigint not null default 0,
  conversions bigint not null default 0
);

create table public.categories (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  description text not null default '',
  sort_order integer not null default 0
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null default 'member' check (role in ('member','admin','owner')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  alt_text text not null default '',
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  file_name text not null default '',
  mime_type text not null default 'image/webp',
  width integer,
  height integer
);

create table public.posts (
  id text primary key,
  slug text not null unique,
  title text not null,
  excerpt text not null default '',
  status text not null default 'draft' check (status in ('draft','published')),
  updated_at timestamptz not null default now(),
  body text not null default '',
  category_slug text references public.categories(slug) on delete set null,
  seo_title text not null default '',
  seo_description text not null default '',
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  cover_image_id uuid references public.media_assets(id) on delete set null,
  cover_alt text not null default '',
  tags text[] not null default '{}',
  constraint post_tag_count check (cardinality(tags) <= 12)
);
create index post_tags_idx on public.posts using gin (tags);

create table public.post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id text not null references public.posts(id) on delete cascade,
  snapshot jsonb not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_created_idx on public.audit_logs (created_at desc);

create table public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.site_pages (
  slug text primary key,
  title text not null,
  body text not null default '',
  status text not null default 'draft' check (status in ('draft','published')),
  updated_at timestamptz not null default now()
);

create table public.analytics_daily (
  day date not null,
  tool_slug text not null references public.tools(slug) on delete cascade,
  views bigint not null default 0 check (views >= 0),
  primary key (day, tool_slug)
);

create table public.contact_requests (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 100),
  email text not null,
  subject text not null check (char_length(subject) between 1 and 160),
  message text not null check (char_length(message) between 10 and 5000),
  created_at timestamptz not null default now()
);
create index contact_created_idx on public.contact_requests (created_at desc);

create table public.contact_mail_jobs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contact_requests(id) on delete cascade,
  kind text not null check (kind in ('alert','receipt','reply')),
  recipient text not null,
  subject text not null,
  body text not null,
  created_by text,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','unknown')),
  attempts integer not null default 0,
  last_error text,
  message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contact_jobs_idx on public.contact_mail_jobs (contact_id, created_at);
create unique index contact_initial_job_idx on public.contact_mail_jobs (contact_id, kind) where kind in ('alert','receipt');

-- Temporary email. THREE tables, TWO owners (see INTEGRATION_HANDOFF.md section 1.3):
create table public.temp_mail_sessions (            -- shared by Vercel /api/temp-mail AND Edge Function temp-mail
  capability text primary key,
  token text not null,
  account_id text not null,
  address text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()      -- NOTE: NOT NULL here (legacy shape); package SQL has it nullable
);
create index idx_temp_mail_expires on public.temp_mail_sessions (expires_at);

create table public.temp_mail_rate_limits (         -- OWNED BY Edge Function temp-mail + pg_cron job 2. Do not alter.
  ip_hash text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 1
);

create table public.temp_mail_client_limits (       -- OWNED BY Vercel backend via RPC consume_temp_mail_limit (package name was temp_mail_rate_limits)
  client_hash text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 1
);

-- Row Level Security: enabled (not forced) on every table in public and legacy_archive.
alter table public.tools enable row level security;
alter table public.categories enable row level security;
alter table public.profiles enable row level security;
alter table public.media_assets enable row level security;
alter table public.posts enable row level security;
alter table public.post_revisions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.site_settings enable row level security;
alter table public.site_pages enable row level security;
alter table public.analytics_daily enable row level security;
alter table public.contact_requests enable row level security;
alter table public.contact_mail_jobs enable row level security;
alter table public.temp_mail_sessions enable row level security;
alter table public.temp_mail_rate_limits enable row level security;
alter table public.temp_mail_client_limits enable row level security;

-- Only policies that exist in public (all other tables: RLS on, no policy = deny-all for browser roles).
create policy own_profile on public.profiles for select to authenticated using (id = auth.uid());
create policy rate_limit_no_client_access on public.temp_mail_rate_limits for all using (false) with check (false);
create policy temp_mail_no_access on public.temp_mail_sessions for all using (false) with check (false);

-- Grants (effective, verified with has_table_privilege): anon none; authenticated SELECT on profiles only; service_role ALL on public.*
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles to authenticated;
grant all on all tables in schema public to service_role;

-- Functions (public). All: search_path=public, NOT security definer except sync_auth_profile.
-- EXECUTE: service_role only (anon and authenticated verified denied; PUBLIC revoked).
create or replace function public.record_tool_view(tool_identifier text) returns void language plpgsql set search_path to 'public' as $function$
declare tool_key text;
begin
 update public.tools set views=views+1 where slug=tool_identifier or name=tool_identifier returning slug into tool_key;
 if tool_key is not null then insert into public.analytics_daily(day,tool_slug,views) values(current_date,tool_key,1)
 on conflict(day,tool_slug) do update set views=public.analytics_daily.views+1; end if;
end; $function$;

create or replace function public.consume_temp_mail_limit(client_key text) returns jsonb language plpgsql set search_path to 'public' as $function$
declare current_limit public.temp_mail_client_limits;
begin
  delete from public.temp_mail_client_limits where window_start < now() - interval '2 hours';
  insert into public.temp_mail_client_limits as limits (client_hash, window_start, attempts)
  values (client_key, now(), 1)
  on conflict (client_hash) do update set
    window_start = case when limits.window_start <= now() - interval '1 hour' then now() else limits.window_start end,
    attempts = case when limits.window_start <= now() - interval '1 hour' then 1 else least(limits.attempts + 1, 6) end
  returning * into current_limit;
  return jsonb_build_object(
    'allowed', current_limit.attempts <= 5,
    'remaining', greatest(0, 5 - current_limit.attempts),
    'resetIn', greatest(1, ceil(extract(epoch from (current_limit.window_start + interval '1 hour' - now()))))
  );
end;
$function$;

create or replace function public.create_contact_request(request_id uuid, sender_name text, sender_email text, contact_subject text, contact_message text) returns boolean language plpgsql set search_path to 'public' as $function$
declare inserted_id uuid;
begin
  insert into public.contact_requests(id,name,email,subject,message)
  values(request_id,sender_name,sender_email,contact_subject,contact_message)
  on conflict(id) do nothing returning id into inserted_id;
  if inserted_id is null then return false; end if;
  insert into public.contact_mail_jobs(contact_id,kind,recipient,subject,body) values
  (request_id,'alert','faizan@velloxtech.com','New Anvil Tools contact: ' || contact_subject,
    'New contact request ' || request_id || E'\nFrom: ' || sender_name || ' <' || sender_email || E'>\n\n' || contact_message || E'\n\nReply from https://anviltools.vercel.app/admin-panel/index.html#contacts'),
  (request_id,'receipt',sender_email,'We received your message - Anvil Tools',
    'Hello ' || sender_name || E',\n\nYour message has been received by VelloxTech. Reference: ' || request_id || E'\n\nSubject: ' || contact_subject || E'\n\nYour message:\n' || contact_message || E'\n\nWe will reply to this email address.\nVelloxTech | info@velloxtech.com');
  return true;
end;
$function$;
-- NOTE: alert recipient and admin URL are HARD-CODED in this function (not env-driven).

create or replace function public.save_post_document(document jsonb, actor uuid) returns jsonb language plpgsql set search_path to 'public' as $function$
declare saved public.posts;
begin
 insert into public.posts(id,slug,title,excerpt,body,status,category_slug,seo_title,seo_description,author_id,published_at,cover_image_id,cover_alt,tags)
 values(document->>'id',document->>'slug',document->>'title',coalesce(document->>'excerpt',''),coalesce(document->>'body',''),document->>'status',nullif(document->>'category_slug',''),coalesce(document->>'seo_title',''),coalesce(document->>'seo_description',''),actor,case when document->>'status'='published' then now() end,nullif(document->>'cover_image_id','')::uuid,coalesce(document->>'cover_alt',''),array(select jsonb_array_elements_text(coalesce(document->'tags','[]'::jsonb))))
 on conflict(id) do update set slug=excluded.slug,title=excluded.title,excerpt=excluded.excerpt,body=excluded.body,status=excluded.status,category_slug=excluded.category_slug,seo_title=excluded.seo_title,seo_description=excluded.seo_description,cover_image_id=excluded.cover_image_id,cover_alt=excluded.cover_alt,tags=excluded.tags,updated_at=now(),published_at=case when excluded.status='published' then coalesce(public.posts.published_at,now()) else null end
 returning * into saved;
 insert into public.post_revisions(post_id,snapshot,actor_id) values(saved.id,to_jsonb(saved),actor);
 insert into public.audit_logs(actor_id,action,target) values(actor,'post.saved',saved.id);
 return to_jsonb(saved);
end; $function$;

create or replace function public.change_user_access(target_id uuid, new_role text, enabled boolean, actor uuid) returns void language plpgsql set search_path to 'public' as $function$
declare existing public.profiles;
begin
 select * into existing from public.profiles where id=target_id for update;
 if not found then raise exception 'User profile not found'; end if;
 if target_id=actor or existing.role='owner' then raise exception 'Protected account'; end if;
 if new_role not in ('member','admin') then raise exception 'Invalid role'; end if;
 update public.profiles set role=new_role,is_active=enabled,updated_at=now() where id=target_id;
 insert into public.audit_logs(actor_id,action,target,details) values(actor,'user.access_changed',target_id::text,jsonb_build_object('old_role',existing.role,'new_role',new_role,'enabled',enabled));
end; $function$;

create or replace function public.cleanup_expired_state() returns jsonb language plpgsql set search_path to 'public' as $function$
declare sessions integer; limits integer; legacy_limits integer;
begin
 delete from public.temp_mail_sessions where expires_at<now(); get diagnostics sessions=row_count;
 delete from public.temp_mail_client_limits where window_start<now()-interval '2 hours'; get diagnostics limits=row_count;
 delete from public.temp_mail_rate_limits where window_start<now()-interval '2 hours'; get diagnostics legacy_limits=row_count;
 return jsonb_build_object('expired_sessions',sessions,'expired_rate_limits',limits+legacy_limits);
end; $function$;

create or replace function public.sync_auth_profile() returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
 insert into public.profiles(id,email,display_name) values(new.id,coalesce(new.email,''),left(coalesce(new.raw_user_meta_data->>'full_name',''),100))
 on conflict(id) do update set email=excluded.email, updated_at=now();
 return new;
end; $function$;

-- Auth trigger: every new Auth user (Google or otherwise) gets a profile with role 'member', is_active true.
create trigger on_auth_user_profile after insert or update of email on auth.users for each row execute function public.sync_auth_profile();

-- Storage: private bucket, no storage.objects policies (RLS on, 0 policies => browser roles denied; service role only).
--   editorial-media: public=false, file_size_limit=5242880, allowed_mime_types={image/jpeg,image/png,image/webp}
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
  values ('editorial-media','editorial-media',false,5242880,array['image/jpeg','image/png','image/webp']);

-- pg_cron (pre-existing, unchanged): job 1 cleanup-expired-temp-mail-sessions */10 * * * * :
--     delete from public.temp_mail_sessions where expires_at < now();
--   job 2 cleanup-expired-rate-limits */15 * * * * :
--     delete from public.temp_mail_rate_limits where window_start < now() - interval '1 hour';

-- ------------------------------ LEGACY_ARCHIVE (sealed; retired objects, data preserved) --------------
-- No privileges for anon/authenticated/service_role; no USAGE on the schema. Only the postgres owner can read.
create schema legacy_archive;
create table legacy_archive.categories (
  id uuid primary key default gen_random_uuid(), slug text not null unique, label text not null,
  description text not null default '', sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table legacy_archive.tools (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null,
  category_id uuid references legacy_archive.categories(id) on delete set null, short_desc text not null default '',
  processing_mode text not null default 'browser' check (processing_mode in ('browser','browser_cdn','third_party_api')),
  enabled boolean not null default true, ads_allowed boolean not null default false, sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table legacy_archive.profiles (
  id uuid primary key references auth.users(id) on delete cascade, email text not null,
  role text not null default 'admin' check (role in ('admin','editor')), created_at timestamptz not null default now());
create table legacy_archive.blog_posts (
  id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null,
  excerpt text not null default '', body text not null default '', author text not null default 'Anvil Tools',
  published boolean not null default false, published_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table legacy_archive.contact_messages (
  id uuid primary key default gen_random_uuid(), name text, email text not null, subject text, message text not null,
  status text not null default 'new' check (status in ('new','read','resolved')), created_at timestamptz not null default now());
create table legacy_archive.analytics_events (
  id bigint generated always as identity primary key, event_name text not null, tool_slug text, page text,
  created_at timestamptz not null default now());
create index idx_analytics_created on legacy_archive.analytics_events (created_at);
create table legacy_archive.consent_stats (
  choice text primary key check (choice in ('accepted','rejected','custom_analytics_only','custom_personalized_only')),
  count bigint not null default 0);
create or replace function legacy_archive.set_updated_at() returns trigger language plpgsql as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
create or replace function legacy_archive.is_site_admin() returns boolean language sql stable security definer set search_path to 'legacy_archive' as $function$
    select exists (select 1 from legacy_archive.profiles where id = auth.uid());
  $function$;
-- Legacy triggers: trg_categories_updated, trg_tools_updated, trg_posts_updated (before update -> set_updated_at()).
-- Legacy RLS policies kept for record (16): categories/tools/blog_posts public read + admin write via is_site_admin();
--   profiles_self_read; contact_insert (with check true); contact_admin_read/update; analytics_insert (3 event names);
--   analytics_admin_read; consent_stats_read (true); consent_stats_admin_write. All inert: no role can reach the schema.
-- WARNING for anyone restoring these to public: contact_insert/analytics_insert allow anonymous writes, and
--   profiles.role defaulted to 'admin'. That is why they were sealed.
