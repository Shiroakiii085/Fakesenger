import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const { roomId } = await context.params;

    const hiddenResult = await supabase.from("message_hides").select("message_id").eq("user_id", user.id);
    if (hiddenResult.error) throw hiddenResult.error;
    const hiddenMessageIds = (hiddenResult.data ?? []).map((item) => item.message_id);

    const { data, error } = await supabase
      .from("messages")
      .select("id,room_id,user_id,body,kind,media_url,created_at,edited_at,is_deleted,profiles:profiles(id,email,display_name,avatar_url,status)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) throw error;
    return json({ messages: (data ?? []).filter((message) => !hiddenMessageIds.includes(message.id)) });
  } catch (error) {
    return errorJson(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const { roomId } = await context.params;
    const body = await request.json();
    const kind = body.kind === "image" || body.kind === "audio" ? body.kind : "text";
    const message = String(body.body ?? "").trim();
    const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl.trim() : null;

    if (!message && kind === "text") {
      return json({ error: "Tin nhan khong duoc de trong" }, { status: 400 });
    }
    if (kind !== "text" && !mediaUrl) {
      return json({ error: "Thieu tep dinh kem" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        room_id: roomId,
        user_id: user.id,
        body: message.slice(0, 2000) || (kind === "image" ? "Anh" : "Tin nhan am thanh"),
        kind,
        media_url: mediaUrl
      })
      .select("id,room_id,user_id,body,kind,media_url,created_at,edited_at,is_deleted,profiles:profiles(id,email,display_name,avatar_url,status)")
      .single();

    if (error) throw error;
    return json({ message: data }, { status: 201 });
  } catch (error) {
    return errorJson(error);
  }
}
