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

create index if not exists idx_member_requests_room_status on public.member_requests(room_id, status, created_at);

create unique index if not exists idx_member_requests_pending_unique
on public.member_requests(room_id, target_user_id)
where status = 'pending';

alter table public.member_requests enable row level security;

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
    alter publication supabase_realtime add table public.member_requests;
  end if;
exception
  when duplicate_object then null;
end;
$$;
