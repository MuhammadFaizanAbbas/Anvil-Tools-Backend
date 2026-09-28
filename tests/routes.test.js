const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.ADMIN_EMAILS = 'admin@example.com';
process.env.VERCEL = '';
let writes = [];
const record = { slug: 'word-counter', name: 'Word Counter' };
const db = {
  auth: { getUser: async token => ({ data: { user: token === 'invalid' ? null : {
    id: 'user', email: token === 'admin' ? 'admin@example.com' : 'member@example.com',
  } } }) },
  from(table) {
    const query = {
      select() { return this; }, eq() { return this; },
      update(data) { writes.push({ table, data }); Object.assign(record, data); return this; },
      maybeSingle: async () => ({ data: record, error: null }),
    };
    return query;
  },
  rpc: async () => ({ data: { allowed: false, remaining: 0, resetIn: 120 } }),
};
const clientPath = require.resolve('../backend/src/lib/supabase');
require.cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: {
  supabaseAdmin: db, requireDatabase: (req, res, next) => next(),
} };
const app = require('../backend/src/app');
let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
test('admin authorization rejects cookie spoofing, invalid tokens and ordinary users', async () => {
  for (const [headers, expected] of [
    [{ Cookie: 'admin_session=authenticated' }, 401],
    [{ Authorization: 'Bearer invalid' }, 401],
    [{ Authorization: 'Bearer member' }, 403],
    [{ Authorization: 'Bearer admin' }, 200],
  ]) assert.equal((await fetch(`${base}/api/admin/me`, { headers })).status, expected);
});
test('tool edits write to the database and cannot overwrite counters or identity', async () => {
  writes = [];
  const response = await fetch(`${base}/api/tools/word-counter`, { method: 'PUT', headers: {
    Authorization: 'Bearer admin', 'Content-Type': 'application/json',
  }, body: JSON.stringify({ name: 'Updated name', slug: 'changed', views: 999 }) });
  assert.equal(response.status, 200);
  assert.deepEqual(writes, [{ table: 'tools', data: { name: 'Updated name' } }]);
  assert.equal((await response.json()).tool.slug, 'word-counter');
});
test('database rate limit stops inbox creation before contacting mail provider', async () => {
  const response = await fetch(`${base}/api/temp-mail/create`, { method: 'POST' });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '120');
});
test('invalid mail capabilities return 404 without database lookup', async () => {
  assert.equal((await fetch(`${base}/api/temp-mail/messages?cap=bad`)).status, 404);
});
