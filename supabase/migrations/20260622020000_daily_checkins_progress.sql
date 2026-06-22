alter table public.body_measurements
  add column if not exists chest_cm numeric(6, 2) check (chest_cm between 20 and 400),
  add column if not exists hip_cm numeric(6, 2) check (hip_cm between 20 and 400),
  add column if not exists arm_cm numeric(6, 2) check (arm_cm between 10 and 150),
  add column if not exists thigh_cm numeric(6, 2) check (thigh_cm between 10 and 200),
  add column if not exists neck_cm numeric(6, 2) check (neck_cm between 10 and 150);

create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null,
  sleep_hours numeric(4, 2) check (sleep_hours between 0 and 24),
  water_ml integer check (water_ml between 0 and 20000),
  energy_level smallint check (energy_level between 1 and 5),
  hunger_level smallint check (hunger_level between 1 and 5),
  mood text check (mood in ('great', 'good', 'okay', 'tired', 'stressed')),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, checkin_date)
);

create index if not exists daily_checkins_user_date_idx
  on public.daily_checkins (user_id, checkin_date desc);

drop trigger if exists daily_checkins_set_updated_at on public.daily_checkins;
create trigger daily_checkins_set_updated_at
before update on public.daily_checkins
for each row execute function public.set_updated_at();

alter table public.daily_checkins enable row level security;

drop policy if exists "Users manage their own daily checkins" on public.daily_checkins;
create policy "Users manage their own daily checkins"
on public.daily_checkins
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.daily_checkins from anon;
grant select, insert, update, delete on table public.daily_checkins to authenticated;
