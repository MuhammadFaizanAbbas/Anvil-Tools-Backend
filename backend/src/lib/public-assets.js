// Keep this release version in sync with frontend/public-assets.php.
const PUBLIC_STYLE_VERSION = '20261005-review4';

function versionPublicStyles(html) {
  return html.replace(/(href="[^"]*\bassets\/css\/(?:style|refinements|design|content)\.css)(?:\?[^"]*)?"/g, `$1?v=${PUBLIC_STYLE_VERSION}"`)
    .replace(/(src="[^"]*\bassets\/js\/(?:main|recommendations|site-catalog|tool-directory|tool-examples|tools\/(?:word-counter|temp-mail|qr-code-generator))\.js)(?:\?[^"]*)?"/g, `$1?v=${PUBLIC_STYLE_VERSION}"`);
}

module.exports = { PUBLIC_STYLE_VERSION, versionPublicStyles };
