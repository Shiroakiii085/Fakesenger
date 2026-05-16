export type OpenRouterChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const CHATBOT_USER_ID = "00000000-0000-0000-0000-000000000000";

const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5-mini";

export class OpenRouterError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
  }
}

export function hasOpenRouterApiKey() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export function resolveOpenRouterModel() {
  const configuredModel = (process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || DEFAULT_OPENROUTER_MODEL).trim();
  if (!configuredModel) return DEFAULT_OPENROUTER_MODEL;

  // Older project env files used bare OpenAI names such as "gpt-5-mini".
  // OpenRouter expects provider/model slugs, so preserve valid slugs and upgrade bare names.
  return configuredModel.includes("/") ? configuredModel : `openai/${configuredModel}`;
}

function readTextContent(content: unknown): string {
  if (typeof content === "string") return content.trim();

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";

        const record = part as { type?: unknown; text?: unknown; content?: unknown };
        if (typeof record.text === "string") return record.text;
        if (record.type === "text" && typeof record.content === "string") return record.content;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (content && typeof content === "object") {
    const record = content as { text?: unknown };
    if (typeof record.text === "string") return record.text.trim();
  }

  return "";
}

export function readOpenRouterAssistantText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object") return "";

  const message = (firstChoice as { message?: unknown }).message;
  if (!message || typeof message !== "object") return "";

  return readTextContent((message as { content?: unknown }).content);
}

export function readOpenRouterErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const error = (payload as { error?: unknown }).error;
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error !== "object") return "";

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

export async function createOpenRouterChatCompletion(messages: OpenRouterChatMessage[], maxCompletionTokens = 700) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new OpenRouterError("ChatBot chưa được cấu hình OPENROUTER_API_KEY.", 503);
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
      model: resolveOpenRouterModel(),
      messages,
      max_completion_tokens: maxCompletionTokens
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = readOpenRouterErrorMessage(payload);
    throw new OpenRouterError(providerMessage ? `Lỗi từ OpenRouter: ${providerMessage}` : "Không thể gọi OpenRouter lúc này.", response.status);
  }

  const message = readOpenRouterAssistantText(payload);
  if (!message) {
    throw new OpenRouterError("ChatBot AI chưa trả về nội dung.", 502);
  }

  return message;
}
