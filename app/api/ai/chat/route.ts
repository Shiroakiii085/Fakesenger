import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

type AiInputMessage = {
  role: "user" | "assistant";
  content: string;
};

function readAssistantText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const choices = (payload as { choices?: unknown }).choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const firstChoice = choices[0];
    if (firstChoice && typeof firstChoice === "object") {
      const message = (firstChoice as { message?: unknown }).message;
      if (message && typeof message === "object") {
        const content = (message as { content?: unknown }).content;
        if (typeof content === "string" && content.trim()) {
          return content.trim();
        }
      }
    }
  }

  return "";
}

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

    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json({ error: "Chatbot AI chưa được cấu hình." }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const messages = normalizeMessages(body.messages);
    const lastMessage = messages.at(-1);
    if (!lastMessage || lastMessage.role !== "user") {
      return json({ error: "Vui lòng nhập câu hỏi cho chatbot." }, { status: 400 });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Fakesenger",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini",
        messages: [
          {
            role: "system",
            content:
              "Bạn là trợ lý AI trong ứng dụng chat Fakesenger. Trả lời bằng tiếng Việt rõ ràng, ngắn gọn, hữu ích và lịch sự. Khi người dùng hỏi về kỹ thuật, ưu tiên các bước có thể làm ngay."
          },
          ...messages
        ],
        max_tokens: 700
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: { message?: unknown } }).error?.message ?? "")
          : "";
      return json(
        { error: providerMessage ? `Lỗi từ AI: ${providerMessage}` : "Không thể gọi chatbot AI lúc này." },
        { status: 400 } // Always return 400 or 502, but standard 400 allows frontend to show error text correctly without throwing unhandled exceptions if the fetch wrapper is picky
      );
    }

    const message = readAssistantText(payload);
    if (!message) {
      console.error("Lỗi parse nội dung từ AI payload:", JSON.stringify(payload));
      return json({ error: "Chatbot AI trả về dữ liệu không hợp lệ. Vui lòng thử lại hoặc đổi model khác." }, { status: 400 });
    }

    return json({ message });
  } catch (error) {
    return errorJson(error);
  }
}
