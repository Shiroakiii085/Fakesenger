create extension if not exists "pgcrypto";

do $$
begin
  create type public.room_type as enum ('direct', 'group', 'channel');
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.member_role as enum ('admin', 'member');
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null,
  avatar_url text,
  status text default 'online',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  type public.room_type not null,
  name text,
  description text,
  avatar_url text,
  direct_key text unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint direct_room_key_required check (
    (type = 'direct' and direct_key is not null) or (type <> 'direct')
  )
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create table if not exists public.member_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint member_requests_no_self_request check (requester_id <> target_user_id)
);

create index if not exists idx_room_members_user_id on public.room_members(user_id);
create index if not exists idx_room_members_room_id on public.room_members(room_id);
create index if not exists idx_messages_room_created on public.messages(room_id, created_at);
create index if not exists idx_member_requests_room_status on public.member_requests(room_id, status, created_at);
create unique index if not exists idx_member_requests_pending_unique
on public.member_requests(room_id, target_user_id)
where status = 'pending';
create index if not exists idx_profiles_search on public.profiles using gin (
  to_tsvector('simple', coalesce(display_name, '') || ' ' || coalesce(email, ''))
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_room_after_message()
returns trigger
language plpgsql
as $$
begin
  update public.rooms set updated_at = now() where id = new.room_id;
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Thanh vien moi')
  )
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_rooms_updated_at on public.rooms;
create trigger touch_rooms_updated_at
  before update on public.rooms
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_room_after_message_insert on public.messages;
create trigger touch_room_after_message_insert
  after insert on public.messages
  for each row execute function public.touch_room_after_message();

create or replace function public.is_room_member(room uuid, member uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = room and user_id = member
  );
$$;

create or replace function public.is_room_admin(room uuid, member uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = room and user_id = member and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;
alter table public.member_requests enable row level security;

drop policy if exists "profiles are visible to authenticated users" on public.profiles;
create policy "profiles are visible to authenticated users"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "members can read rooms" on public.rooms;
create policy "members can read rooms"
on public.rooms for select
to authenticated
using (created_by = auth.uid() or public.is_room_member(id, auth.uid()));

drop policy if exists "users can create rooms" on public.rooms;
create policy "users can create rooms"
on public.rooms for insert
to authenticated
with check (auth.uid() = created_by);

drop policy if exists "admins can update rooms" on public.rooms;
create policy "admins can update rooms"
on public.rooms for update
to authenticated
using (public.is_room_admin(id, auth.uid()))
with check (public.is_room_admin(id, auth.uid()));

drop policy if exists "members can read room members" on public.room_members;
create policy "members can read room members"
on public.room_members for select
to authenticated
using (public.is_room_member(room_id, auth.uid()));

drop policy if exists "creator and admins can add members" on public.room_members;
create policy "creator and admins can add members"
on public.room_members for insert
to authenticated
with check (
  exists (
    select 1 from public.rooms
    where rooms.id = room_id
      and (rooms.created_by = auth.uid() or public.is_room_admin(room_id, auth.uid()))
  )
);

drop policy if exists "admins and self can remove members" on public.room_members;
create policy "admins and self can remove members"
on public.room_members for delete
to authenticated
using (user_id = auth.uid() or public.is_room_admin(room_id, auth.uid()));

drop policy if exists "members can read messages" on public.messages;
create policy "members can read messages"
on public.messages for select
to authenticated
using (public.is_room_member(room_id, auth.uid()));

drop policy if exists "members can send messages" on public.messages;
create policy "members can send messages"
on public.messages for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_room_member(room_id, auth.uid())
  and (
    not exists (select 1 from public.rooms where id = room_id and type = 'channel')
    or public.is_room_admin(room_id, auth.uid())
  )
);

drop policy if exists "members can read member requests" on public.member_requests;
create policy "members can read member requests"
on public.member_requests for select
to authenticated
using (public.is_room_member(room_id, auth.uid()));

drop policy if exists "members can request adding people" on public.member_requests;
create policy "members can request adding people"
on public.member_requests for insert
to authenticated
with check (
  requester_id = auth.uid()
  and status = 'pending'
  and public.is_room_member(room_id, auth.uid())
  and not public.is_room_member(room_id, target_user_id)
);

drop policy if exists "admins can decide member requests" on public.member_requests;
create policy "admins can decide member requests"
on public.member_requests for update
to authenticated
using (public.is_room_admin(room_id, auth.uid()))
with check (public.is_room_admin(room_id, auth.uid()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.rooms;
  end if;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.room_members;
  end if;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.member_requests;
  end if;
exception
  when duplicate_object then null;
end;
$$;
