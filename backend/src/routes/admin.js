const router = require('express').Router();
const { createAuthClient, supabaseAdmin } = require('../lib/supabase');
const { requireAdmin, isAdmin } = require('../middleware/auth');
const run = require('../lib/async-handler');
router.post('/setup-password', run(async (req, res) => {
  const token = (req.get('Authorization') || '').match(/^Bearer (\S+)$/)?.[1];
  if (!token) return res.status(401).json({ error: 'Open the invitation link from your email.' });
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) return res.status(400).json({ error: 'Use a password between 12 and 128 characters.' });
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user?.email_confirmed_at) return res.status(401).json({ error: 'Invitation expired. Ask your administrator for a new link.' });
  if (!data.user.app_metadata?.password_setup_required) return res.status(409).json({ error: 'Your password setup is already complete. Sign in with your password.' });
  const updated = await supabaseAdmin.auth.admin.updateUserById(data.user.id, { password, app_metadata: { ...data.user.app_metadata, password_setup_required: false } });
  if (updated.error) return res.status(400).json({ error: 'Password could not be set. Check the password requirements and try again.' });
  // Revoke the invitation session and issue a password-authenticated session.
  await supabaseAdmin.auth.admin.signOut(token, 'global');
  const signed = await createAuthClient().auth.signInWithPassword({ email: data.user.email, password });
  if (signed.error) return res.json({ ok: true, signInRequired: true });
  const admin = await isAdmin(signed.data.user);
  res.json({ ok: true, admin, accessToken: signed.data.session.access_token, expiresAt: signed.data.session.expires_at });
}));
router.post('/login', run(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const auth = createAuthClient();
  if (!auth) return res.status(503).json({ error: 'Supabase Auth is not configured' });
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: 'Invalid credentials' });
  if (!(await isAdmin(data.user))) return res.status(403).json({ error: 'Admin access required' });
  res.json({ ok: true, user: { id: data.user.id, email: data.user.email },
    accessToken: data.session.access_token, expiresAt: data.session.expires_at });
}));
router.get('/me', requireAdmin, (req, res) => {
  res.json({ authenticated: true, user: { id: req.user.id, email: req.user.email, role: req.role } });
});
router.post('/logout', requireAdmin, run(async (req, res) => {
  const { error } = await supabaseAdmin.auth.admin.signOut(req.accessToken, 'local');
  if (error) throw error;
  res.json({ ok: true });
}));
module.exports = router;
