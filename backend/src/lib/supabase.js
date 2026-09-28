require('../config/env');
const { createClient } = require('@supabase/supabase-js');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = url && serviceKey ? createClient(url, serviceKey, options) : null;
// Separate login clients keep concurrent requests' sessions independent.
function createAuthClient() {
  return url && anonKey ? createClient(url, anonKey, options) : null;
}
function requireDatabase(req, res, next) {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase is not configured' });
  next();
}
module.exports = { supabaseAdmin, createAuthClient, requireDatabase };
