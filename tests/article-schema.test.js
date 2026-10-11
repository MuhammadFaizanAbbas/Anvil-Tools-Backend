const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderArticle } = require('../backend/src/lib/articles');

test('article schema uses the canonical Anvil Tools publisher and 180px logo', () => {
  const origin = 'https://nevco.online';
  const html = renderArticle({ slug: 'schema-check', title: 'Schema check', body: 'Reviewed content.' }, origin);
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const graph = data['@graph'];
  const parent = graph.find(item => item['@id'] === `${origin}/about.html#velloxtech`);
  const publisher = graph.find(item => item['@id'] === `${origin}/#organization`);
  const author = graph.find(item => item.name === 'VelloxTech Editorial Team');
  const article = graph.find(item => item['@type'] === 'BlogPosting');

  assert.equal(parent.name, 'VelloxTech');
  assert.equal(publisher.name, 'Anvil Tools');
  assert.deepEqual(publisher.logo, {
    '@type': 'ImageObject',
    url: `${origin}/assets/images/apple-touch-icon.png`,
    width: 180,
    height: 180,
  });
  assert.equal(publisher.parentOrganization['@id'], parent['@id']);
  assert.equal(author.parentOrganization['@id'], publisher['@id']);
  assert.equal(article.publisher['@id'], publisher['@id']);
  assert.equal(article.author['@id'], author['@id']);
});
