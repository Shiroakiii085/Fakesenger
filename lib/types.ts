export type RoomType = "direct" | "group" | "channel";
export type MemberRole = "admin" | "member";

export type Profile = {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  status: string | null;
};

export type RoomMember = {
  room_id: string;
  user_id: string;
  role: MemberRole;
  profiles: Profile | null;
};

export type Room = {
  id: string;
  type: RoomType;
  name: string | null;
  description: string | null;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  members: RoomMember[];
};

export type Message = {
  id: string;
  room_id: string;
  user_id: string;
  body: string;
  kind: "text" | "image" | "audio" | "call";
  media_url: string | null;
  call_status: "ringing" | "active" | "completed" | "missed" | "rejected" | null;
  call_duration_seconds: number | null;
  created_at: string;
  edited_at: string | null;
  is_deleted: boolean;
  profiles: Profile | null;
};

export type MemberRequestStatus = "pending" | "approved" | "rejected";

export type MemberRequest = {
  id: string;
  room_id: string;
  requester_id: string;
  target_user_id: string;
  status: MemberRequestStatus;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  requester: Profile | null;
  target: Profile | null;
};

export type AppNotification = {
  id: string;
  user_id: string;
  actor_id: string | null;
  room_id: string | null;
  type: "mention" | "system";
  message: string;
  is_read: boolean;
  created_at: string;
};
