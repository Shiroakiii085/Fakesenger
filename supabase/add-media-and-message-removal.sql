alter table public.messages
add column if not exists kind text not null default 'text'
check (kind in ('text', 'image', 'audio'));

alter table public.messages
add column if not exists media_url text;

create table if not exists public.message_hides (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists idx_message_hides_user_id on public.message_hides(user_id);

alter table public.message_hides enable row level security;

drop policy if exists "senders can update own messages" on public.messages;
create policy "senders can update own messages"
on public.messages for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users can read own hidden messages" on public.message_hides;
create policy "users can read own hidden messages"
on public.message_hides for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can hide own messages" on public.message_hides;
create policy "users can hide own messages"
on public.message_hides for insert
to authenticated
with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

drop policy if exists "members can upload chat media" on storage.objects;
create policy "members can upload chat media"
on storage.objects for insert
to authenticated
with check (bucket_id = 'chat-media');

drop policy if exists "public can read chat media" on storage.objects;
create policy "public can read chat media"
on storage.objects for select
to public
using (bucket_id = 'chat-media');
