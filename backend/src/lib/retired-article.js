const { escape } = require('./editorial-markdown');
const { versionPublicStyles } = require('./public-assets');
function renderUnavailable(siteOrigin, retired = false, options = {}) {
  const title = options.title || (retired ? 'Article retired' : 'Article unavailable');
  const message = options.message || (retired ? 'This article has been removed from the public library.' : 'This article is not available.');
  return versionPublicStyles(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, follow"><title>${escape(title)} | Anvil Tools</title><link rel="stylesheet" href="${escape(siteOrigin)}/assets/css/style.css"><link rel="stylesheet" href="${escape(siteOrigin)}/assets/css/content.css"></head><body class="public-site"><main class="wrap"><h1>${escape(title)}</h1><p>${escape(message)}</p><p><a href="${escape(siteOrigin)}/blog/index.html">Browse the current guides</a></p><p><a href="${escape(siteOrigin)}/tools/index.html">Browse all tools</a></p><p><a href="${escape(siteOrigin)}/">Anvil Tools home</a></p></main></body></html>`);
}
module.exports = { renderUnavailable };
