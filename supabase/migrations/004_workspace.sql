-- Stop before changing a production database with archived legacy objects.
do $guard$
begin
 if to_regnamespace('legacy_archive') is not null then
  raise exception 'This file is for fresh projects only. See docs/PRODUCTION_INTEGRATION.md; production uses a different migration history.';
 end if;
end
$guard$;

-- Run after 003. Server-owned roles, full editorial records, and configuration.
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 display_name text not null default '',
 role text not null default 'member' check(role in ('member','admin','owner')),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create or replace function public.sync_auth_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
 insert into public.profiles(id,email,display_name) values(new.id,coalesce(new.email,''),left(coalesce(new.raw_user_meta_data->>'full_name',''),100))
 on conflict(id) do update set email=excluded.email, updated_at=now();
 return new;
end; $$;
drop trigger if exists on_auth_user_profile on auth.users;
create trigger on_auth_user_profile after insert or update of email on auth.users for each row execute function public.sync_auth_profile();
insert into public.profiles(id,email,display_name) select id,coalesce(email,''),left(coalesce(raw_user_meta_data->>'full_name',''),100) from auth.users on conflict(id) do nothing;

create table if not exists public.categories (
 slug text primary key check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 name text not null, description text not null default '', sort_order integer not null default 0
);
insert into public.categories(slug,name) values ('email-tools','Email tools'),('image-tools','Image tools'),('pdf-tools','PDF tools'),('developer-tools','Developer tools'),('text-tools','Text tools'),('generators','Generators') on conflict do nothing;
alter table public.posts add column if not exists body text not null default '';
alter table public.posts add column if not exists category_slug text references public.categories(slug) on delete set null;
alter table public.posts add column if not exists seo_title text not null default '';
alter table public.posts add column if not exists seo_description text not null default '';
alter table public.posts add column if not exists author_id uuid references auth.users(id) on delete set null;
alter table public.posts add column if not exists created_at timestamptz not null default now();
alter table public.posts add column if not exists published_at timestamptz;
create table if not exists public.post_revisions (
 id uuid primary key default gen_random_uuid(), post_id text not null references public.posts(id) on delete cascade,
 snapshot jsonb not null, actor_id uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
 id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id) on delete set null,
 action text not null, target text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists audit_created_idx on public.audit_logs(created_at desc);
create table if not exists public.site_settings (
 key text primary key, value jsonb not null, updated_at timestamptz not null default now()
);
insert into public.site_settings(key,value) values
 ('site','{"name":"Anvil Tools","url":"https://anviltools.vercel.app","support_email":"info@velloxtech.com"}'),
 ('advertising','{"enabled":false,"publisher_id":null}') on conflict do nothing;
create table if not exists public.site_pages (
 slug text primary key, title text not null, body text not null default '', status text not null default 'draft' check(status in ('draft','published')),
 updated_at timestamptz not null default now()
);
create table if not exists public.media_assets (
 id uuid primary key default gen_random_uuid(), storage_path text unique not null, alt_text text not null default '',
 uploaded_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.analytics_daily (
 day date not null, tool_slug text not null references public.tools(slug) on delete cascade,
 views bigint not null default 0 check(views>=0), primary key(day,tool_slug)
);
create or replace function public.record_tool_view(tool_identifier text) returns void language plpgsql set search_path=public as $$
declare tool_key text;
begin
 update public.tools set views=views+1 where slug=tool_identifier or name=tool_identifier returning slug into tool_key;
 if tool_key is not null then insert into public.analytics_daily(day,tool_slug,views) values(current_date,tool_key,1)
 on conflict(day,tool_slug) do update set views=public.analytics_daily.views+1; end if;
end; $$;

-- All editorial mutations and their audit entries share one transaction.
create or replace function public.save_post_document(document jsonb, actor uuid) returns jsonb language plpgsql set search_path=public as $$
declare saved public.posts;
begin
 insert into public.posts(id,slug,title,excerpt,body,status,category_slug,seo_title,seo_description,author_id,published_at)
 values(document->>'id',document->>'slug',document->>'title',coalesce(document->>'excerpt',''),coalesce(document->>'body',''),document->>'status',nullif(document->>'category_slug',''),coalesce(document->>'seo_title',''),coalesce(document->>'seo_description',''),actor,case when document->>'status'='published' then now() end)
 on conflict(id) do update set slug=excluded.slug,title=excluded.title,excerpt=excluded.excerpt,body=excluded.body,status=excluded.status,category_slug=excluded.category_slug,seo_title=excluded.seo_title,seo_description=excluded.seo_description,updated_at=now(),published_at=case when excluded.status='published' then coalesce(public.posts.published_at,now()) else null end
 returning * into saved;
 insert into public.post_revisions(post_id,snapshot,actor_id) values(saved.id,to_jsonb(saved),actor);
 insert into public.audit_logs(actor_id,action,target) values(actor,'post.saved',saved.id);
 return to_jsonb(saved);
end; $$;
create or replace function public.change_user_access(target_id uuid, new_role text, enabled boolean, actor uuid) returns void language plpgsql set search_path=public as $$
declare existing public.profiles;
begin
 select * into existing from public.profiles where id=target_id for update;
 if not found then raise exception 'User profile not found'; end if;
 if target_id=actor or existing.role='owner' then raise exception 'Protected account'; end if;
 if new_role not in ('member','admin') then raise exception 'Invalid role'; end if;
 update public.profiles set role=new_role,is_active=enabled,updated_at=now() where id=target_id;
 insert into public.audit_logs(actor_id,action,target,details) values(actor,'user.access_changed',target_id::text,jsonb_build_object('old_role',existing.role,'new_role',new_role,'enabled',enabled));
end; $$;
create or replace function public.cleanup_expired_state() returns jsonb language plpgsql set search_path=public as $$
declare sessions integer; limits integer;
begin
 delete from public.temp_mail_sessions where expires_at<now(); get diagnostics sessions=row_count;
 delete from public.temp_mail_client_limits where window_start<now()-interval '2 hours'; get diagnostics limits=row_count;
 return jsonb_build_object('expired_sessions',sessions,'expired_rate_limits',limits);
end; $$;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.post_revisions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.site_settings enable row level security;
alter table public.site_pages enable row level security;
alter table public.media_assets enable row level security;
alter table public.analytics_daily enable row level security;
revoke all on public.profiles,public.categories,public.post_revisions,public.audit_logs,public.site_settings,public.site_pages,public.media_assets,public.analytics_daily from anon,authenticated;
grant all on public.profiles,public.categories,public.post_revisions,public.audit_logs,public.site_settings,public.site_pages,public.media_assets,public.analytics_daily to service_role;
grant select on public.profiles to authenticated;
drop policy if exists own_profile on public.profiles;
create policy own_profile on public.profiles for select to authenticated using(id=auth.uid());
revoke all on function public.sync_auth_profile(),public.save_post_document(jsonb,uuid),public.change_user_access(uuid,text,boolean,uuid),public.cleanup_expired_state() from public,anon,authenticated;
grant execute on function public.save_post_document(jsonb,uuid),public.change_user_access(uuid,text,boolean,uuid),public.cleanup_expired_state() to service_role;
-- Private media staging; no anonymous uploads or reads.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('editorial-media','editorial-media',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
