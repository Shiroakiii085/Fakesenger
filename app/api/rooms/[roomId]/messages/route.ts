import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const { roomId } = await context.params;

    const { data: memberData } = await supabase
      .from("room_members")
      .select("cleared_at")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .single();
    const clearedAt = memberData?.cleared_at;

    const hiddenResult = await supabase.from("message_hides").select("message_id").eq("user_id", user.id);
    if (hiddenResult.error) throw hiddenResult.error;
    const hiddenMessageIds = (hiddenResult.data ?? []).map((item) => item.message_id);

    let query = supabase
      .from("messages")
      .select("id,room_id,user_id,body,kind,media_url,call_status,call_duration_seconds,created_at,edited_at,is_deleted,profiles:profiles!messages_user_id_fkey(id,email,display_name,avatar_url,status)")
      .eq("room_id", roomId);

    if (clearedAt) {
      query = query.gt("created_at", clearedAt);
    }

    const { data, error } = await query.order("created_at", { ascending: true }).limit(200);

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
    const kind = body.kind === "image" || body.kind === "audio" || body.kind === "call" ? body.kind : "text";
    const message = String(body.body ?? "").trim();
    const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl.trim() : null;
    const callStatus =
      body.callStatus === "ringing" ||
      body.callStatus === "active" ||
      body.callStatus === "completed" ||
      body.callStatus === "missed" ||
      body.callStatus === "rejected"
        ? body.callStatus
        : null;

    if (!message && kind === "text") {
      return json({ error: "Tin nhan khong duoc de trong" }, { status: 400 });
    }
    if (kind !== "text" && !mediaUrl) {
      if (kind !== "call") return json({ error: "Thieu tep dinh kem" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        room_id: roomId,
        user_id: user.id,
        body: message.slice(0, 2000) || (kind === "image" ? "Anh" : kind === "audio" ? "Tin nhan am thanh" : "Cuoc goi video"),
        kind,
        media_url: mediaUrl,
        call_status: callStatus
      })
      .select("id,room_id,user_id,body,kind,media_url,call_status,call_duration_seconds,created_at,edited_at,is_deleted,profiles:profiles!messages_user_id_fkey(id,email,display_name,avatar_url,status)")
      .single();

    if (error) throw error;

    const { data: roomMembers, error: roomMembersError } = await supabase
      .from("room_members")
      .select("user_id, profiles!inner(display_name)")
      .eq("room_id", roomId);
    if (roomMembersError) throw roomMembersError;

    const senderName = (data.profiles as { display_name?: string } | null)?.display_name || "Ai \u0111\u00f3";
    const preview =
      kind === "image"
        ? `${senderName} \u0111\u00e3 g\u1eedi m\u1ed9t \u1ea3nh.`
        : kind === "audio"
          ? `${senderName} \u0111\u00e3 g\u1eedi m\u1ed9t tin nh\u1eafn tho\u1ea1i.`
          : kind === "call"
            ? `${senderName} \u0111\u00e3 b\u1eaft \u0111\u1ea7u m\u1ed9t cu\u1ed9c g\u1ecdi.`
            : `${senderName}: ${message.slice(0, 120)}`;

    const notifications = (roomMembers ?? [])
      .filter((member) => member.user_id !== user.id)
      .map((member) => {
        const profile = member.profiles as { display_name?: string } | null;
        const mentioned = kind === "text" && profile?.display_name && message.includes(`@${profile.display_name}`);
        return {
          user_id: member.user_id,
          actor_id: user.id,
          room_id: roomId,
          type: mentioned ? "mention" : "message",
          message: mentioned ? `${senderName} \u0111\u00e3 nh\u1eafc \u0111\u1ebfn b\u1ea1n.` : preview
        };
      });

    if (notifications.length > 0) {
      await supabase.from("notifications").insert(notifications);
    }

    return json({ message: data }, { status: 201 });
  } catch (error) {
    return errorJson(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const { roomId } = await context.params;

    const memberResult = await supabase
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberResult.error) throw memberResult.error;
    if (memberResult.data?.role !== "admin") {
      return json({ error: "Chi quan tri vien moi co the xoa toan bo tin nhan." }, { status: 403 });
    }

    const { error } = await supabase.from("messages").delete().eq("room_id", roomId);
    if (error) throw error;
    return json({ ok: true });
  } catch (error) {
    return errorJson(error);
  }
}
