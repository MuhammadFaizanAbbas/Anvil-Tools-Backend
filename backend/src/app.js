require('./config/env');
const express = require('express');
const { supabaseAdmin, requireDatabase } = require('./lib/supabase');
const app = express();
app.disable('x-powered-by');
// API responses are not public search landing pages.
app.use((req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });
app.use(require('./middleware/cors'));
app.use(express.json({ limit: '2mb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'anvil-api', databaseConfigured: Boolean(supabaseAdmin) }));
app.use('/api', requireDatabase);
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/content'));
app.use('/api', require('./routes/contact'));
app.use('/api/temp-mail', require('./routes/temp-mail'));
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((error, req, res, next) => {
  console.error(error.message);
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  res.status(status).json({ error: status < 500 ? error.message : 'Request failed. Check server configuration and logs.' });
});
module.exports = app;
