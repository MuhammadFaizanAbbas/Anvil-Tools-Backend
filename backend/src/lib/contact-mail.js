const nodemailer = require('nodemailer');
const { supabaseAdmin: db } = require('./supabase');
const unwrap = result => { if (result.error) throw result.error; return result.data; };
function transport() {
  const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASS: pass, SMTP_FROM: from } = process.env;
  if (!host || !user || !pass || !from) throw Object.assign(new Error('SMTP not configured'), { code: 'SMTP_NOT_CONFIGURED' });
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({ host, port, secure: port === 465, requireTLS: port !== 465,
    auth: { user, pass }, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true });
}
async function deliver(job) {
  // Compare-and-set claim prevents double clicks and concurrent requests from sending twice.
  const claimed = unwrap(await db.from('contact_mail_jobs').update({ status: 'sending', attempts: job.attempts + 1,
    updated_at: new Date().toISOString(), last_error: null }).eq('id', job.id).eq('status', job.status).select().maybeSingle());
  if (!claimed) return;
  let result;
  try {
    const smtp = transport();
    const info = await smtp.sendMail({ from: process.env.SMTP_FROM, to: { address: job.recipient },
      replyTo: 'info@velloxtech.com', subject: job.subject, text: job.body,
      messageId: `<${job.id}@velloxtech.com>` });
    if (!info.accepted?.length) throw Object.assign(new Error('Recipient rejected'), { code: 'EENVELOPE' });
    result = { status: 'sent', message_id: info.messageId, last_error: null };
  } catch (error) {
    const safeFailures = ['SMTP_NOT_CONFIGURED', 'EAUTH', 'ECONNECTION', 'EDNS', 'EENVELOPE'];
    const certain = safeFailures.includes(error.code) || (error.responseCode >= 400 && error.responseCode <= 599);
    result = { status: certain ? 'failed' : 'unknown', last_error: certain ? (safeFailures.includes(error.code) ? error.code : 'SMTP_REJECTED') : 'DELIVERY_UNCONFIRMED' };
  }
  // If this write fails, leave 'sending' for operator review; never automatically resend.
  unwrap(await db.from('contact_mail_jobs').update({ ...result, updated_at: new Date().toISOString() }).eq('id', job.id));
}
async function deliverInitial(contactId) {
  const jobs = unwrap(await db.from('contact_mail_jobs').select('*').eq('contact_id', contactId).eq('status', 'queued').in('kind', ['alert', 'receipt']));
  await Promise.all(jobs.map(deliver));
}
module.exports = { deliver, deliverInitial, transport };
