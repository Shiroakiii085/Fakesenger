drop policy if exists "admins can delete rooms" on public.rooms;
create policy "admins can delete rooms"
on public.rooms for delete
to authenticated
using (public.is_room_admin(id, auth.uid()));

drop policy if exists "admins can delete room messages" on public.messages;
create policy "admins can delete room messages"
on public.messages for delete
to authenticated
using (public.is_room_admin(room_id, auth.uid()));
