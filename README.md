# Anvil Tools API

Deploy this repository root to Vercel as Express, with default build/output settings.

Configure SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAILS, and FRONTEND_ORIGINS=https://anviltools.vercel.app in Vercel Production. Redeploy after setting them. Never commit secrets.

Apply supabase/migrations in numeric order, then supabase/seed.sql. Create an authorized Supabase Auth user matching ADMIN_EMAILS.

Check /api/health (databaseConfigured must be true), then /api/tools. The API root / intentionally returns JSON 404. Frontend: https://anviltools.vercel.app.
