"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BellDot,
  Camera,
  ChevronDown,
  ChevronUp,
  Check,
  Images,
  LogOut,
  Menu,
  MessageCircle,
  Pencil,
  Plus,
  Send,
  Settings2,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import clsx from "clsx";

type User = { id: string; username: string; name: string; avatarUrl: string | null; bio: string };
type CatUserName = {
  id: string;
  catId: string;
  userId: string;
  nickname: string;
  preference: string;
  memorySummary: string;
  relationship: string;
  user: Pick<User, "id" | "name" | "avatarUrl">;
};
type CatMemory = { summary: string; relationship: string };
type Cat = {
  id: string;
  name: string;
  avatarUrl: string;
  personality: string;
  tone: string;
  backstory: string;
  isDefault: boolean;
  nicknames: CatUserName[];
  memory: CatMemory | null;
  _count?: { messages: number };
};
type Message = {
  id: string;
  catId: string;
  userId: string | null;
  role: "USER" | "CAT" | "SYSTEM";
  messageType: "TEXT" | "IMAGE";
  content: string;
  imageUrl?: string | null;
  createdAt: string;
  user?: Pick<User, "id" | "name"> | null;
};
type CatMoment = {
  id: string;
  catId: string;
  imageUrl: string;
  caption: string;
  createdAt: string;
};
type WhisperReply = {
  id: string;
  cardId: string;
  senderId: string;
  recipientId: string;
  content: string;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
  sender: Pick<User, "id" | "name" | "avatarUrl">;
};
type WhisperCard = {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  deliverAt: string;
  editedAt: string | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
  sender: Pick<User, "id" | "name" | "avatarUrl">;
  recipient: Pick<User, "id" | "name" | "avatarUrl">;
  replies: WhisperReply[];
  status: "pending" | "active";
};
type WhisperOverview = {
  partner: Pick<User, "id" | "name" | "avatarUrl"> | null;
  unreadCount: number;
  sections: {
    pending: WhisperCard[];
    active: WhisperCard[];
  };
};

type Props = {
  currentUser: User;
  initialCats: Cat[];
  users: User[];
  initialWhispers: WhisperOverview;
};

type CatDraft = typeof emptyCat & {
  name: string;
  nickname: string;
  preference: string;
  avatarFile?: File | null;
};

const uploadAccept = "image/png,image/jpeg,image/webp,image/gif";
const allowedUploadTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const avatarUploadLimitBytes = 10 * 1024 * 1024;

const emptyCat = {
  personality: "亲人、好奇、喜欢陪伴。",
  tone: "温柔自然，像熟悉的家人。",
  backstory: "这是一只刚加入小家的猫咪。",
};

function isAllowedUploadType(file: File) {
  return allowedUploadTypes.has(file.type);
}

async function readApiResult<T>(response: Response) {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "请求失败，请稍后再试");
  }
  return data;
}

export default function ChatApp({ currentUser, initialCats, users, initialWhispers }: Props) {
  const [sessionUser, setSessionUser] = useState(currentUser);
  const [householdUsers, setHouseholdUsers] = useState(users);
  const [cats, setCats] = useState(initialCats);
  const [selectedCatId, setSelectedCatId] = useState(initialCats[0]?.id || "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [moments, setMoments] = useState<CatMoment[]>([]);
  const [messageText, setMessageText] = useState("");
  const [whisperOverview, setWhisperOverview] = useState(initialWhispers);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMoments, setLoadingMoments] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [activePanel, setActivePanel] = useState<"chat" | "moments" | "whispers">("chat");
  const [selectedMoment, setSelectedMoment] = useState<CatMoment | null>(null);
  const [momentDeleteTarget, setMomentDeleteTarget] = useState<CatMoment | null>(null);
  const [deletingMomentId, setDeletingMomentId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileCatsOpen, setMobileCatsOpen] = useState(false);
  const [whisperCollapsed, setWhisperCollapsed] = useState(false);
  const [whisperDialog, setWhisperDialog] = useState<{ mode: "create" } | { mode: "edit"; card: WhisperCard } | null>(null);
  const [whisperDeleteTarget, setWhisperDeleteTarget] = useState<WhisperCard | null>(null);
  const [deletingWhisperId, setDeletingWhisperId] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const whisperUnreadRef = useRef(initialWhispers.unreadCount);

  const selectedCat = useMemo(
    () => cats.find((cat) => cat.id === selectedCatId) || cats[0],
    [cats, selectedCatId],
  );
  const selectedCatProfile = useMemo(
    () => selectedCat?.nicknames.find((item) => item.userId === sessionUser.id) || null,
    [selectedCat, sessionUser.id],
  );
  const whisperPartner = whisperOverview.partner;

  useEffect(() => {
    if (!selectedCat?.id) return;
    setLoadingMessages(true);
    fetch(`/api/cats/${selectedCat.id}/messages`)
      .then((response) => readApiResult<{ messages?: Message[] }>(response))
      .then((data) => setMessages(data.messages || []))
      .catch((error: unknown) => {
        setMessages([]);
        setNotice(error instanceof Error ? error.message : "加载消息失败，请稍后重试");
      })
      .finally(() => setLoadingMessages(false));
  }, [selectedCat?.id]);

  useEffect(() => {
    if (!selectedCat?.id) return;
    setLoadingMoments(true);
    fetch(`/api/cats/${selectedCat.id}/moments`)
      .then((response) => readApiResult<{ moments?: CatMoment[] }>(response))
      .then((data) => setMoments(data.moments || []))
      .catch((error: unknown) => {
        setMoments([]);
        setNotice(error instanceof Error ? error.message : "加载猫圈失败，请稍后重试");
      })
      .finally(() => setLoadingMoments(false));
  }, [selectedCat?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  useEffect(() => {
    if (!whisperPartner) return;
    const timer = window.setInterval(() => {
      void refreshWhispers(true).catch(() => {});
    }, 30000);
    return () => window.clearInterval(timer);
  }, [whisperPartner?.id]);

  useEffect(() => {
    if (whisperOverview.unreadCount > whisperUnreadRef.current) {
      setNotice("收到新的悄悄话了。");
    }
    whisperUnreadRef.current = whisperOverview.unreadCount;
  }, [whisperOverview.unreadCount]);

  useEffect(() => {
    if (activePanel !== "whispers" || whisperOverview.unreadCount === 0) return;
    void markWhispersRead().catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : "更新悄悄话已读状态失败");
    });
  }, [activePanel, whisperOverview.unreadCount]);

  async function refreshCats() {
    const response = await fetch("/api/cats");
    const data = await readApiResult<{ cats: Cat[]; users?: User[] }>(response);
    setCats(data.cats);
    if (data.users) {
      setHouseholdUsers(data.users);
    }
  }

  async function refreshMoments() {
    if (!selectedCat?.id) return;
    const response = await fetch(`/api/cats/${selectedCat.id}/moments`);
    const data = await readApiResult<{ moments?: CatMoment[] }>(response);
    setMoments(data.moments || []);
  }

  async function refreshWhispers(silent = false) {
    const response = await fetch("/api/whispers");
    const data = await readApiResult<WhisperOverview>(response);
    setWhisperOverview(data);
    if (!silent) {
      return data;
    }
  }

  async function markWhispersRead() {
    const response = await fetch("/api/whispers/read", { method: "POST" });
    const data = await readApiResult<WhisperOverview>(response);
    setWhisperOverview(data);
  }

  async function createWhisper(payload: { recipientId: string; content: string; deliverAt: string }) {
    const response = await fetch("/api/whispers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as WhisperOverview & { error?: string };
    if (!response.ok) {
      throw new Error(data.error || "创建悄悄话失败");
    }
    setWhisperOverview(data);
    setActivePanel("whispers");
    setWhisperDialog(null);
    setNotice("悄悄话已安排好了。");
  }

  async function updateWhisper(cardId: string, payload: { content: string; deliverAt: string }) {
    const response = await fetch(`/api/whispers/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as WhisperOverview & { error?: string };
    if (!response.ok) {
      throw new Error(data.error || "更新悄悄话失败");
    }
    setWhisperOverview(data);
    setWhisperDialog(null);
    setNotice("悄悄话已更新。");
  }

  async function deleteWhisper(card: WhisperCard) {
    if (card.senderId !== sessionUser.id || deletingWhisperId) {
      return;
    }

    setWhisperDeleteTarget(card);
  }

  async function confirmDeleteWhisper() {
    const card = whisperDeleteTarget;
    if (!card || card.senderId !== sessionUser.id || deletingWhisperId) {
      return;
    }

    setDeletingWhisperId(card.id);
    try {
      const response = await fetch(`/api/whispers/${card.id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { deletedCardId?: string; overview?: WhisperOverview; error?: string };
      if (!response.ok || !data.deletedCardId || !data.overview) {
        throw new Error(data.error || "删除悄悄话失败");
      }

      setWhisperOverview(data.overview);
      setWhisperDialog((previous) => (previous?.mode === "edit" && previous.card.id === card.id ? null : previous));
      setWhisperDeleteTarget((previous) => (previous?.id === card.id ? null : previous));
      setNotice("悄悄话已撤回。");
    } finally {
      setDeletingWhisperId("");
    }
  }

  async function replyWhisper(cardId: string, content: string) {
    const response = await fetch(`/api/whispers/${cardId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = (await response.json()) as WhisperOverview & { error?: string };
    if (!response.ok) {
      throw new Error(data.error || "回复悄悄话失败");
    }
    setWhisperOverview(data);
  }

  async function deleteMoment(moment: CatMoment) {
    if (!selectedCat) return;

    setMomentDeleteTarget(moment);
  }

  async function confirmDeleteMoment() {
    const moment = momentDeleteTarget;
    if (!selectedCat || !moment) return;

    setDeletingMomentId(moment.id);
    const response = await fetch(`/api/cats/${selectedCat.id}/moments/${moment.id}`, {
      method: "DELETE",
    });
    const data = (await response.json()) as { deletedMomentId?: string; error?: string };
    setDeletingMomentId("");

    if (!response.ok || !data.deletedMomentId) {
      setNotice(data.error || "删除猫圈失败，请稍后再试");
      return;
    }

    setMoments((previous) => previous.filter((item) => item.id !== data.deletedMomentId));
    setMomentDeleteTarget((previous) => (previous?.id === data.deletedMomentId ? null : previous));
    setSelectedMoment((previous) => (previous?.id === data.deletedMomentId ? null : previous));
    setNotice("这条猫圈内容已移出电子相册。");
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!messageText.trim() || !selectedCat || sending) return;

    const content = messageText.trim();
    setMessageText("");
    setSending(true);
    setNotice("");

    const response = await fetch(`/api/cats/${selectedCat.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    const data = (await response.json()) as { messages?: Message[]; error?: string; usedFallback?: boolean };
    setSending(false);

    if (!response.ok || !data.messages) {
      setNotice(data.error || "发送失败，请稍后再试");
      return;
    }

    setMessages((previous) => [...previous, ...data.messages!]);
    if (data.usedFallback) {
      setNotice("模型暂时不可用，已使用本地备用回复。");
    }
    refreshCats().catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : "刷新猫咪列表失败，请稍后重试");
    });
  }

  async function sendImage(file?: File) {
    if (!file || !selectedCat || sending) return;
    if (file.size > 4 * 1024 * 1024) {
      setNotice("图片不能超过 4MB");
      return;
    }
    if (!isAllowedUploadType(file)) {
      setNotice("请上传 png、jpg、webp 或 gif 图片");
      return;
    }

    setSending(true);
    setNotice("");

    const formData = new FormData();
    formData.set("image", file);
    if (messageText.trim()) {
      formData.set("content", messageText.trim());
    }

    const response = await fetch(`/api/cats/${selectedCat.id}/messages`, {
      method: "POST",
      body: formData,
    });

    const data = (await response.json()) as { messages?: Message[]; error?: string; usedFallback?: boolean };
    setSending(false);

    if (!response.ok || !data.messages) {
      setNotice(data.error || "发图失败，请稍后再试");
      return;
    }

    setMessageText("");
    setMessages((previous) => [...previous, ...data.messages!]);
    setActivePanel("chat");
    if (data.usedFallback) {
      setNotice("模型暂时不可用，已使用本地备用回复。图片已收进猫咪猫圈。");
    } else {
      setNotice("图片已发给猫咪，也收进它的猫圈了。");
    }
    try {
      await Promise.all([refreshCats(), refreshMoments()]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "刷新数据失败，请稍后重试");
    }
  }

  function nextCatName() {
    let index = 1;
    let candidate = "新猫咪";
    const usedNames = new Set(cats.map((cat) => cat.name));
    while (usedNames.has(candidate)) {
      index += 1;
      candidate = `新猫咪 ${index}`;
    }
    return candidate;
  }

  async function createCat(draft: CatDraft) {
    const response = await fetch("/api/cats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        personality: draft.personality,
        tone: draft.tone,
        backstory: draft.backstory,
      }),
    });
    const data = (await response.json()) as { cat?: Cat; error?: string };
    if (!response.ok || !data.cat) {
      throw new Error(data.error || "创建猫咪失败");
    }

    try {
      const nicknameResponse = await fetch(`/api/cats/${data.cat.id}/nicknames`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: draft.nickname, preference: draft.preference }),
      });
      if (!nicknameResponse.ok) {
        const nicknameData = (await nicknameResponse.json()) as { error?: string };
        throw new Error(nicknameData.error || "称呼保存失败");
      }

      if (draft.avatarFile) {
        const formData = new FormData();
        formData.set("avatar", draft.avatarFile);
        const avatarResponse = await fetch(`/api/cats/${data.cat.id}/avatar`, {
          method: "POST",
          body: formData,
        });
        if (!avatarResponse.ok) {
          const avatarData = (await avatarResponse.json()) as { error?: string };
          throw new Error(avatarData.error || "头像上传失败");
        }
      }
    } catch (createError) {
      await fetch(`/api/cats/${data.cat.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: data.cat.name }),
      }).catch(() => {});
      throw createError;
    }

    const catsResponse = await fetch("/api/cats");
    const catsData = await readApiResult<{ cats: Cat[]; users?: User[] }>(catsResponse);
    setCats(catsData.cats);
    if (catsData.users) {
      setHouseholdUsers(catsData.users);
    }
    setSelectedCatId(data.cat.id);
    setMessages([]);
    setCreateOpen(false);
    setSettingsOpen(false);
    setNotice("新猫咪已创建，可以开始聊天了。");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="mx-auto flex h-screen max-w-7xl overflow-hidden p-3 sm:p-5">
      <section className="flex w-full overflow-hidden rounded-[30px] border border-white/70 bg-white/70 shadow-soft backdrop-blur-xl">
        <aside
          className={clsx(
            "absolute inset-y-3 left-3 z-30 w-[82vw] max-w-80 border-r border-stone-200/70 bg-white/95 p-4 transition sm:static sm:block sm:w-80 sm:translate-x-0 sm:bg-white/55",
            mobileCatsOpen ? "translate-x-0" : "-translate-x-[110%]",
          )}
        >
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">小月天天开心</h1>
            </div>
            <button className="rounded-full p-2 text-stone-500 hover:bg-stone-100 sm:hidden" onClick={() => setMobileCatsOpen(false)}>
              <X size={20} />
            </button>
          </div>

          <div className="mb-4 flex items-center gap-2 rounded-2xl bg-cream px-3 py-3">
            <UserAvatar user={sessionUser} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{sessionUser.name}</p>
              <p className="truncate text-xs text-stone-500">{sessionUser.bio || "已登录，个人资料独立管理"}</p>
            </div>
            <button title="个人资料" onClick={() => setProfileOpen(true)} className="rounded-full p-2 text-stone-500 hover:bg-white">
              <Settings2 size={17} />
            </button>
            <button title="退出登录" onClick={logout} className="rounded-full p-2 text-stone-500 hover:bg-white">
              <LogOut size={17} />
            </button>
          </div>

          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-600">叶子是老大</span>
            <button title="新增猫咪" onClick={() => setCreateOpen(true)} className="rounded-full bg-ink p-2 text-white hover:bg-stone-700">
              <Plus size={16} />
            </button>
          </div>

          <div className="scrollbar-soft flex max-h-[calc(100vh-22rem)] flex-col gap-2 overflow-y-auto pr-1">
            {cats.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCatId(cat.id);
                  setActivePanel("chat");
                  setMobileCatsOpen(false);
                }}
                className={clsx(
                  "flex items-center gap-3 rounded-2xl p-3 text-left transition",
                  activePanel !== "whispers" && selectedCat?.id === cat.id ? "bg-stone-900 text-white" : "hover:bg-white",
                )}
              >
                <Avatar cat={cat} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold">{cat.name}</span>
                    <span className="text-xs opacity-60">{cat._count?.messages || 0}</span>
                  </div>
                  <p className="truncate text-xs opacity-70">{cat.personality}</p>
                </div>
              </button>
            ))}
          </div>

          <section className="mt-4 rounded-[28px] border border-stone-200/80 bg-white/80 p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-stone-600">小月也是老大</span>
              <button type="button" onClick={() => setWhisperCollapsed((previous) => !previous)} className="rounded-full p-2 text-stone-500 hover:bg-stone-100">
                {whisperCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            </div>
            {!whisperCollapsed ? (
              whisperPartner ? (
                <button
                  type="button"
                  onClick={() => {
                    setActivePanel("whispers");
                    setMobileCatsOpen(false);
                  }}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-2xl p-3 text-left transition",
                    activePanel === "whispers" ? "bg-stone-900 text-white" : "hover:bg-stone-50",
                  )}
                >
                  <UserAvatar user={whisperPartner} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{whisperPartner.name}</span>
                      {whisperOverview.unreadCount > 0 ? (
                        <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", activePanel === "whispers" ? "bg-white text-stone-900" : "bg-stone-900 text-white")}>
                          {whisperOverview.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    <p className={clsx("truncate text-xs", activePanel === "whispers" ? "text-white/70" : "text-stone-500")}>
                      悄悄话留言卡
                    </p>
                  </div>
                </button>
              ) : (
                <div className="rounded-2xl bg-stone-50 px-3 py-4 text-xs leading-5 text-stone-500">还没有可用的互动对象。</div>
              )
            ) : null}
          </section>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {activePanel === "whispers" && whisperPartner ? (
            <>
              <header className="flex h-16 items-center gap-3 border-b border-stone-200/80 bg-white/60 px-4">
                <button className="rounded-full p-2 text-stone-600 hover:bg-stone-100 sm:hidden" onClick={() => setMobileCatsOpen(true)}>
                  <Menu size={21} />
                </button>
                <UserAvatar user={whisperPartner} size={42} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold">{whisperPartner.name}</h2>
                  <p className="truncate text-xs text-stone-500">只属于你们两个人的悄悄话</p>
                </div>
                {whisperOverview.unreadCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                    <BellDot size={14} />
                    {whisperOverview.unreadCount} 条未读
                  </span>
                ) : null}
                <button type="button" onClick={() => setWhisperDialog({ mode: "create" })} className="rounded-full bg-ink p-2 text-white hover:bg-stone-700">
                  <Plus size={18} />
                </button>
              </header>

              <div className="scrollbar-soft flex-1 overflow-y-auto px-4 py-5">
                <WhisperPanel
                  currentUser={sessionUser}
                  overview={whisperOverview}
                  deletingCardId={deletingWhisperId}
                  onCompose={() => setWhisperDialog({ mode: "create" })}
                  onEdit={(card) => setWhisperDialog({ mode: "edit", card })}
                  onDelete={deleteWhisper}
                  onReply={replyWhisper}
                />
              </div>

              {notice ? <p className="mx-4 mb-2 rounded-2xl bg-amber-50 px-4 py-2 text-sm text-amber-700">{notice}</p> : null}
            </>
          ) : selectedCat ? (
            <>
              <header className="flex h-16 items-center gap-3 border-b border-stone-200/80 bg-white/60 px-4">
                <button className="rounded-full p-2 text-stone-600 hover:bg-stone-100 sm:hidden" onClick={() => setMobileCatsOpen(true)}>
                  <Menu size={21} />
                </button>
                <Avatar cat={selectedCat} size={42} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold">{selectedCat.name}</h2>
                  <p className="truncate text-xs text-stone-500">{selectedCatProfile?.relationship || selectedCat.memory?.relationship || "正在熟悉中"}</p>
                </div>
                <div className="hidden items-center gap-1 rounded-full bg-stone-100 p-1 sm:flex">
                  <button
                    type="button"
                    onClick={() => setActivePanel("chat")}
                    className={clsx("rounded-full px-3 py-1.5 text-xs font-medium", activePanel === "chat" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
                  >
                    聊天
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePanel("moments")}
                    className={clsx("rounded-full px-3 py-1.5 text-xs font-medium", activePanel === "moments" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
                  >
                    猫圈
                  </button>
                </div>
                <button
                  title="猫咪设置"
                  onClick={() => setSettingsOpen(true)}
                  className="rounded-full p-2 text-stone-600 hover:bg-stone-100"
                >
                  <Settings2 size={21} />
                </button>
              </header>

              <div className="scrollbar-soft flex-1 overflow-y-auto px-4 py-5">
                <div className="mb-4 flex items-center gap-2 rounded-full bg-stone-100 p-1 sm:hidden">
                  <button
                    type="button"
                    onClick={() => setActivePanel("chat")}
                    className={clsx("flex-1 rounded-full px-3 py-2 text-xs font-medium", activePanel === "chat" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
                  >
                    聊天
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePanel("moments")}
                    className={clsx("flex-1 rounded-full px-3 py-2 text-xs font-medium", activePanel === "moments" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
                  >
                    猫圈
                  </button>
                </div>

                {activePanel === "chat" ? (
                  <>
                    {loadingMessages ? <p className="text-center text-sm text-stone-400">正在打开聊天...</p> : null}
                    {!loadingMessages && messages.length === 0 ? (
                      <div className="mx-auto mt-16 max-w-sm text-center text-stone-500">
                        <MessageCircle className="mx-auto mb-3 text-stone-300" size={38} />
                        <p className="text-sm">还没有消息。和{selectedCat.name}说第一句话吧。</p>
                      </div>
                    ) : null}
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <MessageBubble key={message.id} message={message} currentUser={sessionUser} cat={selectedCat} />
                      ))}
                      {sending ? (
                        <div className="flex items-end gap-2">
                          <Avatar cat={selectedCat} size={34} />
                          <div className="rounded-2xl rounded-bl-md bg-white px-4 py-2 text-sm text-stone-400 shadow-sm">正在想怎么回答...</div>
                        </div>
                      ) : null}
                    </div>
                    <div ref={bottomRef} />
                  </>
                ) : (
                  <MomentsPanel
                    cat={selectedCat}
                    moments={moments}
                    loading={loadingMoments}
                    deletingMomentId={deletingMomentId}
                    onOpenMoment={setSelectedMoment}
                    onDeleteMoment={deleteMoment}
                  />
                )}
              </div>

              {notice ? <p className="mx-4 mb-2 rounded-2xl bg-amber-50 px-4 py-2 text-sm text-amber-700">{notice}</p> : null}

              <form onSubmit={sendMessage} className="border-t border-stone-200/80 bg-white/65 p-3">
                <div className="flex items-end gap-2 rounded-3xl bg-white px-3 py-2 shadow-sm">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept={uploadAccept}
                    className="hidden"
                    onChange={(event) => {
                      void sendImage(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                  <button
                    type="button"
                    title="发图片给猫咪"
                    onClick={() => imageInputRef.current?.click()}
                    className="mb-0.5 rounded-full bg-stone-100 p-2.5 text-stone-600 transition hover:bg-stone-200"
                  >
                    <Camera size={18} />
                  </button>
                  <textarea
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        sendMessage(event);
                      }
                    }}
                    rows={1}
                    placeholder={activePanel === "chat" ? `和${selectedCat.name}说点什么` : `给${selectedCat.name}发图时顺便写点说明`}
                    className="max-h-32 min-h-10 flex-1 bg-transparent px-2 py-2 text-sm outline-none"
                  />
                  <button disabled={sending || !messageText.trim()} className="mb-0.5 rounded-full bg-ink p-2.5 text-white transition hover:bg-stone-700 disabled:opacity-40">
                    <Send size={18} />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-stone-500">还没有猫咪</div>
          )}
        </section>
      </section>

      {settingsOpen && selectedCat ? (
        <CatSettings
          cat={selectedCat}
          currentUser={sessionUser}
          users={householdUsers}
          onClose={() => setSettingsOpen(false)}
          onSaved={(cat) => {
            setCats((previous) => previous.map((item) => (item.id === cat.id ? { ...item, ...cat } : item)));
            setNotice("猫咪设定已保存。");
          }}
          onDeleted={(deletedCatId) => {
            const remainingCats = cats.filter((item) => item.id !== deletedCatId);
            setCats(remainingCats);
            setSelectedCatId(remainingCats[0]?.id || "");
            setMessages([]);
            setSettingsOpen(false);
            setNotice("猫咪已删除，相关聊天记录和记忆也已清理。");
          }}
        />
      ) : null}

      {profileOpen ? (
        <UserProfileDialog
          user={sessionUser}
          onClose={() => setProfileOpen(false)}
          onUpdated={(user) => {
            setSessionUser(user);
            setHouseholdUsers((previous) => previous.map((item) => (item.id === user.id ? user : item)));
            setNotice("个人资料已保存。");
          }}
        />
      ) : null}

      {createOpen ? (
        <CreateCatDialog
          initialName={nextCatName()}
          currentUser={sessionUser}
          onClose={() => setCreateOpen(false)}
          onCreate={createCat}
        />
      ) : null}

      {whisperDialog && whisperPartner ? (
        <WhisperComposerDialog
          partner={whisperPartner}
          mode={whisperDialog.mode}
          initialCard={whisperDialog.mode === "edit" ? whisperDialog.card : null}
          onClose={() => setWhisperDialog(null)}
          onSubmit={(payload) =>
            whisperDialog.mode === "edit"
              ? updateWhisper(whisperDialog.card.id, payload)
              : createWhisper({ ...payload, recipientId: whisperPartner.id })
          }
        />
      ) : null}

      {whisperDeleteTarget ? (
        <WhisperDeleteDialog
          card={whisperDeleteTarget}
          deleting={deletingWhisperId === whisperDeleteTarget.id}
          onClose={() => {
            if (deletingWhisperId) return;
            setWhisperDeleteTarget(null);
          }}
          onConfirm={() => void confirmDeleteWhisper()}
        />
      ) : null}

      {selectedMoment && selectedCat ? (
        <MomentPreviewDialog
          cat={selectedCat}
          moment={selectedMoment}
          deleting={deletingMomentId === selectedMoment.id}
          onClose={() => setSelectedMoment(null)}
          onDelete={() => void deleteMoment(selectedMoment)}
        />
      ) : null}

      {momentDeleteTarget && selectedCat ? (
        <MomentDeleteDialog
          cat={selectedCat}
          moment={momentDeleteTarget}
          deleting={deletingMomentId === momentDeleteTarget.id}
          onClose={() => {
            if (deletingMomentId) return;
            setMomentDeleteTarget(null);
          }}
          onConfirm={() => void confirmDeleteMoment()}
        />
      ) : null}
    </main>
  );
}

function UserAvatar({ user, size }: { user: Pick<User, "name" | "avatarUrl">; size: number }) {
  const fallback = user.name.trim().charAt(0) || "用";

  return user.avatarUrl ? (
    <div className="shrink-0 overflow-hidden rounded-full bg-sage ring-1 ring-white/80" style={{ width: size, height: size }}>
      <Image src={user.avatarUrl} alt={user.name} width={size} height={size} className="h-full w-full object-cover" />
    </div>
  ) : (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-sage text-sm font-semibold text-ink ring-1 ring-white/80"
      style={{ width: size, height: size }}
    >
      {fallback}
    </div>
  );
}

function Avatar({ cat, size }: { cat: Pick<Cat, "avatarUrl" | "name">; size: number }) {
  return (
    <div className="shrink-0 overflow-hidden rounded-full bg-petal ring-1 ring-white/80" style={{ width: size, height: size }}>
      <Image src={cat.avatarUrl} alt={cat.name} width={size} height={size} className="h-full w-full object-cover" />
    </div>
  );
}

function MessageBubble({ message, currentUser, cat }: { message: Message; currentUser: User; cat: Cat }) {
  const isUser = message.role === "USER";
  const isMine = isUser && message.userId === currentUser.id;
  return (
    <div className={clsx("flex items-end gap-2", isMine ? "justify-end" : "justify-start")}>
      {!isMine ? <Avatar cat={cat} size={34} /> : null}
      <div className={clsx("max-w-[78%]", isMine ? "text-right" : "text-left")}>
        {isUser && !isMine ? <p className="mb-1 px-1 text-xs text-stone-400">{message.user?.name || "用户"}</p> : null}
        <div
          className={clsx(
            "overflow-hidden whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm",
            isMine
              ? "rounded-br-md bg-[#95ec69] text-stone-900"
              : "rounded-bl-md bg-white text-stone-800",
          )}
        >
          {message.imageUrl ? (
            <div className="mb-2 overflow-hidden rounded-2xl bg-stone-100">
              <Image src={message.imageUrl} alt="发送给猫咪的图片" width={480} height={360} className="h-auto w-full object-cover" />
            </div>
          ) : null}
          {message.content}
        </div>
      </div>
    </div>
  );
}

function WhisperPanel({
  currentUser,
  overview,
  deletingCardId,
  onCompose,
  onEdit,
  onDelete,
  onReply,
}: {
  currentUser: User;
  overview: WhisperOverview;
  deletingCardId: string;
  onCompose: () => void;
  onEdit: (card: WhisperCard) => void;
  onDelete: (card: WhisperCard) => Promise<void>;
  onReply: (cardId: string, content: string) => Promise<void>;
}) {
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyingCardId, setReplyingCardId] = useState("");
  const [replyErrors, setReplyErrors] = useState<Record<string, string>>({});
  const [activeLetterCardId, setActiveLetterCardId] = useState("");
  const totalCount = overview.sections.pending.length + overview.sections.active.length;
  const activeLetterCard = [...overview.sections.pending, ...overview.sections.active].find((card) => card.id === activeLetterCardId) || null;

  async function submitReply(cardId: string) {
    const content = replyDrafts[cardId]?.trim() || "";
    if (!content || replyingCardId) return;

    setReplyingCardId(cardId);
    setReplyErrors((previous) => ({ ...previous, [cardId]: "" }));
    try {
      await onReply(cardId, content);
      setReplyDrafts((previous) => ({ ...previous, [cardId]: "" }));
    } catch (error) {
      setReplyErrors((previous) => ({
        ...previous,
        [cardId]: error instanceof Error ? error.message : "回复失败，请稍后再试",
      }));
    } finally {
      setReplyingCardId("");
    }
  }

  function renderCard(card: WhisperCard) {
    const isSender = card.senderId === currentUser.id;
    const cardMeta = isSender
      ? card.status === "pending"
        ? `将在 ${formatDateTime(card.deliverAt)} 送达`
        : "已送达"
      : `来自 ${card.sender.name}`;
    const cardBadge = card.status === "pending" ? "待送达" : isSender ? (card.readAt ? "已读" : "未读") : "已送达";

    return (
      <article
        key={card.id}
        className={clsx(
          "rounded-[28px] border bg-white/90 p-4 shadow-sm",
          !isSender && !card.readAt && card.status === "active" ? "border-amber-200" : "border-stone-200/80",
        )}
      >
        <div className="flex items-start gap-3">
          <UserAvatar user={isSender ? card.recipient : card.sender} size={42} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-stone-800">{isSender ? `给 ${card.recipient.name}` : card.sender.name}</p>
                <p className="mt-0.5 text-xs text-stone-400">{cardMeta}</p>
              </div>
              <div className="flex items-center gap-2">
                {card.editedAt ? <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-500">已修改</span> : null}
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600">{cardBadge}</span>
                {isSender ? (
                  <>
                    {card.status === "pending" ? (
                      <button type="button" onClick={() => onEdit(card)} className="rounded-full p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-800">
                        <Pencil size={15} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={deletingCardId === card.id}
                      onClick={() => void onDelete(card)}
                      className="rounded-full p-2 text-stone-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <div className="relative mt-4">
              <button
                type="button"
                onClick={() => setActiveLetterCardId(card.id)}
                className="relative block w-full text-left"
              >
                <div className="relative overflow-hidden rounded-[30px] border-2 border-[#ddc9b6] bg-[linear-gradient(180deg,#fbf2e9_0%,#f3e4d5_100%)] shadow-[0_16px_34px_rgba(168,151,134,0.14)] transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(168,151,134,0.18)]">
                  <div className="absolute inset-x-0 top-[42%] h-px bg-[#dbc6b1]" />
                  <div className="absolute inset-x-0 bottom-0 h-[58%] bg-[linear-gradient(180deg,#f6e9dc_0%,#eddccc_100%)]" />
                  <div
                    className={clsx(
                      "absolute inset-x-0 top-0 z-10 origin-top transition-all duration-500",
                      activeLetterCardId === card.id ? "-translate-y-3 rotate-[-4deg] opacity-95" : "translate-y-0 rotate-0 opacity-100",
                    )}
                    style={{ height: "118px", clipPath: "polygon(0 0, 100% 0, 50% 78%)", background: "linear-gradient(180deg, #fff7ef 0%, #f1e0cf 100%)" }}
                  />
                  <div className="absolute inset-x-0 bottom-0 z-[5] h-[60%]" style={{ clipPath: "polygon(0 100%, 18% 38%, 50% 72%, 82% 38%, 100% 100%)", background: "linear-gradient(180deg, #efddca 0%, #e7d1bb 100%)" }} />
                  <div className="absolute left-[14%] top-[44%] z-[6] h-[44%] w-px bg-[#decab5]" />
                  <div className="absolute right-[14%] top-[44%] z-[6] h-[44%] w-px bg-[#decab5]" />
                  <div className="relative z-20 px-5 pb-6 pt-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#ab947b]">悄悄来信</p>
                        <p className="mt-2 text-base font-semibold text-stone-700">{isSender ? `寄给 ${card.recipient.name}` : `${card.sender.name} 寄来的信`}</p>
                        <p className="mt-1 text-sm text-stone-500">轻点信封，把里面的心事打开</p>
                      </div>
                      <div className="rounded-full border border-white/90 bg-white/80 px-3 py-1 text-xs font-medium text-stone-500 shadow-sm">
                        未拆封
                      </div>
                    </div>

                    <div className="relative mt-6 flex items-end justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-[0.22em] text-[#b09b85]">To</p>
                        <p className="mt-1 truncate text-lg font-medium text-stone-700">{isSender ? card.recipient.name : currentUser.name}</p>
                      </div>
                      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
                        <svg viewBox="0 0 64 64" className="h-14 w-14 -rotate-12 drop-shadow-[0_8px_16px_rgba(188,161,150,0.22)]" aria-hidden="true">
                          <path
                            d="M32 54c-.7 0-1.4-.2-2-.7C17.4 44.2 10 36.9 10 27.2 10 20 15.3 14.7 22.2 14.7c4.2 0 7.9 2 9.8 5.2 1.9-3.2 5.6-5.2 9.8-5.2C48.7 14.7 54 20 54 27.2c0 9.7-7.4 17-20 26.1-.6.5-1.3.7-2 .7Z"
                            fill="#dcaea9"
                            opacity="0.34"
                            transform="translate(1.5 2.5)"
                          />
                          <path
                            d="M32 53c-.7 0-1.4-.2-2-.7C17.4 43.2 10 35.9 10 26.2 10 19 15.3 13.7 22.2 13.7c4.2 0 7.9 2 9.8 5.2 1.9-3.2 5.6-5.2 9.8-5.2C48.7 13.7 54 19 54 26.2c0 9.7-7.4 17-20 26.1-.6.5-1.3.7-2 .7Z"
                            fill="#fff9f6"
                            stroke="#efd5cc"
                            strokeWidth="2.4"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M32 47.5c-9.5-6.9-14.8-12.2-14.8-19.1 0-4.5 3.1-7.9 7.3-7.9 3.4 0 6.2 2 7.5 5 1.3-3 4.1-5 7.5-5 4.2 0 7.3 3.4 7.3 7.9 0 6.9-5.3 12.2-14.8 19.1Z"
                            fill="url(#heart-seal-fill)"
                          />
                          <path
                            d="M32 47.5c-9.5-6.9-14.8-12.2-14.8-19.1 0-4.5 3.1-7.9 7.3-7.9 3.4 0 6.2 2 7.5 5 1.3-3 4.1-5 7.5-5 4.2 0 7.3 3.4 7.3 7.9 0 6.9-5.3 12.2-14.8 19.1Z"
                            fill="none"
                            stroke="#f7e8e2"
                            strokeWidth="1.1"
                            opacity="0.9"
                          />
                          <ellipse cx="25" cy="23.5" rx="6.5" ry="3.8" fill="#ffffff" opacity="0.72" transform="rotate(-28 25 23.5)" />
                          <defs>
                            <linearGradient id="heart-seal-fill" x1="18" y1="19" x2="47" y2="47" gradientUnits="userSpaceOnUse">
                              <stop stopColor="#f9d7d2" />
                              <stop offset="0.55" stopColor="#f4c6c0" />
                              <stop offset="1" stopColor="#ebb6b0" />
                            </linearGradient>
                          </defs>
                        </svg>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-xs text-stone-400">
                      <span>{card.replies.length > 0 ? `${card.replies.length} 条回信` : "还没有回信"}</span>
                      <span>{formatLetterDate(card.deliverAt)} 送达</span>
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  if (totalCount === 0) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center text-stone-500">
        <MessageCircle className="mx-auto mb-3 text-stone-300" size={38} />
        <p className="text-sm leading-7">这里会保存你们之间的悄悄话。可以先写一张留言卡，设定什么时候送达；如果之后不想保留，也可以由发送方随时删除。</p>
        <button type="button" onClick={onCompose} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white">
          <Plus size={16} />
          写第一张悄悄话
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {overview.sections.pending.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-600">待送达</h3>
              <span className="text-xs text-stone-400">只有你自己看得见</span>
            </div>
            {overview.sections.pending.map(renderCard)}
          </section>
        ) : null}

        {overview.sections.active.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-600">正在生效</h3>
              <span className="text-xs text-stone-400">送达后可以即时回复</span>
            </div>
            {overview.sections.active.map(renderCard)}
          </section>
        ) : null}
      </div>

      {activeLetterCard ? (
        <WhisperLetterDialog
          card={activeLetterCard}
          currentUser={currentUser}
          replyDraft={replyDrafts[activeLetterCard.id] || ""}
          replyError={replyErrors[activeLetterCard.id] || ""}
          replying={replyingCardId === activeLetterCard.id}
          onClose={() => setActiveLetterCardId("")}
          onReplyDraftChange={(value) => setReplyDrafts((previous) => ({ ...previous, [activeLetterCard.id]: value }))}
          onReply={() => void submitReply(activeLetterCard.id)}
        />
      ) : null}
    </>
  );
}

function WhisperLetterDialog({
  card,
  currentUser,
  replyDraft,
  replyError,
  replying,
  onClose,
  onReplyDraftChange,
  onReply,
}: {
  card: WhisperCard;
  currentUser: User;
  replyDraft: string;
  replyError: string;
  replying: boolean;
  onClose: () => void;
  onReplyDraftChange: (value: string) => void;
  onReply: () => void;
}) {
  const isSender = card.senderId === currentUser.id;

  return (
    <div className="fixed inset-0 z-50 animate-letter-overlay-fade bg-stone-950/30 p-4 backdrop-blur-sm">
      <div className="flex h-full items-center justify-center">
        <div className="relative w-full max-w-3xl animate-letter-sheet-pop">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 z-30 rounded-full bg-white/85 p-2 text-stone-600 shadow-sm transition hover:bg-white"
          >
            <X size={20} />
          </button>

          <div className="mx-auto h-28 w-[86%] rounded-[28px] border border-[#eadccd] bg-[linear-gradient(180deg,#faf1e6_0%,#f3e2d0_100%)] shadow-[0_14px_30px_rgba(168,151,134,0.18)]" />

          <div
            className="-mt-14 rounded-[32px] border border-[#ece4da] bg-[#fffdf8] px-6 pb-6 pt-10 shadow-[0_30px_80px_rgba(168,151,134,0.18)]"
            style={{
              backgroundImage:
                "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(255,252,247,0.99) 100%), repeating-linear-gradient(180deg, transparent 0, transparent 31px, rgba(193, 176, 158, 0.10) 31px, rgba(193, 176, 158, 0.10) 32px)",
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#efe6db] pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-stone-400">悄悄话信纸</p>
                <h3 className="mt-2 text-xl font-semibold text-stone-800">{isSender ? `写给 ${card.recipient.name}` : `${card.sender.name} 写来的悄悄话`}</h3>
                <p className="mt-1 text-sm text-stone-500">{isSender ? "你的信纸已经展开在桌面上" : `${card.sender.name} 的信已经轻轻展开了`}</p>
              </div>
              <div className="text-right">
                <div className="rounded-full bg-[#f6efe7] px-3 py-1 text-xs font-medium text-stone-500">{card.status === "pending" ? "待送达信件" : "已送达信件"}</div>
                <p className="mt-2 text-xs text-stone-400">送达于 {formatLetterDate(card.deliverAt)}</p>
              </div>
            </div>

            <div className="pt-6 text-[15px] leading-8 text-stone-700">{card.content}</div>

            {card.replies.length > 0 ? (
              <div className="mt-8 space-y-3 rounded-[24px] bg-stone-50/90 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">回信</p>
                {card.replies.map((reply) => {
                  const isMyReply = reply.senderId === currentUser.id;
                  return (
                    <div key={reply.id} className={clsx("flex", isMyReply ? "justify-end" : "justify-start")}>
                      <div className={clsx("max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm", isMyReply ? "bg-stone-900 text-white" : "bg-white text-stone-700") }>
                        <p className={clsx("mb-1 text-[11px]", isMyReply ? "text-white/65" : "text-stone-400")}>{reply.sender.name}</p>
                        <p className="whitespace-pre-wrap">{reply.content}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {card.status === "active" ? (
              <div className="mt-8 rounded-[24px] border border-stone-200/80 bg-white/90 px-4 py-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">写回信</p>
                <textarea
                  value={replyDraft}
                  onChange={(event) => onReplyDraftChange(event.target.value)}
                  rows={3}
                  placeholder="在这张信纸旁边，写下一句回应..."
                  className="mt-3 w-full resize-none bg-transparent text-sm leading-7 outline-none"
                />
                {replyError ? <p className="mt-2 text-xs text-red-600">{replyError}</p> : null}
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={replying || !replyDraft.trim()}
                    onClick={onReply}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    <Send size={15} />
                    {replying ? "发送中..." : "寄出回信"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function WhisperComposerDialog({
  partner,
  mode,
  initialCard,
  onClose,
  onSubmit,
}: {
  partner: Pick<User, "id" | "name" | "avatarUrl">;
  mode: "create" | "edit";
  initialCard: WhisperCard | null;
  onClose: () => void;
  onSubmit: (payload: { content: string; deliverAt: string }) => Promise<void>;
}) {
  const [content, setContent] = useState(initialCard?.content || "");
  const [deliverAt, setDeliverAt] = useState(initialCard ? toDateTimeInputValue(initialCard.deliverAt) : toDateTimeInputValue(addMinutes(new Date(), 30)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setError("悄悄话内容不能为空");
      return;
    }

    if (!deliverAt) {
      setError("请选择送达时间");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSubmit({
        content: trimmedContent,
        deliverAt: new Date(deliverAt).toISOString(),
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存悄悄话失败");
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/20 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="flex w-full max-w-lg flex-col rounded-[28px] bg-[#fbfaf8] shadow-soft">
        <header className="flex h-16 items-center justify-between border-b border-stone-200 px-5">
          <div>
            <h2 className="text-lg font-semibold">{mode === "edit" ? "编辑悄悄话" : `写给 ${partner.name} 的悄悄话`}</h2>
            <p className="text-xs text-stone-500">只设置送达时间；发送后你仍然可以随时删除，删除会连同回复一起消失</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-stone-100">
            <X size={21} />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <TextArea label="内容" value={content} onChange={setContent} rows={5} />

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-stone-600">送达时间</span>
            <input
              type="datetime-local"
              value={deliverAt}
              onChange={(event) => setDeliverAt(event.target.value)}
              className="h-11 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm outline-none focus:border-stone-400"
            />
          </label>

          <div className="rounded-2xl bg-stone-100 px-4 py-3 text-xs leading-6 text-stone-500">
            收件人看到后不会显示具体时间，只会看到是谁送来的悄悄话。
          </div>

          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}
        </div>

        <footer className="flex flex-col gap-2 border-t border-stone-200 p-4 sm:flex-row">
          <button type="submit" disabled={saving} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-semibold text-white disabled:opacity-50">
            <Check size={18} />
            {saving ? "保存中..." : mode === "edit" ? "保存修改" : "安排送达"}
          </button>
          <button type="button" onClick={onClose} className="h-12 rounded-2xl bg-white px-5 text-sm font-semibold text-stone-600">
            取消
          </button>
        </footer>
      </form>
    </div>
  );
}

function WhisperDeleteDialog({
  card,
  deleting,
  onClose,
  onConfirm,
}: {
  card: WhisperCard;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const counterpart = card.recipient;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/20 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-md flex-col rounded-[28px] bg-[#fbfaf8] shadow-soft">
        <header className="flex h-16 items-center justify-between border-b border-stone-200 px-5">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">撤回这张悄悄话</h2>
            <p className="text-xs text-stone-500">撤回后会从你和 {counterpart.name} 的界面同时消失</p>
          </div>
          <button type="button" onClick={onClose} disabled={deleting} className="rounded-full p-2 hover:bg-stone-100 disabled:opacity-40">
            <X size={21} />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <div className="rounded-[24px] border border-stone-200 bg-white px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">即将撤回</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">{card.content}</p>
          </div>

          <div className="rounded-[24px] border border-red-100 bg-red-50/80 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-red-100 p-2 text-red-600">
                <TriangleAlert size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-red-700">这个操作无法撤销</p>
                <p className="mt-1 text-sm leading-6 text-red-600">删除后，相关即时回复也会一起消失，双方都无法再看到这张留言卡。</p>
              </div>
            </div>
          </div>
        </div>

        <footer className="flex flex-col gap-2 border-t border-stone-200 p-4 sm:flex-row">
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Trash2 size={16} />
            {deleting ? "撤回中..." : "确认撤回"}
          </button>
          <button type="button" onClick={onClose} disabled={deleting} className="h-12 rounded-2xl bg-white px-5 text-sm font-semibold text-stone-600 disabled:opacity-40">
            再想想
          </button>
        </footer>
      </div>
    </div>
  );
}

function MomentsPanel({
  cat,
  moments,
  loading,
  deletingMomentId,
  onOpenMoment,
  onDeleteMoment,
}: {
  cat: Cat;
  moments: CatMoment[];
  loading: boolean;
  deletingMomentId: string;
  onOpenMoment: (moment: CatMoment) => void;
  onDeleteMoment: (moment: CatMoment) => void;
}) {
  if (loading) {
    return <p className="text-center text-sm text-stone-400">正在打开{cat.name}的猫圈...</p>;
  }

  if (moments.length === 0) {
    return (
      <div className="mx-auto mt-16 max-w-sm text-center text-stone-500">
        <Images className="mx-auto mb-3 text-stone-300" size={38} />
        <p className="text-sm">还没有猫圈内容。给{cat.name}发一张图片，它会把自己的心情和时间一起收进电子相册。</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {moments.map((moment) => (
        <article key={moment.id} className="rounded-[28px] border border-stone-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-sm">
          <div className="mb-3 flex items-start gap-3">
            <Avatar cat={cat} size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-stone-800">{cat.name}</p>
                  <p className="mt-0.5 text-xs text-stone-400">发布到猫圈 · {formatDateTime(moment.createdAt)}</p>
                </div>
                <button
                  type="button"
                  disabled={deletingMomentId === moment.id}
                  onClick={() => onDeleteMoment(moment)}
                  className="rounded-full p-2 text-stone-400 transition hover:bg-stone-100 hover:text-red-500 disabled:opacity-40"
                  title="删除这条猫圈"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">{moment.caption}</p>
            </div>
          </div>
          <button type="button" onClick={() => onOpenMoment(moment)} className="block w-full overflow-hidden rounded-[24px] bg-stone-100 text-left">
            <div className="aspect-[4/3] overflow-hidden">
              <Image src={moment.imageUrl} alt={`${cat.name}的猫圈图片`} width={960} height={720} className="h-full w-full object-cover transition duration-300 hover:scale-[1.02]" />
            </div>
          </button>
        </article>
      ))}
    </div>
  );
}

function MomentPreviewDialog({
  cat,
  moment,
  deleting,
  onClose,
  onDelete,
}: {
  cat: Cat;
  moment: CatMoment;
  deleting: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] bg-[#fbfaf8] shadow-soft lg:flex-row">
        <div className="relative flex-1 bg-stone-950">
          <Image src={moment.imageUrl} alt={`${cat.name}的猫圈图片大图`} width={1400} height={1100} className="h-full max-h-[70vh] w-full object-contain lg:max-h-[92vh]" />
          <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-stone-700 hover:bg-white">
            <X size={20} />
          </button>
        </div>
        <aside className="flex w-full max-w-md flex-col border-t border-stone-200 lg:border-l lg:border-t-0">
          <div className="flex items-center gap-3 border-b border-stone-200 px-5 py-4">
            <Avatar cat={cat} size={42} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-stone-800">{cat.name}的猫圈</p>
              <p className="text-xs text-stone-400">{formatDateTime(moment.createdAt)}</p>
            </div>
          </div>
          <div className="scrollbar-soft flex-1 space-y-4 overflow-y-auto p-5">
            <p className="whitespace-pre-wrap text-sm leading-7 text-stone-700">{moment.caption}</p>
          </div>
          <div className="flex gap-2 border-t border-stone-200 p-4">
            <button
              type="button"
              disabled={deleting}
              onClick={onDelete}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 text-sm font-semibold text-white disabled:opacity-40"
            >
              <Trash2 size={16} />
              {deleting ? "删除中..." : "删除这条猫圈"}
            </button>
            <button type="button" onClick={onClose} className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-stone-600">
              关闭
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MomentDeleteDialog({
  cat,
  moment,
  deleting,
  onClose,
  onConfirm,
}: {
  cat: Cat;
  moment: CatMoment;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/20 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-md flex-col rounded-[28px] bg-[#fbfaf8] shadow-soft">
        <header className="flex h-16 items-center justify-between border-b border-stone-200 px-5">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">删除这条猫圈</h2>
            <p className="text-xs text-stone-500">删除后会从 {cat.name} 的电子相册中永久移除</p>
          </div>
          <button type="button" onClick={onClose} disabled={deleting} className="rounded-full p-2 hover:bg-stone-100 disabled:opacity-40">
            <X size={21} />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <div className="overflow-hidden rounded-[24px] border border-stone-200 bg-white">
            <div className="aspect-[4/3] overflow-hidden bg-stone-100">
              <Image src={moment.imageUrl} alt={`${cat.name}的猫圈图片预览`} width={960} height={720} className="h-full w-full object-cover" />
            </div>
            <div className="space-y-2 px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">即将删除</p>
              <p className="text-sm font-semibold text-stone-800">{cat.name}的猫圈照片</p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-stone-600">{moment.caption || "这张图片没有额外文案。"}</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-red-100 bg-red-50/80 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-red-100 p-2 text-red-600">
                <TriangleAlert size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-red-700">这个操作无法撤销</p>
                <p className="mt-1 text-sm leading-6 text-red-600">删除后，这张图片会从猫圈和电子相册里一起消失。</p>
              </div>
            </div>
          </div>
        </div>

        <footer className="flex flex-col gap-2 border-t border-stone-200 p-4 sm:flex-row">
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Trash2 size={16} />
            {deleting ? "删除中..." : "确认删除"}
          </button>
          <button type="button" onClick={onClose} disabled={deleting} className="h-12 rounded-2xl bg-white px-5 text-sm font-semibold text-stone-600 disabled:opacity-40">
            取消
          </button>
        </footer>
      </div>
    </div>
  );
}

function UserProfileDialog({
  user,
  onClose,
  onUpdated,
}: {
  user: User;
  onClose: () => void;
  onUpdated: (user: User) => void;
}) {
  const [form, setForm] = useState({
    username: user.username,
    name: user.name,
    bio: user.bio,
  });
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const displayedAvatarUrl = avatarPreviewUrl || avatarUrl;

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  function selectAvatar(file?: File) {
    if (!file) return;
    if (file.size > avatarUploadLimitBytes) {
      setError("原始头像不能超过 10MB");
      return;
    }
    if (!isAllowedUploadType(file)) {
      setError("请上传 png、jpg、webp 或 gif 图片");
      return;
    }

    setError("");
    setAvatarFile(file);
    setAvatarPreviewUrl((previous) => {
      if (previous?.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      return URL.createObjectURL(file);
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    const username = form.username.trim();
    const name = form.name.trim();
    const bio = form.bio.trim();

    if (!username) {
      setError("用户名不能为空");
      return;
    }

    if (!name) {
      setError("显示名称不能为空");
      return;
    }

    setSaving(true);
    setError("");

    const response = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        name,
        bio,
      }),
    });

    const data = (await response.json()) as { user?: User; error?: string };

    if (!response.ok || !data.user) {
      setSaving(false);
      setError(data.error || "保存个人资料失败");
      return;
    }

    let updatedUser = data.user;
    setAvatarUrl(data.user.avatarUrl);
    setForm({ username: data.user.username, name: data.user.name, bio: data.user.bio });

    if (avatarFile) {
      const formData = new FormData();
      formData.set("avatar", avatarFile);
      const avatarResponse = await fetch("/api/auth/me/avatar", { method: "POST", body: formData });
      const avatarData = (await avatarResponse.json()) as { user?: User; error?: string };

      if (!avatarResponse.ok || !avatarData.user) {
        setSaving(false);
        onUpdated(data.user);
        setError(avatarData.error || "头像上传失败");
        return;
      }

      updatedUser = avatarData.user;
      setAvatarUrl(avatarData.user.avatarUrl);
    }

    setSaving(false);
    onUpdated(updatedUser);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/20 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="flex w-full max-w-md flex-col rounded-[28px] bg-[#fbfaf8] shadow-soft">
        <header className="flex h-16 items-center justify-between border-b border-stone-200 px-5">
          <div>
            <h2 className="text-lg font-semibold">个人资料</h2>
            <p className="text-xs text-stone-500">这里只会修改你自己的账号信息</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-stone-100">
            <X size={21} />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <div className="flex items-center gap-4">
            <UserAvatar user={{ name: form.name || user.name, avatarUrl: displayedAvatarUrl }} size={64} />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-medium shadow-sm">
              <Camera size={17} />
              上传头像
              <input type="file" accept={uploadAccept} className="hidden" onChange={(event) => selectAvatar(event.target.files?.[0])} />
            </label>
          </div>
          <p className="-mt-1 text-xs text-stone-400">支持上传不超过 10MB 的原始头像，系统会自动压缩静态图片头像。</p>
          <TextField label="登录用户名" value={form.username} onChange={(value) => setForm((previous) => ({ ...previous, username: value }))} />
          <TextField label="显示名称" value={form.name} onChange={(value) => setForm((previous) => ({ ...previous, name: value }))} />
          <TextArea label="个人简介" value={form.bio} onChange={(value) => setForm((previous) => ({ ...previous, bio: value }))} rows={3} />
          <p className="rounded-2xl bg-stone-100 px-4 py-3 text-xs leading-5 text-stone-500">
            密码修改已移到登录页处理。这里仅修改你自己的头像、名称、用户名和简介。
          </p>
          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}
        </div>

        <footer className="flex flex-col gap-2 border-t border-stone-200 p-4 sm:flex-row">
          <button
            type="submit"
            disabled={saving}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-semibold text-white disabled:opacity-50"
          >
            <Check size={18} />
            {saving ? "保存中..." : "保存资料"}
          </button>
          <button type="button" onClick={onClose} className="h-12 rounded-2xl bg-white px-5 text-sm font-semibold text-stone-600">
            取消
          </button>
        </footer>
      </form>
    </div>
  );
}

function CreateCatDialog({
  initialName,
  currentUser,
  onClose,
  onCreate,
}: {
  initialName: string;
  currentUser: User;
  onClose: () => void;
  onCreate: (draft: CatDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CatDraft>({
    ...emptyCat,
    name: initialName,
    nickname: currentUser.name,
    preference: "喜欢自然、贴近生活的回应。",
    avatarFile: null,
  });
  const [avatarPreview, setAvatarPreview] = useState("/avatars/cat-cream.svg");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.name.trim() || creating) return;

    setCreating(true);
    setError("");
    try {
      await onCreate({
        ...draft,
        name: draft.name.trim(),
        personality: draft.personality.trim(),
        tone: draft.tone.trim(),
        backstory: draft.backstory.trim(),
        nickname: draft.nickname.trim(),
        preference: draft.preference.trim(),
      });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建猫咪失败");
    } finally {
      setCreating(false);
    }
  }

  function selectAvatar(file?: File) {
    if (!file) return;
    if (file.size > avatarUploadLimitBytes) {
      setError("原始头像不能超过 10MB");
      return;
    }
    if (!isAllowedUploadType(file)) {
      setError("请上传 png、jpg、webp 或 gif 图片");
      return;
    }
    setError("");
    setDraft((previous) => ({ ...previous, avatarFile: file }));
    setAvatarPreview((previous) => {
      if (previous.startsWith("blob:")) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/20 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-[28px] bg-[#fbfaf8] shadow-soft">
        <header className="flex h-16 items-center justify-between border-b border-stone-200 px-5">
          <div>
            <h2 className="text-lg font-semibold">创建新猫咪</h2>
            <p className="text-xs text-stone-500">填好信息后会直接进入聊天</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-stone-100">
            <X size={21} />
          </button>
        </header>

        <div className="scrollbar-soft flex-1 space-y-5 overflow-y-auto p-5">
          <div className="flex items-center gap-4">
            <div className="shrink-0 overflow-hidden rounded-full bg-petal ring-1 ring-white/80" style={{ width: 72, height: 72 }}>
              <Image src={avatarPreview} alt="新猫咪头像" width={72} height={72} className="h-full w-full object-cover" />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-medium shadow-sm">
              <Camera size={17} />
              上传头像
              <input type="file" accept={uploadAccept} className="hidden" onChange={(event) => selectAvatar(event.target.files?.[0])} />
            </label>
          </div>
          <p className="-mt-2 text-xs text-stone-400">支持上传不超过 10MB 的原始头像，系统会自动压缩静态图片头像。</p>

          <TextField
            label="名字"
            value={draft.name}
            onChange={(value) => setDraft((previous) => ({ ...previous, name: value }))}
          />
          <TextArea
            label="性格"
            value={draft.personality}
            onChange={(value) => setDraft((previous) => ({ ...previous, personality: value }))}
          />
          <TextArea
            label="语气"
            value={draft.tone}
            onChange={(value) => setDraft((previous) => ({ ...previous, tone: value }))}
          />
          <TextArea
            label="背景故事"
            value={draft.backstory}
            onChange={(value) => setDraft((previous) => ({ ...previous, backstory: value }))}
          />

          <div>
            <p className="mb-3 text-sm font-semibold text-stone-600">你和这只猫的专属设置</p>
            <div className="space-y-3 rounded-3xl bg-white/80 p-4">
              <TextField
                label="它怎么称呼你"
                value={draft.nickname}
                onChange={(value) => setDraft((previous) => ({ ...previous, nickname: value }))}
              />
              <TextArea
                label="它和你相处时优先记住什么"
                value={draft.preference}
                onChange={(value) => setDraft((previous) => ({ ...previous, preference: value }))}
                rows={3}
              />
              <p className="text-xs leading-5 text-stone-500">其他用户的称呼会先使用他们自己的显示名称，之后由他们自己再调整。</p>
            </div>
          </div>
          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}
        </div>

        <footer className="flex flex-col gap-2 border-t border-stone-200 p-4 sm:flex-row">
          <button
            type="submit"
            disabled={!draft.name.trim() || creating}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={18} />
            {creating ? "创建中..." : "确认创建"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-2xl bg-white px-5 text-sm font-semibold text-stone-600"
          >
            取消
          </button>
        </footer>
      </form>
    </div>
  );
}

function CatSettings({
  cat,
  currentUser,
  users,
  onClose,
  onSaved,
  onDeleted,
}: {
  cat: Cat;
  currentUser: User;
  users: User[];
  onClose: () => void;
  onSaved: (cat: Cat) => void;
  onDeleted: (deletedCatId: string) => void;
}) {
  const currentProfile = cat.nicknames.find((item) => item.userId === currentUser.id);
  const [form, setForm] = useState({
    name: cat.name,
    personality: cat.personality,
    tone: cat.tone,
    backstory: cat.backstory,
  });
  const [relationForm, setRelationForm] = useState({
    nickname: currentProfile?.nickname || currentUser.name,
    preference: currentProfile?.preference || "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [error, setError] = useState("");
  const normalizedDeleteConfirmName = deleteConfirmName.trim();
  const canDelete = normalizedDeleteConfirmName === cat.name && !deleting;

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  async function save() {
    setSaving(true);
    setError("");
    const [catResponse, nicknameResponse] = await Promise.all([
      fetch(`/api/cats/${cat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }),
      fetch(`/api/cats/${cat.id}/nicknames`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: relationForm.nickname, preference: relationForm.preference }),
      }),
    ]);
    if (!catResponse.ok || !nicknameResponse.ok) {
      setSaving(false);
      setError("保存失败，请稍后再试");
      return;
    }

    const data = (await catResponse.json()) as { cat: Cat };
    const nicknameData = (await nicknameResponse.json()) as { cat?: Cat };
    const savedCat = nicknameData.cat || data.cat;

    if (avatarFile) {
      const formData = new FormData();
      formData.set("avatar", avatarFile);
      const avatarResponse = await fetch(`/api/cats/${cat.id}/avatar`, { method: "POST", body: formData });
      const avatarData = (await avatarResponse.json()) as { cat?: Cat; error?: string };
      if (!avatarResponse.ok || !avatarData.cat) {
        setSaving(false);
        onSaved(savedCat);
        setError(avatarData.error || "头像上传失败");
        return;
      }

      setSaving(false);
      onSaved(avatarData.cat);
      onClose();
      return;
    }

    setSaving(false);
    onSaved(savedCat);
    onClose();
  }

  function selectAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > avatarUploadLimitBytes) {
      setError("原始头像不能超过 10MB");
      event.target.value = "";
      return;
    }
    if (!isAllowedUploadType(file)) {
      setError("请上传 png、jpg、webp 或 gif 图片");
      event.target.value = "";
      return;
    }

    setError("");
    setAvatarFile(file);
    setAvatarPreviewUrl((previous) => {
      if (previous?.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      return URL.createObjectURL(file);
    });
    event.target.value = "";
  }

  async function deleteCat() {
    if (!canDelete) return;

    setDeleting(true);
    setError("");
    const response = await fetch(`/api/cats/${cat.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: normalizedDeleteConfirmName }),
    });
    const data = (await response.json()) as { deletedCatId?: string; error?: string };
    setDeleting(false);

    if (!response.ok || !data.deletedCatId) {
      setError(data.error || "删除猫咪失败");
      return;
    }

    onDeleted(data.deletedCatId);
  }

  return (
    <div className="fixed inset-0 z-40 bg-stone-900/20 backdrop-blur-sm">
      <aside className="ml-auto flex h-full w-full max-w-lg flex-col bg-[#fbfaf8] shadow-soft">
        <header className="flex h-16 items-center justify-between border-b border-stone-200 px-5">
          <h2 className="text-lg font-semibold">猫咪设置</h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-stone-100">
            <X size={21} />
          </button>
        </header>
        <div className="scrollbar-soft flex-1 space-y-5 overflow-y-auto p-5">
          <div className="flex items-center gap-4">
            <Avatar cat={{ name: cat.name, avatarUrl: avatarPreviewUrl || cat.avatarUrl }} size={72} />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-medium shadow-sm">
              <Camera size={17} />
              上传头像
              <input type="file" accept={uploadAccept} className="hidden" onChange={selectAvatar} />
            </label>
          </div>
          <p className="-mt-2 text-xs text-stone-400">支持上传不超过 10MB 的原始头像，系统会自动压缩静态图片头像。</p>

          <TextField label="名字" value={form.name} onChange={(value) => setForm((previous) => ({ ...previous, name: value }))} />
          <TextArea label="性格" value={form.personality} onChange={(value) => setForm((previous) => ({ ...previous, personality: value }))} />
          <TextArea label="语气" value={form.tone} onChange={(value) => setForm((previous) => ({ ...previous, tone: value }))} />
          <TextArea label="背景故事" value={form.backstory} onChange={(value) => setForm((previous) => ({ ...previous, backstory: value }))} />

          <section className="space-y-4 rounded-3xl bg-white/80 p-4">
            <div>
              <p className="text-sm font-semibold text-stone-700">你的专属关系</p>
              <p className="mt-1 text-xs leading-5 text-stone-500">这里只能改这只猫对你的称呼和对你聊天时优先参考的偏好。</p>
            </div>
            <TextField
              label="它怎么称呼你"
              value={relationForm.nickname}
              onChange={(value) => setRelationForm((previous) => ({ ...previous, nickname: value }))}
            />
            <TextArea
              label="它和你相处时优先记住什么"
              value={relationForm.preference}
              onChange={(value) => setRelationForm((previous) => ({ ...previous, preference: value }))}
              rows={3}
            />
            <InfoCard title="你的关系状态" content={currentProfile?.relationship || "还在慢慢熟悉中。"} />
            <InfoCard title="你的专属记忆" content={currentProfile?.memorySummary || "暂时还没有专属记忆。开始聊天后会逐步累积。"} />
          </section>

          <section className="space-y-3 rounded-3xl bg-stone-100/80 p-4">
            <p className="text-sm font-semibold text-stone-700">其他用户的专属称呼</p>
            {users
              .filter((user) => user.id !== currentUser.id)
              .map((user) => {
                const profile = cat.nicknames.find((item) => item.userId === user.id);
                return (
                  <div key={user.id} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-3">
                    <UserAvatar user={user} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-stone-700">{user.name}</p>
                      <p className="truncate text-xs text-stone-500">{profile?.nickname || user.name}</p>
                    </div>
                    <span className="text-xs text-stone-400">仅本人可修改</span>
                  </div>
                );
              })}
          </section>

          <section className="rounded-3xl border border-red-100 bg-red-50/70 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-red-100 p-2 text-red-600">
                <TriangleAlert size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-red-700">危险操作区</h3>
                <p className="mt-1 text-sm leading-6 text-red-600">
                  删除后会永久移除这只猫咪、聊天记录、长期记忆和自定义头像。这个操作无法撤销。
                </p>
                {!deleteOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteOpen(true);
                      setDeleteConfirmName("");
                      setError("");
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={16} />
                    删除这只猫咪
                  </button>
                ) : (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm leading-6 text-red-700">
                      请输入猫咪当前名称 <span className="font-semibold">{cat.name}</span> 来确认删除。输入框前后的空格会被忽略。
                    </p>
                    <input
                      value={deleteConfirmName}
                      onChange={(event) => setDeleteConfirmName(event.target.value)}
                      className="h-11 w-full rounded-2xl border border-red-200 bg-white px-4 text-sm outline-none focus:border-red-400"
                      placeholder={cat.name}
                    />
                    {deleteConfirmName && !canDelete ? (
                      <p className="text-xs text-red-600">输入内容需要和猫咪名称完全一致。</p>
                    ) : null}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={deleteCat}
                        disabled={!canDelete}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 size={16} />
                        {deleting ? "删除中..." : "确认永久删除"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteOpen(false);
                          setDeleteConfirmName("");
                          setError("");
                        }}
                        className="h-11 rounded-2xl bg-white px-4 text-sm font-semibold text-stone-600"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}
        </div>
        <footer className="border-t border-stone-200 p-4">
          <button onClick={save} disabled={saving || deleting} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-semibold text-white disabled:opacity-50">
            <Check size={18} />
            {saving ? "保存中..." : "保存设定"}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-stone-600">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm outline-none focus:border-stone-400" />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-stone-600">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-stone-400" />
    </label>
  );
}

function InfoCard({ title, content }: { title: string; content: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-[#fbfaf8] px-4 py-3">
      <p className="text-xs font-medium text-stone-500">{title}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-700">{content}</p>
    </div>
  );
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60 * 1000);
}

function toDateTimeInputValue(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLetterDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
