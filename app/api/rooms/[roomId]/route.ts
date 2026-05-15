import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

export async function DELETE(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const { supabase } = await getRouteContext(request);
    const { roomId } = await context.params;

    const { data, error } = await supabase.from("rooms").delete().eq("id", roomId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "Ban khong the xoa phong nay." }, { status: 403 });
    return json({ ok: true });
  } catch (error) {
    return errorJson(error);
  }
}
