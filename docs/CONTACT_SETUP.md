# Contact inbox and SMTP setup

> Production project `epxzxcqsonxscyvbopqt` is already migrated. Do not run the numbered migrations, full-schema.sql, seed.sql, or `supabase db push` against it. See [Production integration](PRODUCTION_INTEGRATION.md) for the deployed contract and remaining setup.

1. In Supabase SQL Editor run `supabase/migrations/003_contact_inbox.sql` after migrations 001 and 002. This creates private contact and outbound-email tables plus the atomic submission function. Browser roles cannot read them.
2. In the **backend** Vercel project's Production environment, set `SMTP_HOST`, `SMTP_PORT` (587 or 465), `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM=info@velloxtech.com` (or a sender address authorized by your SMTP provider). Configure SPF/DKIM with your provider for that sender domain. Port 465 uses implicit TLS; 587 requires STARTTLS with certificate verification. Never place SMTP credentials in frontend files or GitHub.
3. Existing backend configuration is still required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_EMAILS`. The shared backend accepts browser calls from new frontend domains without another origin variable. Redeploy after changing environment variables.
4. Open `/contact.html`, submit a real message from an address you control, and verify the alert at `faizan@velloxtech.com` and receipt at your submission address. No real emails were sent by the automated tests.
5. Sign in at `/admin-panel/login.html`, open **Contact inbox**, select the request, and send a reply. Replies use the stored client address; the browser cannot choose an arbitrary recipient. Replies and email delivery records are visible in the conversation. Future email replies received in your mailbox are not imported; inbound email sync is not implemented.

## Persistence and delivery behavior

- Submissions and the alert/receipt jobs commit together before sending. An SMTP failure does not delete the message. The form reports that the message is saved; it does not promise receipt delivery.
- The alert destination is fixed to `faizan@velloxtech.com`. The client receives a plain-text copy of the original message. Email Reply-To is `info@velloxtech.com`. The contact page lists info, faizan, farhan, and nauman at velloxtech.com; only Faizan receives the automatic alert.
- Every outbound job records kind, recipient, body, administrator (for replies), status, attempt count, timestamps, safe error code, and SMTP message ID. Authenticated admins can retry queued or confirmed failed jobs. SMTP_NOT_CONFIGURED means Vercel is missing one or more SMTP environment variables. EAUTH means the SMTP provider rejected credentials.
- `sent` means the SMTP server accepted the email; it does not confirm inbox delivery or track bounces. `unknown` means the connection failed at an ambiguous stage. A job left `sending` can indicate an interrupted request or a failed log update. Check provider logs using its stable `<job UUID@velloxtech.com>` Message-ID before any manual reconciliation; do not blindly resend these jobs.
- A UUID per submission/reply and a database compare-and-set delivery claim prevent duplicate sends on ordinary retries and concurrent clicks. SMTP and the database cannot commit as one transaction; ambiguous outcomes require review. No background scheduler is required: initial sends are awaited during the request; queued/failed deliveries can be retried in admin.
- Public requests are validated, honeypot checked, and limited to five attempts per hour per hashed client IP and per recipient email using the existing atomic rate limiter. Rate-limit rows expire during subsequent limiter calls. No file uploads, arbitrary recipients, or executable email HTML are accepted. Contact records are retained until an operator deletes them; configure a support retention schedule appropriate to your operation. Delete a contact row to cascade-delete its local email jobs; mailbox copies are separate.

## Testing

`tests/contact.test.js` uses mocked Supabase and SMTP to check validation, authorization, rate limits, duplicate submissions/replies, failed delivery, unknown delivery, retries, and persistence failures. Actual SQL execution and SMTP credentials must be checked in your configured environment. SMTP implementation follows https://nodemailer.com/smtp.
