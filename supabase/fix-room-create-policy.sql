drop policy if exists "members can read rooms" on public.rooms;

create policy "members can read rooms"
on public.rooms for select
to authenticated
using (created_by = auth.uid() or public.is_room_member(id, auth.uid()));
