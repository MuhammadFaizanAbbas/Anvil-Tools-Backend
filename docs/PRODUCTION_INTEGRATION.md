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

## Blog and image fixes prepared locally

A later read-only check found 100 articles returned by the public feed. A cover request returned SVG bytes with `Content-Type: image/webp`, confirming the broken-image cause.

- `backend/src/routes/articles.js` now serves the stored image MIME type, with Storage metadata/file-extension fallbacks for legacy records. SVG, PNG, JPEG, WebP, GIF, AVIF, BMP and ICO are supported. SVG responses have a restrictive CSP, and unpublished covers remain private. Admin PNG/JPEG uploads still use the existing WebP optimization.
- `backend/src/routes/content.js` accepts `limit` (1–100) and `offset` for the published feed, with stable ordering.
- `frontend/blog/index.html` and `frontend/assets/js/published-posts.js` show uploaded and existing static guides in one card grid. The feed loads 12 articles at a time, supports retries, and includes published posts with no publication date. The older query-string article page now includes its cover.

Deploy the backend changes first, then the frontend changes. No database migration or article re-upload is required. Regression tests cover actual SVG/PNG/JPEG/WebP responses, draft privacy, pagination beyond 100 records, frontend retries and cover rendering.

## Temporary inbox fix

The production create endpoint returned HTTP 503 while the old mail.tm integration was deployed. The replacement uses Guerrilla Mail and keeps its session token and cookie on the server. A direct provider check created an inbox and returned its welcome message.

- Inbox creation uses `consume_inbox_creation_limit` when available and falls back to production's existing `consume_temp_mail_limit`, so this release does not require a database migration.
- The browser restores an active inbox after reload, checks every 15 seconds, supports manual refresh, and preserves the current inbox if creating a replacement fails.
- Late responses from an abandoned inbox cannot overwrite the new inbox. Expired or mismatched provider sessions are cleared.
- Subjects and senders are decoded for display. Message bodies render as text; HTML scripts and styles are removed server-side and no provider HTML is inserted into the page.

Automated API tests cover provider failure, session privacy, limiter compatibility, malformed responses, expiration, text and HTML messages, and cleanup after storage failure. Headless browser checks cover loading, safe display, switching races, failed replacement, reload, expiry and the mobile layout.
