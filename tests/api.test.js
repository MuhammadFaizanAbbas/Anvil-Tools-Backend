const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
const app = require('../server');
let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
test('health works without secrets and reports database configuration', async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).databaseConfigured, false);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('allows cPanel preflight including bearer authorization', async () => {
  const response = await fetch(`${base}/api/tools/demo`, { method: 'OPTIONS', headers: {
    Origin: 'https://frontend.example.com', 'Access-Control-Request-Method': 'PUT',
    'Access-Control-Request-Headers': 'authorization,content-type',
  } });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('access-control-allow-headers'), /Authorization/);
});
test('allows a new frontend origin without backend configuration', async () => {
  const response = await fetch(`${base}/api/health`, { headers: { Origin: 'https://unapproved.example.com' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
});
test('missing database fails closed instead of accepting a demo cookie', async () => {
  const response = await fetch(`${base}/api/admin/me`, { headers: { Cookie: 'admin_session=authenticated' } });
  assert.equal(response.status, 503);
});
test('API never exposes repository or frontend files', async () => {
  for (const path of ['/', '/server.js', '/package.json', '/.env', '/frontend/index.html']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
});
