import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

type ChatRole = "user" | "assistant";

type IncomingMessage = {
  role?: unknown;
  content?: unknown;
};

type OpenRouterAnnotation = {
  type?: string;
  url_citation?: {
    url?: string;
    title?: string;
  };
};

type OpenRouterResponse = {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      annotations?: OpenRouterAnnotation[];
    };
  }>;
  error?: {
    message?: string;
  };
};

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free";
const SYSTEM_PROMPT =
  "Bạn là trợ lý AI trong ứng dụng chat Fakesenger. Trả lời bằng tiếng Việt rõ ràng, hữu ích, lịch sự. Mặc định trả lời ngắn gọn trong 2-4 câu hoặc dưới 180 từ, chỉ chi tiết hơn khi người dùng yêu cầu. Nếu người dùng hỏi bằng ngôn ngữ khác, hãy trả lời theo ngôn ngữ đó. Khi câu hỏi phụ thuộc vào thông tin mới, thay đổi theo thời gian, hoặc cần kiểm chứng trên Internet, hãy chủ động dùng web search trước khi trả lời nhưng chỉ lấy những nguồn thật sự cần thiết.";

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
    .slice(-12)
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
      content: item.content.trim().slice(0, 2500)
    }));
}

function extractSources(annotations?: OpenRouterAnnotation[]) {
  const seen = new Set<string>();

  return (annotations ?? [])
    .filter((annotation) => annotation?.type === "url_citation")
    .map((annotation) => ({
      title: annotation.url_citation?.title?.trim() || annotation.url_citation?.url?.trim() || "",
      url: annotation.url_citation?.url?.trim() || ""
    }))
    .filter((source) => {
      if (!source.title || !source.url || seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    })
    .slice(0, 3);
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
        tools: [
          {
            type: "openrouter:web_search",
            parameters: {
              max_results: 3,
              max_total_results: 4,
              search_context_size: "low"
            }
          }
        ],
        temperature: 0.5,
        max_completion_tokens: 420
      })
    });

    const data = (await response.json().catch(() => ({}))) as OpenRouterResponse;
    if (!response.ok) {
      return json({ error: data.error?.message || "Không thể lấy phản hồi từ OpenRouter." }, { status: response.status });
    }

    const message = data.choices?.[0]?.message;
    const content = message?.content?.trim();
    if (!content) {
      return json({ error: "OpenRouter không trả về nội dung phản hồi." }, { status: 502 });
    }

    return json({
      message: content,
      model: data.model || DEFAULT_MODEL,
      sources: extractSources(message?.annotations)
    });
  } catch (error) {
    return errorJson(error, 500);
  }
}
