-- 1. Create notifications table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  room_id uuid references public.rooms(id) on delete cascade,
  type text not null check (type in ('mention', 'system')),
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_id on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "users can read own notifications" on public.notifications;
create policy "users can read own notifications"
on public.notifications for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can update own notifications" on public.notifications;
create policy "users can update own notifications"
on public.notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users can insert notifications" on public.notifications;
create policy "users can insert notifications"
on public.notifications for insert
to authenticated
with check (true);

-- 2. Add ChatBot user to auth.users and profiles
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'chatbot@fakesenger.local',
  crypt('randompassword123', gen_salt('bf')),
  now(),
  now(),
  now()
) on conflict (id) do nothing;

insert into public.profiles (id, email, display_name, status)
values ('00000000-0000-0000-0000-000000000000', 'chatbot@fakesenger.local', 'ChatBot', 'online')
on conflict (id) do update set display_name = 'ChatBot';

-- 3. Allow authenticated room members to create ChatBot replies through a controlled RPC
create or replace function public.insert_chatbot_message(target_room_id uuid, content text)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_message public.messages;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_room_member(target_room_id, auth.uid()) then
    raise exception 'Not a room member';
  end if;

  if nullif(trim(content), '') is null then
    raise exception 'ChatBot reply cannot be empty';
  end if;

  insert into public.messages (room_id, user_id, body, kind)
  values (
    target_room_id,
    '00000000-0000-0000-0000-000000000000',
    left(trim(content), 2000),
    'text'
  )
  returning * into inserted_message;

  return inserted_message;
end;
$$;

revoke all on function public.insert_chatbot_message(uuid, text) from public;
grant execute on function public.insert_chatbot_message(uuid, text) to authenticated;

-- 4. Add cleared_at to room_members
alter table public.room_members add column if not exists cleared_at timestamptz;

-- Ensure realtime is enabled for notifications
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception
  when duplicate_object then null;
end;
$$;
