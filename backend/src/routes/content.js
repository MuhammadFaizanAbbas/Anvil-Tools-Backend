const router = require('express').Router();
const { supabaseAdmin: db } = require('../lib/supabase');
const { requireAdmin } = require('../middleware/auth');
const run = require('../lib/async-handler');
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
  res.json(unwrap(await db.from('posts').select('*').order('updated_at', { ascending: false })).map(postShape));
}));
router.post('/posts', requireAdmin, run(async (req, res) => {
  const { title, slug, excerpt = '', status = 'draft' } = req.body || {};
  if (typeof title !== 'string' || !title.trim() || title.length > 300 ||
      typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 150 ||
      typeof excerpt !== 'string' || excerpt.length > 5000 || !['draft', 'published'].includes(status)) {
    return res.status(400).json({ error: 'Valid title, slug, excerpt and status are required' });
  }
  const result = await db.from('posts').insert({ id: slug, title: title.trim(), slug, excerpt, status }).select().single();
  if (result.error?.code === '23505') return res.status(409).json({ error: 'Post slug already exists' });
  res.status(201).json({ ok: true, post: postShape(unwrap(result)) });
}));
router.get('/site/overview', requireAdmin, run(async (req, res) => {
  const [toolResult, postResult] = await Promise.all([
    db.from('tools').select('name,views').order('views', { ascending: false }),
    db.from('posts').select('id', { count: 'exact', head: true }),
  ]);
  const tools = unwrap(toolResult);
  unwrap(postResult);
  res.json({ totalTools: tools.length, totalPosts: postResult.count,
    totalVisitors: tools.reduce((sum, tool) => sum + Number(tool.views), 0),
    avgSessionTime: 'Not tracked', topSource: 'Not tracked', toolBreakdown: tools.slice(0, 4) });
}));
router.post('/analytics/event', run(async (req, res) => {
  const { tool } = req.body || {};
  if (typeof tool !== 'string' || !tool || tool.length > 200) return res.status(400).json({ error: 'Tool is required' });
  unwrap(await db.rpc('record_tool_view', { tool_identifier: tool }));
  res.json({ ok: true, tool });
}));
module.exports = router;
