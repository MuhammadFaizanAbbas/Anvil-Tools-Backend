const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderMarkdown, inline } = require('../backend/src/lib/editorial-markdown');
const { renderArticle } = require('../backend/src/lib/articles');

test('long guides have one title, unique anchors, and a working HTML outline', () => {
  const body = '# Guide title\n\nIntroduction.\n\n# First step\n\nRead this.\n\n## Check\n\nOne.\n\n## Check\n\nTwo.\n\n# Finish\n\nDone.';
  const rendered = renderMarkdown(body, { title: 'Guide title' });
  assert.equal(rendered.headings.length, 4);
  assert.match(rendered.html, /id="check-2"/);
  for (const heading of rendered.headings) assert.ok(rendered.toc.includes(`href="#${heading.id}"`));
  const html = renderArticle({ slug: 'guide', title: 'Guide title', body }, 'https://example.test');
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /By <a[^>]+rel="author">Anvil Tools/);
  assert.doesNotMatch(html, /<h2[^>]*>Guide title/);
});

test('markup preserves code and supports accessible tables without JavaScript', () => {
  const body = '# Example\n\nUse **bold** and `JSON.parse` with [the formatter](/tools/json-formatter.html).\n\n```json\n{"markup":"<script>"}\n\n{}\n```\n\n| Input | Result |\n| --- | --- |\n| `null` | A value |';
  const html = renderMarkdown(body).html;
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /href="\/tools\/json-formatter.html"/);
  assert.match(html, /<pre><code class="language-json">/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<th scope="col">Input<\/th>/);
  assert.match(html, /tabindex="0" role="region"/);
});

test('raw HTML and unsafe link destinations cannot execute', () => {
  for (const text of ['[x](javascript:alert%281%29)', '[x](data:text/html,abc)', '[x](//evil.example)', '[x](/\\evil.example)', '<img src=x onerror=alert(1)>']) {
    assert.doesNotMatch(inline(text), /<a |<img /);
  }
  assert.match(inline('[Reference](https://example.test/a?x=1&y=2)'), /href="https:\/\/example.test\/a\?x=1&amp;y=2"/);
  assert.match(inline('`<b>**literal**</b>`'), /<code>&lt;b&gt;\*\*literal\*\*&lt;\/b&gt;<\/code>/);
});

test('legacy plain headings remain readable and incomplete fences stay escaped', () => {
  assert.match(renderMarkdown('Keep filenames useful\n\nA descriptive filename helps.').html, /<h2 id="keep-filenames-useful">/);
  assert.match(renderMarkdown('```html\n<img src=x>').html, /&lt;img src=x&gt;<\/code><\/pre>/);
});

test('article examples allow local raster images and escape captions and unsafe sources', () => {
  const html = renderMarkdown('![Before <and> after](/assets/images/editorial/example.png)').html;
  assert.match(html, /<figure class="article-example"><img src="\/assets\/images\/editorial\/example.png"/);
  assert.match(html, /alt="Before &lt;and&gt; after"/);
  assert.match(html, /<figcaption>Before &lt;and&gt; after<\/figcaption>/);
  for (const source of ['https://example.test/tracker.png', '//example.test/x.png', '/assets/images/../x.png', '/assets/images/%2e%2e/x.png', '/assets/images/x.svg', 'javascript:alert%281%29']) {
    assert.doesNotMatch(renderMarkdown(`![Unsafe](${source})`).html, /<img |<a /);
  }
  assert.doesNotMatch(renderMarkdown('```\n![Example](/assets/images/example.png)\n```').html, /<img /);
});
