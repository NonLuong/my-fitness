alter table public.coach_messages
  add column if not exists client_id text;

update public.coach_messages
set client_id = id::text
where client_id is null;

alter table public.coach_messages
  alter column client_id set not null;

create unique index if not exists coach_messages_user_client_id_idx
  on public.coach_messages (user_id, client_id);
