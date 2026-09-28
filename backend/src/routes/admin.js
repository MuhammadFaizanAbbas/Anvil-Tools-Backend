const router = require('express').Router();
const { createAuthClient, supabaseAdmin } = require('../lib/supabase');
const { requireAdmin, isAdmin } = require('../middleware/auth');
const run = require('../lib/async-handler');
router.post('/login', run(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const auth = createAuthClient();
  if (!auth) return res.status(503).json({ error: 'Supabase Auth is not configured' });
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: 'Invalid credentials' });
  if (!isAdmin(data.user)) return res.status(403).json({ error: 'Admin access required' });
  res.json({ ok: true, user: { id: data.user.id, email: data.user.email },
    accessToken: data.session.access_token, expiresAt: data.session.expires_at });
}));
router.get('/me', requireAdmin, (req, res) => {
  res.json({ authenticated: true, user: { id: req.user.id, email: req.user.email } });
});
router.post('/logout', requireAdmin, run(async (req, res) => {
  const { error } = await supabaseAdmin.auth.admin.signOut(req.accessToken, 'local');
  if (error) throw error;
  res.json({ ok: true });
}));
module.exports = router;
