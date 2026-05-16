import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

type ChatRole = "user" | "assistant";

type IncomingMessage = {
  role?: unknown;
  content?: unknown;
};

type OpenRouterResponse = {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openrouter/auto";
const SYSTEM_PROMPT =
  "Bạn là trợ lý AI trong ứng dụng chat Fakesenger. Trả lời bằng tiếng Việt rõ ràng, hữu ích, ngắn gọn khi có thể, và lịch sự. Nếu người dùng hỏi bằng ngôn ngữ khác, hãy trả lời theo ngôn ngữ đó.";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

function normalizeMessages(messages: unknown): Array<{ role: ChatRole; content: string }> {
  if (!Array.isArray(messages)) return [];

  return messages
    .slice(-20)
    .map((item) => item as IncomingMessage)
    .filter((item): item is IncomingMessage & { role: ChatRole; content: string } => {
      return (
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        item.content.trim().length > 0
      );
    })
    .map((item) => ({
      role: item.role,
      content: item.content.trim().slice(0, 4000)
    }));
}

export async function POST(request: Request) {
  try {
    await getRouteContext(request);
    const body = await request.json().catch(() => ({}));
    const messages = normalizeMessages(body.messages);

    if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
      return json({ error: "Vui lòng gửi ít nhất một câu hỏi hợp lệ." }, { status: 400 });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requiredEnv("OPENROUTER_API_KEY")}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_NAME || "Fakesenger"
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        temperature: 0.7,
        max_tokens: 900
      })
    });

    const data = (await response.json().catch(() => ({}))) as OpenRouterResponse;
    if (!response.ok) {
      return json({ error: data.error?.message || "Không thể lấy phản hồi từ OpenRouter." }, { status: response.status });
    }

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return json({ error: "OpenRouter không trả về nội dung phản hồi." }, { status: 502 });
    }

    return json({
      message: content,
      model: data.model || DEFAULT_MODEL
    });
  } catch (error) {
    return errorJson(error, 500);
  }
}
