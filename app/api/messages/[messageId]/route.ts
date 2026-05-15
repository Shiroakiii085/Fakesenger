import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

export async function DELETE(request: Request, context: { params: Promise<{ messageId: string }> }) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const { messageId } = await context.params;
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");

    if (scope === "self") {
      const { error } = await supabase.from("message_hides").insert({ message_id: messageId, user_id: user.id });
      if (error) throw error;
      return json({ ok: true });
    }

    const { data, error } = await supabase
      .from("messages")
      .update({
        body: "Tin nhan da duoc go",
        media_url: null,
        is_deleted: true,
        edited_at: new Date().toISOString()
      })
      .eq("id", messageId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) return json({ error: "Ban khong the go tin nhan nay." }, { status: 403 });
    return json({ ok: true });
  } catch (error) {
    return errorJson(error);
  }
}
