const router = require('express').Router();
const { supabaseAdmin: db } = require('../lib/supabase');
const { requireAdmin } = require('../middleware/auth');
const run = require('../lib/async-handler');
const crypto = require('node:crypto');
const { recommendations } = require('../lib/recommendations');
const { readPage } = require('../lib/pagination');
const retiredArticles = require('../lib/article-redirects.json');
router.get('/public/recommendations', run(async (req,res) => {
  const slug = req.query.slug ?? '', limit = Number(req.query.limit ?? 6);
  if (typeof slug !== 'string' || slug.length > 150 || (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) || !Number.isSafeInteger(limit) || limit < 1 || limit > 12) {
    return res.status(400).json({error:'Invalid recommendation parameters'});
  }
  res.json(await recommendations(db,slug,limit));
}));
function unwrap(result) { if (result.error) throw result.error; return result.data; }
const postShape = row => ({ ...row, updatedAt: row.updated_at?.slice(0, 10) });

router.get('/tools', run(async (req, res) => {
  res.json(unwrap(await db.from('tools').select('*').order('name')));
}));
router.put('/tools/:slug', requireAdmin, run(async (req, res) => {
  const updates = {};
  for (const key of ['name', 'description', 'category', 'status']) {
    if (req.body?.[key] !== undefined) {
      if (typeof req.body[key] !== 'string' || !req.body[key].trim() || req.body[key].length > 2000) {
        return res.status(400).json({ error: `Invalid ${key}` });
      }
      updates[key] = req.body[key].trim();
    }
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No editable fields provided' });
  if (updates.status && !['active', 'inactive'].includes(updates.status)) return res.status(400).json({ error: 'Invalid status' });
  const tool = unwrap(await db.from('tools').update(updates).eq('slug', req.params.slug).select().maybeSingle());
  if (!tool) return res.status(404).json({ error: 'Tool not found' });
  res.json({ ok: true, tool });
}));
router.get('/posts', requireAdmin, run(async (req, res) => {
  if (req.query.limit === undefined && req.query.offset === undefined) {
    return res.json(unwrap(await db.from('posts').select('*').order('updated_at', { ascending: false, nullsFirst: false }).order('id')).map(postShape));
  }
  const limit = Number(req.query.limit ?? 10), offset = Number(req.query.offset ?? 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) {
    return res.status(400).json({ error: 'Invalid post pagination' });
  }
  const result = await readPage(db.from('posts').select('*', { count: 'exact' })
    .order('updated_at', { ascending: false, nullsFirst: false }).order('id').range(offset, offset + limit - 1),
    () => db.from('posts').select('id', { count: 'exact', head: true }), offset);
  res.json({ items: unwrap(result).map(postShape), total: result.count || 0, limit, offset });
}));
router.post('/posts', requireAdmin, run(async (req, res) => {
  const { title, slug, excerpt = '', status = 'draft' } = req.body || {};
  if (typeof title !== 'string' || !title.trim() || title.length > 300 ||
      typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 150 ||
      typeof excerpt !== 'string' || excerpt.length > 5000 || !['draft', 'published'].includes(status)) {
    return res.status(400).json({ error: 'Valid title, slug, excerpt and status are required' });
  }
  if (status === 'published') return res.status(400).json({ error: 'Create a draft, then add article content in the editor before publishing.' });
  const result = await db.from('posts').insert({ id: slug, title: title.trim(), slug, excerpt, status: 'draft' }).select().single();
  if (result.error?.code === '23505') return res.status(409).json({ error: 'Post slug already exists' });
  res.status(201).json({ ok: true, post: postShape(unwrap(result)) });
}));
router.get('/site/overview', requireAdmin, run(async (req, res) => {
  const [toolResult, postResult, publishedResult, draftResult] = await Promise.all([
    db.from('tools').select('name,views').order('views', { ascending: false }),
    db.from('posts').select('id', { count: 'exact', head: true }),
    db.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    db.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
  ]);
  const tools = unwrap(toolResult);
  unwrap(postResult); unwrap(publishedResult); unwrap(draftResult);
  res.json({ totalTools: tools.length, totalPosts: postResult.count,
    publishedPosts: publishedResult.count, draftPosts: draftResult.count,
    totalVisitors: tools.reduce((sum, tool) => sum + Number(tool.views), 0),
    avgSessionTime: 'Not tracked', topSource: 'Not tracked', toolBreakdown: tools.slice(0, 4) });
}));
router.post('/analytics/event', run(async (req, res) => {
  const { tool } = req.body || {};
  if (typeof tool !== 'string' || !tool || tool.length > 200) return res.status(400).json({ error: 'Tool is required' });
  const ip = process.env.VERCEL ? req.get('x-vercel-forwarded-for') : req.socket.remoteAddress;
  if (!ip) return res.status(503).json({ error: 'Client address unavailable' });
  const key = 'analytics-ip:' + crypto.createHash('sha256').update(ip).digest('hex');
  const limit = unwrap(await db.rpc('consume_temp_mail_limit', { client_key: key }));
  if (!limit.allowed) {
    res.set('Retry-After', String(limit.resetIn));
    return res.status(429).json({ error: 'Too many analytics events' });
  }
  let record = unwrap(await db.from('tools').select('slug').eq('slug', tool).maybeSingle());
  if (!record) record = unwrap(await db.from('tools').select('slug').eq('name', tool).maybeSingle());
  if (!record) return res.status(404).json({ error: 'Tool not found' });
  unwrap(await db.rpc('record_tool_view', { tool_identifier: record.slug }));
  res.json({ ok: true, tool });
}));
router.get('/public/posts', run(async (req, res) => {
  const limit=Number(req.query.limit ?? 100),offset=Number(req.query.offset ?? 0);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>1000000)return res.status(400).json({error:'Invalid article pagination'});
  const result=await readPage(db.from('posts').select('slug,title,excerpt,published_at,category_slug,cover_image_id,cover_alt,tags',{count:'exact'}).eq('status','published').order('published_at',{ascending:false,nullsFirst:false}).order('slug').range(offset,offset+limit-1),
    () => db.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'published'), offset);
  res.set('X-Total-Count',String(result.count||0)).json(unwrap(result));
}));
router.get('/public/posts/:slug', run(async (req,res) => {
  if(Object.hasOwn(retiredArticles,req.params.slug))return res.status(410).json({error:'Article retired',replacement:retiredArticles[req.params.slug]?'/journal/'+retiredArticles[req.params.slug]:null});
  const post=unwrap(await db.from('posts').select('slug,title,excerpt,body,published_at,seo_title,seo_description,cover_image_id,cover_alt,tags').eq('slug',req.params.slug).eq('status','published').maybeSingle());
  if(!post)return res.status(404).json({error:'Article not found'});
  res.json(post);
}));
module.exports = router;
