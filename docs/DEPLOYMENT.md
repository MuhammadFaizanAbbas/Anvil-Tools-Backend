# Vercel + cPanel + Supabase

> Production project `epxzxcqsonxscyvbopqt` is already migrated. Do not run the numbered migrations, full-schema.sql, seed.sql, or `supabase db push` against it. See [Production integration](PRODUCTION_INTEGRATION.md) for the deployed contract and remaining setup.

## 1. Supabase

Create a Supabase project, then run these files in its SQL Editor in order:

1. `supabase/migrations/001_create_temp_mail_sessions.sql`
2. `supabase/migrations/002_app_schema.sql`
3. `supabase/seed.sql`

The seed adds the existing tool catalog and two existing dashboard post records without replacing existing rows. Demo traffic counts are not imported. All app tables have Row Level Security enabled and access revoked from browser roles; the API uses its server-only service-role key. Rate limiting uses an atomic database function shared across Vercel instances. Expired temporary sessions and rate-limit rows are removed during new inbox requests; there is no persistent worker. Provider mailbox retention remains controlled by Guerrilla Mail.

Create an admin user under Authentication > Users and set its password. Add its email to `ADMIN_EMAILS`. A valid Supabase account alone does not grant admin access. Disable public signups if your project only needs invited administrators.

## 2. Vercel backend

Import this repository into Vercel with the **repository root** as Root Directory. Framework is Express (`vercel.json`); use Node.js 22.x. There is no frontend build or output directory to configure. The root `server.js` exports the Express app and opens a listener only when run directly for local development. `.vercelignore` excludes SQL and development scripts. The frontend remains available for a separate Vercel project with Root Directory `frontend`; the Express project does not serve it.

Set these environment variables for the environments you deploy:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Your project's Supabase URL |
| `SUPABASE_ANON_KEY` | Supabase anon/publishable key for password login |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role/secret key; backend only |
| `ADMIN_EMAILS` | Comma-separated permitted admin emails |
| `FRONTEND_ORIGINS` | `https://example.com,https://www.example.com` using your exact cPanel origins |
| `NODE_ENV` | `production` |

Do not include trailing slashes or paths in origins. Add local origins only if deliberately using this API for local development. Redeploy after configuration changes.

Check `https://YOUR-PROJECT.vercel.app/api/health`. It must return `ok: true` and `databaseConfigured: true`. This confirms process/configuration availability, not live database connectivity. Check `/api/tools` to verify the database schema, key and seed. `/` on the API intentionally returns JSON 404.

The deployment must allow public requests to its API domain. If Vercel Deployment Protection is enabled for a preview, use the public production deployment for cPanel rather than putting a protection bypass secret in the browser.

## 3. Frontend hosting (Vercel or cPanel)

### Vercel frontend in a separate project/repository

The root `vercel.json` is for the API only. Importing the full repository twice with the same root settings creates two API deployments, not a frontend and a backend.

| Setting | Backend project | Frontend project (full repository) |
| --- | --- | --- |
| Root Directory | Repository root | `frontend` |
| Framework | Express | Other |
| Build Command | Default / no override | Empty |
| Output Directory | Default / no override | `.` |
| Install Command | Default | Empty |
| Configuration | Root `vercel.json` | `frontend/vercel.json` |

The frontend configuration is included in `frontend/vercel.json`. If your frontend repository contains only the contents of `frontend/`, use repository root instead. Do not copy the root backend `vercel.json` into that frontend repository. Redeploy after changing the settings.

If copying backend files to a new repository, retain root `server.js`, `package.json`, `package-lock.json`, `vercel.json`, and the complete `backend/src/` tree. Uploading only `backend/` loses the dependency manifest and expected entry point layout.

The frontend API URL is now set to `https://anvil-tools-backend.vercel.app` in `assets/js/config.js`. In the backend Vercel project set `FRONTEND_ORIGINS=https://anviltools.vercel.app`. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, and `ADMIN_EMAILS` in Production, then redeploy. Apply the SQL and create the admin user as described above. Never add the service-role key to the frontend project.

During the September 28, 2026 checks:

- Frontend domain `https://anviltools.vercel.app/api/health` returned HTTP 200 with `service: anvil-api` and `databaseConfigured: false`. The frontend project is deploying the Express backend. Change its Root Directory to `frontend` and Framework to Other.
- Backend domain `https://anvil-tools-backend.vercel.app/api/health` returned Vercel `NOT_FOUND` (HTTP 404), not the application's JSON error. Check that this domain belongs to the backend project, a successful Production deployment exists, and its Root Directory is the repository root containing `server.js` and `package.json`. The GitHub API confirmed that the backend repository root currently contains only `backend/`: root `server.js`, `package.json`, `package-lock.json`, and `vercel.json` are missing. Add these files from this workspace, or extract `deployment/anvil-backend.zip` into that repository root and commit its contents. Do not upload just the ZIP to GitHub.
- Frontend repo: `MuhammadFaizanAbbas/Anvil-Tools`. Backend repo: `MuhammadFaizanAbbas/Anvil-Tools-Backend`. Keep the backend entry point at the repository root; do not set Root Directory to `backend/src` with the current layout.

Configure Supabase on the actual backend project. A JSON 404 at the API root `/` remains expected; use `/api/health` to test it.

Visit the frontend `/` and `/admin-panel/login.html`. Test the backend `/api/health` and `/api/tools` separately. The health response must show `databaseConfigured: true`; `/api/tools` also verifies database connectivity and schema.

### cPanel alternative

Edit `frontend/assets/js/config.js` and replace `https://YOUR-PROJECT.vercel.app` with the deployed API origin (or your custom API domain). It must use HTTPS. This is public configuration; no Supabase secret belongs here.

Upload the **contents** of `frontend/` to the domain's `public_html` document root, including `.htaccess`. Keep `assets/`, `tools/`, `categories/`, `blog/` and `admin-panel/` in place. Do not upload the repository root, backend, `.env`, `node_modules`, or SQL files. Enable HTTPS for the cPanel domain. No Node.js process or PHP database connection is required on cPanel.

Open `/admin-panel/login.html` to sign in. `/admin` and `/admin/login` redirect there on Apache with mod_rewrite. Auth uses a short-lived bearer token stored in the current browser tab's sessionStorage, so login works across different cPanel and Vercel domains without third-party cookies. On expiration, sign in again; automatic refresh is not implemented. Logout clears the local session and asks Supabase to revoke its refresh session; an already issued access token remains valid until its expiry.

## 4. Verify the deployment

- Open the homepage, a tool page and blog pages on the cPanel domain.
- Sign in with the allowed Supabase admin and edit a tool name. Reload to confirm persistence.
- Confirm an ordinary Supabase user cannot use admin endpoints.
- Create a temporary inbox, list messages, open a message, and switch to a new inbox. Guerrilla Mail must be reachable. The API uses `consume_inbox_creation_limit` when installed and falls back to the existing `consume_temp_mail_limit` RPC on the current production schema.
- Confirm browser requests target Vercel and have no CORS errors.
- Replace `www.example.com`, contact email and publisher placeholders in static files before launch.

Local automated tests use mocked database responses; real Supabase SQL execution, mail delivery and hosted behavior require the configured services. No live deployment is performed by the repository setup.

## References

- [Vercel Express deployment](https://vercel.com/docs/frameworks/backend/express)
- [Supabase server authentication clients](https://supabase.com/docs/reference/javascript/auth)
- [Supabase database security](https://supabase.com/docs/guides/database/secure-data)

Older Railway/demo notes are retained under `docs/archive/` for historical reference only.

## Repository-specific deployment configuration

The Anvil-Tools frontend repository now has a root vercel.json with Framework Other and outputDirectory frontend. Its Vercel Root Directory can remain the repository root. Alternatively, Root Directory frontend uses frontend/vercel.json with outputDirectory dot. The Anvil-Tools-Backend repository has its own Express root configuration and startup files. Do not copy the frontend root vercel.json into the backend repository.

## Responsive design release

Public pages use design.css for the shared design; admin uses admin.css. Consent starts hidden in HTML and opens only when no stored choice exists, or from the footer Privacy settings control. All public pages offer reject, customize, and accept. This preference UI is not a Google-certified CMP; advertising remains disabled until the documented launch requirements are met. No dummy publisher entry is served. Admin pages and API responses are marked noindex.

Validated representative public/admin pages at 320, 375, 768, and 1440 pixels with headless Chrome, including saved-consent navigation, reopening preferences, and admin panel switching. Supabase configuration is still required for live admin data.

## Contact form and inbox

See [CONTACT_SETUP.md](CONTACT_SETUP.md) for migration 003, SMTP environment variables, delivery logs, retries, and admin replies. The form cannot save submissions until the Supabase schema is configured.

## Published articles and images

Apply migration 005 after 004 (or use full-schema.sql only for a new project). The frontend Vercel configuration proxies `/journal/:slug`, `/journal-images/:id`, and `/journal-sitemap.xml` to the backend `/api/public/articles/:slug`, `/api/public/post-images/:id`, and `/api/public/sitemap.xml`. Set backend SITE_URL to the canonical frontend origin. If you change the backend domain, update both frontend Vercel configuration files.

For cPanel or another static host, configure equivalent reverse-proxy routes with your hosting provider; uploading static files alone cannot serve these dynamic journal URLs. Local static previews also require equivalent proxying to exercise published journal pages.

Image uploads use authenticated API requests and a private Supabase bucket. The server accepts JPEG/PNG/WebP up to 3 MB, verifies the decoded image, strips metadata, resizes to 2000 pixels, and stores WebP. Draft-only images are unavailable through public image routes. Alt text is required before publishing a cover. Uploads and article publishing need a configured Supabase project.
