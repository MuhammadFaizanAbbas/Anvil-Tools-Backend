const { test } = require('node:test');
const assert = require('node:assert/strict');

const cors = require('../backend/src/middleware/cors');
const { parseOrigin, requestSiteOrigin } = require('../backend/src/lib/site-origin');

function request(headers = {}, protocol = 'https') {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return { protocol, get: name => normalized[name.toLowerCase()] };
}

test('site origin follows each frontend without SITE_URL', () => {
  const previous = process.env.SITE_URL;
  delete process.env.SITE_URL;
  try {
    assert.equal(requestSiteOrigin(request({ 'X-Frontend-Origin': 'https://nevco.online/index.html' })), 'https://nevco.online');
    assert.equal(requestSiteOrigin(request({ Origin: 'https://site-two.example' })), 'https://site-two.example');
    assert.equal(requestSiteOrigin(request({ 'X-Forwarded-Host': 'site-three.example', 'X-Forwarded-Proto': 'https' })), 'https://site-three.example');
    assert.equal(requestSiteOrigin(request({ Forwarded: 'for=192.0.2.1;proto=https;host="site-four.example"' })), 'https://site-four.example');
  } finally {
    if (previous === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previous;
  }
});

test('site origins only accept HTTP and HTTPS URLs', () => {
  assert.equal(parseOrigin('javascript:alert(1)'), null);
  assert.equal(parseOrigin('https://user:pass@example.com'), null);
  assert.equal(parseOrigin('https://example.com/path?q=1'), 'https://example.com');
});

test('wildcard CORS permits any frontend without cookies', () => {
  const headers = new Map();
  const res = {
    vary() {},
    set(name, value) { headers.set(name.toLowerCase(), value); },
    sendStatus(status) { this.status = status; },
  };
  let called = false;
  cors({ method: 'GET', get: name => name === 'Origin' ? 'https://new-site.example' : undefined }, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(headers.get('access-control-allow-origin'), '*');
  assert.match(headers.get('access-control-allow-headers'), /X-Frontend-Origin/);
  assert.equal(headers.has('access-control-allow-credentials'), false);
});
