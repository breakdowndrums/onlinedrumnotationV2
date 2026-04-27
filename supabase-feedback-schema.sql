create extension if not exists pgcrypto;

create table if not exists public.feedback_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid null references auth.users(id) on delete set null,
  author_kind text not null check (author_kind in ('registered', 'anonymous')),
  author_label text null,
  body text not null check (char_length(body) between 3 and 2000),
  status text not null default 'pending' check (status in ('pending', 'public', 'hidden', 'archived')),
  is_public boolean not null default false,
  vote_score integer not null default 0,
  vote_count integer not null default 0,
  fingerprint text null,
  feedback_type text not null default 'idea' check (feedback_type in ('bug', 'feature', 'idea')),
  feedback_types text[] not null default '{}'::text[] check (
    feedback_types <@ array['bug', 'feature_idea']::text[]
  ),
  admin_reply text null check (admin_reply is null or char_length(admin_reply) <= 2000),
  resolution_status text not null default 'reviewing' check (resolution_status in ('reviewing', 'planned', 'done')),
  admin_note text null
);

alter table public.feedback_items
  add column if not exists feedback_type text not null default 'idea';

alter table public.feedback_items
  add column if not exists feedback_types text[] not null default '{}'::text[];

alter table public.feedback_items
  add column if not exists admin_reply text null;

alter table public.feedback_items
  add column if not exists resolution_status text not null default 'reviewing';

create table if not exists public.feedback_votes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  feedback_id uuid not null references public.feedback_items(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete cascade,
  fingerprint text null,
  vote smallint not null check (vote in (-1, 1)),
  constraint feedback_votes_identity_check check (
    user_id is not null or fingerprint is not null
  )
);

alter table public.feedback_votes
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists feedback_votes_feedback_user_uidx
  on public.feedback_votes (feedback_id, user_id)
  where user_id is not null;

create unique index if not exists feedback_votes_feedback_fingerprint_uidx
  on public.feedback_votes (feedback_id, fingerprint)
  where fingerprint is not null;

create index if not exists feedback_items_created_at_idx
  on public.feedback_items (created_at desc);

create index if not exists feedback_items_public_idx
  on public.feedback_items (is_public, status, created_at desc);

create index if not exists feedback_items_sort_top_idx
  on public.feedback_items (is_public, status, vote_score desc, created_at desc);

create index if not exists feedback_items_fingerprint_created_idx
  on public.feedback_items (fingerprint, created_at desc)
  where fingerprint is not null;

create index if not exists feedback_votes_fingerprint_created_idx
  on public.feedback_votes (fingerprint, created_at desc)
  where fingerprint is not null;

create or replace function public.set_feedback_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists feedback_items_set_updated_at on public.feedback_items;
create trigger feedback_items_set_updated_at
before update on public.feedback_items
for each row execute function public.set_feedback_updated_at();

drop trigger if exists feedback_votes_set_updated_at on public.feedback_votes;
create trigger feedback_votes_set_updated_at
before update on public.feedback_votes
for each row execute function public.set_feedback_updated_at();

create or replace function public.refresh_feedback_vote_totals(target_feedback_id uuid)
returns void
language plpgsql
as $$
begin
  update public.feedback_items
  set
    vote_score = coalesce((
      select sum(v.vote)::integer
      from public.feedback_votes v
      where v.feedback_id = target_feedback_id
    ), 0),
    vote_count = coalesce((
      select count(*)::integer
      from public.feedback_votes v
      where v.feedback_id = target_feedback_id
    ), 0),
    updated_at = now()
  where id = target_feedback_id;
end;
$$;

create or replace function public.feedback_votes_sync_totals()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_feedback_vote_totals(old.feedback_id);
    return old;
  end if;

  perform public.refresh_feedback_vote_totals(new.feedback_id);

  if tg_op = 'UPDATE' and old.feedback_id is distinct from new.feedback_id then
    perform public.refresh_feedback_vote_totals(old.feedback_id);
  end if;

  return new;
end;
$$;

drop trigger if exists feedback_votes_sync_totals_after_insert on public.feedback_votes;
create trigger feedback_votes_sync_totals_after_insert
after insert on public.feedback_votes
for each row execute function public.feedback_votes_sync_totals();

drop trigger if exists feedback_votes_sync_totals_after_update on public.feedback_votes;
create trigger feedback_votes_sync_totals_after_update
after update on public.feedback_votes
for each row execute function public.feedback_votes_sync_totals();

drop trigger if exists feedback_votes_sync_totals_after_delete on public.feedback_votes;
create trigger feedback_votes_sync_totals_after_delete
after delete on public.feedback_votes
for each row execute function public.feedback_votes_sync_totals();

alter table public.feedback_items enable row level security;
alter table public.feedback_votes enable row level security;

drop policy if exists "feedback_items_public_read" on public.feedback_items;
create policy "feedback_items_public_read"
on public.feedback_items
for select
using (is_public = true and status = 'public');

drop policy if exists "feedback_votes_public_read" on public.feedback_votes;
create policy "feedback_votes_public_read"
on public.feedback_votes
for select
using (true);

drop policy if exists "feedback_items_insert_any" on public.feedback_items;
drop policy if exists "feedback_votes_insert_any" on public.feedback_votes;
drop policy if exists "feedback_votes_update_any" on public.feedback_votes;
drop policy if exists "feedback_votes_delete_any" on public.feedback_votes;
drop policy if exists "feedback_items_admin_all" on public.feedback_items;

comment on table public.feedback_items is
  'Feedback items are created and moderated via the backend API. Public clients only need read access to published items.';

comment on table public.feedback_votes is
  'Votes are written through the backend API. Aggregate counts on feedback_items are maintained by database triggers.';
