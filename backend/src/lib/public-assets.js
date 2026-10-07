// Keep this release version in sync with frontend/public-assets.php.
const PUBLIC_STYLE_VERSION = '20261007-guides2';

function versionPublicStyles(html) {
  return html.replace(/(href="[^"]*\bassets\/css\/[^"?]+\.css)(?:\?[^"]*)?"/g, `$1?v=${PUBLIC_STYLE_VERSION}"`)
    .replace(/(src="[^"]*\bassets\/js\/(?!vendor\/)[^"?]+\.js)(?:\?[^"]*)?"/g, `$1?v=${PUBLIC_STYLE_VERSION}"`);
}

module.exports = { PUBLIC_STYLE_VERSION, versionPublicStyles };
