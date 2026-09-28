const router = require('express').Router();
const crypto = require('node:crypto');
const { supabaseAdmin: db } = require('../lib/supabase');
const { requireAdmin } = require('../middleware/auth');
const { deliver, deliverInitial } = require('../lib/contact-mail');
const run = require('../lib/async-handler');
const unwrap = result => { if (result.error) throw result.error; return result.data; };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const line = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\r\n\x00]/.test(value);
router.post('/contact', run(async (req, res) => {
  const { id, name, email, subject, message, website } = req.body || {};
  if (website) return res.status(400).json({ error: 'Please leave the website field empty.' });
  if (!uuid(id) || !line(name, 100) || !line(subject, 160) || !line(email, 254) ||
      !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i.test(email) ||
      typeof message !== 'string' || message.trim().length < 10 || message.length > 5000 || message.includes('\0')) {
    return res.status(400).json({ error: 'Enter a valid name, email, subject, and message (10–5000 characters).' });
  }
  const ip = process.env.VERCEL ? req.get('x-vercel-forwarded-for') : req.socket.remoteAddress;
  if (!ip) return res.status(503).json({ error: 'Unable to verify this request. Please email info@velloxtech.com.' });
  for (const identity of [`contact-ip:${ip}`, `contact-email:${email.toLowerCase()}`]) {
    const key = crypto.createHash('sha256').update(identity).digest('hex');
    const limit = unwrap(await db.rpc('consume_temp_mail_limit', { client_key: key }));
    if (!limit.allowed) return res.status(429).set('Retry-After', String(limit.resetIn)).json({ error: 'Too many messages. Please try again later.' });
  }
  const created = unwrap(await db.rpc('create_contact_request', { request_id: id, sender_name: name.trim(),
    sender_email: email.toLowerCase(), contact_subject: subject.trim(), contact_message: message.trim() }));
  // Persistence is the success boundary; failed email never discards a contact request.
  if (created) {
    try { await deliverInitial(id); } catch (_) { console.error('Contact delivery log requires review'); }
  }
  res.status(202).json({ ok: true, reference: id, message: 'Your message is saved. A receipt will be emailed when delivery is available.' });
}));
router.get('/admin/contacts', requireAdmin, run(async (req, res) => {
  const offset = Math.max(0, Math.min(100000, parseInt(req.query.offset, 10) || 0));
  const result = await db.from('contact_requests').select('id,name,email,subject,created_at', { count: 'exact' })
    .order('created_at', { ascending: false }).range(offset, offset + 24);
  res.json({ items: unwrap(result), total: result.count, offset });
}));
router.get('/admin/contacts/:id', requireAdmin, run(async (req, res) => {
  if (!uuid(req.params.id)) return res.status(400).json({ error: 'Invalid reference' });
  const contact = unwrap(await db.from('contact_requests').select('*').eq('id', req.params.id).maybeSingle());
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  const jobs = unwrap(await db.from('contact_mail_jobs').select('*').eq('contact_id', contact.id).order('created_at'));
  res.json({ contact, jobs });
}));
router.post('/admin/contacts/:id/replies', requireAdmin, run(async (req, res) => {
  const { id, message } = req.body || {};
  if (!uuid(id) || !uuid(req.params.id) || typeof message !== 'string' || !message.trim() || message.length > 5000) return res.status(400).json({ error: 'Enter a reply of 1–5000 characters.' });
  const contact = unwrap(await db.from('contact_requests').select('*').eq('id', req.params.id).maybeSingle());
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  const result = await db.from('contact_mail_jobs').insert({ id, contact_id: contact.id, kind: 'reply', recipient: contact.email,
    subject: `Re: ${contact.subject}`, body: `${message.trim()}\n\nVelloxTech\nReference: ${contact.id}`, created_by: req.user.email }).select().single();
  if (result.error?.code === '23505') return res.status(200).json({ ok: true, message: 'Reply already recorded. Check its delivery status.' });
  await deliver(unwrap(result));
  res.json({ ok: true, message: 'Reply recorded. Check its delivery status below.' });
}));
router.post('/admin/contact-jobs/:id/retry', requireAdmin, run(async (req, res) => {
  if (!uuid(req.params.id)) return res.status(400).json({ error: 'Invalid job' });
  const job = unwrap(await db.from('contact_mail_jobs').select('*').eq('id', req.params.id).maybeSingle());
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!['queued', 'failed'].includes(job.status)) return res.status(409).json({ error: 'Only queued or confirmed failed jobs can be retried. Check SMTP logs for unconfirmed deliveries.' });
  await deliver(job);
  res.json({ ok: true });
}));
module.exports = router;
