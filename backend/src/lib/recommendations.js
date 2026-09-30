const fields = 'slug,title,excerpt,published_at,category_slug,cover_image_id,cover_alt,tags';
function rankPosts(posts, current, limit) {
  const tags = new Set((current?.tags || []).map(tag => tag.toLowerCase()));
  const score = post => (current?.category_slug && post.category_slug === current.category_slug ? 4 : 0)
    + (post.tags || []).filter(tag => tags.has(tag.toLowerCase())).length * 2;
  return posts.filter(post => post.slug !== current?.slug).sort((a,b) => score(b)-score(a)
    || String(b.published_at || '').localeCompare(String(a.published_at || '')) || a.slug.localeCompare(b.slug)).slice(0,limit);
}
async function recommendations(db, slug = '', limit = 6) {
  let current = null;
  if (slug) {
    const result = await db.from('posts').select(fields).eq('status','published').eq('slug',slug).maybeSingle();
    if (result.error) throw result.error;
    current = result.data;
    if (!current) return [];
  }
  // Bound the candidate set; metadata is managed through the existing content editor.
  const result = await db.from('posts').select(fields).eq('status','published')
    .order('published_at',{ascending:false,nullsFirst:false}).order('slug').limit(100);
  if (result.error) throw result.error;
  return rankPosts(result.data || [],current,limit);
}
module.exports = { recommendations, rankPosts };
