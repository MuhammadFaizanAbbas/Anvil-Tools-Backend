require('./config/env');
const express = require('express');
const { supabaseAdmin, requireDatabase } = require('./lib/supabase');
const app = express();
app.disable('x-powered-by');
app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next();});
// API responses are not public search landing pages.
app.use((req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });
app.use(require('./middleware/cors'));
app.use(express.json({ limit: '2mb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'anvil-api', databaseConfigured: Boolean(supabaseAdmin) }));
app.get('/api/auth/config', (req, res) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return res.status(503).json({ error: 'Administrator sign-in is not configured.' });
  const key = process.env.SUPABASE_ANON_KEY;
  if (key === process.env.SUPABASE_SERVICE_ROLE_KEY || key.startsWith('sb_secret_')) return res.status(503).json({ error: 'Public auth key is misconfigured.' });
  try { if (JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString()).role === 'service_role') return res.status(503).json({ error: 'Public auth key is misconfigured.' }); } catch (_) { /* Publishable keys are not JWTs. */ }
  res.json({ url: process.env.SUPABASE_URL, anonKey: key });
});
app.use('/api', requireDatabase);
app.use('/api/admin/media', require('./routes/media'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin', require('./routes/workspace'));
app.use('/api', require('./routes/content'));
app.use('/api/public', require('./routes/articles'));
app.use('/api/public', require('./routes/experiment-assets'));
app.use('/api', require('./routes/contact'));
app.use('/api/temp-mail', require('./routes/temp-mail'));
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((error, req, res, next) => {
  console.error(error.message);
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  res.status(status).json({ error: status < 500 ? error.message : 'Request failed. Check server configuration and logs.' });
});
module.exports = app;
