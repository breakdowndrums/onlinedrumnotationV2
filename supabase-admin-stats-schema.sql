create extension if not exists pgcrypto;

create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null check (event_type in ('site_visit', 'share_open', 'share_create')),
  share_kind text null check (share_kind in ('beat', 'arrangement')),
  visitor_id text not null,
  user_id uuid null references auth.users(id) on delete set null,
  path text null,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists app_events_created_at_idx on public.app_events (created_at desc);
create index if not exists app_events_event_type_created_at_idx on public.app_events (event_type, created_at desc);
create index if not exists app_events_share_kind_created_at_idx on public.app_events (share_kind, created_at desc);
create index if not exists app_events_visitor_id_idx on public.app_events (visitor_id);
create index if not exists app_events_user_id_idx on public.app_events (user_id);

grant usage on schema public to service_role;
grant all privileges on table public.app_events to service_role;

alter table public.app_events enable row level security;

drop policy if exists "app_events_service_role_only" on public.app_events;
create policy "app_events_service_role_only"
on public.app_events
for all
using (false)
with check (false);
