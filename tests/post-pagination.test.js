const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const retired = require('../backend/src/lib/article-redirects.json');

// Exercise the real Supabase client against PostgREST-shaped HTTP responses.
const posts = Array.from({ length: 4 }, (_, i) => ({ id: `guide-${i}`, slug: `guide-${i}`, title: `Guide ${i}`, status: 'published', body: 'Published text' }));
posts.push({ id: 'private', slug: 'private-draft', title: 'Private draft', status: 'draft', body: 'Private text' });
let failure, countFailure, requests;
const db = createClient('https://pagination.example.test', 'test-key', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input, options) => {
    const url = new URL(input);
    const head = options.method === 'HEAD';
    requests.push({ head, status: url.searchParams.get('status'), offset: url.searchParams.get('offset') });
    const error = head ? countFailure : failure;
    if (error) return new Response(JSON.stringify(error), { status: 503, headers: { 'Content-Type': 'application/json' } });
    let rows = posts.filter(row => !url.searchParams.has('status') || 'eq.' + row.status === url.searchParams.get('status'));
    if (url.searchParams.has('slug')) rows = rows.filter(row => 'eq.' + row.slug === url.searchParams.get('slug'));
    const total = rows.length;
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || total);
    if (!head && offset > 0 && offset >= total) return new Response(JSON.stringify({ code: 'PGRST103', message: 'Requested range not satisfiable', details: `An offset of ${offset} was requested, but there are only ${total} rows.`, hint: null }), { status: 416, headers: { 'Content-Type': 'application/json', 'Content-Range': `*/${total}` } });
    rows = rows.slice(offset, offset + limit);
    const fields = url.searchParams.get('select');
    if (fields !== '*') rows = rows.map(row => Object.fromEntries(fields.split(',').filter(key => key in row).map(key => [key, row[key]])));
    return new Response(head ? null : JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${total}` } });
  } }
});
const clientPath = require.resolve('../backend/src/lib/supabase');
require.cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: { supabaseAdmin: db } };
const authPath = require.resolve('../backend/src/middleware/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { requireAdmin: (req, res, next) => next() } };
let server, base;
before(async () => {
  const app = express();
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, require('../backend/src/routes/content'));
  app.use((error, req, res, next) => res.status(500).json({ error: 'Database request failed' }));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => { failure = null; countFailure = null; requests = []; });
after(() => new Promise(resolve => server.close(resolve)));

test('public pages count only published posts and do not include article bodies or drafts', async () => {
  const response = await fetch(base + '/api/public/posts?limit=3&offset=0');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-total-count'), '4');
  const data = await response.json();
  assert.equal(data.length, 3);
  assert.ok(data.every(post => post.slug !== 'private-draft' && !Object.hasOwn(post, 'body')));
  assert.equal(requests.length, 1);
});

test('last, empty, and distant public pages return correct totals instead of a server error', async () => {
  for (const offset of [3, 4, 30, 999990]) {
    requests = [];
    const response = await fetch(base + `/api/public/posts?limit=31&offset=${offset}`);
    assert.equal(response.status, 200, String(offset));
    assert.equal(response.headers.get('x-total-count'), '4');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).length, offset < 4 ? 1 : 0);
    assert.ok(requests.every(request => request.status === 'eq.published'));
    assert.equal(requests.filter(request => request.head).length, offset < 4 ? 0 : 1);
  }
});

test('empty admin pages preserve the full private count', async () => {
  const response = await fetch(base + '/api/posts?limit=10&offset=30');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [], total: 5, limit: 10, offset: 30 });
  assert.ok(requests.every(request => request.status === null));
});

test('database outages are not disguised as successful empty public pages', async () => {
  failure = { code: 'PGRST000', message: 'Database unavailable' };
  const response = await fetch(base + '/api/public/posts?limit=31&offset=30');
  assert.equal(response.status, 500);
  assert.equal(response.headers.get('x-total-count'), null);
  assert.ok(requests.length > 0 && requests.every(request => !request.head));
});

test('failure to confirm the filtered count remains an error', async () => {
  countFailure = { code: 'PGRST000', message: 'Database unavailable' };
  assert.equal((await fetch(base + '/api/public/posts?limit=31&offset=30')).status, 500);
});

test('retired article JSON never exposes an old body and points to a replacement only when one exists', async () => {
  for (const [slug, target] of [Object.entries(retired).find(([, target]) => target), Object.entries(retired).find(([, target]) => target === null)]) {
    const response = await fetch(base + '/api/public/posts/' + slug);
    assert.equal(response.status, 410);
    assert.deepEqual(await response.json(), { error: 'Article retired', replacement: target ? '/journal/' + target : null });
  }
  assert.equal(requests.length, 0);
});
