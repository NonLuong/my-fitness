create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  health_profile jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  protein_g numeric(7, 2) not null default 0 check (protein_g >= 0),
  protein_events jsonb not null default '[]'::jsonb,
  workout jsonb not null default '{}'::jsonb,
  meals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, log_date)
);

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 20000),
  client_created_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(6, 2) check (weight_kg between 20 and 500),
  waist_cm numeric(6, 2) check (waist_cm between 20 and 400),
  body_fat_percent numeric(5, 2) check (body_fat_percent between 0 and 100),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, measured_on)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create index if not exists daily_logs_user_date_idx
  on public.daily_logs (user_id, log_date desc);

create index if not exists coach_messages_user_created_idx
  on public.coach_messages (user_id, created_at desc);

create index if not exists body_measurements_user_date_idx
  on public.body_measurements (user_id, measured_on desc);

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists daily_logs_set_updated_at on public.daily_logs;
create trigger daily_logs_set_updated_at
before update on public.daily_logs
for each row execute function public.set_updated_at();

drop trigger if exists body_measurements_set_updated_at on public.body_measurements;
create trigger body_measurements_set_updated_at
before update on public.body_measurements
for each row execute function public.set_updated_at();

alter table public.user_profiles enable row level security;
alter table public.daily_logs enable row level security;
alter table public.coach_messages enable row level security;
alter table public.body_measurements enable row level security;

drop policy if exists "Users manage their own profile" on public.user_profiles;
create policy "Users manage their own profile"
on public.user_profiles
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own daily logs" on public.daily_logs;
create policy "Users manage their own daily logs"
on public.daily_logs
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own coach messages" on public.coach_messages;
create policy "Users manage their own coach messages"
on public.coach_messages
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own body measurements" on public.body_measurements;
create policy "Users manage their own body measurements"
on public.body_measurements
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.user_profiles from anon;
revoke all on table public.daily_logs from anon;
revoke all on table public.coach_messages from anon;
revoke all on table public.body_measurements from anon;

grant select, insert, update, delete on table public.user_profiles to authenticated;
grant select, insert, update, delete on table public.daily_logs to authenticated;
grant select, insert, update, delete on table public.coach_messages to authenticated;
grant select, insert, update, delete on table public.body_measurements to authenticated;
