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
  created_at: string;
  edited_at: string | null;
  is_deleted: boolean;
  profiles: Profile | null;
};
