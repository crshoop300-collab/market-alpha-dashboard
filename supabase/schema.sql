create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  status text not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_status_idx
  on public.subscriptions (status);

alter table public.subscriptions enable row level security;

drop policy if exists "Members can read their subscription" on public.subscriptions;
create policy "Members can read their subscription"
  on public.subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_key text not null,
  trade_date date,
  ticker text not null,
  contract text,
  side text,
  trade_type text,
  sector text,
  premium text,
  premium_num numeric,
  spot text,
  strike text,
  expiry text,
  source text not null default 'dashboard',
  notes text not null default '',
  status text not null default 'watching',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, trade_key)
);

create index if not exists watchlist_items_user_created_idx
  on public.watchlist_items (user_id, created_at desc);

alter table public.watchlist_items enable row level security;

drop policy if exists "Members can read their watchlist" on public.watchlist_items;
create policy "Members can read their watchlist"
  on public.watchlist_items
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Members can insert their watchlist" on public.watchlist_items;
create policy "Members can insert their watchlist"
  on public.watchlist_items
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Members can update their watchlist" on public.watchlist_items;
create policy "Members can update their watchlist"
  on public.watchlist_items
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Members can delete their watchlist" on public.watchlist_items;
create policy "Members can delete their watchlist"
  on public.watchlist_items
  for delete
  to authenticated
  using (auth.uid() = user_id);
