import { errorJson, getRouteContext, json } from "@/lib/supabase-route";

function isMissingRequestsTable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; message?: unknown };
  return (
    value.code === "PGRST205" ||
    String(value.message ?? "")
      .toLowerCase()
      .includes("member_requests")
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ roomId: string; requestId: string }> }
) {
  try {
    const { supabase, user } = await getRouteContext(request);
    const { roomId, requestId } = await context.params;
    const body = await request.json();
    const action = body.action === "reject" ? "reject" : "approve";

    const requestResult = await supabase
      .from("member_requests")
      .select("id,room_id,target_user_id,status")
      .eq("id", requestId)
      .eq("room_id", roomId)
      .eq("status", "pending")
      .single();

    if (requestResult.error) {
      if (isMissingRequestsTable(requestResult.error)) {
        return json({ error: "Chưa thể xử lý yêu cầu lúc này." }, { status: 400 });
      }
      throw requestResult.error;
    }

    if (action === "approve") {
      const memberInsert = await supabase
        .from("room_members")
        .insert({ room_id: roomId, user_id: requestResult.data.target_user_id, role: "member" });
      if (memberInsert.error && memberInsert.error.code !== "23505") throw memberInsert.error;
    }

    const { data, error } = await supabase
      .from("member_requests")
      .update({
        status: action === "approve" ? "approved" : "rejected",
        decided_by: user.id,
        decided_at: new Date().toISOString()
      })
      .eq("id", requestId)
      .select(
        "id,room_id,requester_id,target_user_id,status,decided_by,decided_at,created_at,requester:profiles!member_requests_requester_id_fkey(id,email,display_name,avatar_url,status),target:profiles!member_requests_target_user_id_fkey(id,email,display_name,avatar_url,status)"
      )
      .single();

    if (error) {
      if (isMissingRequestsTable(error)) {
        return json({ error: "Chưa thể xử lý yêu cầu lúc này." }, { status: 400 });
      }
      throw error;
    }
    return json({ request: data });
  } catch (error) {
    return errorJson(error);
  }
}
