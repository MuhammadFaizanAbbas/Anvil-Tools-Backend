const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.ADMIN_EMAILS = 'owner@example.com';
process.env.FRONTEND_ORIGINS = 'https://one.example,https://two.example';
process.env.SITE_URL = 'https://one.example';
process.env.VERCEL = '';
let allowed = true, saved = [], invites = [], rpcCalls = [], rpcError = null;
const db = {
  auth: {
    getUser: async () => ({ data: { user: { id: 'owner', email: 'owner@example.com', email_confirmed_at: '2026-01-01' } } }),
    admin: { generateLink: async () => ({ data: { user: { id: 'invited' }, properties: { hashed_token: 'single-use-test' } } }), updateUserById: async () => ({data:{}}) },
  },
  from(table) {
    let filter, row;
    return {
      select() { return this; }, eq(key, value) { filter = value; return this; },
      insert(value) { row = value; saved.push({ table, row }); return this; },
      single: async () => ({ data: row }),
      maybeSingle: async () => ({ data: table === 'tools' && ['word-counter', 'Word Counter'].includes(filter) ? { slug: 'word-counter' } : null }),
    };
  },
  rpc: async (name, args) => { rpcCalls.push({ name, args }); return name === 'consume_temp_mail_limit' ? { data: { allowed, resetIn: 120 } } : { data: {}, error: rpcError }; },
};
const cp = require.resolve('../backend/src/lib/supabase');
require.cache[cp] = { id: cp, filename: cp, loaded: true, exports: { supabaseAdmin: db, requireDatabase: (req, res, next) => next() } };
const mailPath=require.resolve('../backend/src/lib/contact-mail');require.cache[mailPath]={id:mailPath,filename:mailPath,loaded:true,exports:{transport:()=>({sendMail:async message=>{invites.push(message);return {accepted:['new@example.com']};}})}};
const app = require('../backend/src/app');
let server, base;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => new Promise(resolve => server.close(resolve)));
const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
test('quick creation cannot publish an empty article and still creates drafts', async () => {
  saved = [];
  assert.equal((await post('/api/posts', { title: 'Article', slug: 'article', status: 'published' })).status, 400);
  assert.equal(saved.length, 0);
  assert.equal((await post('/api/posts', { title: 'Article', slug: 'article' })).status, 201);
  assert.equal(saved[0].row.status, 'draft');
});
test('analytics throttles before writes, isolates its quota, and rejects unknown tools', async () => {
  allowed = false; rpcCalls = [];
  const denied = await post('/api/analytics/event', { tool: 'word-counter' });
  assert.equal(denied.status, 429); assert.equal(denied.headers.get('retry-after'), '120');
  assert.deepEqual(rpcCalls.map(c => c.name), ['consume_temp_mail_limit']);
  assert.match(rpcCalls[0].args.client_key, /^analytics-ip:[a-f0-9]{64}$/);
  allowed = true; rpcCalls = [];
  assert.equal((await post('/api/analytics/event', { tool: 'unknown' })).status, 404);
  assert.equal(rpcCalls.some(c => c.name === 'record_tool_view'), false);
  assert.equal((await post('/api/analytics/event', { tool: 'Word Counter' })).status, 200);
  assert.equal(rpcCalls.at(-1).args.tool_identifier, 'word-counter');
});
test('analytics ignores spoofed forwarded-for and fails closed without the Vercel address', async () => {
  process.env.VERCEL = '1';
  try { assert.equal((await post('/api/analytics/event', { tool: 'word-counter' }, { 'X-Forwarded-For': '1.2.3.4' })).status, 503); }
  finally { process.env.VERCEL = ''; }
});
test('invites return to an allowed requesting domain, default for server calls, and reject other origins', async () => {
  invites = [];
  assert.equal((await post('/api/admin/users', { email: 'new@example.com' }, { Origin: 'https://two.example' })).status, 201);
  assert.match(invites[0].text, /https:\/\/two\.example\/admin-panel\/setup-password\.html#token_hash=/);
  assert.equal((await post('/api/admin/users', { email: 'new@example.com' })).status, 201);
  assert.match(invites[1].text, /https:\/\/one\.example\/admin-panel\/setup-password\.html#token_hash=/);
  assert.equal((await post('/api/admin/users', { email: 'new@example.com' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal(invites.length, 2);
});
test('article saves return useful validation errors for missing references', async () => {
  const doc = { id: 'article', slug: 'article', title: 'Article', body: 'Content', excerpt: '', seo_title: '', seo_description: '', status: 'draft', category_slug: 'missing' };
  rpcCalls = [];
  const missing = await post('/api/admin/documents', doc);
  assert.equal(missing.status, 400); assert.match((await missing.json()).error, /category/);
  assert.equal(rpcCalls.length, 0);
  rpcError = { code: '23503' };
  try { assert.equal((await post('/api/admin/documents', { ...doc, category_slug: null })).status, 400); }
  finally { rpcError = null; }
});
