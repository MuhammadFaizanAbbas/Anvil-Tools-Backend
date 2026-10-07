const fs = require('node:fs');
const path = require('node:path');
const { escape } = require('./articles');
const { versionPublicStyles } = require('./public-assets');

const PAGE_SIZE = 30;

function blogPage(value = '1') {
  if (!/^[1-9]\d{0,4}$/.test(String(value))) return null;
  return Number(value) <= 33334 ? Number(value) : null;
}

function renderBlog(posts, siteOrigin, { page = 1, hasNext = false, unavailable = false } = {}) {
  let html = fs.readFileSync(path.join(__dirname, '../templates/blog.html'), 'utf8')
    .replaceAll('https://anviltools.vercel.app', siteOrigin);
  const cards = posts.map(post => `<article class="tool-card">${post.cover_image_id ? `<img class="guide-cover" src="${escape(siteOrigin)}/journal-images/${encodeURIComponent(post.cover_image_id)}" alt="${escape(post.cover_alt || '')}" loading="lazy">` : ''}<h2><a href="/journal/${encodeURIComponent(post.slug)}">${escape(post.title)}</a></h2><p>${escape(post.excerpt || '')}</p><a class="tool-link" href="/journal/${encodeURIComponent(post.slug)}">Read guide &#8594;</a></article>`).join('\n');
  html = html.replace('<!-- published-cards -->', cards)
    .replace('id="publishedGuideCards"', `id="publishedGuideCards" data-server-rendered="${!unavailable}" data-page="${page}" data-has-next="${hasNext}"`)
    .replace('<!-- published-status -->', unavailable ? 'Latest articles are temporarily unavailable. The practical guides below are still available.' : posts.length ? '' : 'No additional articles published yet. Explore the practical guides below.');
  if (!unavailable && posts.length) html = html.replace(/<!-- editorial-library -->[\s\S]*?<!-- \/editorial-library -->/, '');
  const previous = page === 2 ? '/blog/index.html' : `/blog/index.html?page=${page - 1}`;
  const nav = `${page > 1 ? `<a class="btn" id="blogsPrev" href="${previous}" rel="prev">Previous</a>` : ''}<span id="blogsPage">Page ${page}</span>${hasNext ? `<a class="btn" id="blogsNext" href="/blog/index.html?page=${page + 1}" rel="next">Next</a>` : ''}`;
  html = html.replace(/<!-- blog-pagination -->[\s\S]*?<!-- \/blog-pagination -->/, unavailable ? '<nav class="blog-pagination" id="blogPagination" aria-label="Article pages" hidden></nav>' : page > 1 || hasNext ? `<nav class="blog-pagination" id="blogPagination" aria-label="Article pages">${nav}</nav>` : '');
  html = html.replace('<!-- blog-retry -->', unavailable ? '<button class="btn" id="blogsRetry" type="button">Try again</button>' : '');
  if (page > 1) {
    const canonical = `${siteOrigin}/blog/index.html`;
    html = html.replace(`rel="canonical" href="${canonical}"`, `rel="canonical" href="${canonical}?page=${page}"`)
      .replace(`property="og:url" content="${canonical}"`, `property="og:url" content="${canonical}?page=${page}"`);
  }
  return versionPublicStyles(html);
}

module.exports = { PAGE_SIZE, blogPage, renderBlog };
