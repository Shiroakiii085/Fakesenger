import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const { supabase } = await getRouteContext(request);
    const { roomId } = await context.params;

    const { data, error } = await supabase
      .from("messages")
      .select("id,room_id,user_id,body,created_at,edited_at,is_deleted,profiles:profiles(id,email,display_name,avatar_url,status)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) throw error;
    return json({ messages: data ?? [] });
  } catch (error) {
    return errorJson(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const { roomId } = await context.params;
    const body = await request.json();
    const message = String(body.body ?? "").trim();

    if (!message) {
      return json({ error: "Tin nhan khong duoc de trong" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        room_id: roomId,
        user_id: user.id,
        body: message.slice(0, 2000)
      })
      .select("id,room_id,user_id,body,created_at,edited_at,is_deleted,profiles:profiles(id,email,display_name,avatar_url,status)")
      .single();

    if (error) throw error;
    return json({ message: data }, { status: 201 });
  } catch (error) {
    return errorJson(error);
  }
}
