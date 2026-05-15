"use client";

import {
  Bell,
  Hash,
  Check,
  Clock,
  Image as ImageIcon,
  LogOut,
  Mic,
  MessageCircle,
  MoreHorizontal,
  Phone,
  PhoneOff,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  UserMinus,
  Video,
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

class AuthExpiredError extends Error {
  constructor() {
    super("Phiên đăng nhập đã hết hạn.");
  }
}

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
    return "Email không hợp lệ. Vui lòng dùng email thật.";
  }
  if (code === "signup_disabled") {
    return "Hiện chưa thể tạo tài khoản mới.";
  }
  if (code === "weak_password") {
    return "Mật khẩu quá yếu. Vui lòng dùng mật khẩu dài hơn.";
  }
  if (code === "over_email_send_rate_limit" || code === "email_rate_limit_exceeded") {
    return "Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.";
  }

  return error.message;
}

function shouldIgnoreBackgroundError(error: unknown) {
  return error instanceof AuthExpiredError;
}

function appendUniqueMessage(current: Message[], message: Message) {
  if (current.some((item) => item.id === message.id)) return current;
  return [...current, message];
}

function isLocalMessage(message: Message) {
  return message.id.startsWith("local-");
}

function isMatchingPendingMessage(message: Message, incoming: Message) {
  return isLocalMessage(message) && message.user_id === incoming.user_id && message.room_id === incoming.room_id && message.body === incoming.body;
}

function upsertServerMessage(current: Message[], incoming: Message) {
  if (current.some((item) => item.id === incoming.id)) {
    return current.filter((item) => !isMatchingPendingMessage(item, incoming));
  }

  const pendingIndex = current.findIndex((item) => isMatchingPendingMessage(item, incoming));
  if (pendingIndex >= 0) {
    return current.map((item, index) => (index === pendingIndex ? incoming : item));
  }

  return [...current, incoming];
}

function dedupeMessages(messages: Message[]) {
  const seen = new Set<string>();
  return messages.filter((message) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
}

function sortRoomsByRecent(rooms: Room[]) {
  return [...rooms].sort((first, second) => new Date(second.updated_at).getTime() - new Date(first.updated_at).getTime());
}

export function ChatShell() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const isSupabaseConfigured = hasSupabaseBrowserEnv();
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
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
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<Profile[]>([]);
  const [memberRequests, setMemberRequests] = useState<MemberRequest[]>([]);
  const [isMemberActionBusy, setIsMemberActionBusy] = useState(false);
  const [openMessageMenuId, setOpenMessageMenuId] = useState<string | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [callState, setCallState] = useState<"idle" | "calling" | "ringing" | "active">("idle");
  const [incomingOffer, setIncomingOffer] = useState<RTCSessionDescriptionInit | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesLoadIdRef = useRef(0);
  const shouldStickToBottomRef = useRef(true);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const callChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const sessionRef = useRef<Session | null>(null);
  const roomsRef = useRef<Room[]>([]);
  const activeRoomRef = useRef<Room | null>(null);
  const bootstrappedUserIdRef = useRef<string | null>(null);
  const isSigningUpRef = useRef(false);

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

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  const authFetch = useCallback(
    async <T,>(url: string, options: ApiOptions = {}): Promise<T> => {
      const token = sessionRef.current?.access_token;
      if (!token) {
        throw new AuthExpiredError();
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
      if (response.status === 401) {
        throw new AuthExpiredError();
      }
      if (!response.ok) {
        throw new Error(data.error || "Có lỗi xảy ra. Vui lòng thử lại.");
      }

      return data as T;
    },
    []
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
      if (room.type === "channel") return "Kênh thông báo, chỉ quản trị viên gửi";
      if (room.type === "group") return `${room.members.length} thành viên cùng chat`;
      const other = room.members.find((member) => member.user_id !== profile?.id)?.profiles;
      return other?.email || "Chat 1:1";
    },
    [profile?.id]
  );

  const loadRooms = useCallback(async () => {
    if (!sessionRef.current?.access_token) return;
    const data = await authFetch<{ rooms: Room[] }>("/api/rooms");
    setRooms(data.rooms);
    setActiveRoomId((current) => {
      if (current && data.rooms.some((room) => room.id === current)) return current;
      return data.rooms[0]?.id ?? null;
    });
  }, [authFetch]);

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
      bootstrappedUserIdRef.current = nextSession.user.id;
    },
    []
  );

  const loadMessages = useCallback(
    async (roomId: string, loadId?: number) => {
      const data = await authFetch<{ messages: Message[] }>(`/api/rooms/${roomId}/messages`);
      if (loadId && loadId !== messagesLoadIdRef.current) return;
      setMessages(dedupeMessages(data.messages));
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
    if (!isSupabaseConfigured) {
      setIsAuthLoading(false);
      return;
    }

    let isMounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!isMounted) return;
        sessionRef.current = data.session;
        setSession(data.session);
        if (data.session) {
          await bootstrapProfile(data.session).catch((error) => {
            if (!shouldIgnoreBackgroundError(error)) setNotice(error.message);
          });
        }
      })
      .catch(() => {
        if (isMounted) setNotice("Không thể kiểm tra phiên đăng nhập.");
      })
      .finally(() => {
        if (isMounted) setIsAuthLoading(false);
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;
      if (isSigningUpRef.current && event === "SIGNED_IN") return;

      if (event === "INITIAL_SESSION") return;
      if (event === "TOKEN_REFRESHED") {
        sessionRef.current = nextSession;
        return;
      }

      sessionRef.current = nextSession;
      setSession(nextSession);
      if (nextSession) {
        if (bootstrappedUserIdRef.current === nextSession.user.id && event !== "USER_UPDATED") {
          setIsAuthLoading(false);
          return;
        }
        bootstrapProfile(nextSession).catch((error) => {
          if (!shouldIgnoreBackgroundError(error)) setNotice(error.message);
        });
      } else if (nextSession) {
        setIsAuthLoading(false);
      } else {
        bootstrappedUserIdRef.current = null;
        sessionRef.current = null;
        setProfile(null);
        setRooms([]);
        setMessages([]);
        setActiveRoomId(null);
        setIsAccountMenuOpen(false);
        setIsAuthLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [bootstrapProfile, isSupabaseConfigured, supabase]);

  useEffect(() => {
    loadRooms().catch((error) => {
      if (!shouldIgnoreBackgroundError(error)) setNotice(error.message);
    });
  }, [loadRooms, profile?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured || !profile?.id) return;

    let reloadTimer: number | null = null;
    const refreshRoomsSoon = () => {
      if (reloadTimer) window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => {
        loadRooms().catch((error) => {
          if (!shouldIgnoreBackgroundError(error)) setNotice(error.message);
        });
      }, 120);
    };

    const membershipChannel = supabase
      .channel(`room-list-members-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "room_members", filter: `user_id=eq.${profile.id}` },
        refreshRoomsSoon
      )
      .subscribe();

    const messagesChannel = supabase
      .channel(`room-list-messages-${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const row = payload.new as Pick<Message, "room_id" | "created_at">;
        const roomExists = roomsRef.current.some((room) => room.id === row.room_id);

        if (!roomExists) {
          refreshRoomsSoon();
          return;
        }

        setRooms((current) =>
          sortRoomsByRecent(current.map((room) => (room.id === row.room_id ? { ...room, updated_at: row.created_at } : room)))
        );
      })
      .subscribe();

    return () => {
      if (reloadTimer) window.clearTimeout(reloadTimer);
      supabase.removeChannel(membershipChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [isSupabaseConfigured, loadRooms, profile?.id, supabase]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    if (!activeRoomId) {
      setMessages([]);
      setIsMessagesLoading(false);
      return;
    }

    const loadId = messagesLoadIdRef.current + 1;
    messagesLoadIdRef.current = loadId;
    setMessages([]);
    setIsMessagesLoading(true);

    loadMessages(activeRoomId, loadId)
      .catch((error) => {
        if (!shouldIgnoreBackgroundError(error)) setNotice(error.message);
      })
      .finally(() => {
        if (messagesLoadIdRef.current === loadId) setIsMessagesLoading(false);
      });

    const channel = supabase
      .channel(`room-${activeRoomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${activeRoomId}` },
        (payload) => {
          const row = payload.new as Omit<Message, "profiles">;
          const sender = activeRoomRef.current?.members.find((member) => member.user_id === row.user_id)?.profiles ?? null;
          setMessages((current) => upsertServerMessage(current, { ...row, profiles: sender }));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `room_id=eq.${activeRoomId}` },
        (payload) => {
          const row = payload.new as Omit<Message, "profiles">;
          setMessages((current) =>
            current.map((message) => (message.id === row.id ? { ...message, ...row } : message))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeRoomId, isSupabaseConfigured, loadMessages, supabase]);

  useEffect(() => {
    if (!activeRoom || activeRoom.type !== "direct" || !profile) return;

    const channel = supabase
      .channel(`call-${activeRoom.id}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "signal" }, async ({ payload }) => {
        if (payload.from === profile.id) return;
        if (payload.type === "offer") {
          setIncomingOffer(payload.description);
          setCallState("ringing");
          return;
        }
        if (payload.type === "answer" && peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(payload.description);
          await flushPendingIceCandidates();
          setCallState("active");
          return;
        }
        if (payload.type === "ice") {
          if (peerConnectionRef.current?.remoteDescription) {
            await peerConnectionRef.current.addIceCandidate(payload.candidate);
          } else {
            pendingIceCandidatesRef.current.push(payload.candidate);
          }
          return;
        }
        if (payload.type === "hangup") {
          endCall(false);
        }
      })
      .subscribe();

    callChannelRef.current = channel;
    return () => {
      endCall(false);
      supabase.removeChannel(channel);
      callChannelRef.current = null;
    };
  }, [activeRoom, profile, supabase]);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    shouldStickToBottomRef.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [activeRoomId]);

  function handleMessagesScroll() {
    const element = messagesRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 80;
  }

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
    loadMemberRequests(activeRoom.id).catch((error) => {
      if (!shouldIgnoreBackgroundError(error)) setNotice(error.message);
    });
  }, [activeRoom?.id, activeRoom?.type, isDetailsOpen, loadMemberRequests]);

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
        setNotice(error instanceof Error ? error.message : "Không thể tìm người dùng.");
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
            <p className="eyebrow">Fakesenger</p>
            <h1>Ứng dụng chưa sẵn sàng</h1>
            <p className="auth-copy">Vui lòng thử lại sau.</p>
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
        isSigningUpRef.current = true;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName || email.split("@")[0] }
          }
        });
        if (error) throw error;
        await supabase.auth.signOut();
        sessionRef.current = null;
        bootstrappedUserIdRef.current = null;
        setSession(null);
        setProfile(null);
        setRooms([]);
        setMessages([]);
        setActiveRoomId(null);
        setAuthMode("login");
        setPassword("");
        setNotice("Đăng ký thành công. Vui lòng đăng nhập để tiếp tục.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setNotice(authErrorMessage(error, authMode));
    } finally {
      isSigningUpRef.current = false;
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
    if (!activeRoom || !profile || !messageDraft.trim() || !canSend) return;

    const body = messageDraft;
    const pendingId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pendingMessage: Message = {
      id: pendingId,
      room_id: activeRoom.id,
      user_id: profile.id,
      body,
      kind: "text",
      media_url: null,
      created_at: new Date().toISOString(),
      edited_at: null,
      is_deleted: false,
      profiles: profile
    };

    setMessageDraft("");
    setMessages((current) => appendUniqueMessage(current, pendingMessage));

    try {
      const data = await authFetch<{ message: Message }>(`/api/rooms/${activeRoom.id}/messages`, {
        method: "POST",
        body: { body }
      });
      setMessages((current) => upsertServerMessage(current, data.message));
      setRooms((current) =>
        sortRoomsByRecent(
          current.map((room) => (room.id === activeRoom.id ? { ...room, updated_at: data.message.created_at } : room))
        )
      );
    } catch (error) {
      setMessages((current) => current.filter((message) => message.id !== pendingId));
      setMessageDraft(body);
      setNotice(error instanceof Error ? error.message : "Không thể gửi tin nhắn.");
    }
  }

  async function uploadMedia(file: File, kind: "image" | "audio") {
    if (!activeRoom || !profile) return;
    setIsUploadingMedia(true);
    try {
      const extension = file.name.split(".").pop() || (kind === "image" ? "jpg" : "webm");
      const path = `${activeRoom.id}/${profile.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from("chat-media").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });
      if (error) throw error;

      const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
      const response = await authFetch<{ message: Message }>(`/api/rooms/${activeRoom.id}/messages`, {
        method: "POST",
        body: {
          body: kind === "image" ? "Anh" : "Tin nhan am thanh",
          kind,
          mediaUrl: data.publicUrl
        }
      });
      setMessages((current) => upsertServerMessage(current, response.message));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Khong the gui tep.");
    } finally {
      setIsUploadingMedia(false);
    }
  }

  async function handleImageSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("Vui long chon tep anh.");
      return;
    }
    await uploadMedia(file, "image");
  }

  async function toggleAudioRecording() {
    if (isRecordingAudio) {
      recorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioStreamRef.current = stream;
      recorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        audioChunksRef.current = [];
        audioStreamRef.current?.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        recorderRef.current = null;
        setIsRecordingAudio(false);
        await uploadMedia(new File([blob], `audio-${Date.now()}.webm`, { type: blob.type }), "audio");
      };
      recorder.start();
      setIsRecordingAudio(true);
    } catch {
      setNotice("Khong the truy cap micro.");
    }
  }

  async function removeMessage(messageId: string, scope: "self" | "everyone") {
    try {
      await authFetch(`/api/messages/${messageId}?scope=${scope}`, { method: "DELETE" });
      if (scope === "self") {
        setMessages((current) => current.filter((message) => message.id !== messageId));
      } else {
        setMessages((current) =>
          current.map((message) =>
            message.id === messageId
              ? { ...message, body: "Tin nhan da duoc go", media_url: null, is_deleted: true, edited_at: new Date().toISOString() }
              : message
          )
        );
      }
      setOpenMessageMenuId(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Khong the go tin nhan.");
    }
  }

  async function sendCallSignal(payload: Record<string, unknown>) {
    await callChannelRef.current?.send({
      type: "broadcast",
      event: "signal",
      payload: { ...payload, from: profile?.id }
    });
  }

  async function createPeerConnection() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    peerConnectionRef.current = peerConnection;
    remoteStreamRef.current = new MediaStream();
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;

    stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
    peerConnection.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => remoteStreamRef.current?.addTrack(track));
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
    };
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendCallSignal({ type: "ice", candidate: event.candidate.toJSON() }).catch(() => undefined);
      }
    };
    return peerConnection;
  }

  async function flushPendingIceCandidates() {
    const peerConnection = peerConnectionRef.current;
    if (!peerConnection) return;
    for (const candidate of pendingIceCandidatesRef.current) {
      await peerConnection.addIceCandidate(candidate);
    }
    pendingIceCandidatesRef.current = [];
  }

  async function startVideoCall() {
    try {
      const peerConnection = await createPeerConnection();
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      setCallState("calling");
      await sendCallSignal({ type: "offer", description: offer });
    } catch {
      setNotice("Khong the bat dau cuoc goi video.");
      endCall(false);
    }
  }

  async function acceptVideoCall() {
    if (!incomingOffer) return;
    try {
      const peerConnection = await createPeerConnection();
      await peerConnection.setRemoteDescription(incomingOffer);
      await flushPendingIceCandidates();
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      setIncomingOffer(null);
      setCallState("active");
      await sendCallSignal({ type: "answer", description: answer });
    } catch {
      setNotice("Khong the nhan cuoc goi.");
      endCall(false);
    }
  }

  function endCall(notify = true) {
    if (notify) sendCallSignal({ type: "hangup" }).catch(() => undefined);
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pendingIceCandidatesRef.current = [];
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setIncomingOffer(null);
    setCallState("idle");
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
      setIsAccountMenuOpen(false);
      setNotice("Đã lưu hồ sơ.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể lưu hồ sơ.");
    }
  }

  async function handleSignOut() {
    setNotice("");
    setIsAccountMenuOpen(false);
    sessionRef.current = null;
    bootstrappedUserIdRef.current = null;
    setSession(null);
    setProfile(null);
    setRooms([]);
    setMessages([]);
    setActiveRoomId(null);
    await supabase.auth.signOut().catch(() => undefined);
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
      setNotice("Đã gửi yêu cầu cho quản trị viên duyệt.");
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

  if (isAuthLoading) {
    return (
      <main className="auth-page">
        <section className="auth-card loading-card">
          <div className="brand-mark">
            <MessageCircle size={34} />
          </div>
          <div>
            <p className="eyebrow">Fakesenger</p>
            <h1>Đang mở cuộc trò chuyện</h1>
            <p className="auth-copy">Vui lòng đợi trong giây lát.</p>
          </div>
          <div className="loading-dots" aria-label="Đang tải">
            <span />
            <span />
            <span />
          </div>
        </section>
      </main>
    );
  }

  if (!session || !profile) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">
            <MessageCircle size={34} />
          </div>
          <div>
            <p className="eyebrow">Fakesenger</p>
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
          <button
            className={`icon-button ${isAccountMenuOpen ? "dark" : ""}`}
            title="Tài khoản"
            onClick={() => setIsAccountMenuOpen((open) => !open)}
          >
            <Settings size={18} />
          </button>
        </div>

        {isAccountMenuOpen && (
          <div className="account-menu">
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
              <button className="profile-logout" type="button" onClick={handleSignOut}>
                <LogOut size={17} />
                Đăng xuất
              </button>
            </div>
          </div>
        )}

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
                    Quản trị viên
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
                {activeRoom.type === "direct" && (
                  <button className="icon-button" type="button" title="Goi video" onClick={startVideoCall}>
                    <Video size={18} />
                  </button>
                )}
              </div>
            </header>

            <div className="messages" ref={messagesRef} onScroll={handleMessagesScroll}>
              {isMessagesLoading && (
                <div className="message-loading" aria-label="Đang tải tin nhắn">
                  <span className="loading-line short" />
                  <span className="loading-line" />
                  <span className="loading-line mine" />
                  <span className="loading-line wide" />
                </div>
              )}

              {!isMessagesLoading &&
                messages.map((message) => {
                  const mine = message.user_id === profile.id;
                  const pending = isLocalMessage(message);
                  return (
                    <article key={message.id} className={`message-row ${mine ? "mine" : ""} ${pending ? "pending" : ""}`}>
                      {!mine && <span className="avatar">{initials(message.profiles?.display_name)}</span>}
                      <div className="bubble">
                        {!mine && <strong>{message.profiles?.display_name || "Thành viên"}</strong>}
                        {message.is_deleted ? (
                          <p className="deleted-message">Tin nhan da duoc go</p>
                        ) : message.kind === "image" && message.media_url ? (
                          <img className="message-image" src={message.media_url} alt="Anh da gui" />
                        ) : message.kind === "audio" && message.media_url ? (
                          <audio className="message-audio" controls src={message.media_url} />
                        ) : (
                          <p>{message.body}</p>
                        )}
                      <time>{pending ? "Đang gửi" : formatTime(message.created_at)}</time>
                      {!pending && !message.is_deleted && (
                        <div className="message-actions">
                          <button
                            type="button"
                            title="Tuy chon"
                            onClick={() => setOpenMessageMenuId((current) => (current === message.id ? null : message.id))}
                          >
                            <MoreHorizontal size={16} />
                          </button>
                          {openMessageMenuId === message.id && (
                            <div className="message-menu">
                              <button type="button" onClick={() => removeMessage(message.id, "self")}>
                                Go khoi ban than
                              </button>
                              {mine && (
                                <button type="button" onClick={() => removeMessage(message.id, "everyone")}>
                                  Go voi moi nguoi
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
                })}
              {!isMessagesLoading && messages.length === 0 && (
                <div className="empty-conversation">
                  <MessageCircle size={34} />
                  <h3>Chưa có tin nhắn</h3>
                  <p>Bắt đầu cuộc trò chuyện bằng một tin nhắn ngắn.</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <input ref={imageInputRef} className="hidden-file-input" type="file" accept="image/*" onChange={handleImageSelected} />
              <button
                className="icon-button composer-tool"
                type="button"
                title="Gui anh"
                onClick={() => imageInputRef.current?.click()}
                disabled={!canSend || isUploadingMedia}
              >
                <ImageIcon size={18} />
              </button>
              <button
                className={`icon-button composer-tool ${isRecordingAudio ? "recording" : ""}`}
                type="button"
                title={isRecordingAudio ? "Dung ghi am" : "Ghi am"}
                onClick={toggleAudioRecording}
                disabled={!canSend || isUploadingMedia}
              >
                <Mic size={18} />
              </button>
              <input
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                placeholder={canSend ? "Nhập tin nhắn..." : "Kênh này chỉ quản trị viên được gửi tin"}
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
            <p>Bắt đầu nhắn tin với bạn bè hoặc nhóm của bạn.</p>
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
                  placeholder={isRoomAdmin ? "Tìm người để thêm" : "Tìm người để quản trị viên duyệt"}
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
                  <small>{member.role === "admin" ? "Quản trị viên" : member.profiles?.status || "Thành viên"}</small>
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

      {activeRoom?.type === "direct" && callState !== "idle" && (
        <div className="call-overlay">
          <section className="call-panel">
            <video ref={remoteVideoRef} className="remote-video" autoPlay playsInline />
            <video ref={localVideoRef} className="local-video" autoPlay muted playsInline />
            <div className="call-controls">
              {callState === "ringing" ? (
                <>
                  <button className="call-accept" type="button" onClick={acceptVideoCall}>
                    <Phone size={18} />
                    Nhan cuoc goi
                  </button>
                  <button className="call-end" type="button" onClick={() => endCall()}>
                    <PhoneOff size={18} />
                    Tu choi
                  </button>
                </>
              ) : (
                <>
                  <span>{callState === "calling" ? "Dang goi..." : "Dang goi video"}</span>
                  <button className="call-end" type="button" onClick={() => endCall()}>
                    <PhoneOff size={18} />
                    Ket thuc
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {isRoomComposerOpen && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={createRoom}>
            <button className="modal-close" type="button" onClick={() => setIsRoomComposerOpen(false)} title="Đóng">
              <X size={18} />
            </button>
            <h2>Tạo phòng chat</h2>
            <p>Nhóm cho mọi người cùng nhắn, kênh chỉ quản trị viên gửi thông báo.</p>

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
