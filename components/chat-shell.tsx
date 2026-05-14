"use client";

import {
  Bell,
  Hash,
  Check,
  Clock,
  LogOut,
  MessageCircle,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  UserMinus,
  Users,
  X
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserSupabase, hasSupabaseBrowserEnv } from "@/lib/supabase-browser";
import type { MemberRequest, Message, Profile, Room, RoomMember, RoomType } from "@/lib/types";

type ApiOptions = {
  method?: string;
  body?: unknown;
};

function initials(name?: string | null) {
  const value = name?.trim() || "?";
  return value
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

function roomIcon(type: RoomType) {
  if (type === "channel") return <Bell size={17} />;
  if (type === "group") return <Hash size={17} />;
  return <MessageCircle size={17} />;
}

function authErrorMessage(error: unknown, mode: "login" | "signup") {
  if (!(error instanceof Error)) {
    return mode === "signup" ? "Không thể đăng ký." : "Không thể đăng nhập.";
  }

  const code = (error as { code?: unknown }).code;
  if (code === "email_address_invalid") {
    return "Supabase không chấp nhận email này. Hãy dùng email thật, ví dụ Gmail, Outlook hoặc email trường.";
  }
  if (code === "signup_disabled") {
    return "Supabase đang tắt đăng ký. Vào Authentication > Providers > Email và bật Allow new users to sign up.";
  }
  if (code === "weak_password") {
    return "Mật khẩu quá yếu. Hãy dùng mật khẩu dài hơn, tối thiểu 6 ký tự.";
  }
  if (code === "over_email_send_rate_limit" || code === "email_rate_limit_exceeded") {
    return "Supabase đang giới hạn gửi email xác nhận. Hãy tắt Confirm email trong Supabase để demo nhanh, hoặc đợi vài phút rồi thử lại.";
  }

  return error.message;
}

export function ChatShell() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const isSupabaseConfigured = hasSupabaseBrowserEnv();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [notice, setNotice] = useState("");
  const [isRoomComposerOpen, setIsRoomComposerOpen] = useState(false);
  const [newRoomType, setNewRoomType] = useState<"group" | "channel">("group");
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDescription, setNewRoomDescription] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Profile[]>([]);
  const [profileDraft, setProfileDraft] = useState({ displayName: "", status: "" });
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<Profile[]>([]);
  const [memberRequests, setMemberRequests] = useState<MemberRequest[]>([]);
  const [isMemberActionBusy, setIsMemberActionBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) ?? null,
    [rooms, activeRoomId]
  );

  const currentMember = useMemo(
    () => activeRoom?.members.find((member) => member.user_id === profile?.id) ?? null,
    [activeRoom, profile?.id]
  );

  const canSend = Boolean(activeRoom && (activeRoom.type !== "channel" || currentMember?.role === "admin"));
  const isRoomAdmin = currentMember?.role === "admin";
  const activeRoomMemberIds = useMemo(
    () => new Set(activeRoom?.members.map((member) => member.user_id) ?? []),
    [activeRoom?.members]
  );

  const authFetch = useCallback(
    async <T,>(url: string, options: ApiOptions = {}): Promise<T> => {
      const token = session?.access_token;
      if (!token) {
        throw new Error("Bạn cần đăng nhập lại.");
      }

      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Request thất bại.");
      }

      return data as T;
    },
    [session?.access_token]
  );

  const getRoomTitle = useCallback(
    (room: Room) => {
      if (room.type !== "direct") return room.name || "Phòng chưa đặt tên";
      const other = room.members.find((member) => member.user_id !== profile?.id)?.profiles;
      return other?.display_name || "Tin nhắn riêng";
    },
    [profile?.id]
  );

  const getRoomSubtitle = useCallback(
    (room: Room) => {
      if (room.type === "channel") return "Kênh thông báo, chỉ admin gửi";
      if (room.type === "group") return `${room.members.length} thành viên cùng chat`;
      const other = room.members.find((member) => member.user_id !== profile?.id)?.profiles;
      return other?.email || "Chat 1:1";
    },
    [profile?.id]
  );

  const loadRooms = useCallback(async () => {
    if (!session) return;
    const data = await authFetch<{ rooms: Room[] }>("/api/rooms");
    setRooms(data.rooms);
    setActiveRoomId((current) => current ?? data.rooms[0]?.id ?? null);
  }, [authFetch, session]);

  const bootstrapProfile = useCallback(
    async (nextSession: Session) => {
      const response = await fetch("/api/me", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${nextSession.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ displayName: nextSession.user.user_metadata?.display_name })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Không thể tạo hồ sơ.");
      }

      setProfile(data.profile);
      setProfileDraft({
        displayName: data.profile.display_name || "",
        status: data.profile.status || ""
      });
    },
    []
  );

  const loadMessages = useCallback(
    async (roomId: string) => {
      const data = await authFetch<{ messages: Message[] }>(`/api/rooms/${roomId}/messages`);
      setMessages(data.messages);
    },
    [authFetch]
  );

  const loadMemberRequests = useCallback(
    async (roomId: string) => {
      const data = await authFetch<{ requests: MemberRequest[] }>(`/api/rooms/${roomId}/member-requests`);
      setMemberRequests(data.requests);
    },
    [authFetch]
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        await bootstrapProfile(data.session).catch((error) => setNotice(error.message));
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        bootstrapProfile(nextSession).catch((error) => setNotice(error.message));
      } else {
        setProfile(null);
        setRooms([]);
        setMessages([]);
        setActiveRoomId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [bootstrapProfile, isSupabaseConfigured, supabase]);

  useEffect(() => {
    loadRooms().catch((error) => setNotice(error.message));
  }, [loadRooms, profile?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    if (!activeRoomId) {
      setMessages([]);
      return;
    }

    loadMessages(activeRoomId).catch((error) => setNotice(error.message));

    const channel = supabase
      .channel(`room-${activeRoomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${activeRoomId}` },
        () => loadMessages(activeRoomId).catch((error) => setNotice(error.message))
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeRoomId, isSupabaseConfigured, loadMessages, supabase]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeRoomId]);

  useEffect(() => {
    setIsDetailsOpen(false);
    setMemberSearchQuery("");
    setMemberSearchResults([]);
    setMemberRequests([]);
  }, [activeRoomId]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      if (!searchQuery.trim() || !session) {
        setSearchResults([]);
        return;
      }

      try {
        const data = await authFetch<{ profiles: Profile[] }>(
          `/api/profiles/search?q=${encodeURIComponent(searchQuery.trim())}`
        );
        setSearchResults(data.profiles);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Không thể tìm người dùng.");
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [authFetch, searchQuery, session]);

  useEffect(() => {
    if (!isDetailsOpen || !activeRoom || activeRoom.type === "direct") return;
    loadMemberRequests(activeRoom.id).catch((error) => setNotice(error.message));
  }, [activeRoom, isDetailsOpen, loadMemberRequests]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      if (!isDetailsOpen || !memberSearchQuery.trim() || !session) {
        setMemberSearchResults([]);
        return;
      }

      try {
        const data = await authFetch<{ profiles: Profile[] }>(
          `/api/profiles/search?q=${encodeURIComponent(memberSearchQuery.trim())}`
        );
        setMemberSearchResults(data.profiles.filter((user) => !activeRoomMemberIds.has(user.id)));
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Khong the tim nguoi dung.");
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [activeRoomMemberIds, authFetch, isDetailsOpen, memberSearchQuery, session]);

  if (!isSupabaseConfigured) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">
            <Settings size={34} />
          </div>
          <div>
            <p className="eyebrow">Cấu hình còn thiếu</p>
            <h1>Thêm Supabase env để chạy chat</h1>
            <p className="auth-copy">
              Tạo `.env.local` từ `.env.example`, điền `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
              sau đó chạy lại app.
            </p>
          </div>
        </section>
      </main>
    );
  }

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");

    try {
      if (authMode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName || email.split("@")[0] }
          }
        });
        if (error) throw error;
        setNotice("Đăng ký thành công. Nếu Supabase bật xác thực email, hãy kiểm tra hộp thư.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setNotice(authErrorMessage(error, authMode));
    }
  }

  async function startDirectChat(targetUserId: string) {
    try {
      const data = await authFetch<{ room: Room }>("/api/direct", {
        method: "POST",
        body: { targetUserId }
      });
      await loadRooms();
      setActiveRoomId(data.room.id);
      setSearchQuery("");
      setSearchResults([]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể tạo chat 1:1.");
    }
  }

  function toggleSelectedUser(user: Profile) {
    setSelectedUsers((current) =>
      current.some((item) => item.id === user.id)
        ? current.filter((item) => item.id !== user.id)
        : [...current, user]
    );
  }

  async function createRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const data = await authFetch<{ room: Room }>("/api/rooms", {
        method: "POST",
        body: {
          type: newRoomType,
          name: newRoomName,
          description: newRoomDescription,
          memberIds: selectedUsers.map((user) => user.id)
        }
      });

      setNewRoomName("");
      setNewRoomDescription("");
      setSelectedUsers([]);
      setIsRoomComposerOpen(false);
      await loadRooms();
      setActiveRoomId(data.room.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể tạo phòng.");
    }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeRoom || !messageDraft.trim() || !canSend) return;

    const body = messageDraft;
    setMessageDraft("");

    try {
      await authFetch(`/api/rooms/${activeRoom.id}/messages`, {
        method: "POST",
        body: { body }
      });
      await loadMessages(activeRoom.id);
      await loadRooms();
    } catch (error) {
      setMessageDraft(body);
      setNotice(error instanceof Error ? error.message : "Không thể gửi tin nhắn.");
    }
  }

  async function saveProfile() {
    try {
      const data = await authFetch<{ profile: Profile }>("/api/me", {
        method: "PATCH",
        body: {
          displayName: profileDraft.displayName,
          status: profileDraft.status
        }
      });
      setProfile(data.profile);
      setNotice("Đã lưu hồ sơ.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể lưu hồ sơ.");
    }
  }

  async function addMemberDirect(targetUserId: string) {
    if (!activeRoom) return;
    setIsMemberActionBusy(true);
    try {
      await authFetch(`/api/rooms/${activeRoom.id}/members`, {
        method: "POST",
        body: { userId: targetUserId }
      });
      setMemberSearchQuery("");
      setMemberSearchResults([]);
      await loadRooms();
      setNotice("Đã thêm thành viên vào nhóm.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể thêm thành viên.");
    } finally {
      setIsMemberActionBusy(false);
    }
  }

  async function requestMemberAdd(targetUserId: string) {
    if (!activeRoom) return;
    setIsMemberActionBusy(true);
    try {
      await authFetch(`/api/rooms/${activeRoom.id}/member-requests`, {
        method: "POST",
        body: { targetUserId }
      });
      setMemberSearchQuery("");
      setMemberSearchResults([]);
      await loadMemberRequests(activeRoom.id);
      setNotice("Đã gửi yêu cầu cho admin duyệt.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể gửi yêu cầu.");
    } finally {
      setIsMemberActionBusy(false);
    }
  }

  async function removeMember(userId: string) {
    if (!activeRoom || !profile || userId === profile.id) return;
    setIsMemberActionBusy(true);
    try {
      await authFetch(`/api/rooms/${activeRoom.id}/members?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE"
      });
      await loadRooms();
      setNotice("Đã xoá thành viên khỏi nhóm.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể xoá thành viên.");
    } finally {
      setIsMemberActionBusy(false);
    }
  }

  async function decideMemberRequest(requestId: string, action: "approve" | "reject") {
    if (!activeRoom) return;
    setIsMemberActionBusy(true);
    try {
      await authFetch(`/api/rooms/${activeRoom.id}/member-requests/${requestId}`, {
        method: "PATCH",
        body: { action }
      });
      await Promise.all([loadRooms(), loadMemberRequests(activeRoom.id)]);
      setNotice(action === "approve" ? "Đã duyệt yêu cầu thêm thành viên." : "Đã từ chối yêu cầu.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể xử lý yêu cầu.");
    } finally {
      setIsMemberActionBusy(false);
    }
  }

  if (!session || !profile) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">
            <MessageCircle size={34} />
          </div>
          <div>
            <p className="eyebrow">Student Messenger</p>
            <h1>Fakesenger</h1>
          </div>

          <form className="auth-form" onSubmit={handleAuth}>
            <div className="segmented">
              <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>
                Đăng nhập
              </button>
              <button type="button" className={authMode === "signup" ? "active" : ""} onClick={() => setAuthMode("signup")}>
                Đăng ký
              </button>
            </div>

            {authMode === "signup" && (
              <label>
                Tên hiển thị
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Nguyễn Văn A" />
              </label>
            )}

            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ten@gmail.com" required />
            </label>

            <label>
              Mật khẩu
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                minLength={6}
                required
              />
            </label>

            <button className="primary-action" type="submit">
              <LogOut size={18} />
              {authMode === "login" ? "Vào phòng chat" : "Tạo tài khoản"}
            </button>
          </form>

          {notice && <p className="notice">{notice}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className={`chat-page ${isDetailsOpen && activeRoom && activeRoom.type !== "direct" ? "with-details" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="avatar avatar-large">{initials(profile.display_name)}</div>
          <div>
            <strong>{profile.display_name}</strong>
            <span>{profile.status || "online"}</span>
          </div>
          <button className="icon-button" title="Đăng xuất" onClick={() => supabase.auth.signOut()}>
            <LogOut size={18} />
          </button>
        </div>

        <div className="profile-editor">
          <div className="field-row">
            <Settings size={16} />
            <span>Hồ sơ</span>
          </div>
          <input
            value={profileDraft.displayName}
            onChange={(event) => setProfileDraft((current) => ({ ...current, displayName: event.target.value }))}
            placeholder="Tên hiển thị"
          />
          <input
            value={profileDraft.status}
            onChange={(event) => setProfileDraft((current) => ({ ...current, status: event.target.value }))}
            placeholder="Trạng thái"
          />
          <button type="button" onClick={saveProfile}>
            Lưu hồ sơ
          </button>
        </div>

        <div className="search-box">
          <Search size={17} />
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Tìm người theo email hoặc tên" />
        </div>

        {searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map((user) => (
              <button key={user.id} type="button" onClick={() => startDirectChat(user.id)}>
                <span className="avatar">{initials(user.display_name)}</span>
                <span>
                  <strong>{user.display_name}</strong>
                  <small>{user.email}</small>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="rooms-header">
          <span>Cuộc trò chuyện</span>
          <button className="icon-button dark" title="Tạo nhóm hoặc kênh" onClick={() => setIsRoomComposerOpen(true)}>
            <Plus size={18} />
          </button>
        </div>

        <div className="room-list">
          {rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              className={`room-item ${room.id === activeRoomId ? "selected" : ""}`}
              onClick={() => setActiveRoomId(room.id)}
            >
              <span className="room-symbol">{roomIcon(room.type)}</span>
              <span className="room-meta">
                <strong>{getRoomTitle(room)}</strong>
                <small>{getRoomSubtitle(room)}</small>
              </span>
            </button>
          ))}

          {rooms.length === 0 && (
            <div className="empty-state">
              <Users size={24} />
              <p>Tìm người để chat 1:1 hoặc tạo nhóm/kênh mới.</p>
            </div>
          )}
        </div>
      </aside>

      <section className="conversation">
        {activeRoom ? (
          <>
            <header className="conversation-header">
              <div className="header-title">
                <span className="room-symbol large">{roomIcon(activeRoom.type)}</span>
                <div>
                  <h2>{getRoomTitle(activeRoom)}</h2>
                  <p>{getRoomSubtitle(activeRoom)}</p>
                </div>
              </div>
              <div className="header-actions">
                {currentMember?.role === "admin" && (
                  <span className="role-badge">
                    <Shield size={15} />
                    Admin
                  </span>
                )}
                {activeRoom.type !== "direct" && (
                  <button
                    className={`icon-button ${isDetailsOpen ? "dark" : ""}`}
                    type="button"
                    title="Cài đặt nhóm"
                    onClick={() => setIsDetailsOpen((open) => !open)}
                  >
                    <Settings size={18} />
                  </button>
                )}
              </div>
            </header>

            <div className="messages">
              {messages.map((message) => {
                const mine = message.user_id === profile.id;
                return (
                  <article key={message.id} className={`message-row ${mine ? "mine" : ""}`}>
                    {!mine && <span className="avatar">{initials(message.profiles?.display_name)}</span>}
                    <div className="bubble">
                      {!mine && <strong>{message.profiles?.display_name || "Thành viên"}</strong>}
                      <p>{message.body}</p>
                      <time>{formatTime(message.created_at)}</time>
                    </div>
                  </article>
                );
              })}
              {messages.length === 0 && (
                <div className="empty-conversation">
                  <MessageCircle size={34} />
                  <h3>Chưa có tin nhắn</h3>
                  <p>Bắt đầu cuộc trò chuyện bằng một tin nhắn ngắn.</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <input
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                placeholder={canSend ? "Nhập tin nhắn..." : "Kênh này chỉ admin được gửi tin"}
                disabled={!canSend}
              />
              <button className="send-button" type="submit" disabled={!canSend || !messageDraft.trim()} title="Gửi">
                <Send size={19} />
              </button>
            </form>
          </>
        ) : (
          <div className="blank-panel">
            <MessageCircle size={42} />
            <h2>Chọn hoặc tạo một cuộc trò chuyện</h2>
            <p>Project hỗ trợ đủ 3 kiểu: chat riêng 1:1, kênh 1:N và nhóm N-N.</p>
          </div>
        )}
      </section>

      {activeRoom && activeRoom.type !== "direct" && isDetailsOpen && (
        <aside className="details">
          <div className="details-header">
            <h3>Cài đặt nhóm</h3>
            <button className="icon-button" type="button" title="Đóng" onClick={() => setIsDetailsOpen(false)}>
              <X size={17} />
            </button>
          </div>

          <div className="member-tools">
            <label>
              {isRoomAdmin ? "Thêm thành viên" : "Yêu cầu thêm thành viên"}
              <div className="search-box">
                <Search size={17} />
                <input
                  value={memberSearchQuery}
                  onChange={(event) => setMemberSearchQuery(event.target.value)}
                  placeholder={isRoomAdmin ? "Tìm người để thêm" : "Tìm người để admin duyệt"}
                />
              </div>
            </label>

            {memberSearchResults.length > 0 && (
              <div className="candidate-list compact">
                {memberSearchResults.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    disabled={isMemberActionBusy}
                    onClick={() => (isRoomAdmin ? addMemberDirect(user.id) : requestMemberAdd(user.id))}
                  >
                    <span className="avatar">{initials(user.display_name)}</span>
                    <span>
                      <strong>{user.display_name}</strong>
                      <small>{isRoomAdmin ? "Thêm ngay" : "Gửi yêu cầu duyệt"}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {isRoomAdmin && (
            <div className="request-panel">
              <div className="field-row">
                <Clock size={16} />
                <span>Yêu cầu chờ duyệt</span>
              </div>
              {memberRequests.length === 0 && <p className="muted-copy">Chưa có yêu cầu mới.</p>}
              {memberRequests.map((request) => (
                <div className="request-item" key={request.id}>
                  <span className="avatar">{initials(request.target?.display_name)}</span>
                  <span>
                    <strong>{request.target?.display_name || "Thành viên"}</strong>
                    <small>Đề xuất bởi {request.requester?.display_name || "thành viên"}</small>
                  </span>
                  <button
                    className="mini-action approve"
                    type="button"
                    title="Duyệt"
                    disabled={isMemberActionBusy}
                    onClick={() => decideMemberRequest(request.id, "approve")}
                  >
                    <Check size={15} />
                  </button>
                  <button
                    className="mini-action reject"
                    type="button"
                    title="Từ chối"
                    disabled={isMemberActionBusy}
                    onClick={() => decideMemberRequest(request.id, "reject")}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <h3>Thành viên</h3>
          <div className="member-list">
            {activeRoom.members.map((member: RoomMember) => (
              <div className="member manageable" key={member.user_id}>
                <span className="avatar">{initials(member.profiles?.display_name)}</span>
                <span>
                  <strong>{member.profiles?.display_name || "Thành viên"}</strong>
                  <small>{member.role === "admin" ? "Admin" : member.profiles?.status || "member"}</small>
                </span>
                {isRoomAdmin && member.role !== "admin" && member.user_id !== profile.id && (
                  <button
                    className="mini-action reject"
                    type="button"
                    title="Xoá khỏi nhóm"
                    disabled={isMemberActionBusy}
                    onClick={() => removeMember(member.user_id)}
                  >
                    <UserMinus size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>
      )}

      {isRoomComposerOpen && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={createRoom}>
            <button className="modal-close" type="button" onClick={() => setIsRoomComposerOpen(false)} title="Đóng">
              <X size={18} />
            </button>
            <h2>Tạo phòng chat</h2>
            <p>Nhóm cho mọi người cùng nhắn, kênh chỉ admin gửi thông báo.</p>

            <div className="segmented">
              <button type="button" className={newRoomType === "group" ? "active" : ""} onClick={() => setNewRoomType("group")}>
                Nhóm N-N
              </button>
              <button
                type="button"
                className={newRoomType === "channel" ? "active" : ""}
                onClick={() => setNewRoomType("channel")}
              >
                Kênh 1:N
              </button>
            </div>

            <label>
              Tên phòng
              <input value={newRoomName} onChange={(event) => setNewRoomName(event.target.value)} placeholder="Nhóm đồ án Web" required />
            </label>
            <label>
              Mô tả
              <input
                value={newRoomDescription}
                onChange={(event) => setNewRoomDescription(event.target.value)}
                placeholder="Mục đích của phòng"
              />
            </label>
            <label>
              Tìm thành viên
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Nhập email hoặc tên" />
            </label>

            <div className="picked-users">
              {selectedUsers.map((user) => (
                <button key={user.id} type="button" onClick={() => toggleSelectedUser(user)}>
                  {user.display_name}
                  <X size={14} />
                </button>
              ))}
            </div>

            <div className="candidate-list">
              {searchResults.map((user) => (
                <button key={user.id} type="button" onClick={() => toggleSelectedUser(user)}>
                  <span className="avatar">{initials(user.display_name)}</span>
                  <span>
                    <strong>{user.display_name}</strong>
                    <small>{selectedUsers.some((item) => item.id === user.id) ? "Đã chọn" : user.email}</small>
                  </span>
                </button>
              ))}
            </div>

            <button className="primary-action" type="submit">
              <Plus size={18} />
              Tạo phòng
            </button>
          </form>
        </div>
      )}

      {notice && (
        <button className="toast" type="button" onClick={() => setNotice("")}>
          {notice}
        </button>
      )}
    </main>
  );
}
