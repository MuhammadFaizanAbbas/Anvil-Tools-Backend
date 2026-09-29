-- Stop before changing a production database with archived legacy objects.
do $guard$
begin
 if to_regnamespace('legacy_archive') is not null then
  raise exception 'This file is for fresh projects only. See docs/PRODUCTION_INTEGRATION.md; production uses a different migration history.';
 end if;
end
$guard$;

-- Run after 001. Backend service-role access only; no browser table access.
create table if not exists public.tools (
  id text primary key,
  slug text unique not null,
  name text not null,
  category text not null,
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  views bigint not null default 0,
  conversions bigint not null default 0
);
create table if not exists public.posts (
  id text primary key,
  slug text unique not null,
  title text not null,
  excerpt text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  updated_at timestamptz not null default now()
);
create table if not exists public.temp_mail_client_limits (
  client_hash text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 1
);
alter table public.tools enable row level security;
alter table public.posts enable row level security;
alter table public.temp_mail_sessions enable row level security;
alter table public.temp_mail_client_limits enable row level security;
revoke all on public.tools, public.posts, public.temp_mail_sessions, public.temp_mail_client_limits from anon, authenticated;
grant all on public.tools, public.posts, public.temp_mail_sessions, public.temp_mail_client_limits to service_role;

create or replace function public.record_tool_view(tool_identifier text)
returns void language sql set search_path = public as $$
  update public.tools set views = views + 1 where slug = tool_identifier or name = tool_identifier;
$$;

-- Atomic upsert serializes concurrent requests for the same client.
create or replace function public.consume_temp_mail_limit(client_key text)
returns jsonb language plpgsql set search_path = public as $$
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
$$;
revoke all on function public.record_tool_view(text), public.consume_temp_mail_limit(text) from public, anon, authenticated;
grant execute on function public.record_tool_view(text), public.consume_temp_mail_limit(text) to service_role;
