import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

function isMissingRequestsTable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; message?: unknown };
  return (
    value.code === "PGRST205" ||
    String(value.message ?? "")
      .toLowerCase()
      .includes("could not find the table 'public.member_requests'")
  );
}

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const { supabase } = await getRouteContext(request);
    const { roomId } = await context.params;

    const { data, error } = await supabase
      .from("member_requests")
      .select(
        "id,room_id,requester_id,target_user_id,status,decided_by,decided_at,created_at,requester:profiles!member_requests_requester_id_fkey(id,email,display_name,avatar_url,status),target:profiles!member_requests_target_user_id_fkey(id,email,display_name,avatar_url,status)"
      )
      .eq("room_id", roomId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      if (isMissingRequestsTable(error)) return json({ requests: [] });
      throw error;
    }
    return json({ requests: data ?? [] });
  } catch (error) {
    return errorJson(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const { roomId } = await context.params;
    const body = await request.json();
    const targetUserId = String(body.targetUserId ?? "");

    if (!targetUserId || targetUserId === user.id) {
      return json({ error: "Nguoi duoc them khong hop le." }, { status: 400 });
    }

    const existingMember = await supabase
      .from("room_members")
      .select("user_id")
      .eq("room_id", roomId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (existingMember.error) throw existingMember.error;
    if (existingMember.data) {
      return json({ error: "Nguoi nay da o trong nhom." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("member_requests")
      .insert({
        room_id: roomId,
        requester_id: user.id,
        target_user_id: targetUserId,
        status: "pending"
      })
      .select(
        "id,room_id,requester_id,target_user_id,status,decided_by,decided_at,created_at,requester:profiles!member_requests_requester_id_fkey(id,email,display_name,avatar_url,status),target:profiles!member_requests_target_user_id_fkey(id,email,display_name,avatar_url,status)"
      )
      .single();

    if (error) {
      if (isMissingRequestsTable(error)) {
        return json({ error: "Chua the gui yeu cau luc nay." }, { status: 400 });
      }
      if (error.code === "23505") {
        return json({ error: "Yeu cau nay dang cho duyet." }, { status: 409 });
      }
      throw error;
    }
    return json({ request: data }, { status: 201 });
  } catch (error) {
    return errorJson(error);
  }
}
