const router = require('express').Router();
const crypto = require('node:crypto');
const { supabaseAdmin: db } = require('../lib/supabase');
const { requireAdmin } = require('../middleware/auth');
const run = require('../lib/async-handler');
const TTL = 60 * 60 * 1000;
const provider = (path, options = {}) => fetch(`https://api.mail.tm${path}`, {
  ...options, signal: AbortSignal.timeout(10000),
  headers: { 'Content-Type': 'application/json', Accept: 'application/ld+json', ...options.headers },
});
function unavailable(code, message) {
  return Object.assign(new Error(message), { status: 503, code });
}
async function mailRequest(path, options) {
  try { return await provider(path, options); }
  catch (_) { throw unavailable('MAIL_PROVIDER_UNREACHABLE', 'Temporary mail service could not be reached. Please try again shortly.'); }
}
function mailFailure(response, code) {
  console.error('Temporary mail provider request failed', { code, status: response.status });
  return unavailable(code, 'Temporary mail service is unavailable. Please try again shortly.');
}
const createInbox = async (req, res) => {
  let stage = 'limit';
  try {
    await create(req, res, nextStage => { stage = nextStage; });
  } catch (error) {
    console.error('Temporary inbox creation failed', { stage, code: error.code || 'UNKNOWN' });
    res.status(error.status === 503 ? 503 : 500).json({
      error: error.status === 503 ? error.message : 'Inbox creation failed. Please try again later.',
      code: error.code?.startsWith('MAIL_') ? error.code : `TEMP_MAIL_${stage.toUpperCase()}_FAILED`,
    });
  }
};
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
async function create(req, res, stage) {
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
  stage('storage_cleanup');
  unwrap(await db.from('temp_mail_sessions').delete().lt('expires_at', new Date().toISOString()));
  stage('domains');
  const domainResponse = await mailRequest('/domains');
  if (!domainResponse.ok) throw mailFailure(domainResponse, 'MAIL_DOMAINS_UNAVAILABLE');
  const domainData = await domainResponse.json();
  const domain = (domainData['hydra:member'] || domainData)[0]?.domain;
  if (!domain) throw unavailable('MAIL_DOMAINS_EMPTY', 'No temporary mail domain is currently available. Please try again shortly.');
  const address = `${crypto.randomBytes(8).toString('hex')}@${domain}`;
  const password = crypto.randomBytes(24).toString('base64url');
  stage('account');
  const accountResponse = await mailRequest('/accounts', { method: 'POST', body: JSON.stringify({ address, password }) });
  if (!accountResponse.ok) throw mailFailure(accountResponse, 'MAIL_ACCOUNT_UNAVAILABLE');
  const account = await accountResponse.json();
  stage('token');
  const tokenResponse = await mailRequest('/token', { method: 'POST', body: JSON.stringify({ address, password }) });
  if (!tokenResponse.ok) throw mailFailure(tokenResponse, 'MAIL_TOKEN_UNAVAILABLE');
  const { token } = await tokenResponse.json();
  const capability = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + TTL;
  stage('storage');
  try {
    unwrap(await db.from('temp_mail_sessions').insert({ capability, token, account_id: account.id,
      address: account.address, expires_at: new Date(expiresAt).toISOString() }));
  } catch (error) {
    // Delete only the provider account created by this failed request.
    try { await provider(`/accounts/${encodeURIComponent(account.id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); } catch (_) { /* Preserve the storage error. */ }
    throw error;
  }
  res.json({ ok: true, capability, address: account.address, expiresAt, remaining: limit.remaining });
}
router.post('/create', run(createInbox));
router.get('/messages', authorize, run(async (req, res) => {
  const response = await provider('/messages', { headers: { Authorization: `Bearer ${req.mail.token}` } });
  if (!response.ok) throw new Error('Could not fetch messages');
  const data = await response.json();
  const messages = (data['hydra:member'] || []).map(message => ({ id: message.id,
    from: message.from?.address || '', subject: message.subject, intro: message.intro, createdAt: message.createdAt }));
  res.json({ ok: true, messages, address: req.mail.address, expiresAt: Date.parse(req.mail.expires_at) });
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
