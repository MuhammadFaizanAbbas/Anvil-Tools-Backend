const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const site = () => (process.env.SITE_URL || 'https://anviltools.vercel.app').replace(/\/$/, '');

function imageUrl(post) {
  return post.cover_image_id ? `${site()}/journal-images/${post.cover_image_id}` : null;
}

function isPlainHeading(text, index, blocks) {
  const words = text.trim().split(/\s+/);
  return index < blocks.length - 1 && text.length <= 80 && words.length <= 10 && !/[.!?:;]$/.test(text);
}

function renderBody(body) {
  const blocks = String(body || '').trim().split(/\n\s*\n/).filter(Boolean);
  return blocks.map((block, index) => {
    const text = block.trim();
    const heading = text.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4);
      return `<h${level}>${escape(heading[2])}</h${level}>`;
    }
    const lines = text.split(/\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length && lines.every(line => /^[-*]\s+/.test(line))) {
      return `<ul>${lines.map(line => `<li>${escape(line.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    if (lines.length && lines.every(line => /^\d+[.)]\s+/.test(line))) {
      return `<ol>${lines.map(line => `<li>${escape(line.replace(/^\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
    }
    if (lines.length === 1 && isPlainHeading(text, index, blocks)) return `<h2>${escape(text)}</h2>`;
    return `<p>${escape(text).replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

function renderFooter() {
  const base = site();
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
        <li><button type="button" class="privacy-settings" id="privacy-settings" aria-controls="consent-banner" aria-expanded="false">Privacy settings</button></li>
      </ul></div>
    </div>
    <div class="footer-bottom"><span>&copy; <span class="current-year"></span> Anvil Tools. All rights reserved.</span><span>Developed by VelloxTech</span></div>
  </div>
</footer>
<div id="consent-banner" hidden aria-hidden="true" role="region" aria-label="Privacy preferences">
  <div class="consent-heading"><strong>Your privacy, your choice</strong><button type="button" id="consent-close" aria-label="Close privacy preferences">&#215;</button></div>
  <p>Choose your preferences for optional analytics and personalized advertising. Advertising is currently disabled. Read our <a href="${base}/cookie-policy.html">cookie policy</a> and <a href="${base}/privacy-policy.html">privacy policy</a>. You can change your choices from the footer anytime.</p>
  <div class="btn-row"><button type="button" class="btn" id="consent-reject">Reject optional</button><button type="button" class="btn" id="consent-customize" aria-expanded="false" aria-controls="consent-custom-panel">Customize</button><button type="button" class="btn primary" id="consent-accept">Accept optional</button></div>
  <div id="consent-custom-panel" hidden><label><input type="checkbox" id="consent-analytics"> Allow analytics</label><label><input type="checkbox" id="consent-personalized"> Allow personalized advertising</label><button type="button" class="btn" id="consent-save">Save preferences</button></div>
</div>`;
}

function renderArticle(post) {
  const canonical = `${site()}/journal/${encodeURIComponent(post.slug)}`;
  const title = post.seo_title || post.title;
  const description = post.seo_description || post.excerpt;
  const image = imageUrl(post);
  const tags = post.tags || [];
  const ld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description,
    datePublished: post.published_at || undefined, dateModified: post.updated_at || undefined,
    image: image || undefined, mainEntityOfPage: canonical, keywords: tags.join(', ')
  }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} | Anvil Tools</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${escape(canonical)}">
<meta property="og:type" content="article"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(canonical)}">
${image ? `<meta property="og:image" content="${escape(image)}"><meta property="og:image:alt" content="${escape(post.cover_alt || '')}">` : ''}<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<link rel="icon" href="${site()}/assets/images/anvil-mark.svg"><link rel="stylesheet" href="${site()}/assets/css/style.css"><link rel="stylesheet" href="${site()}/assets/css/refinements.css"><link rel="stylesheet" href="${site()}/assets/css/design.css"><script type="application/ld+json">${ld}</script></head>
<body class="public-site article-page"><a class="skip-link" href="#main-content">Skip to article</a>
<header class="site-header"><div class="header-row"><a class="logo" href="${site()}/"><img src="${site()}/assets/images/anvil-mark.svg" width="36" height="36" alt="">Anvil Tools</a><button class="nav-toggle" aria-label="Toggle navigation" aria-expanded="false"><span aria-hidden="true">&#9776;</span></button><nav class="main-nav" aria-label="Main navigation"><a href="${site()}/">Home</a><a href="${site()}/tools/index.html">All tools</a><a aria-current="page" href="${site()}/blog/index.html">Blogs</a><a href="${site()}/about.html">About</a><a href="${site()}/contact.html">Contact</a></nav></div></header>
<main class="wrap" id="main-content"><p class="breadcrumbs"><a href="${site()}/">Home</a> <span aria-hidden="true">/</span> <a href="${site()}/blog/index.html">Blogs</a></p>
<article class="published-article"><header class="article-header"><span class="eyebrow">${escape(post.category_slug || 'Blog')}</span><h1>${escape(post.title)}</h1><p class="lede">${escape(post.excerpt || '')}</p>${post.published_at ? `<p class="article-meta">Published <time datetime="${escape(post.published_at)}">${escape(post.published_at.slice(0, 10))}</time></p>` : ''}</header>
${image ? `<img class="article-cover" src="${escape(image)}" alt="${escape(post.cover_alt || '')}">` : ''}<div class="article-content">${renderBody(post.body)}</div>
${tags.length ? `<div class="article-tags" aria-label="Topics">${tags.map(tag => `<span class="chip">${escape(tag)}</span>`).join('')}</div>` : ''}<a class="article-return" href="${site()}/blog/index.html">&#8592; Back to all blogs</a></article></main>
${renderFooter()}<script src="${site()}/assets/js/cmp.js" defer></script><script src="${site()}/assets/js/ads.js" defer></script><script src="${site()}/assets/js/main.js" defer></script></body></html>`;
}

module.exports = { renderArticle, renderBody, renderFooter, imageUrl, escape, site };
