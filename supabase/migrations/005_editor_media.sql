-- Add cover images and article tags. Run after 004.
alter table public.media_assets add column if not exists file_name text not null default '';
alter table public.media_assets add column if not exists mime_type text not null default 'image/webp';
alter table public.media_assets add column if not exists width integer;
alter table public.media_assets add column if not exists height integer;
alter table public.posts add column if not exists cover_image_id uuid references public.media_assets(id) on delete set null;
alter table public.posts add column if not exists cover_alt text not null default '';
alter table public.posts add column if not exists tags text[] not null default '{}';
alter table public.posts drop constraint if exists post_tag_count;
alter table public.posts add constraint post_tag_count check(cardinality(tags)<=12);
create index if not exists post_tags_idx on public.posts using gin(tags);

create or replace function public.save_post_document(document jsonb, actor uuid) returns jsonb language plpgsql set search_path=public as $$
declare saved public.posts;
begin
 insert into public.posts(id,slug,title,excerpt,body,status,category_slug,seo_title,seo_description,author_id,published_at,cover_image_id,cover_alt,tags)
 values(document->>'id',document->>'slug',document->>'title',coalesce(document->>'excerpt',''),coalesce(document->>'body',''),document->>'status',nullif(document->>'category_slug',''),coalesce(document->>'seo_title',''),coalesce(document->>'seo_description',''),actor,case when document->>'status'='published' then now() end,nullif(document->>'cover_image_id','')::uuid,coalesce(document->>'cover_alt',''),array(select jsonb_array_elements_text(coalesce(document->'tags','[]'::jsonb))))
 on conflict(id) do update set slug=excluded.slug,title=excluded.title,excerpt=excluded.excerpt,body=excluded.body,status=excluded.status,category_slug=excluded.category_slug,seo_title=excluded.seo_title,seo_description=excluded.seo_description,cover_image_id=excluded.cover_image_id,cover_alt=excluded.cover_alt,tags=excluded.tags,updated_at=now(),published_at=case when excluded.status='published' then coalesce(public.posts.published_at,now()) else null end
 returning * into saved;
 insert into public.post_revisions(post_id,snapshot,actor_id) values(saved.id,to_jsonb(saved),actor);
 insert into public.audit_logs(actor_id,action,target) values(actor,'post.saved',saved.id);
 return to_jsonb(saved);
end; $$;
revoke all on function public.save_post_document(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_post_document(jsonb,uuid) to service_role;
