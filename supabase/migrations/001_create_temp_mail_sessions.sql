-- Migration: create temp_mail_sessions table
-- Run this on the Supabase project to persist temporary mail capabilities

create table if not exists public.temp_mail_sessions (
  capability text primary key,
  token text not null,
  account_id text not null,
  address text not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists idx_temp_mail_expires on public.temp_mail_sessions (expires_at);
