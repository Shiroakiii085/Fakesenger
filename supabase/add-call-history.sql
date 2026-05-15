alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages
add constraint messages_kind_check
check (kind in ('text', 'image', 'audio', 'call'));

alter table public.messages
add column if not exists call_status text
check (call_status in ('ringing', 'active', 'completed', 'missed', 'rejected'));

alter table public.messages
add column if not exists call_duration_seconds integer
check (call_duration_seconds is null or call_duration_seconds >= 0);
