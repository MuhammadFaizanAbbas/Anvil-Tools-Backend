// Read-only production checks. Never prints auth keys or session tokens.
const base = 'https://anvil-tools-backend.vercel.app';
async function get(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  return { response, data };
}
(async () => {
  for (const path of ['/api/health', '/api/tools', '/api/admin/me', '/api/public/posts']) {
    const { response, data } = await get(base + path);
    console.log(JSON.stringify({ path, status: response.status, ...(Array.isArray(data) ? { count: data.length } : { ok: data.ok, databaseConfigured: data.databaseConfigured, error: data.error }) }));
  }
  const { response, data } = await get(base + '/api/auth/config', { Origin: 'https://anviltools.vercel.app' });
  console.log(JSON.stringify({ path: '/api/auth/config', status: response.status, corsOrigin: response.headers.get('access-control-allow-origin'), publicKeyPresent: Boolean(data.anonKey), error: data.error }));
  if (response.ok && data.url === 'https://epxzxcqsonxscyvbopqt.supabase.co' && data.anonKey) {
    const settings = await get(data.url + '/auth/v1/settings', { apikey: data.anonKey });
    console.log(JSON.stringify({ path: '/auth/v1/settings', status: settings.response.status, googleEnabled: settings.data.external?.google, emailEnabled: settings.data.external?.email }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
