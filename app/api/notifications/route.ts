import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) throw error;
    return json({ unreadCount: count ?? 0 });
  } catch (error) {
    return errorJson(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) throw error;
    return json({ ok: true });
  } catch (error) {
    return errorJson(error);
  }
}
