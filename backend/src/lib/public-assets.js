// Change this version when shipping updated public styles.
const PUBLIC_STYLE_VERSION = '20261004-css';

function versionPublicStyles(html) {
  return html.replace(/(href="[^"]*\bassets\/css\/(?:style|refinements|design|content)\.css)(?:\?[^"]*)?"/g, `$1?v=${PUBLIC_STYLE_VERSION}"`);
}

module.exports = { PUBLIC_STYLE_VERSION, versionPublicStyles };
