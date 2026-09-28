# Supabase workspace setup

## 1. Database

For a NEW Supabase project, run **supabase/full-schema.sql** once in the SQL Editor. It includes migrations 001–005 and the starter catalog in one transaction.

For an EXISTING installation, run only missing files in **supabase/migrations/** in numeric order; do not replace your existing database. Migration 004 backfills existing Auth users with member profiles and preserves existing posts/tools/contact records.

Tables cover tool catalog/counters; complete blog articles with SEO fields, categories and revisions; user profiles and roles; contact requests and SMTP job logs; audit events; daily aggregate analytics; site settings; page drafts; media metadata; temporary inbox capabilities; and shared rate limiting. The editor accepts JPEG/PNG/WebP uploads up to 3 MB and 24 megapixels. The server decodes images, removes metadata, and resizes them to at most 2000 pixels as WebP. Images are stored in the private editorial-media bucket; the media library uses temporary signed previews. Only covers attached to published posts are served publicly. Migration 005 adds cover references, alt text, tags, and image dimensions. A generic legal-page editor is not included.

Browser database roles cannot edit privileges or private records. Every admin API request verifies the Auth token and reads the role. User-supplied metadata never sets access. Profiles start as member. Members may authenticate but cannot open the admin workspace. Admins can invite users and grant/revoke admin access. Owners and self-access changes are protected. Disabling a profile stops admin API access immediately; it does not delete the Auth account.

Set **ADMIN_EMAILS** in the Vercel backend to the real owner's Google account email (comma separated if needed). This is the owner recovery allowlist; it overrides profile roles and is not editable in the dashboard. Remove an email from the environment to revoke that recovery access. Never add untrusted addresses. Keep email confirmation enabled in Supabase Auth.

## 2. Backend Vercel environment

Required: SUPABASE_URL, SUPABASE_ANON_KEY (the public anon/publishable key), SUPABASE_SERVICE_ROLE_KEY (server secret), ADMIN_EMAILS, FRONTEND_ORIGINS=https://anviltools.vercel.app, SITE_URL=https://anviltools.vercel.app.

Gmail delivery settings:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=abbasf323@gmail.com
SMTP_PASS=<Google app password, stored only in Vercel>
SMTP_FROM=abbasf323@gmail.com
```

The Gmail account is the sender; faizan@velloxtech.com remains the alert recipient. Do not use a VelloxTech From address unless it is an authorized Gmail sending alias. Replies direct recipients to info@velloxtech.com. See CONTACT_SETUP.md for email logging and migration 003. Redeploy after changes. SMTP credentials are never frontend variables.

## 3. Google sign-in

1. Create a Google Cloud OAuth Web application. Add https://anviltools.vercel.app as an authorized JavaScript origin.
2. Add the Supabase callback URL shown in **Authentication → Sign In / Providers → Google**, normally https://PROJECT_REF.supabase.co/auth/v1/callback, as the Google authorized redirect URI.
3. Enable Google in Supabase and enter the Google client ID and client secret there. Do not put the Google secret in frontend files.
4. In Supabase Authentication URL configuration, set Site URL to https://anviltools.vercel.app. Add https://anviltools.vercel.app/admin-panel/login.html to allowed redirect URLs. For local testing add http://localhost:8080/admin-panel/login.html explicitly.
5. Sign in with the owner email listed in ADMIN_EMAILS. The login uses the vendored Supabase JS SDK (2.117.2) and PKCE, then the backend independently authorizes the resulting token. Existing email/password login still works. Sessions expire; sign in again on expiry.
6. In Team & access, invite people or change access for existing profiles. Google sign-ins automatically create member profiles. The invite email and Google email must match. Supabase's invitation emails use **Supabase Auth's SMTP settings**, not Vercel's SMTP variables: configure Custom SMTP in Supabase Auth separately using the same provider if desired. Supabase may otherwise apply its built-in email restrictions. Inviting an existing account may fail; manage its existing row instead. Invited members cannot enter admin until granted admin access.

## 4. Edge Functions

Sources are in supabase/functions. Install/authenticate the Supabase CLI, link your project, and deploy:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy workspace-api
supabase functions deploy published-posts
supabase functions deploy maintenance
```

The supplied supabase/config.toml disables the gateway JWT check per function, because the private functions validate the bearer token themselves with Auth getUser and check the database role. **Never remove those checks.** published-posts is deliberately public and returns published article fields only.

In Edge Function secrets set FRONTEND_ORIGINS=https://anviltools.vercel.app, BACKEND_URL=https://anvil-tools-backend.vercel.app, and ADMIN_EMAILS matching the backend. Supabase supplies SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Edge environment; do not expose the latter. Edge Functions do not require Gmail credentials; SMTP stays on Vercel.

- **workspace-api**: optional authenticated gateway. Call `/functions/v1/workspace-api?path=/api/admin/users` with `Authorization: Bearer <user access token>`. It forwards only approved admin paths to Vercel; both layers check access. The current frontend calls Vercel directly until you choose to use this gateway.
- **published-posts**: GET `/functions/v1/published-posts` or `?slug=article-slug`; drafts and private author data are never returned. The frontend also has equivalent Vercel public article endpoints.
- **maintenance**: POST with an authorized admin access token. Cleans expired database mailbox capabilities and rate limits, and records an audit entry. It does not delete provider mailboxes or email/contact history. No scheduled job is enabled automatically.

## 5. Publishing and panels

Overview, Tool library, Content, Analytics, Contact inbox, Team & access, Categories, Audit log, and Settings each have their own panel. Content supports full plain-text articles, cover uploads and a reusable media library, required cover alt text for publishing, up to 12 tags, category selection, excerpt, SEO fields with a live search preview, draft/published state, revision history, and loading an earlier revision into the editor for an explicit save. Use blank lines for paragraphs. HTML is rendered as text.

New published articles appear under Latest from the workspace on the Guides page and open at `/journal/slug`. Vercel rewrites serve complete HTML from the API, including SEO title/description, canonical URL, Open Graph cover, Twitter card, and BlogPosting structured data. The dynamic `/journal-sitemap.xml` is listed in robots.txt. Existing static guides remain intact. Search indexing is controlled by search engines. For another frontend host, configure equivalent reverse-proxy routes as described in DEPLOYMENT.md. Tool catalog edits remain database edits and do not rewrite the static public tool pages.

Daily analytics contain events received by `/api/analytics/event`, not fabricated visitors. Automatic browser tracking remains disabled. Site settings are displayed read-only; advertising remains disabled. No live project configuration, Google console changes, SQL execution, or Edge deployment is performed without your project connection.

Official references: https://supabase.com/docs/guides/auth/social-login/auth-google and https://supabase.com/docs/guides/functions/auth .
