// Explicit sources required by public tools and the separate administrator UI.
// Inline styles/scripts remain supported; WASM is required by background removal.
const publicSecurityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://epxzxcqsonxscyvbopqt.supabase.co",
    "font-src 'self'",
    "connect-src 'self' https://anvil-tools-backend.vercel.app https://epxzxcqsonxscyvbopqt.supabase.co wss://epxzxcqsonxscyvbopqt.supabase.co https://cdn.jsdelivr.net",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join('; '),
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};
// Start with a week, scoped to each HTTPS host; no subdomain or preload promise.
const hsts = 'max-age=604800';
// The fixed IMG.LY/ONNX CDN bundle also uses dynamic JavaScript execution.
// Permit it only on the image processor page, not on other tools or the admin UI.
const backgroundCsp = publicSecurityHeaders['Content-Security-Policy']
  .replace("'wasm-unsafe-eval'", "'wasm-unsafe-eval' 'unsafe-eval'")
  .replace("connect-src 'self'", "connect-src 'self' blob:");
function securityHeadersForPath(pathname) {
  return /^\/tools\/background-remover\.html\/?$/.test(pathname)
    ? { ...publicSecurityHeaders, 'Content-Security-Policy': backgroundCsp } : publicSecurityHeaders;
}
module.exports = { publicSecurityHeaders, securityHeadersForPath, backgroundCsp, hsts };
