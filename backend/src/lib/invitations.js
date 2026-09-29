const { supabaseAdmin: db } = require('./supabase');
const { transport } = require('./contact-mail');
const { allowedOrigins } = require('../config/env');
const unwrap = result => { if (result.error) throw result.error; return result.data; };
async function invite(email, role, actor, origin, existing) {
  // Validate SMTP before creating a pending account. generateLink never sends mail.
  const smtp = transport();
  const site = origin && allowedOrigins.includes(origin) ? origin : process.env.SITE_URL;
  if (!site || !/^https:\/\//.test(site)) throw Object.assign(new Error('Configure a secure SITE_URL before inviting users.'), { status: 503 });
  const type = existing ? 'recovery' : 'invite';
  const data = unwrap(await db.auth.admin.generateLink({ type, email }));
  const user = data.user;
  unwrap(await db.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, password_setup_required: true } }));
  if (!existing && role === 'admin') unwrap(await db.rpc('change_user_access', { target_id: user.id, new_role: role, enabled: true, actor }));
  const link = new URL('/admin-panel/setup-password.html', site);
  link.hash = new URLSearchParams({ token_hash: data.properties.hashed_token, type }).toString();
  let sent = false;
  try {
    const result = await smtp.sendMail({ from: process.env.SMTP_FROM, to: { address: email }, subject: 'Set up your Anvil Tools account',
      text: `You have been invited to Anvil Tools. Set your password using this single-use link:\n\n${link.href}\n\nIf you did not expect this invitation, ignore it. Do not forward this link.` });
    sent = Boolean(result.accepted?.length);
  } catch (_) { /* Record a safe delivery result below; no token in logs. */ }
  unwrap(await db.from('audit_logs').insert({ actor_id: actor, action: sent ? 'user.invited' : 'user.invite_delivery_failed', target: user.id, details: { role } }));
  if (!sent) throw Object.assign(new Error('Account created with password pending, but invitation delivery was not confirmed. Check SMTP before resending.'), { status: 502 });
  return { ok: true, message: 'Invitation sent. The user must set a password before accessing the workspace.' };
}
module.exports = { invite };
