import { createOpenRouterChatCompletion, hasOpenRouterApiKey, OpenRouterError } from "@/lib/openrouter";
import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

type AiInputMessage = {
  role: "user" | "assistant";
  content: string;
};

function normalizeMessages(value: unknown): AiInputMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((message) => {
      if (!message || typeof message !== "object") return null;
      const role = (message as { role?: unknown }).role;
      const content = (message as { content?: unknown }).content;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;

      const trimmed = content.trim().slice(0, 4000);
      return trimmed ? { role, content: trimmed } : null;
    })
    .filter((message): message is AiInputMessage => Boolean(message))
    .slice(-16);
}

export async function POST(request: Request) {
  try {
    await getRouteContext(request);

    if (!hasOpenRouterApiKey()) {
      return json({ error: "Chatbot AI chưa được cấu hình OPENROUTER_API_KEY." }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const messages = normalizeMessages(body.messages);
    const lastMessage = messages.at(-1);
    if (!lastMessage || lastMessage.role !== "user") {
      return json({ error: "Vui lòng nhập câu hỏi cho chatbot." }, { status: 400 });
    }

    const message = await createOpenRouterChatCompletion([
      {
        role: "system",
        content:
          "Bạn là trợ lý AI trong ứng dụng chat Fakesenger. Trả lời bằng tiếng Việt rõ ràng, ngắn gọn, hữu ích và lịch sự. Khi người dùng hỏi về kỹ thuật, ưu tiên các bước có thể làm ngay."
      },
      ...messages
    ]);

    return json({ message });
  } catch (error) {
    if (error instanceof OpenRouterError) {
      return json({ error: error.message }, { status: error.status >= 400 && error.status < 600 ? error.status : 502 });
    }

    return errorJson(error);
  }
}
