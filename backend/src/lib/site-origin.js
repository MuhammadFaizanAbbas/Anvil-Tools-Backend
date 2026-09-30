function parseOrigin(value, protocol = 'https') {
  const candidate = String(value || '').split(',')[0].trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate.includes('://') ? candidate : `${protocol}://${candidate}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.origin;
  } catch (_) {
    return null;
  }
}

function forwardedOrigin(header) {
  const first = String(header || '').split(',')[0];
  const host = first.match(/(?:^|;)\s*host=(?:"([^"]+)"|([^;\s]+))/i);
  const proto = first.match(/(?:^|;)\s*proto=(?:"([^"]+)"|([^;\s]+))/i);
  return host ? parseOrigin(host[1] || host[2], proto?.[1] || proto?.[2] || 'https') : null;
}

function requestSiteOrigin(req) {
  const explicit = parseOrigin(req.get('X-Frontend-Origin'));
  if (explicit) return explicit;

  const browser = parseOrigin(req.get('Origin')) || parseOrigin(req.get('Referer'));
  if (browser) return browser;

  const forwarded = forwardedOrigin(req.get('Forwarded'));
  if (forwarded) return forwarded;

  const protocol = String(req.get('X-Forwarded-Proto') || req.protocol || 'https').split(',')[0].trim();
  const proxy = parseOrigin(req.get('X-Forwarded-Host'), protocol);
  if (proxy) return proxy;

  const fallback = parseOrigin(process.env.SITE_URL);
  if (fallback) return fallback;

  return parseOrigin(req.get('Host'), protocol) || 'http://localhost';
}

module.exports = { parseOrigin, requestSiteOrigin };
