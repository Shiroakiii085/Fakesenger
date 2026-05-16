import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

type AiInputMessage = {
  role: "user" | "assistant";
  content: string;
};

function readAssistantText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const directText = (payload as { output_text?: unknown }).output_text;
  if (typeof directText === "string" && directText.trim()) {
    return directText.trim();
  }

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";

  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || !Array.isArray((item as { content?: unknown }).content)) {
        return [];
      }

      return (item as { content: unknown[] }).content
        .map((content) => {
          if (!content || typeof content !== "object") return "";
          const type = (content as { type?: unknown }).type;
          const text = (content as { text?: unknown }).text;
          return type === "output_text" && typeof text === "string" ? text : "";
        })
        .filter(Boolean);
    })
    .join("\n")
    .trim();
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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json({ error: "Chatbot AI chưa được cấu hình." }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const messages = normalizeMessages(body.messages);
    const lastMessage = messages.at(-1);
    if (!lastMessage || lastMessage.role !== "user") {
      return json({ error: "Vui lòng nhập câu hỏi cho chatbot." }, { status: 400 });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions:
          "Bạn là trợ lý AI trong ứng dụng chat Fakesenger. Trả lời bằng tiếng Việt rõ ràng, ngắn gọn, hữu ích và lịch sự. Khi người dùng hỏi về kỹ thuật, ưu tiên các bước có thể làm ngay.",
        input: messages,
        max_output_tokens: 700,
        store: false
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: { message?: unknown } }).error?.message ?? "")
          : "";
      return json(
        { error: providerMessage || "Không thể gọi chatbot AI lúc này." },
        { status: response.status >= 500 ? 502 : response.status }
      );
    }

    const message = readAssistantText(payload);
    if (!message) {
      throw new Error("Chatbot AI chưa trả về nội dung.");
    }

    return json({ message });
  } catch (error) {
    return errorJson(error);
  }
}
