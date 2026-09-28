const router = require('express').Router();
const crypto = require('node:crypto');
const { supabaseAdmin: db } = require('../lib/supabase');
const { requireAdmin } = require('../middleware/auth');
const run = require('../lib/async-handler');
const TTL = 60 * 60 * 1000;
const provider = (path, options = {}) => fetch(`https://api.mail.tm${path}`, {
  ...options, signal: AbortSignal.timeout(10000),
  headers: { 'Content-Type': 'application/json', ...options.headers },
});
function unwrap(result) { if (result.error) throw result.error; return result.data; }
const authorize = run(async (req, res, next) => {
  const cap = req.query.cap || req.body?.cap;
  if (typeof cap !== 'string' || !/^[a-f0-9]{64}$/.test(cap)) return res.status(404).json({ error: 'Invalid capability' });
  const session = unwrap(await db.from('temp_mail_sessions').select('*').eq('capability', cap).maybeSingle());
  if (!session) return res.status(404).json({ error: 'Invalid capability' });
  if (Date.parse(session.expires_at) <= Date.now()) return res.status(410).json({ error: 'Capability expired' });
  req.mail = session;
  next();
});
router.post('/create', run(async (req, res) => {
  // Vercel overwrites x-vercel-forwarded-for. Local requests use the socket IP.
  const ip = process.env.VERCEL ? req.get('x-vercel-forwarded-for') : req.socket.remoteAddress;
  if (!ip) return res.status(503).json({ error: 'Client address unavailable' });
  const key = crypto.createHash('sha256').update(ip).digest('hex');
  const limit = unwrap(await db.rpc('consume_temp_mail_limit', { client_key: key }));
  if (!limit.allowed) {
    res.set('Retry-After', String(limit.resetIn));
    return res.status(429).json({ error: 'Too many inbox creations', ...limit });
  }
  // Request-driven cleanup works across serverless instances without timers.
  unwrap(await db.from('temp_mail_sessions').delete().lt('expires_at', new Date().toISOString()));
  const domainResponse = await provider('/domains');
  if (!domainResponse.ok) throw new Error('Mail provider unavailable');
  const domainData = await domainResponse.json();
  const domain = (domainData['hydra:member'] || domainData)[0]?.domain;
  if (!domain) throw new Error('No mail domain available');
  const address = `${crypto.randomBytes(8).toString('hex')}@${domain}`;
  const password = crypto.randomBytes(24).toString('base64url');
  const accountResponse = await provider('/accounts', { method: 'POST', body: JSON.stringify({ address, password }) });
  if (!accountResponse.ok) throw new Error('Could not create mail account');
  const account = await accountResponse.json();
  const tokenResponse = await provider('/token', { method: 'POST', body: JSON.stringify({ address, password }) });
  if (!tokenResponse.ok) throw new Error('Could not authenticate mail account');
  const { token } = await tokenResponse.json();
  const capability = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + TTL;
  unwrap(await db.from('temp_mail_sessions').insert({ capability, token, account_id: account.id,
    address: account.address, expires_at: new Date(expiresAt).toISOString() }));
  res.json({ ok: true, capability, address: account.address, expiresAt, remaining: limit.remaining });
}));
router.get('/messages', authorize, run(async (req, res) => {
  const response = await provider('/messages', { headers: { Authorization: `Bearer ${req.mail.token}` } });
  if (!response.ok) throw new Error('Could not fetch messages');
  const data = await response.json();
  const messages = (data['hydra:member'] || []).map(message => ({ id: message.id,
    from: message.from?.address || '', subject: message.subject, intro: message.intro, createdAt: message.createdAt }));
  res.json({ ok: true, messages });
}));
router.get('/messages/:id', authorize, run(async (req, res) => {
  const response = await provider(`/messages/${encodeURIComponent(req.params.id)}`, { headers: { Authorization: `Bearer ${req.mail.token}` } });
  if (response.status === 404) return res.status(404).json({ error: 'Message not found' });
  if (!response.ok) throw new Error('Could not fetch message');
  const message = await response.json();
  const html = Array.isArray(message.html) ? message.html.join(' ') : (message.html || '');
  res.json({ ok: true, id: message.id, from: message.from, subject: message.subject,
    text: message.text || html.replace(/<[^>]+>/g, ' '), createdAt: message.createdAt });
}));
router.post('/delete', authorize, run(async (req, res) => {
  const response = await provider(`/accounts/${encodeURIComponent(req.mail.account_id)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${req.mail.token}` },
  });
  if (!response.ok && response.status !== 404) throw new Error('Could not delete mail account');
  unwrap(await db.from('temp_mail_sessions').delete().eq('capability', req.mail.capability));
  res.json({ ok: true });
}));
router.get('/stats', requireAdmin, run(async (req, res) => {
  const result = await db.from('temp_mail_sessions').select('*', { count: 'exact', head: true }).gt('expires_at', new Date().toISOString());
  unwrap(result);
  res.json({ ok: true, inMemory: 0, supabase: result.count, total: result.count, ttlHours: 1, storageMode: 'supabase' });
}));
module.exports = router;
