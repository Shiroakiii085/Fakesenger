import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const membershipResult = await supabase.from("room_members").select("room_id").eq("user_id", user.id);
    if (membershipResult.error) throw membershipResult.error;

    const roomIds = (membershipResult.data ?? []).map((item) => item.room_id);
    if (roomIds.length === 0) {
      return json({ rooms: [] });
    }

    const [roomsResult, membersResult] = await Promise.all([
      supabase.from("rooms").select("*").in("id", roomIds).order("updated_at", { ascending: false }),
      supabase
        .from("room_members")
        .select("room_id,user_id,role,profiles:profiles(id,email,display_name,avatar_url,status)")
        .in("room_id", roomIds)
    ]);

    if (roomsResult.error) throw roomsResult.error;
    if (membersResult.error) throw membersResult.error;

    const rooms = (roomsResult.data ?? []).map((room) => ({
      ...room,
      members: (membersResult.data ?? []).filter((member) => member.room_id === room.id)
    }));

    return json({ rooms });
  } catch (error) {
    return errorJson(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const body = await request.json();
    const type = body.type === "channel" ? "channel" : "group";
    const name = String(body.name ?? "").trim();
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 180) : null;
    const memberIds = Array.isArray(body.memberIds)
      ? body.memberIds.filter((id: unknown) => typeof id === "string" && id !== user.id)
      : [];

    if (!name) {
      return json({ error: "Ten phong la bat buoc" }, { status: 400 });
    }

    const roomInsert = await supabase
      .from("rooms")
      .insert({
        type,
        name: name.slice(0, 80),
        description,
        created_by: user.id
      })
      .select("*")
      .single();

    if (roomInsert.error) throw roomInsert.error;

    const uniqueMemberIds = Array.from(new Set([user.id, ...memberIds]));
    const members = uniqueMemberIds.map((memberId) => ({
      room_id: roomInsert.data.id,
      user_id: memberId,
      role: memberId === user.id ? "admin" : "member"
    }));

    const memberInsert = await supabase.from("room_members").insert(members);
    if (memberInsert.error) throw memberInsert.error;

    return json({ room: roomInsert.data }, { status: 201 });
  } catch (error) {
    return errorJson(error);
  }
}
