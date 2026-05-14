import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export type RouteContext = {
  supabase: SupabaseClient;
  user: User;
};

function env(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const [type, token] = header.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}

export async function getRouteContext(request: Request): Promise<RouteContext> {
  const token = getBearerToken(request);
  if (!token) {
    throw new Response(JSON.stringify({ error: "Missing bearer token" }), { status: 401 });
  }

  const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Response(JSON.stringify({ error: "Invalid session" }), { status: 401 });
  }

  return { supabase, user: data.user };
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

export function errorJson(error: unknown, status = 400) {
  if (error instanceof Response) {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message);
    const details = "details" in error ? String((error as { details?: unknown }).details ?? "") : "";
    const hint = "hint" in error ? String((error as { hint?: unknown }).hint ?? "") : "";

    return json({ error: [message, details, hint].filter(Boolean).join(" ") }, { status });
  }

  const message = error instanceof Error ? error.message : "Có lỗi xảy ra. Vui lòng thử lại.";
  return json({ error: message }, { status });
}
