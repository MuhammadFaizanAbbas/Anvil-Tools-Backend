-- M3: anvil_map_legacy_content
-- Maps archived legacy rows into the application tables. Originals stay in legacy_archive. No duplicate slugs are created:
-- existing application rows win; only missing slugs are inserted. Legacy posts whose body is only a pointer to a static HTML
-- guide are imported as DRAFTS (never published stubs); their original publication dates are preserved.
do $anvil_m3$
declare
  v_cat_touched int; v_tools_new int; v_tools_inactive int; v_posts_new int; v_posts_dated int; v_diff jsonb; v_missing text;
begin
  if to_regclass('legacy_archive.tools') is null or to_regclass('public.posts') is null or to_regclass('public.tools') is null then
    raise exception 'M3 abort: expected legacy_archive and application tables are not both present';
  end if;
  if exists (select 1 from public.audit_logs where action = 'legacy.import') then
    raise exception 'M3 abort: legacy import already recorded';
  end if;

  insert into public.categories(slug, name, description, sort_order)
  select lc.slug, lc.label, lc.description, lc.sort_order from legacy_archive.categories lc
  on conflict (slug) do update set
    description = case when public.categories.description = '' then excluded.description else public.categories.description end,
    sort_order  = case when public.categories.sort_order = 0 then excluded.sort_order else public.categories.sort_order end;
  get diagnostics v_cat_touched = row_count;

  insert into public.tools(id, slug, name, category, description, status)
  select lt.slug, lt.slug, lt.name, coalesce(lc.label, 'Uncategorized'), lt.short_desc, case when lt.enabled then 'active' else 'inactive' end
  from legacy_archive.tools lt left join legacy_archive.categories lc on lc.id = lt.category_id
  where not exists (select 1 from public.tools x where x.slug = lt.slug or x.id = lt.slug)
  order by lt.sort_order;
  get diagnostics v_tools_new = row_count;

  update public.tools x set status = 'inactive' from legacy_archive.tools lt
  where lt.slug = x.slug and lt.enabled = false and x.status <> 'inactive';
  get diagnostics v_tools_inactive = row_count;

  select coalesce(jsonb_agg(jsonb_build_object('slug', x.slug, 'kept_name', x.name, 'archived_name', lt.name,
           'kept_category', x.category, 'archived_category', lc.label, 'kept_description', x.description, 'archived_description', lt.short_desc) order by x.slug), '[]'::jsonb)
    into v_diff
  from public.tools x join legacy_archive.tools lt on lt.slug = x.slug left join legacy_archive.categories lc on lc.id = lt.category_id
  where x.name <> lt.name or x.category <> coalesce(lc.label, 'Uncategorized') or x.description <> lt.short_desc;

  insert into public.posts(id, slug, title, excerpt, body, status, published_at, created_at, updated_at)
  select lp.slug, lp.slug, lp.title, lp.excerpt, lp.body, 'draft', lp.published_at, lp.created_at, lp.updated_at
  from legacy_archive.blog_posts lp
  where not exists (select 1 from public.posts p where p.slug = lp.slug or p.id = lp.slug);
  get diagnostics v_posts_new = row_count;

  update public.posts p set published_at = lp.published_at from legacy_archive.blog_posts lp
  where lp.slug = p.slug and p.status = 'published' and p.published_at is null;
  get diagnostics v_posts_dated = row_count;

  insert into public.audit_logs(action, target, details)
  values ('legacy.import', 'legacy_archive', jsonb_build_object(
    'categories_upserted', v_cat_touched, 'tools_inserted', v_tools_new, 'tools_set_inactive', v_tools_inactive,
    'posts_inserted_as_draft', v_posts_new, 'posts_published_at_restored', v_posts_dated, 'tool_text_differences', v_diff));

  select string_agg(lc.slug, ',') into v_missing from legacy_archive.categories lc where not exists (select 1 from public.categories c where c.slug = lc.slug);
  if v_missing is not null then raise exception 'M3 verify: categories not mapped: %', v_missing; end if;
  select string_agg(lt.slug, ',') into v_missing from legacy_archive.tools lt where not exists (select 1 from public.tools x where x.slug = lt.slug);
  if v_missing is not null then raise exception 'M3 verify: tools not mapped: %', v_missing; end if;
  select string_agg(lp.slug, ',') into v_missing from legacy_archive.blog_posts lp where not exists (select 1 from public.posts p where p.slug = lp.slug);
  if v_missing is not null then raise exception 'M3 verify: posts not mapped: %', v_missing; end if;
  if (select count(*) from public.tools) <> 12 or (select count(*) from public.posts) <> 4 or (select count(*) from public.categories) <> 6 then
    raise exception 'M3 verify: unexpected row counts after mapping';
  end if;
  if (select count(*) from legacy_archive.tools) <> 12 or (select count(*) from legacy_archive.blog_posts) <> 4 or (select count(*) from legacy_archive.categories) <> 6 then
    raise exception 'M3 verify: archive was modified';
  end if;
end
$anvil_m3$;
