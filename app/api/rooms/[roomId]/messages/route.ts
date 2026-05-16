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

    // Process mentions and ChatBot
    if (kind === "text" && message.includes("@")) {
      const { data: roomMembers } = await supabase
        .from("room_members")
        .select("user_id, profiles!inner(display_name)")
        .eq("room_id", roomId);
        
      if (roomMembers) {
        const notifications = [];
        for (const member of roomMembers) {
          // Type casting since Supabase typings might not know profiles is an object here
          const profile = member.profiles as any;
          const name = profile?.display_name;
          if (name && member.user_id !== user.id && message.includes(`@${name}`)) {
            notifications.push({
              user_id: member.user_id,
              actor_id: user.id,
              room_id: roomId,
              type: "mention",
              message: `${(data.profiles as any)?.display_name || 'Ai đó'} đã nhắc đến bạn.`
            });
          }
        }
        if (notifications.length > 0) {
          await supabase.from("notifications").insert(notifications);
        }
      }

      if (message.includes("@ChatBot")) {
        const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
        if (apiKey) {
          const { data: recentMessages } = await supabase
            .from("messages")
            .select("body, user_id, profiles:profiles!messages_user_id_fkey(display_name)")
            .eq("room_id", roomId)
            .eq("kind", "text")
            .order("created_at", { ascending: false })
            .limit(10);
            
          const chatMessages = (recentMessages || []).reverse().map(m => ({
            role: m.user_id === "00000000-0000-0000-0000-000000000000" ? "assistant" : "user",
            content: `${(m.profiles as any)?.display_name || 'User'}: ${m.body}`
          }));

          fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
              "X-Title": "Fakesenger",
            },
            body: JSON.stringify({
              model: process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || "meta-llama/llama-3.2-3b-instruct:free",
              messages: [
                {
                  role: "system",
                  content: "Bạn là trợ lý AI tên ChatBot trong ứng dụng chat Fakesenger. Bạn đang tham gia một nhóm chat. Trả lời bằng tiếng Việt rõ ràng, ngắn gọn."
                },
                ...chatMessages
              ],
              max_tokens: 700
            })
          })
          .then(res => res.json())
          .then(async payload => {
            let reply = "";
            const choices = payload?.choices;
            if (Array.isArray(choices) && choices.length > 0) {
              reply = choices[0]?.message?.content || "";
            }
            if (reply.trim()) {
              await supabase.from("messages").insert({
                room_id: roomId,
                user_id: "00000000-0000-0000-0000-000000000000",
                body: reply.trim(),
                kind: "text"
              });
            }
          })
          .catch(e => console.error("ChatBot fetch error:", e));
        }
      }
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
