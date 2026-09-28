const { supabaseAdmin } = require('../lib/supabase');
const { adminEmails } = require('../config/env');
const asyncHandler = require('../lib/async-handler');
function isAdmin(user) {
  return Boolean(user?.email && adminEmails.includes(user.email.toLowerCase()));
}
const requireAdmin = asyncHandler(async (req, res, next) => {
  const token = (req.get('Authorization') || '').match(/^Bearer (\S+)$/)?.[1];
  if (!token) return res.status(401).json({ error: 'Missing admin token' });
  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase is not configured' });
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Invalid or expired session' });
  if (!isAdmin(data.user)) return res.status(403).json({ error: 'Admin access required' });
  req.user = data.user;
  req.accessToken = token;
  next();
});
module.exports = { requireAdmin, isAdmin };
