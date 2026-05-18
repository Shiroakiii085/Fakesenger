import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

type ChatRole = "user" | "assistant";
type AiChatJobStatus = "pending" | "processing" | "completed" | "failed";

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

type AiChatJobRow = {
  id: string;
  user_id: string;
  request_messages: Array<{ role: ChatRole; content: string }>;
  status: AiChatJobStatus;
  response_message: string | null;
  response_model: string | null;
  response_sources: Array<{ title: string; url: string }> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free";
const SYSTEM_PROMPT =
  "B\u1ea1n l\u00e0 tr\u1ee3 l\u00fd AI trong \u1ee9ng d\u1ee5ng chat Fakesenger. Tr\u1ea3 l\u1eddi b\u1eb1ng ti\u1ebfng Vi\u1ec7t r\u00f5 r\u00e0ng, h\u1eefu \u00edch, l\u1ecbch s\u1ef1. M\u1eb7c \u0111\u1ecbnh tr\u1ea3 l\u1eddi ng\u1eafn g\u1ecdn trong 2-4 c\u00e2u ho\u1eb7c d\u01b0\u1edbi 180 t\u1eeb, ch\u1ec9 chi ti\u1ebft h\u01a1n khi ng\u01b0\u1eddi d\u00f9ng y\u00eau c\u1ea7u. N\u1ebfu ng\u01b0\u1eddi d\u00f9ng h\u1ecfi b\u1eb1ng ng\u00f4n ng\u1eef kh\u00e1c, h\u00e3y tr\u1ea3 l\u1eddi theo ng\u00f4n ng\u1eef \u0111\u00f3. Khi c\u00e2u h\u1ecfi ph\u1ee5 thu\u1ed9c v\u00e0o th\u00f4ng tin m\u1edbi, thay \u0111\u1ed5i theo th\u1eddi gian, ho\u1eb7c c\u1ea7n ki\u1ec3m ch\u1ee9ng tr\u00ean Internet, h\u00e3y ch\u1ee7 \u0111\u1ed9ng d\u00f9ng web search tr\u01b0\u1edbc khi tr\u1ea3 l\u1eddi nh\u01b0ng ch\u1ec9 l\u1ea5y nh\u1eefng ngu\u1ed3n th\u1eadt s\u1ef1 c\u1ea7n thi\u1ebft.";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function normalizeRequestId(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

function toPublicJob(job: AiChatJobRow) {
  return {
    requestId: job.id,
    status: job.status,
    message: job.response_message,
    model: job.response_model,
    sources: job.response_sources ?? [],
    error: job.error_message
  };
}

async function readJob(request: Request, requestId: string) {
  const { supabase, user } = await getRouteContext(request);
  const { data, error } = await supabase
    .from("ai_chat_jobs")
    .select("id,user_id,request_messages,status,response_message,response_model,response_sources,error_message,created_at,updated_at")
    .eq("id", requestId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data as AiChatJobRow | null;
}

async function requestCompletion(messages: Array<{ role: ChatRole; content: string }>) {
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
    throw new Error(data.error?.message || "Kh\u00f4ng th\u1ec3 l\u1ea5y ph\u1ea3n h\u1ed3i t\u1eeb OpenRouter.");
  }

  const message = data.choices?.[0]?.message;
  const content = message?.content?.trim();
  if (!content) {
    throw new Error("OpenRouter kh\u00f4ng tr\u1ea3 v\u1ec1 n\u1ed9i dung ph\u1ea3n h\u1ed3i.");
  }

  return {
    message: content,
    model: data.model || DEFAULT_MODEL,
    sources: extractSources(message?.annotations)
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestId = normalizeRequestId(url.searchParams.get("requestId"));
    if (!requestId) {
      return json({ error: "Thi\u1ebfu requestId h\u1ee3p l\u1ec7." }, { status: 400 });
    }

    const job = await readJob(request, requestId);
    if (!job) {
      return json({ error: "Kh\u00f4ng t\u00ecm th\u1ea5y y\u00eau c\u1ea7u AI n\u00e0y." }, { status: 404 });
    }

    return json(toPublicJob(job));
  } catch (error) {
    return errorJson(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const body = await request.json().catch(() => ({}));
    const requestId = normalizeRequestId(body.requestId);
    const messages = normalizeMessages(body.messages);

    if (!requestId) {
      return json({ error: "requestId kh\u00f4ng h\u1ee3p l\u1ec7." }, { status: 400 });
    }

    if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
      return json({ error: "Vui l\u00f2ng g\u1eedi \u00edt nh\u1ea5t m\u1ed9t c\u00e2u h\u1ecfi h\u1ee3p l\u1ec7." }, { status: 400 });
    }

    const existingJob = await readJob(request, requestId);
    if (existingJob) {
      return json(toPublicJob(existingJob));
    }

    const { data: insertedJob, error: insertError } = await supabase
      .from("ai_chat_jobs")
      .insert({
        id: requestId,
        user_id: user.id,
        request_messages: messages,
        status: "processing"
      })
      .select("id,user_id,request_messages,status,response_message,response_model,response_sources,error_message,created_at,updated_at")
      .single();

    if (insertError) throw insertError;

    try {
      const completion = await requestCompletion(messages);
      const { data: completedJob, error: updateError } = await supabase
        .from("ai_chat_jobs")
        .update({
          status: "completed",
          response_message: completion.message,
          response_model: completion.model,
          response_sources: completion.sources,
          error_message: null
        })
        .eq("id", requestId)
        .eq("user_id", user.id)
        .select("id,user_id,request_messages,status,response_message,response_model,response_sources,error_message,created_at,updated_at")
        .single();

      if (updateError) throw updateError;
      return json(toPublicJob(completedJob as AiChatJobRow));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Kh\u00f4ng th\u1ec3 x\u1eed l\u00fd y\u00eau c\u1ea7u AI.";
      const { data: failedJob, error: updateError } = await supabase
        .from("ai_chat_jobs")
        .update({
          status: "failed",
          error_message: errorMessage
        })
        .eq("id", requestId)
        .eq("user_id", user.id)
        .select("id,user_id,request_messages,status,response_message,response_model,response_sources,error_message,created_at,updated_at")
        .single();

      if (updateError) throw updateError;
      return json(toPublicJob((failedJob ?? insertedJob) as AiChatJobRow));
    }
  } catch (error) {
    return errorJson(error, 500);
  }
}
