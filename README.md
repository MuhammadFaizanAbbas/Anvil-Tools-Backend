# Anvil Tools API

Deploy this repository root to Vercel as Express, with default build/output settings.

Configure SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAILS, and FRONTEND_ORIGINS=https://anviltools.vercel.app in Vercel Production. Redeploy after setting them. Never commit secrets.

Apply supabase/migrations in numeric order, then supabase/seed.sql. Create an authorized Supabase Auth user matching ADMIN_EMAILS.

Check /api/health (databaseConfigured must be true), then /api/tools. The API root / intentionally returns JSON 404. Frontend: https://anviltools.vercel.app.

The public frontend and admin redesign is deployed from Anvil-Tools. API responses now carry X-Robots-Tag: noindex, nofollow so search engines use public tool pages rather than API endpoints. Privacy preferences and disabled ad inventory are managed by the frontend; no advertising scripts are served by this API.

## Contact requests and SMTP

The API now saves support requests, logs alert/receipt jobs, sends SMTP email, and supports authenticated admin replies and retries. Run migration 003 and configure SMTP as described in [docs/CONTACT_SETUP.md](docs/CONTACT_SETUP.md). Contact alert recipient: faizan@velloxtech.com. Receipt and replies go to the submitted email. Tests use mocked SMTP and send no real email.

## Google sign-in and workspace roles

Run migration 004 for existing databases, or full-schema.sql for a fresh Supabase project. See [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) for Google OAuth, member/admin/owner access, article revisions, private storage foundations, and the three optional Edge Functions. The server checks database roles on every admin request and reserves verified ADMIN_EMAILS accounts as protected recovery owners.
