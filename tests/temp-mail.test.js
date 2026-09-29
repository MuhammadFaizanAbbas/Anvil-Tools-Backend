const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.VERCEL = '';
const originalFetch = global.fetch;
let failure = '', deleted = false, inserted;
const session = { capability: 'a'.repeat(64), token: 'private-token', account_id: 'test-account', address: 'test@example.test', expires_at: new Date(Date.now() + 60000).toISOString() };
const db = {
  rpc: async () => failure === 'limit' ? { error: { code: 'DB_ERROR', message: 'secret database details' } } : { data: { allowed: true, remaining: 4 } },
  from() { return { delete() { return this; }, lt: async () => ({ data: [] }), select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: session }), insert: async row => { inserted = row; return failure === 'storage' ? { error: { code: 'DB_ERROR' } } : { data: [] }; } }; },
};
const cp = require.resolve('../backend/src/lib/supabase');
require.cache[cp] = { id: cp, filename: cp, loaded: true, exports: { supabaseAdmin: db, requireDatabase: (req, res, next) => next() } };
global.fetch = async (url, options = {}) => {
  if (!String(url).startsWith('https://api.mail.tm')) return originalFetch(url, options);
  const path = new URL(url).pathname;
  if (failure === 'network') throw Error('private network details');
  if (failure === 'domains') return new Response('upstream private details', { status: 403 });
  if (options.method === 'DELETE') { deleted = true; return new Response(null, { status: 204 }); }
  if (path === '/domains') return Response.json({ 'hydra:member': [{ domain: 'example.test' }] });
  if (path === '/accounts') return Response.json({ id: 'test-account', address: 'test@example.test' });
  if (path === '/token') return Response.json({ token: 'private-token' });
  if (path === '/messages') return Response.json({ 'hydra:member': [] });
  throw Error('Unexpected provider call');
};
const app = require('../backend/src/app');
let server, base;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}/api/temp-mail`; });
after(async () => { global.fetch = originalFetch; await new Promise(resolve => server.close(resolve)); });
test('creation reports safe stage codes for database and provider failures', async () => {
  for (const [stage, status, code] of [['limit', 500, 'TEMP_MAIL_LIMIT_FAILED'], ['domains', 503, 'MAIL_DOMAINS_UNAVAILABLE'], ['network', 503, 'MAIL_PROVIDER_UNREACHABLE']]) {
    failure = stage;
    const response = await originalFetch(base + '/create', { method: 'POST' });
    assert.equal(response.status, status);
    const data = await response.json(); assert.equal(data.code, code); assert.doesNotMatch(data.error, /private|secret/);
  }
});
test('storage failure removes only the newly created provider account', async () => {
  failure = 'storage'; deleted = false;
  assert.equal((await originalFetch(base + '/create', { method: 'POST' })).status, 500);
  assert.equal(deleted, true);
});
test('creation persists provider credentials but returns only the inbox capability', async () => {
  failure = '';
  const response = await originalFetch(base + '/create', { method: 'POST' });
  assert.equal(response.status, 200); const data = await response.json();
  assert.match(data.capability, /^[a-f0-9]{64}$/); assert.equal(data.token, undefined); assert.equal(inserted.token, 'private-token');
});
test('resuming an inbox restores its address without exposing provider credentials', async () => {
  const response = await originalFetch(base + '/messages?cap=' + session.capability);
  assert.equal(response.status, 200); const data = await response.json();
  assert.equal(data.address, session.address); assert.equal(data.expiresAt, Date.parse(session.expires_at)); assert.equal(data.token, undefined);
});
