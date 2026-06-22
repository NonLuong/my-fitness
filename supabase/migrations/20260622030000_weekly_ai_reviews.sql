create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  source_hash text not null,
  source_snapshot jsonb not null default '{}'::jsonb,
  review jsonb not null default '{}'::jsonb,
  model text not null,
  generated_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, week_start),
  check (week_end >= week_start)
);

create index if not exists weekly_reviews_user_week_idx
  on public.weekly_reviews (user_id, week_start desc);

drop trigger if exists weekly_reviews_set_updated_at on public.weekly_reviews;
create trigger weekly_reviews_set_updated_at
before update on public.weekly_reviews
for each row execute function public.set_updated_at();

alter table public.weekly_reviews enable row level security;

drop policy if exists "Users manage their own weekly reviews" on public.weekly_reviews;
create policy "Users manage their own weekly reviews"
on public.weekly_reviews
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.weekly_reviews from anon;
grant select, insert, update, delete on table public.weekly_reviews to authenticated;
