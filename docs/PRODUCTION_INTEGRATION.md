# Production integration — 29 September 2026

The website calls the Vercel Express backend, which accesses Supabase with a server-only service-role key. Browser Google sign-in uses Supabase Auth directly; every admin API request verifies the resulting token and role.

## Database history

Project `epxzxcqsonxscyvbopqt` already has a migrated database. **Do not execute full-schema.sql, the numbered migration scripts, seed.sql, the supplied schema export, or supabase db push against this project.**

The live history contains four legacy migrations followed by `20260928201313`, `20260928201441`, and `20260928201504`. Supplied copies of those three migrations and the catalog export are retained under `supabase/reference/2026-09-29/` for review, outside the executable migration directory. The original four legacy migration sources are not supplied; CLI history has not been reconciled. Future production changes need a reviewed incremental migration against this actual history.

Fresh-project SQL now uses `temp_mail_client_limits` for the application limiter. Production retains `temp_mail_rate_limits` with the legacy `ip_hash/count` columns for the old Edge Function. The application calls `consume_temp_mail_limit(client_key)` and never queries either limiter table directly. Production cleanup handles both tables; fresh projects have only the application table. Fresh-project bootstrap and scripts 002/004 reject the archived production schema before replacing these RPCs.

Fresh seeds create empty articles as drafts. The two existing production seeded articles remain published and empty; no production rows were changed. They need editorial content or an explicit unpublish action. Quick-create `/api/posts` now accepts drafts only; publishing uses the full document editor and requires content.

## Domains and Google login

- Vercel backend `FRONTEND_ORIGINS` accepts comma-separated exact origins, for example `https://anviltools.vercel.app,https://newsite.com`. Redeploy after updating it.
- Keep `SITE_URL` as the primary canonical website. Admin invitations return to the allowed browser Origin; server calls without Origin use SITE_URL. Each invitation destination must also be an allowed Supabase Auth redirect URL.
- Add each login page to Supabase Authentication → URL Configuration → Redirect URLs, such as `https://newsite.com/admin-panel/login.html`. Existing frontend PKCE code returns to the domain where login began.
- Enable Google in Supabase Authentication → Sign In / Providers using the Google OAuth web client ID and secret. Google Cloud's authorized redirect URI is `https://epxzxcqsonxscyvbopqt.supabase.co/auth/v1/callback`.
- Set the actual confirmed owner email in Vercel `ADMIN_EMAILS`. Owner recovery access is intentionally derived from this environment variable; it is not automatically persisted as a database owner role. New users default to member.
- Password login remains available. Do not disable Email or public signup settings without checking the intended login/invitation flow.
- Frontend API calls do not require Edge Function CORS configuration. Only configure Edge origins if a browser starts calling those functions directly.

Multiple allowed domains share the same data and administrator access. This is not isolation between independent sites.

## API changes and validation

- Analytics uses the existing atomic limiter with a separate `analytics-ip:` key namespace: five events per IP/hour, across tools. Over-limit requests return 429 and Retry-After; unknown tools return 404. This bounds abuse but does not prove visitor authenticity. Browser tracking remains disabled.
- Article saves reject unknown categories and return 400 for missing foreign-key references rather than a generic server error.
- No runtime changes or retirement were applied to the old temp-mail Edge Function. The local frontend uses `/api/temp-mail/*` on Vercel. Other possible callers of that function have not been inventoried.

Run `npm test` locally. `node scripts/check-live-integration.js` performs read-only production checks and suppresses public key values. Tests use mocked services; they do not send mail or modify Supabase.

Read-only checks before deployment found: health 200 with databaseConfigured=true; tools 200 with 12 records; unauthenticated admin/me 401; public posts 200 with two records; auth/config 200 with the expected website CORS header. Supabase Auth settings returned **external.google=false** and external.email=true. Adding redirect URLs alone has not enabled Google. Owner login, member rejection with a real session, SMTP, and media upload still need end-to-end verification.

The supplied rollback remains in Downloads and was not executed or added to the migration path. The stronger guard is not a reason to roll back this deployment.
