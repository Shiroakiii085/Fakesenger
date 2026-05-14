import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();

    if (q.length < 2) {
      return json({ profiles: [] });
    }

    const escaped = q.replaceAll("%", "\\%").replaceAll("_", "\\_");
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,display_name,avatar_url,status")
      .neq("id", user.id)
      .or(`display_name.ilike.%${escaped}%,email.ilike.%${escaped}%`)
      .limit(10);

    if (error) throw error;
    return json({ profiles: data ?? [] });
  } catch (error) {
    return errorJson(error);
  }
}
