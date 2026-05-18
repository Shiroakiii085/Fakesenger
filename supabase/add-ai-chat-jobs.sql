create table if not exists public.ai_chat_jobs (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_messages jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  response_message text,
  response_model text,
  response_sources jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_chat_jobs_user_created
on public.ai_chat_jobs(user_id, created_at desc);

alter table public.ai_chat_jobs enable row level security;

drop policy if exists "users can read own ai chat jobs" on public.ai_chat_jobs;
create policy "users can read own ai chat jobs"
on public.ai_chat_jobs for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can create own ai chat jobs" on public.ai_chat_jobs;
create policy "users can create own ai chat jobs"
on public.ai_chat_jobs for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "users can update own ai chat jobs" on public.ai_chat_jobs;
create policy "users can update own ai chat jobs"
on public.ai_chat_jobs for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop trigger if exists touch_ai_chat_jobs_updated_at on public.ai_chat_jobs;
create trigger touch_ai_chat_jobs_updated_at
  before update on public.ai_chat_jobs
  for each row execute function public.touch_updated_at();
