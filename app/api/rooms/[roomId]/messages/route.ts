import { CHATBOT_USER_ID, createOpenRouterChatCompletion, hasOpenRouterApiKey } from "@/lib/openrouter";
import { errorJson, getRouteContext, json, type RouteContext } from "@/lib/supabase-route";

const CHATBOT_MENTION_PATTERN = /(^|\s)@chatbot\b/i;

function hasChatbotMention(message: string) {
  return CHATBOT_MENTION_PATTERN.test(message);
}

function getChatbotErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "");
    if (message.includes("insert_chatbot_message")) {
      return "ChatBot chưa được bật trong cơ sở dữ liệu. Hãy chạy lại script Supabase mới nhất.";
    }
    return message || "ChatBot chưa thể phản hồi lúc này.";
  }

  return "ChatBot chưa thể phản hồi lúc này.";
}

async function createChatbotReply(supabase: RouteContext["supabase"], roomId: string) {
  if (!hasOpenRouterApiKey()) {
    throw new Error("ChatBot chưa được cấu hình OPENROUTER_API_KEY.");
  }

  const { data: recentMessages, error: recentMessagesError } = await supabase
    .from("messages")
    .select("body, user_id, profiles:profiles!messages_user_id_fkey(display_name)")
    .eq("room_id", roomId)
    .eq("kind", "text")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(12);

  if (recentMessagesError) throw recentMessagesError;

  const chatMessages = (recentMessages ?? [])
    .reverse()
    .map((message) => ({
      role: message.user_id === CHATBOT_USER_ID ? ("assistant" as const) : ("user" as const),
      content: `${(message.profiles as { display_name?: string } | null)?.display_name || "User"}: ${message.body}`
    }));

  const reply = await createOpenRouterChatCompletion([
    {
      role: "system",
      content:
        "Bạn là trợ lý AI tên ChatBot trong ứng dụng chat Fakesenger. Bạn đang tham gia một phòng chat. Trả lời bằng tiếng Việt rõ ràng, ngắn gọn, hữu ích, và chỉ trả lời nội dung người dùng vừa hỏi."
    },
    ...chatMessages
  ]);

  const { error } = await supabase.rpc("insert_chatbot_message", {
    target_room_id: roomId,
    content: reply
  });

  if (error) throw error;
}

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

    let chatbotError: string | null = null;

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
          const profile = member.profiles as { display_name?: string } | null;
          const name = profile?.display_name;
          if (name && member.user_id !== user.id && message.includes(`@${name}`)) {
            notifications.push({
              user_id: member.user_id,
              actor_id: user.id,
              room_id: roomId,
              type: "mention",
              message: `${(data.profiles as { display_name?: string } | null)?.display_name || "Ai đó"} đã nhắc đến bạn.`
            });
          }
        }
        if (notifications.length > 0) {
          await supabase.from("notifications").insert(notifications);
        }
      }

      if (hasChatbotMention(message)) {
        try {
          await createChatbotReply(supabase, roomId);
        } catch (error) {
          console.error("ChatBot reply error:", error);
          chatbotError = getChatbotErrorMessage(error);
        }
      }
    }

    return json({ message: data, chatbotError }, { status: 201 });
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
