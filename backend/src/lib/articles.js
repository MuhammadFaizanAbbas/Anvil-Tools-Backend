const { escape, renderMarkdown } = require('./editorial-markdown');
function imageUrl(post, siteOrigin) {
  return post.cover_image_id ? `${siteOrigin}/journal-images/${post.cover_image_id}` : null;
}

function renderBody(body) {
  return renderMarkdown(body).html;
}

function renderFooter(siteOrigin) {
  const base = siteOrigin;
  return `<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <div class="logo" style="margin-bottom:10px;"><img class="brand-mark" src="${base}/assets/images/anvil-mark.svg" width="36" height="36" alt="">Anvil Tools</div>
        <p class="small-note">Free, browser-based tools for email, images, PDFs, and everyday developer tasks. No installs, no accounts required for most tools.</p>
      </div>
      <div><h4>Tools</h4><ul>
        <li><a href="${base}/tools/temp-mail.html">Temp mail</a></li>
        <li><a href="${base}/tools/background-remover.html">Background remover</a></li>
        <li><a href="${base}/tools/pdf-merge.html">PDF merge</a></li>
        <li><a href="${base}/tools/index.html">View all tools</a></li>
      </ul></div>
      <div><h4>Company</h4><ul>
        <li><a href="${base}/about.html">About</a></li>
        <li><a href="${base}/blog/index.html">Blogs</a></li>
        <li><a href="${base}/contact.html">Contact</a></li>
      </ul></div>
      <div><h4>Legal</h4><ul>
        <li><a href="${base}/privacy-policy.html">Privacy policy</a></li>
        <li><a href="${base}/terms-of-service.html">Terms of service</a></li>
        <li><a href="${base}/cookie-policy.html">Cookie policy</a></li>
        <li><a href="${base}/disclaimer.html">Disclaimer</a></li>

      </ul></div>
    </div>
    <div class="footer-bottom"><span>&copy; <span class="current-year">${new Date().getUTCFullYear()}</span> Anvil Tools. All rights reserved.</span><span>Anvil Tools is a VelloxTech project.</span></div>
  </div>
</footer>
`;
}

function renderArticle(post, siteOrigin) {
  const canonical = `${siteOrigin}/journal/${encodeURIComponent(post.slug)}`;
  const title = post.seo_title || post.title;
  const description = post.seo_description || post.excerpt;
  const image = imageUrl(post, siteOrigin);
  const tags = post.tags || [];
  const rendered = renderMarkdown(post.body, { title: post.title });
  const words = Number.isSafeInteger(post.word_count) && post.word_count >= 0 ? post.word_count : String(post.body || '').trim().split(/\s+/).filter(Boolean).length;
  const organization = { '@type': 'Organization', name: 'Anvil Tools', url: `${siteOrigin}/about.html` };
  const ld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description,
    datePublished: post.published_at || undefined, dateModified: post.updated_at || undefined,
    image: image || undefined, mainEntityOfPage: canonical, keywords: tags.join(', '),
    author: organization, publisher: organization, inLanguage: 'en', wordCount: words,
    url: canonical
  }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} | Anvil Tools</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${escape(canonical)}">
<meta property="og:type" content="article"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(canonical)}">
${image ? `<meta property="og:image" content="${escape(image)}"><meta property="og:image:alt" content="${escape(post.cover_alt || '')}"><meta name="twitter:image" content="${escape(image)}"><meta name="twitter:image:alt" content="${escape(post.cover_alt || '')}">` : ''}<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}">
<link rel="icon" href="${siteOrigin}/assets/images/anvil-mark.svg"><link rel="stylesheet" href="${siteOrigin}/assets/css/style.css"><link rel="stylesheet" href="${siteOrigin}/assets/css/refinements.css"><link rel="stylesheet" href="${siteOrigin}/assets/css/design.css"><link rel="stylesheet" href="${siteOrigin}/assets/css/content.css"><script type="application/ld+json">${ld}</script></head>
<body class="public-site article-page"><noscript><style>.public-site .nav-toggle{display:none}.public-site .header-row{flex-wrap:wrap}.public-site .main-nav{display:flex;position:static;width:100%;flex-wrap:wrap;flex-direction:row;padding:8px 0;border:0;box-shadow:none}.public-site .main-nav a{width:auto}</style></noscript><a class="skip-link" href="#main-content">Skip to article</a>
<header class="site-header"><div class="header-row"><a class="logo" href="${siteOrigin}/"><img src="${siteOrigin}/assets/images/anvil-mark.svg" width="36" height="36" alt="">Anvil Tools</a><button class="nav-toggle" aria-label="Toggle navigation" aria-expanded="false"><span aria-hidden="true">&#9776;</span></button><nav class="main-nav" aria-label="Main navigation"><a href="${siteOrigin}/">Home</a><a href="${siteOrigin}/tools/index.html">All tools</a><a aria-current="page" href="${siteOrigin}/blog/index.html">Blogs</a><a href="${siteOrigin}/about.html">About</a><a href="${siteOrigin}/contact.html">Contact</a></nav></div></header>
<main class="wrap" id="main-content"><p class="breadcrumbs"><a href="${siteOrigin}/">Home</a> <span aria-hidden="true">/</span> <a href="${siteOrigin}/blog/index.html">Blogs</a></p>
<article class="published-article"><header class="article-header"><span class="eyebrow">${escape(post.category_slug || 'Blog')}</span><h1>${escape(post.title)}</h1><p class="lede">${escape(post.excerpt || '')}</p><p class="article-meta">By <a href="${siteOrigin}/about.html" rel="author">Anvil Tools</a>${words ? ` · ${Math.max(1, Math.ceil(words / 220))} minute read` : ''}</p>${post.published_at ? `<p class="article-meta">Published <time datetime="${escape(post.published_at)}">${escape(post.published_at.slice(0, 10))}</time>${post.updated_at && post.updated_at.slice(0,10) !== post.published_at.slice(0,10) ? ` · Updated <time datetime="${escape(post.updated_at)}">${escape(post.updated_at.slice(0,10))}</time>` : ''}</p>` : ''}</header>
${image ? `<img class="article-cover" src="${escape(image)}" alt="${escape(post.cover_alt || '')}" decoding="async" fetchpriority="high">` : ''}${rendered.toc}<div class="article-content">${rendered.html}</div>
${tags.length ? `<div class="article-tags" aria-label="Topics">${tags.map(tag => `<span class="chip">${escape(tag)}</span>`).join('')}</div>` : ''}<a class="article-return" href="${siteOrigin}/blog/index.html">&#8592; Back to all blogs</a></article></main>
${renderFooter(siteOrigin)}<script src="${siteOrigin}/assets/js/main.js" defer></script></body></html>`;
}

module.exports = { renderArticle, renderBody, renderFooter, imageUrl, escape };
