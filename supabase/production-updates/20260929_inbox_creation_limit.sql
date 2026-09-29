-- New incremental migration for the already-migrated production project.
-- Does not replace consume_temp_mail_limit or modify either existing limiter table.
begin;
create table if not exists public.inbox_creation_limits (
 client_hash text primary key, attempts timestamptz[] not null default '{}', updated_at timestamptz not null default now()
);
alter table public.inbox_creation_limits enable row level security;
revoke all on public.inbox_creation_limits from public,anon,authenticated;
grant all on public.inbox_creation_limits to service_role;
create or replace function public.consume_inbox_creation_limit(client_key text)
returns jsonb language plpgsql set search_path=public as $$
declare hits timestamptz[]; moment timestamptz:=clock_timestamp();
begin
 delete from public.inbox_creation_limits where updated_at<moment-interval '1 day';
 insert into public.inbox_creation_limits(client_hash) values(client_key) on conflict do nothing;
 select attempts into hits from public.inbox_creation_limits where client_hash=client_key for update;
 select coalesce(array_agg(t order by t),'{}'::timestamptz[]) into hits from unnest(hits) t where t>moment-interval '1 minute';
 if cardinality(hits)>=3 then
  return jsonb_build_object('allowed',false,'remaining',0,'resetIn',greatest(1,ceil(extract(epoch from (hits[1]+interval '1 minute'-moment)))));
 end if;
 update public.inbox_creation_limits set attempts=array_append(hits,moment),updated_at=moment where client_hash=client_key;
 return jsonb_build_object('allowed',true,'remaining',2-cardinality(hits),'resetIn',60);
end;$$;
revoke all on function public.consume_inbox_creation_limit(text) from public,anon,authenticated;
grant execute on function public.consume_inbox_creation_limit(text) to service_role;
commit;
