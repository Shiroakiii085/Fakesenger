import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const [countResult, notificationsResult] = await Promise.all([
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false),
      supabase
        .from("notifications")
        .select(
          "id,user_id,actor_id,room_id,type,message,is_read,created_at,actor:profiles!notifications_actor_id_fkey(id,display_name,avatar_url),room:rooms(id,type,name)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(40)
    ]);

    if (countResult.error) throw countResult.error;
    if (notificationsResult.error) throw notificationsResult.error;
    return json({ unreadCount: countResult.count ?? 0, notifications: notificationsResult.data ?? [] });
  } catch (error) {
    return errorJson(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const body = await request.json().catch(() => ({}));
    let query = supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    if (typeof body.roomId === "string" && body.roomId) {
      query = query.eq("room_id", body.roomId);
    }
    const { error } = await query;

    if (error) throw error;
    return json({ ok: true });
  } catch (error) {
    return errorJson(error);
  }
}
