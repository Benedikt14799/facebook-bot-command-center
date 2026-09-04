create table if not exists public.cron_tokens (
  name text primary key,
  token text not null default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);
grant all on public.cron_tokens to service_role;
alter table public.cron_tokens enable row level security;
create policy "no client access to cron tokens" on public.cron_tokens
  as restrictive for all to authenticated, anon using (false) with check (false);
insert into public.cron_tokens (name) values ('scheduler') on conflict (name) do nothing;