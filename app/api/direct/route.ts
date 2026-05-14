import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const body = await request.json();
    const targetUserId = String(body.targetUserId ?? "");

    if (!targetUserId || targetUserId === user.id) {
      return json({ error: "Nguoi nhan khong hop le" }, { status: 400 });
    }

    const directKey = [user.id, targetUserId].sort().join(":");
    const existing = await supabase.from("rooms").select("*").eq("direct_key", directKey).maybeSingle();
    if (existing.error) throw existing.error;

    if (existing.data) {
      return json({ room: existing.data });
    }

    const roomInsert = await supabase
      .from("rooms")
      .insert({
        type: "direct",
        name: null,
        created_by: user.id,
        direct_key: directKey
      })
      .select("*")
      .single();

    if (roomInsert.error) throw roomInsert.error;

    const members = [
      { room_id: roomInsert.data.id, user_id: user.id, role: "admin" },
      { room_id: roomInsert.data.id, user_id: targetUserId, role: "member" }
    ];

    const memberInsert = await supabase.from("room_members").insert(members);
    if (memberInsert.error) throw memberInsert.error;

    return json({ room: roomInsert.data }, { status: 201 });
  } catch (error) {
    return errorJson(error);
  }
}
