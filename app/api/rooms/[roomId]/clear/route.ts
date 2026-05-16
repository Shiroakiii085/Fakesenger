import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const { roomId } = await context.params;

    const { data: roomData, error: roomError } = await supabase
      .from("rooms")
      .select("type")
      .eq("id", roomId)
      .single();

    if (roomError) throw roomError;

    if (roomData.type !== "direct") {
      return json({ error: "Chỉ có thể xóa lịch sử cuộc trò chuyện 1-1." }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("room_members")
      .update({ cleared_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", user.id);

    if (updateError) throw updateError;

    return json({ ok: true, message: "Đã xóa lịch sử trò chuyện." });
  } catch (error) {
    return errorJson(error);
  }
}
