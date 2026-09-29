# Anvil Tools – Integration Handoff for Codex
Prepared 29 Sep 2026 from read-only inspection. **No production records were modified, no email sent, nothing deployed or rolled back during this handoff.**
Secrets policy: this file contains variable *names* only. No keys, OAuth secrets, tokens, passwords or SMTP credentials.

Architecture (unchanged): `Frontend (Vercel) → Vercel Express backend → Supabase (service role)`. Supabase Auth (Google) issues user sessions in the browser; the backend verifies every token server-side. Edge Functions are optional side doors.

| Item | Value |
|---|---|
| Frontend | https://anviltools.vercel.app · repo `MuhammadFaizanAbbas/Anvil-Tools` |
| Backend | https://anvil-tools-backend.vercel.app · repo `MuhammadFaizanAbbas/Anvil-Tools-Backend`, default branch `main`, 6 commits |
| Supabase project | `epxzxcqsonxscyvbopqt` (us-east-1, Postgres 17, ACTIVE_HEALTHY) |
| Supabase API base | `https://epxzxcqsonxscyvbopqt.supabase.co` |
| Google callback URI (for Google Cloud) | `https://epxzxcqsonxscyvbopqt.supabase.co/auth/v1/callback` |

## 0. Access limitations (read first)
| Area | What I could do | What I could NOT do |
|---|---|---|
| Supabase DB, Edge Function listing/source, migrations, advisors | Full read access via connector; ran catalog queries | — |
| Supabase **Auth settings** (Google provider, credentials, Site URL, redirect URLs) | Nothing | Not exposed by the connector. Only indirect evidence: `auth.users`=0, `auth.identities`=0 |
| Supabase **Edge Function secrets** | Nothing | Cannot list secrets. Names derived from source code |
| Vercel (project settings, env vars, Root Directory, build settings, logs) | Fetched `GET /api/health` and the frontend home page | No dashboard/API access. `/api/tools` and other routes could not be fetched (tool only opens URLs already seen) |
| GitHub | Fetched the backend repo landing page (branch, root file list, README). | Blocked (robots) for tree/blob pages; **cannot read repo file contents**, so the endpoint table in §4 comes from the `backend/src/` copy inside your ZIP. **Codex must diff it against `main`.** |
| Frontend repo | Home page HTML only | Frontend code (login page, `config.js`, rewrites) not inspected |

## 1. Database
Deliverable: `schema/anvil-schema-only.sql` (generated from the live catalog; reference only, do **not** run on live).

### 1.1 Inventory (verified against live catalog)
`public` (15 tables, RLS enabled on all): `tools`, `categories`, `profiles`, `media_assets`, `posts`, `post_revisions`, `audit_logs`, `site_settings`, `site_pages`, `analytics_daily`, `contact_requests`, `contact_mail_jobs`, `temp_mail_sessions`, `temp_mail_rate_limits`, `temp_mail_client_limits`.
`legacy_archive` (sealed, 7 tables + 2 functions): `tools`, `categories`, `profiles`, `blog_posts`, `contact_messages`, `analytics_events`, `consent_stats`, `is_site_admin()`, `set_updated_at()`.
Row counts now: tools 12, categories 6, posts 4 (2 published, 2 draft), site_settings 2, audit_logs 1, everything else 0. `auth.users` 0.

**Grants (verified with `has_table_privilege`)**: `anon` – nothing anywhere. `authenticated` – `SELECT` on `public.profiles` only (policy `own_profile`: `id = auth.uid()`). `service_role` – ALL on `public.*`, nothing on `legacy_archive` (no schema USAGE). Only 3 policies exist in public (`own_profile`, and deny-all `rate_limit_no_client_access` / `temp_mail_no_access`); other tables are "RLS on, no policy" = browser roles denied. Security advisor: 12 INFO for that (intended), 1 WARN on archived `legacy_archive.set_updated_at` (mutable search_path; not executable by any API role).

### 1.2 RPCs (exact signatures; EXECUTE = `service_role` only; anon/authenticated verified denied)
| Function | Params → return | Notes |
|---|---|---|
| `record_tool_view` | `(tool_identifier text)` → void | bumps `tools.views` + `analytics_daily` (matches slug OR name) |
| `consume_temp_mail_limit` | `(client_key text)` → jsonb `{allowed, remaining, resetIn}` | 5/hour per key; table `temp_mail_client_limits`; also used by contact form |
| `create_contact_request` | `(request_id uuid, sender_name text, sender_email text, contact_subject text, contact_message text)` → boolean | inserts request + `alert` + `receipt` jobs atomically; `false` = duplicate id. **Alert recipient `faizan@velloxtech.com` and admin URL are hard-coded in SQL** |
| `save_post_document` | `(document jsonb, actor uuid)` → jsonb | upsert post, revision row, audit row; sets `published_at` first time published, nulls it on draft |
| `change_user_access` | `(target_id uuid, new_role text, enabled boolean, actor uuid)` → void | roles `member`/`admin` only; refuses self and `owner`; audit row |
| `cleanup_expired_state` | `()` → jsonb `{expired_sessions, expired_rate_limits}` | cleans sessions + BOTH limiter tables (custom change) |
| `sync_auth_profile` | trigger fn, SECURITY DEFINER | see §3.4 |

### 1.3 Differences: deployed DB vs repository SQL
| Topic | Repo (`supabase/migrations/001–005`, `full-schema.sql`, README/docs) | Live |
|---|---|---|
| Migration history | Instructions: apply 001→005 (or `full-schema.sql` for new projects) | History = 4 **legacy** entries (`001_core_schema`, `002_rls_policies`, `003_seed_real_content`, `004_temp_mail_rate_limit`) + `20260928201313 anvil_compat_archive_legacy_schema`, `20260928201441 anvil_app_schema_bootstrap`, `20260928201504 anvil_map_legacy_content`. Same numbers, **different content**. |
| `legacy_archive` | does not exist | Sealed schema holding the retired earlier design (uuid-keyed tools/categories, `profiles.role` default `admin`, anon-writable `contact_messages`/`analytics_events`). Data checksum-verified identical to pre-migration backup. Nothing in the backend reads it. |
| `temp_mail_rate_limits` | Package: `(client_hash, window_start, attempts)`, used by `consume_temp_mail_limit` | **Legacy shape kept**: `(ip_hash, window_start, count)`. Owned by Edge Function `temp-mail` and pg_cron job 2. |
| `temp_mail_client_limits` | does not exist | **Renamed package table** `(client_hash, window_start, attempts)`; used by `consume_temp_mail_limit` and `cleanup_expired_state` |
| `temp_mail_sessions` | `created_at` nullable | `created_at NOT NULL default now()` (legacy shape). Compatible. Shared by Vercel route and Edge `temp-mail` (same 64-hex capability format). |
| `profiles` | same as live | role check `member/admin/owner`, default `member`, `is_active` – ok. **Nothing ever writes `owner` to the DB** (owner is derived from `ADMIN_EMAILS`). |
| `posts`, `contact_requests`, `contact_mail_jobs`, `post_revisions`, `media_assets`, `audit_logs`, `site_*`, `analytics_daily`, `tools`, `categories` | as package | identical structure (verified column-by-column) |
| Data changes | seed only | 2 legacy posts imported as **draft** (`simple-pdf-workflow-without-software`, `small-tools-that-save-developers-time`); legacy category ordering/descriptions merged; 0 tools inserted (all 12 slugs already seeded); `legacy.import` audit row records text differences (password-generator and user-agent-generator descriptions differ; package text kept). |

**HAZARD:** running the repo's `002_app_schema.sql`, `full-schema.sql` or `supabase db push` against live would `CREATE OR REPLACE` `consume_temp_mail_limit` back to the old body that references `temp_mail_rate_limits(client_hash, attempts)`. That table has the legacy shape, so **rate limiting, temp-mail creation and the contact form would start failing**. `cleanup_expired_state` would also revert. Never run repo SQL on this project; fix the repo (§7 P1-1).

### 1.4 Profiles, roles, posts, contacts, email jobs
- `profiles`: one row per Auth user, created by trigger. Roles: `member` (default), `admin`, `owner` (schema allows, code never sets). `is_active=false` disables.
- `posts`: `id` = slug (text). `status draft|published`. Admin edits go through `save_post_document` (revision + audit). Public reads only `status='published'`. Cover image = `cover_image_id → media_assets`; alt text required to publish (enforced in backend code, not DB).
- `contact_requests` + `contact_mail_jobs`: job kinds `alert|receipt|reply`, statuses `queued|sending|sent|failed|unknown`; unique index makes alert/receipt one-per-contact; backend claims jobs with compare-and-set. SMTP success = provider accepted, not inbox delivery. Inbound replies are not imported.
- Storage: bucket `editorial-media` private, 5 MB, jpeg/png/webp; `storage.objects` RLS on with **0 policies** (browser roles denied; backend uses service role + signed URLs). 0 objects.
- pg_cron (pre-existing): job 1 deletes expired `temp_mail_sessions` (*/10), job 2 deletes `temp_mail_rate_limits` older than 1 h (*/15). Nothing schedules `cleanup_expired_state`.

## 2. Edge Functions (source in `edge-functions/`; all `verify_jwt=false`, all ACTIVE, version 1)
Base: `https://epxzxcqsonxscyvbopqt.supabase.co/functions/v1/<name>`. Shared helper `_shared/auth.ts` (imports `npm:@supabase/supabase-js@2.117.2`). `workspace-api` was re-fetched from the platform and matches the supplied source exactly.

| Function | Methods / request | Response | Auth | Env names | Vercel depends on it? |
|---|---|---|---|---|---|
| `workspace-api` | GET/POST/PUT (+OPTIONS). `?path=/api/admin/(me\|users\|documents\|categories\|audit\|system\|analytics/daily\|contacts\|contact-jobs)…`; body ≤200 KB forwarded | Proxied Vercel status/body; errors `{error}`: 401 Unauthorized, 403 Forbidden/Origin denied, 400 Route not allowed, 413, 500 "Function request failed". Media routes intentionally excluded | `Authorization: Bearer <user JWT>`; admin = `ADMIN_EMAILS` (confirmed email) OR `profiles.role in (admin,owner) AND is_active`. Forwards the token so Vercel re-checks | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (platform-provided); `FRONTEND_ORIGINS`, `BACKEND_URL`, `ADMIN_EMAILS` (custom) | **No** (it depends on Vercel) |
| `published-posts` | GET; optional `?slug=` | list (≤100, newest first) or one object with `slug,title,excerpt,body,published_at,category_slug,seo_title,seo_description,cover_image_id,cover_alt,tags`; 404 `{error:'Article not found'}` | None (public); CORS origin allow-list applies only when an `Origin` header is sent | as above minus `BACKEND_URL`,`ADMIN_EMAILS` | No |
| `maintenance` | POST only (405 otherwise) | `{ok:true, expired_sessions, expired_rate_limits}`; writes audit `maintenance.cleanup` | Admin JWT (same rule) | as `workspace-api` minus `BACKEND_URL` | No. No schedule exists |
| `temp-mail` *(not in package; pre-existing, untouched, sha256 `c316351c…`)* | `POST /create`; `GET /messages?cap=`; `GET /messages/:id?cap=`; `POST /delete` body `{cap}` | `{ok,capability,address,expiresAt}`; `{ok,messages[]}`; `{ok,id,from,subject,text,createdAt}`; 429 with message; 404 "Invalid or expired capability" | None; capability-based. CORS `*` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; optional `RATE_LIMIT_SALT` | **No.** Vercel has its own `/api/temp-mail/*` implementation sharing only the `temp_mail_sessions` table. Whether the frontend still calls this function is unverified |

Status of each: code exists ✔ · deployed ✔ (platform listing) · **HTTP tests: not run** (see §6). DB-level behaviour tested (§6).
Recommendation: keep frontend → Vercel → DB. Edge functions are not needed by the app; `workspace-api`/`published-posts` are redundant, `maintenance` is optional, `temp-mail` is redundant with the Vercel route unless the frontend still points at it.

## 3. Google sign-in
### 3.1 Verified vs unverified
| Check | Status |
|---|---|
| Google provider enabled | **Unverified** (no Auth settings access) |
| Google client ID/secret stored in Supabase | **Unverified** |
| Site URL / Redirect URLs | **Unverified**; you report adding the login redirect URL |
| Any user has ever signed in | **No evidence**: `auth.users` = 0, `auth.identities` = 0 (so end-to-end login has not been exercised, or has not yet succeeded) |
| Profile trigger | ✔ exists on `auth.users` (`on_auth_user_profile`, AFTER INSERT OR UPDATE OF email) |
| Backend `/api/auth/config` returns url + anon key | Code ✔; live response **not checked** |

### 3.2 Required configuration
- Google Cloud OAuth *Web* client → Authorized redirect URI: `https://epxzxcqsonxscyvbopqt.supabase.co/auth/v1/callback`. Authorized JavaScript origin `https://anviltools.vercel.app` (harmless; only strictly needed for Google Identity Services flows). Consent-screen publishing status/test users must allow the owner's account.
- Supabase Auth → Providers → Google: enabled + client ID + secret. → URL Configuration: Site URL `https://anviltools.vercel.app`; Redirect URLs include `https://anviltools.vercel.app/admin-panel/login.html` (exact path documented by the package; verify against the frontend's `redirectTo`). Add `http://localhost:8080/admin-panel/login.html` only for local testing.
- If Supabase Auth's Email provider is unused, disable it / disable signups (backend still ships a password login route, §4).

### 3.3 Token validation & authorization (backend, `middleware/auth.js`)
1. Frontend logs in via supabase-js (PKCE) using URL + anon key fetched from `GET /api/auth/config`, then sends `Authorization: Bearer <access_token>`.
2. `requireAdmin` calls `supabaseAdmin.auth.getUser(token)` (server-side verification, not local JWT decode) → 401 on missing/invalid.
3. Role: **owner** = email in `ADMIN_EMAILS` **and** `email_confirmed_at` set (virtual, protected, always active). Otherwise read `profiles.role,is_active`; **admin** = `role in (admin,owner) and is_active`. **member** = authenticated, no admin routes → 403. There are currently **no member-facing endpoints**.
4. `change_user_access` can only set `member`/`admin`; never the caller, never an owner.

### 3.4 New users
Any new Auth user → trigger `sync_auth_profile` (SECURITY DEFINER) inserts `profiles(id,email,display_name)` with role `member`, `is_active=true`. `display_name` comes from `raw_user_meta_data->>'full_name'` (truncated to 100); **metadata never influences role**. Email changes resync. Inviting (`POST /api/admin/users`) uses `auth.admin.inviteUserByEmail` (needs Supabase Auth Custom SMTP) then `change_user_access` if role=admin; the invitee signs in with Google using the same email.

### 3.5 Adding future login domains (all configurable, nothing hard-coded except two defaults)
1. Backend Vercel `FRONTEND_ORIGINS` (comma list, exact scheme+host, no slash) → CORS. 2. Edge secret `FRONTEND_ORIGINS` (if Edge Functions are used). 3. Supabase Auth Redirect URLs: `https://<new-domain>/admin-panel/login.html`. 4. Google Cloud: origin per domain if using GIS; redirect URI stays the single Supabase callback. 5. That frontend's `assets/js/config.js` API URL and its `vercel.json` rewrites (`/journal/:slug`, `/journal-images/:id`, `/journal-sitemap.xml`). 6. Code limits: `SITE_URL` is **single-valued** and drives invite `redirectTo` (`routes/workspace.js`), canonical URLs/JSON-LD/sitemap (`lib/articles.js`); Supabase Site URL is also single. Keep one primary domain; for multi-domain invites derive `redirectTo` from an allow-listed origin (§7 P2). PKCE verifier lives per-origin: a login must finish on the origin where it started.

## 4. Backend integration contract
Source: `backend/src/**` from your ZIP (**not** verified against GitHub `main`). Errors are `{error: string}`; 4xx messages pass through, 5xx become "Request failed. Check server configuration and logs." Disallowed browser `Origin` → 403 `{error:'Origin is not allowed'}`. `/api` responses `Cache-Control: no-store`; `X-Robots-Tag: noindex` except article/image/sitemap. `requireDatabase` returns 503 if service key missing. Auth column: **P** public, **A** admin.

| Method + path | Auth | Purpose / input | Success · errors | DB objects |
|---|---|---|---|---|
| GET `/api/health` | P | liveness | `{ok,service:'anvil-api',databaseConfigured}` (config presence only) | – |
| GET `/api/auth/config` | P | `{url, anonKey}` for supabase-js; refuses service/secret keys | 200 · 503 | env only |
| POST `/api/admin/login` | P | `{email,password}` **password** login (not Google) | `{ok,user,accessToken,expiresAt}` · 400/401/403 | Auth, `profiles` |
| GET `/api/admin/me` | A | current user | `{authenticated,user{id,email,role}}` · 401/403 | Auth, `profiles` |
| POST `/api/admin/logout` | A | revoke session | `{ok}` | Auth |
| GET `/api/tools` | P | all tools (`select *`, incl. views/conversions) | array | `tools` |
| PUT `/api/tools/:slug` | A | edit `name,description,category,status` (≤2000 chars; status active/inactive) | `{ok,tool}` · 400/404 | `tools` |
| POST `/api/analytics/event` | **P** | `{tool}` count a view | `{ok,tool}` · 400 | RPC `record_tool_view` |
| GET `/api/site/overview` | A | totals + top tools | object | `tools`,`posts` |
| GET `/api/posts` | A | all posts (+`updatedAt`) | array | `posts` |
| POST `/api/posts` | A | `{title,slug,excerpt,status}` quick create | 201 · 400/409 | `posts` |
| GET `/api/public/posts` | P | published list (≤100) | array | `posts` |
| GET `/api/public/posts/:slug` | P | published article JSON | object · 404 | `posts` |
| GET `/api/public/articles/:slug` | P | server-rendered HTML with SEO/JSON-LD (frontend `/journal/:slug` rewrite) | html · 404 html | `posts` |
| GET `/api/public/post-images/:id` | P | cover image only if used by a published post (frontend `/journal-images/:id`) | webp · 404 | `posts`,`media_assets`, storage |
| GET `/api/public/sitemap.xml` | P | published slugs (frontend `/journal-sitemap.xml`) | xml | `posts` |
| POST `/api/admin/documents` | A | full article save; validates ids/limits, ≤12 tags, cover exists, alt text needed to publish a cover, **non-empty body needed to publish** | `{ok,post}` · 400/409 | RPC `save_post_document`, `media_assets` |
| GET `/api/admin/documents/:id/revisions` | A | last 20 revisions | array | `post_revisions` |
| GET `/api/admin/categories` · PUT `/api/admin/categories/:slug` | A | list · upsert `{name,description}` | array · `{ok}` · 400 | `categories` |
| GET `/api/admin/audit` | A | last 100 events | array | `audit_logs` |
| GET `/api/admin/system` | A | `{databaseConfigured, smtpConfigured, googleSetup, settings}` | object | `site_settings`, env |
| GET `/api/admin/analytics/daily` | A | last 30 days | array | `analytics_daily` |
| GET `/api/admin/users?page=` | A | 25/page; role shown as `owner` for ADMIN_EMAILS | `{items,total,page}` | `profiles` |
| POST `/api/admin/users` | A | `{email, role: member|admin}` invite | 201 · 400 | Auth admin, `audit_logs`, RPC `change_user_access` |
| PUT `/api/admin/users/:id` | A | `{role: member|admin, is_active: bool}`; owner/self protected | `{ok}` · 400/403/404 | RPC `change_user_access` |
| GET `/api/admin/media?page=` · GET `/:id` | A | list/one with 1 h signed URL | `{items,total,page}` / object · 400/404 | `media_assets`, storage |
| POST `/api/admin/media?name=` | A | raw `image/jpeg|png|webp` ≤3 MB, ≤24 MP; re-encoded to WebP ≤2000 px | 201 asset+url · 400 | storage `editorial-media`, `media_assets` |
| POST `/api/contact` | P | `{id(uuid v4),name,email,subject,message,website(honeypot)}`; 2 rate-limit checks (ip, email) | 202 `{ok,reference,message}` · 400/429(+Retry-After)/503 | RPC `consume_temp_mail_limit`, `create_contact_request`, `contact_mail_jobs`, SMTP |
| GET `/api/admin/contacts?offset=` · GET `/:id` | A | list · contact + jobs | `{items,total,offset}` / `{contact,jobs}` | `contact_requests`,`contact_mail_jobs` |
| POST `/api/admin/contacts/:id/replies` | A | `{id(uuid),message ≤5000}` idempotent by job id | `{ok,message}` | `contact_mail_jobs`, SMTP |
| POST `/api/admin/contact-jobs/:id/retry` | A | only `queued|failed` | `{ok}` · 409 | `contact_mail_jobs`, SMTP |
| POST `/api/temp-mail/create` | P | rate-limited (5/h/IP) | `{ok,capability,address,expiresAt,remaining}` · 429/503 | RPC `consume_temp_mail_limit`, `temp_mail_sessions`, mail.tm |
| GET `/api/temp-mail/messages?cap=` · `/messages/:id?cap=` · POST `/delete` | P (capability) | list/read/delete inbox | ok payloads · 404 invalid, 410 expired | `temp_mail_sessions`, mail.tm |
| GET `/api/temp-mail/stats` | A | active session count | `{ok,…}` | `temp_mail_sessions` |

**Schema match:** every table, column and RPC parameter name used by the routes above exists live with matching names/types (checked against the catalog). Nothing reads `legacy_archive`, `temp_mail_rate_limits`, `blog_posts`, `contact_messages`, `analytics_events` or `consent_stats`.
**Gaps / mismatches found:**
1. `POST /api/posts` accepts `status:'published'` with empty body (bypasses the `documents` rule).
2. `POST /api/analytics/event` is unauthenticated and unthrottled (anyone can inflate views).
3. No endpoints to write `site_settings`/`site_pages`, delete anything, or run maintenance; `media_assets.alt_text` unused (cover alt lives on `posts.cover_alt`).
4. `POST /api/admin/documents` with an unknown `category_slug` hits an FK error → generic 500 instead of 400.
5. Owner role is virtual (env). `profiles.role='owner'` is never persisted, so `GET /api/admin/users` and Edge `admin()` both re-derive it from `ADMIN_EMAILS`.
6. Any unknown `/api/admin/*` path returns 401/403 before 404 (router-level `requireAdmin`).
7. Frontend URLs `/journal/*` depend on frontend `vercel.json` rewrites → unverified.
8. Two independent temp-mail rate limiters (Edge per-IP hash vs Vercel RPC) → 5 inboxes per path per IP/hour.

## 5. Environment & deployment
Status legend: ✔ configured (evidence) · ~ stated by you / inferred · ? unverified · ✘ missing.
**Vercel backend (Production)**
| Name | Status |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | ✔ inferred: `/api/health` returned `databaseConfigured:true` (requires both). Real DB connectivity not yet tested via HTTP |
| `SUPABASE_ANON_KEY` | ? (needed by `/api/auth/config` and password login) |
| `ADMIN_EMAILS` | ? (owner Google account email; not the SMTP sender) |
| `FRONTEND_ORIGINS` | ~ you state it is configured (expected `https://anviltools.vercel.app`) |
| `SITE_URL` | ? (defaults to `https://anviltools.vercel.app`) |
| `SMTP_HOST`,`SMTP_PORT`,`SMTP_USER`,`SMTP_PASS`,`SMTP_FROM` | ? (`GET /api/admin/system → smtpConfigured` reveals presence) |
| `NODE_ENV` | ? · `PORT` local only · `VERCEL` auto-set |

**Supabase Edge Function secrets**: `FRONTEND_ORIGINS` ?, `BACKEND_URL` ?, `ADMIN_EMAILS` ? (cannot list; if unset, defaults apply and **nobody passes the admin check** by email). `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` platform-provided. `RATE_LIMIT_SALT` optional for `temp-mail` (unset ⇒ public default salt).
**Public frontend config**: no Supabase keys in frontend env; URL + anon key arrive at runtime from `/api/auth/config`. `assets/js/config.js` holds the backend API URL (docs say set to the backend domain; unverified).
**Deployment (per repo docs/README; dashboard unverified)**: backend repo root is the Vercel Root Directory; Framework Express; default build/output; Node 22.x; `vercel.json` + `server.js` at root; production branch presumably `main`; Deployment Protection must allow public API access. Repo root now contains `server.js`, `package.json`, `package-lock.json`, `vercel.json` (seen on GitHub), resolving the 28 Sep "backend NOT_FOUND" note in `docs/DEPLOYMENT.md`; production health now returns 200.

## 6. Verification matrix
| Item | Code exists | Config exists | Deployed | Tested OK | Notes |
|---|---|---|---|---|---|
| Database schema + RLS + grants | ✔ | ✔ | ✔ | ✔ (role-based tests as anon/authenticated/service_role, rolled back) | verified 28–29 Sep |
| RPCs (limiter 5/6th refusal, view counter, publish/unpublish + revisions/audit, contact request + idempotent retry) | ✔ | ✔ | ✔ | ✔ DB-level | not via HTTP |
| temp-mail Edge Function DB dependencies | ✔ | ✔ | ✔ (v1, unchanged) | ✔ emulated queries | real mail.tm flow not run |
| `published-posts` / `workspace-api` / `maintenance` | ✔ | secrets ? | ✔ ACTIVE | ✘ **HTTP not tested** | no network route to the functions from here |
| Vercel backend `/api/health` | ✔ | ✔ | ✔ | ✔ 200 `{ok:true,databaseConfigured:true}` (29 Sep) | config presence only |
| Backend DB routes (`/api/tools`, admin, contact, journal) | ✔ (ZIP copy) | ? | ? | ✘ | could not fetch |
| Frontend home | ? | ✔ | ✔ | ✔ loads, 12 tools, static guides | |
| Google provider / redirect URLs / login | ✔ (trigger + backend) | ✘ unverified | ? | ✘ | 0 users, 0 identities |
| SMTP / real email | ✔ | ? | ? | ✘ | no email sent |
| Private bucket / uploads | ✔ | ✔ bucket | ✔ | bucket verified private; upload ✘ | |

**Known issues**
1. **Seeded published posts with empty bodies – CONFIRMED.** `safe-temporary-email-signups` and `removing-a-photo-background-guide`: `status=published`, body length 0, `published_at` restored to 2026-08-12 / 2026-08-20. They will render empty at `/journal/<slug>`, appear in `/journal-sitemap.xml` and `published-posts`, and duplicate static guides. *Not changed.* Decide: `update public.posts set status='draft', published_at=published_at where body=''` (published_at kept) or write content. Backend also needs P1-2.
2. **Repo vs live migration history – CONFIRMED** (§1.3). Hazard: repo SQL overwrites live `consume_temp_mail_limit`.
3. **Supplied rollback not protective – CONFIRMED by inspection.** Original guard only checked contact/revision/media/site_pages/profiles rows, non-import audit rows and unknown post slugs. It would silently delete later: tool edits and `views/conversions`, category edits, `site_settings` (e.g. advertising flag), edits to the four known posts, `analytics_daily`, and it re-opens legacy anon-write policies. It also does not restore users' profiles (Auth users made in between). **Delivered `migrations/ROLLBACK_GUARDED.sql`** (guard v2 with baseline hashes + `auth.users`/`analytics_daily` checks). Guard expression tested read-only: evaluates *would not refuse* on today's untouched state. The rollback body itself was proven earlier in a self-rolling-back transaction. **Not executed.**

Additional findings (new): Edge `temp-mail` trusts the first `x-forwarded-for` entry (spoofable → rate-limit bypass), `Access-Control-Allow-Origin: *`, echoes internal error messages, default hash salt; `create_contact_request` hard-codes recipient; password login route exists alongside Google.

## 7. Prioritized changes
Backend paths are from the ZIP layout; **confirm against `main`**. Frontend paths are from docs only.
**P0 – before announcing Google login**
1. Complete §8 (Auth provider, URLs, secrets, `ADMIN_EMAILS`, `SUPABASE_ANON_KEY`); sign in once as owner; confirm a `profiles` row (role `member`) appears and `GET /api/admin/me` returns `role:'owner'`.
2. Resolve empty seeded posts (issue 1).
**P1**
1. Sync repo SQL with live (`supabase/migrations/`, `supabase/full-schema.sql`, `supabase/seed.sql`, `README.md`, `docs/SUPABASE_SETUP.md`, `docs/DEPLOYMENT.md`): add the three files in `migrations/` here as `20260928201313_…`, `20260928201441_…`, `20260928201504_…`; change the package limiter table to `temp_mail_client_limits` in `002_app_schema.sql` + `full-schema.sql`; mark old 001–005 "fresh project only"; forbid `db push` against production.
2. `backend/src/routes/content.js`: `POST /posts` must force `draft` (or require body); `POST /analytics/event` add throttle (reuse RPC `consume_temp_mail_limit`, key `analytics-ip:<ip>`) and 404 unknown tools.
3. `backend/src/routes/workspace.js` (`/documents`): map FK `23503` → 400 "Unknown category".
4. Decide password login: remove `backend/src/routes/admin.js` `POST /login` (and disable Supabase Email provider) if Google-only.
5. Fetch and diff GitHub `main` vs the ZIP `backend/src` before editing; run `tests/` (mocked).
**P2**
1. Multi-domain: derive invite `redirectTo` from an allow-listed origin (`routes/workspace.js` `POST /users`); keep `SITE_URL` as canonical primary (`lib/articles.js`).
2. Persist owner role on first login (`middleware/auth.js`) or document it as env-only.
3. Edge `temp-mail`: check whether the frontend still calls `functions/v1/temp-mail`; if not, retire; else fix XFF handling, restrict CORS, set `RATE_LIMIT_SALT`, hide error text.
4. Move contact alert recipient into `site_settings` (new migration, not an edit of `create_contact_request` in place).
5. Missing admin endpoints: `site_settings`/`site_pages` write, delete/unpublish flows, maintenance trigger, schedule `cleanup_expired_state` (or drop it).
6. Frontend (docs-only paths): `assets/js/config.js` (API URL), `vercel.json` (rewrites), `admin-panel/login.html` (Google `redirectTo` must equal an allowed redirect URL).

## 8. Manual dashboard steps (yours)
**Google Cloud**: create/select OAuth Web client; add redirect URI `https://epxzxcqsonxscyvbopqt.supabase.co/auth/v1/callback`; add JS origin `https://anviltools.vercel.app`; consent screen status/test users include the owner.
**Supabase**: Auth → Providers → Google: enable, paste client ID/secret. Auth → URL Configuration: Site URL + redirect URL(s). Auth → Email: disable signups/provider if unused; Auth → SMTP: configure if you will send invitations. Edge Functions → Secrets: `FRONTEND_ORIGINS`, `BACKEND_URL`, `ADMIN_EMAILS` (+ `RATE_LIMIT_SALT` for temp-mail). Settings → API: confirm exposed schemas are only `public`/`graphql_public`. (Never expose `legacy_archive`.)
**Vercel (backend project)**: confirm Production env names in §5 (values only in the dashboard), Root Directory = repo root, Framework Express, Node 22.x, Production branch `main`, Deployment Protection off for Production; redeploy after any change. **Vercel (frontend)**: confirm `config.js` API URL and rewrites; no Supabase keys.
**Decisions needed**: empty seeded posts; keep or remove password login; keep or retire Edge `temp-mail`.

## Appendix – safe read-only checks for Codex/owner (no secrets)
```
curl -s https://anvil-tools-backend.vercel.app/api/health
curl -s https://anvil-tools-backend.vercel.app/api/auth/config        # expect {url,anonKey}; 503 => vars missing
curl -s https://anvil-tools-backend.vercel.app/api/tools | head -c 300 # proves real DB connectivity
curl -si https://anvil-tools-backend.vercel.app/api/admin/me          # expect 401 without token
curl -s https://epxzxcqsonxscyvbopqt.supabase.co/functions/v1/published-posts
curl -si -X POST https://epxzxcqsonxscyvbopqt.supabase.co/functions/v1/maintenance   # expect 401
curl -s -H "apikey: <PUBLISHABLE_KEY>" https://epxzxcqsonxscyvbopqt.supabase.co/auth/v1/settings   # look at external.google
```
