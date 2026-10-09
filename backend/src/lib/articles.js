const { escape, renderMarkdown } = require('./editorial-markdown');
const { versionPublicStyles } = require('./public-assets');
const exampleImages = require('./editorial-images.json');
const { createHash } = require('node:crypto');
const articleReviews = require('./article-reviews.json');
const coverVersions = require('./editorial-cover-versions.json');

const relatedLabReports = Object.freeze({
  'valid-json-api-errors-types-nulls-structure': ['json-duplicate-keys-unicode-escapes', 'JSON duplicate keys, Unicode, and escaped-character test'],
  'why-html-emails-look-different-plain-text-css-mime': ['html-email-link-encoding', 'Synthetic HTML email link-encoding inspection'],
  'qr-codes-scan-reliably-print-screen-guide': ['qr-capacity-error-correction', 'QR payload density and error-correction preflight'],
  'image-to-pdf-page-size-pixels-points-a4': ['jpeg-png-webp-image-to-pdf', 'JPEG, PNG, and WebP conversion evidence'],
  'simple-pdf-workflow-without-software': ['pdf-merge-page-types-order', 'PDF merge order, page size, and text-layer check'],
  'voiceover-script-length-words-per-minute-video-timing': ['unicode-emoji-rtl-word-count', 'Unicode, emoji, RTL, and combining-character counting'],
});

const categoryLabels = Object.freeze({
  'developer-tools': 'Developer tools',
  'dev-tools': 'Developer tools',
  'email-tools': 'Email tools',
  'image-tools': 'Image tools',
  'pdf-tools': 'PDF tools',
  'text-tools': 'Text tools',
  generators: 'Generators',
});
const months = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);

function categoryLabel(slug) {
  if (!slug) return 'Guide';
  return categoryLabels[slug] || String(slug).split('-').filter(Boolean)
    .map((word, index) => index ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function displayDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!match) return String(value || '');
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${months[month - 1]} ${Number(match[3])}, ${match[1]}` : String(value);
}

function reviewFor(post) {
  const review = articleReviews[post.slug];
  const body = String(post.body || '').replace(/\r\n?/g, '\n').trim();
  return review && review.body_sha256 === createHash('sha256').update(body).digest('hex')
    && review.title === post.title && review.excerpt === post.excerpt ? review : null;
}
function imageUrl(post, siteOrigin) {
  if (/^\/assets\/images\/editorial\/[a-z0-9-]+\.(?:png|webp)$/.test(post.cover_path || '')) return siteOrigin + post.cover_path;
  if (!post.cover_image_id) return null;
  const version = Object.hasOwn(coverVersions, post.cover_image_id) ? coverVersions[post.cover_image_id] : null;
  return `${siteOrigin}/journal-images/${post.cover_image_id}${version ? `?v=${version}` : ''}`;
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
      <div><h3>Tools</h3><ul>
        <li><a href="${base}/tools/temp-mail.html">Temp mail</a></li>
        <li><a href="${base}/tools/background-remover.html">Background remover</a></li>
        <li><a href="${base}/tools/pdf-merge.html">PDF merge</a></li>
        <li><a href="${base}/tools/index.html">View all tools</a></li>
      </ul></div>
      <div><h3>Company</h3><ul>
        <li><a href="${base}/about.html">About</a></li>
        <li><a href="${base}/editorial-policy.html">Editorial policy</a></li>
        <li><a href="${base}/lab/index.html">Anvil Tools Lab</a></li>
        <li><a href="${base}/blog/index.html">Guides &amp; experiments</a></li>
        <li><a href="${base}/contact.html">Contact</a></li>
      </ul></div>
      <div><h3>Legal</h3><ul>
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
  const rawDescription = post.seo_description || post.excerpt || '';
  const description = rawDescription.includes('Anvil Tools') ? rawDescription : `Anvil Tools: ${rawDescription}`;
  const image = imageUrl(post, siteOrigin);
  const imageSize = exampleImages[post.cover_path];
  const imageDimensions = imageSize ? ` width="${imageSize.width}" height="${imageSize.height}"` : '';
  const tags = post.tags || [];
  const rendered = renderMarkdown(post.body, { title: post.title });
  const words = Number.isSafeInteger(post.word_count) && post.word_count >= 0 ? post.word_count : String(post.body || '').trim().split(/\s+/).filter(Boolean).length;
  const review = reviewFor(post);
  const labReport = relatedLabReports[post.slug];
  const publisherId = `${siteOrigin}/about.html#velloxtech`;
  const authorId = `${siteOrigin}/editorial-policy.html#velloxtech-editorial-team`;
  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': publisherId, name: 'VelloxTech', url: `${siteOrigin}/about.html` },
      { '@type': 'Organization', '@id': authorId, name: 'VelloxTech Editorial Team', url: `${siteOrigin}/editorial-policy.html`, parentOrganization: { '@id': publisherId } },
      { '@type': 'BreadcrumbList', '@id': `${canonical}#breadcrumb`, itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteOrigin}/` },
        { '@type': 'ListItem', position: 2, name: 'Guides & experiments', item: `${siteOrigin}/blog/index.html` },
        { '@type': 'ListItem', position: 3, name: post.title, item: canonical },
      ] },
      {
        '@type': 'BlogPosting', '@id': `${canonical}#article`, headline: post.title, description,
        datePublished: post.published_at || undefined, dateModified: review?.reviewed_at || post.updated_at || undefined,
        image: image || undefined, mainEntityOfPage: canonical, keywords: tags.join(', ') || undefined,
        author: { '@id': authorId }, publisher: { '@id': publisherId }, inLanguage: 'en', wordCount: words,
        breadcrumb: { '@id': `${canonical}#breadcrumb` }, url: canonical
      }
    ]
  }).replace(/</g, '\\u003c');
  return versionPublicStyles(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} | Anvil Tools</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${escape(canonical)}">
<meta property="og:type" content="article"><meta property="og:title" content="${escape(title)} | Anvil Tools"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(canonical)}">
${image ? `<meta property="og:image" content="${escape(image)}"><meta property="og:image:alt" content="${escape(post.cover_alt || '')}"><meta name="twitter:image" content="${escape(image)}"><meta name="twitter:image:alt" content="${escape(post.cover_alt || '')}">` : ''}<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}">
<link rel="icon" type="image/png" sizes="48x48" href="${siteOrigin}/assets/images/favicon-48.png">
<link rel="shortcut icon" href="${siteOrigin}/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="${siteOrigin}/assets/images/apple-touch-icon.png"><link rel="stylesheet" href="${siteOrigin}/assets/css/style.css"><link rel="stylesheet" href="${siteOrigin}/assets/css/refinements.css"><link rel="stylesheet" href="${siteOrigin}/assets/css/design.css"><link rel="stylesheet" href="${siteOrigin}/assets/css/content.css"><script type="application/ld+json">${ld}</script></head>
<body class="public-site article-page"><noscript><style>.public-site .nav-toggle{display:none}.public-site .header-row{flex-wrap:wrap}.public-site .main-nav{display:flex;position:static;width:100%;flex-wrap:wrap;flex-direction:row;padding:8px 0;border:0;box-shadow:none}.public-site .main-nav a{width:auto}</style></noscript><a class="skip-link" href="#main-content">Skip to article</a>
<header class="site-header"><div class="header-row"><a class="logo" href="${siteOrigin}/"><img src="${siteOrigin}/assets/images/anvil-mark.svg" width="36" height="36" alt="">Anvil Tools</a><button class="nav-toggle" aria-label="Toggle navigation" aria-expanded="false" aria-controls="main-navigation"><span aria-hidden="true">&#9776;</span></button><nav class="main-nav" id="main-navigation" aria-label="Main navigation"><a href="${siteOrigin}/">Home</a><a href="${siteOrigin}/tools/index.html">All tools</a><a aria-current="page" href="${siteOrigin}/blog/index.html">Guides &amp; experiments</a><a href="${siteOrigin}/about.html">About</a><a href="${siteOrigin}/contact.html">Contact</a></nav></div></header>
<main class="wrap" id="main-content"><p class="breadcrumbs"><a href="${siteOrigin}/">Home</a> <span aria-hidden="true">/</span> <a href="${siteOrigin}/blog/index.html">Guides &amp; experiments</a></p>
<article class="published-article"><header class="article-header"><span class="eyebrow">${escape(categoryLabel(post.category_slug))}</span><h1>${escape(post.title)}</h1><p class="lede">${escape(post.excerpt || '')}</p><p class="article-meta">Written by: <a href="${siteOrigin}/editorial-policy.html#velloxtech-editorial-team" rel="author">VelloxTech Editorial Team</a>${words ? ` · ${Math.max(1, Math.ceil(words / 220))} minute read` : ''}</p>${post.published_at ? `<p class="article-meta">Published <time datetime="${escape(post.published_at)}">${escape(post.published_at.slice(0, 10))}</time>${post.updated_at && post.updated_at.slice(0,10) !== post.published_at.slice(0,10) ? ` · Updated <time datetime="${escape(post.updated_at)}">${escape(post.updated_at.slice(0,10))}</time>` : ''}</p>` : ''}${review ? `<p class="article-meta">Last reviewed: <time datetime="${escape(review.reviewed_at)}">${escape(displayDate(review.reviewed_at))}</time></p>` : ''}<p class="article-meta"><a href="${siteOrigin}/editorial-policy.html">How we test examples and review content</a> · <a href="${siteOrigin}/contact.html">Report an error or suggest a correction</a></p></header>
${image ? `<img class="article-cover" src="${escape(image)}" alt="${escape(post.cover_alt || '')}"${imageDimensions} decoding="async" fetchpriority="high">` : ''}${rendered.toc}<div class="article-content">${rendered.html}</div>
${labReport ? `<aside class="article-lab-evidence" aria-labelledby="related-lab-report"><h2 id="related-lab-report">First-party Lab evidence</h2><p>This guide has a related reproducible test with synthetic fixtures, recorded output, environment details, and explicit limitations: <a href="${siteOrigin}/lab/reports/${labReport[0]}.html">${escape(labReport[1])}</a>.</p></aside>` : ''}
${tags.length ? `<div class="article-tags" aria-label="Topics">${tags.map(tag => `<span class="chip">${escape(tag)}</span>`).join('')}</div>` : ''}<a class="article-return" href="${siteOrigin}/blog/index.html">&#8592; Back to guides &amp; experiments</a></article></main>
${renderFooter(siteOrigin)}<script src="${siteOrigin}/assets/js/main.js" defer></script></body></html>`);
}

module.exports = { renderArticle, renderBody, renderFooter, imageUrl, escape, categoryLabel, displayDate };
