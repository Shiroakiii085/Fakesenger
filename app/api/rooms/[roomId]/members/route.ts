import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const { supabase } = await getRouteContext(request);
    const { roomId } = await context.params;
    const body = await request.json();
    const userId = String(body.userId ?? "");
    const role = body.role === "admin" ? "admin" : "member";

    if (!userId) {
      return json({ error: "Thieu userId" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("room_members")
      .insert({ room_id: roomId, user_id: userId, role })
      .select("room_id,user_id,role,profiles:profiles(id,email,display_name,avatar_url,status)")
      .single();

    if (error) throw error;
    return json({ member: data }, { status: 201 });
  } catch (error) {
    return errorJson(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const { roomId } = await context.params;
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId") || String((await request.json().catch(() => ({}))).userId ?? "");

    if (!userId) {
      return json({ error: "Thieu userId" }, { status: 400 });
    }
    if (userId === user.id) {
      return json({ error: "Admin khong the tu xoa minh khoi nhom tai day" }, { status: 400 });
    }

    const { error } = await supabase.from("room_members").delete().eq("room_id", roomId).eq("user_id", userId);
    if (error) throw error;

    return json({ ok: true });
  } catch (error) {
    return errorJson(error);
  }
}
