import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (error) throw error;
    return json({ profile: data });
  } catch (error) {
    return errorJson(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const body = await request.json().catch(() => ({}));
    const displayName =
      typeof body.displayName === "string" && body.displayName.trim()
        ? body.displayName.trim()
        : user.user_metadata?.display_name || user.email?.split("@")[0] || "Thanh vien moi";

    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email: user.email,
          display_name: displayName,
          status: "online"
        },
        { onConflict: "id" }
      )
      .select("*")
      .single();

    if (error) throw error;
    return json({ profile: data });
  } catch (error) {
    return errorJson(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const body = await request.json();
    const patch: Record<string, string | null> = {};

    if (typeof body.displayName === "string") {
      patch.display_name = body.displayName.trim().slice(0, 80);
    }
    if (typeof body.status === "string") {
      patch.status = body.status.trim().slice(0, 80);
    }
    if (typeof body.avatarUrl === "string") {
      patch.avatar_url = body.avatarUrl.trim() || null;
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", user.id)
      .select("*")
      .single();

    if (error) throw error;
    return json({ profile: data });
  } catch (error) {
    return errorJson(error);
  }
}
