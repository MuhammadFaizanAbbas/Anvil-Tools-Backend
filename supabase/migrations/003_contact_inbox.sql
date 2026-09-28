-- Private support inbox and durable outbound mail log. Run after migration 002.
create table if not exists public.contact_requests (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 100),
  email text not null,
  subject text not null check (char_length(subject) between 1 and 160),
  message text not null check (char_length(message) between 10 and 5000),
  created_at timestamptz not null default now()
);
create table if not exists public.contact_mail_jobs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contact_requests(id) on delete cascade,
  kind text not null check (kind in ('alert','receipt','reply')),
  recipient text not null,
  subject text not null,
  body text not null,
  created_by text,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','unknown')),
  attempts integer not null default 0,
  last_error text,
  message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contact_created_idx on public.contact_requests(created_at desc);
create index if not exists contact_jobs_idx on public.contact_mail_jobs(contact_id,created_at);
create unique index if not exists contact_initial_job_idx on public.contact_mail_jobs(contact_id,kind) where kind in ('alert','receipt');
alter table public.contact_requests enable row level security;
alter table public.contact_mail_jobs enable row level security;
revoke all on public.contact_requests, public.contact_mail_jobs from anon, authenticated;
grant all on public.contact_requests, public.contact_mail_jobs to service_role;

-- Commit the message and both delivery jobs together, including idempotent retries.
create or replace function public.create_contact_request(request_id uuid, sender_name text, sender_email text, contact_subject text, contact_message text)
returns boolean language plpgsql set search_path = public as $$
declare inserted_id uuid;
begin
  insert into public.contact_requests(id,name,email,subject,message)
  values(request_id,sender_name,sender_email,contact_subject,contact_message)
  on conflict(id) do nothing returning id into inserted_id;
  if inserted_id is null then return false; end if;
  insert into public.contact_mail_jobs(contact_id,kind,recipient,subject,body) values
  (request_id,'alert','faizan@velloxtech.com','New Anvil Tools contact: ' || contact_subject,
    'New contact request ' || request_id || E'\nFrom: ' || sender_name || ' <' || sender_email || E'>\n\n' || contact_message || E'\n\nReply from https://anviltools.vercel.app/admin-panel/index.html#contacts'),
  (request_id,'receipt',sender_email,'We received your message - Anvil Tools',
    'Hello ' || sender_name || E',\n\nYour message has been received by VelloxTech. Reference: ' || request_id || E'\n\nSubject: ' || contact_subject || E'\n\nYour message:\n' || contact_message || E'\n\nWe will reply to this email address.\nVelloxTech | info@velloxtech.com');
  return true;
end;
$$;
revoke all on function public.create_contact_request(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_contact_request(uuid,text,text,text,text) to service_role;
