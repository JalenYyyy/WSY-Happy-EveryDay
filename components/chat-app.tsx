"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Send,
  Settings2,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import clsx from "clsx";

type User = { id: string; username: string; name: string };
type CatUserName = { id: string; catId: string; userId: string; nickname: string; user: Pick<User, "id" | "name"> };
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
  content: string;
  createdAt: string;
  user?: Pick<User, "id" | "name"> | null;
};

type Props = {
  currentUser: User;
  initialCats: Cat[];
  users: User[];
};

type CatDraft = typeof emptyCat & {
  name: string;
  nicknames: Record<string, string>;
  avatarFile?: File | null;
};

const emptyCat = {
  personality: "亲人、好奇、喜欢陪伴。",
  tone: "温柔自然，像熟悉的家人。",
  backstory: "这是一只刚加入小家的猫咪。",
};

export default function ChatApp({ currentUser, initialCats, users }: Props) {
  const [cats, setCats] = useState(initialCats);
  const [selectedCatId, setSelectedCatId] = useState(initialCats[0]?.id || "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileCatsOpen, setMobileCatsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const selectedCat = useMemo(
    () => cats.find((cat) => cat.id === selectedCatId) || cats[0],
    [cats, selectedCatId],
  );

  useEffect(() => {
    if (!selectedCat?.id) return;
    setLoadingMessages(true);
    fetch(`/api/cats/${selectedCat.id}/messages`)
      .then((response) => response.json())
      .then((data: { messages?: Message[] }) => setMessages(data.messages || []))
      .finally(() => setLoadingMessages(false));
  }, [selectedCat?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  async function refreshCats() {
    const response = await fetch("/api/cats");
    const data = (await response.json()) as { cats: Cat[] };
    setCats(data.cats);
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
    refreshCats();
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
        body: JSON.stringify({ nicknames: draft.nicknames }),
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
    const catsData = (await catsResponse.json()) as { cats: Cat[] };
    setCats(catsData.cats);
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
              <p className="text-xs font-medium text-stone-400">共享小家</p>
              <h1 className="text-xl font-semibold">猫咪小家</h1>
            </div>
            <button className="rounded-full p-2 text-stone-500 hover:bg-stone-100 sm:hidden" onClick={() => setMobileCatsOpen(false)}>
              <X size={20} />
            </button>
          </div>

          <div className="mb-4 flex items-center gap-2 rounded-2xl bg-cream px-3 py-3">
            <div className="h-9 w-9 rounded-full bg-sage" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{currentUser.name}</p>
              <p className="truncate text-xs text-stone-500">已登录，共享聊天记录</p>
            </div>
            <button title="退出登录" onClick={logout} className="rounded-full p-2 text-stone-500 hover:bg-white">
              <LogOut size={17} />
            </button>
          </div>

          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-600">五只猫咪</span>
            <button title="新增猫咪" onClick={() => setCreateOpen(true)} className="rounded-full bg-ink p-2 text-white hover:bg-stone-700">
              <Plus size={16} />
            </button>
          </div>

          <div className="scrollbar-soft flex max-h-[calc(100vh-15rem)] flex-col gap-2 overflow-y-auto pr-1">
            {cats.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCatId(cat.id);
                  setMobileCatsOpen(false);
                }}
                className={clsx(
                  "flex items-center gap-3 rounded-2xl p-3 text-left transition",
                  selectedCat?.id === cat.id ? "bg-stone-900 text-white" : "hover:bg-white",
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
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {selectedCat ? (
            <>
              <header className="flex h-16 items-center gap-3 border-b border-stone-200/80 bg-white/60 px-4">
                <button className="rounded-full p-2 text-stone-600 hover:bg-stone-100 sm:hidden" onClick={() => setMobileCatsOpen(true)}>
                  <Menu size={21} />
                </button>
                <Avatar cat={selectedCat} size={42} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold">{selectedCat.name}</h2>
                  <p className="truncate text-xs text-stone-500">{selectedCat.memory?.relationship || "正在熟悉中"}</p>
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
                {loadingMessages ? <p className="text-center text-sm text-stone-400">正在打开聊天...</p> : null}
                {!loadingMessages && messages.length === 0 ? (
                  <div className="mx-auto mt-16 max-w-sm text-center text-stone-500">
                    <MessageCircle className="mx-auto mb-3 text-stone-300" size={38} />
                    <p className="text-sm">还没有消息。和{selectedCat.name}说第一句话吧。</p>
                  </div>
                ) : null}
                <div className="space-y-4">
                  {messages.map((message) => (
                    <MessageBubble key={message.id} message={message} currentUser={currentUser} cat={selectedCat} />
                  ))}
                  {sending ? (
                    <div className="flex items-end gap-2">
                      <Avatar cat={selectedCat} size={34} />
                      <div className="rounded-2xl rounded-bl-md bg-white px-4 py-2 text-sm text-stone-400 shadow-sm">正在想怎么回答...</div>
                    </div>
                  ) : null}
                </div>
                <div ref={bottomRef} />
              </div>

              {notice ? <p className="mx-4 mb-2 rounded-2xl bg-amber-50 px-4 py-2 text-sm text-amber-700">{notice}</p> : null}

              <form onSubmit={sendMessage} className="border-t border-stone-200/80 bg-white/65 p-3">
                <div className="flex items-end gap-2 rounded-3xl bg-white px-3 py-2 shadow-sm">
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
                    placeholder={`和${selectedCat.name}说点什么`}
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
          users={users}
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

      {createOpen ? (
        <CreateCatDialog
          initialName={nextCatName()}
          users={users}
          onClose={() => setCreateOpen(false)}
          onCreate={createCat}
        />
      ) : null}
    </main>
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
            "whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm",
            isMine
              ? "rounded-br-md bg-[#95ec69] text-stone-900"
              : "rounded-bl-md bg-white text-stone-800",
          )}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

function CreateCatDialog({
  initialName,
  users,
  onClose,
  onCreate,
}: {
  initialName: string;
  users: User[];
  onClose: () => void;
  onCreate: (draft: CatDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CatDraft>({
    ...emptyCat,
    name: initialName,
    nicknames: Object.fromEntries(users.map((user) => [user.id, user.name])),
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
        nicknames: Object.fromEntries(
          Object.entries(draft.nicknames).map(([userId, nickname]) => [userId, nickname.trim()]),
        ),
      });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建猫咪失败");
    } finally {
      setCreating(false);
    }
  }

  function selectAvatar(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("头像不能超过 2MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("请上传图片文件");
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
              <input type="file" accept="image/*" className="hidden" onChange={(event) => selectAvatar(event.target.files?.[0])} />
            </label>
          </div>

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
            <p className="mb-3 text-sm font-semibold text-stone-600">猫咪对用户的称呼</p>
            <div className="space-y-3">
              {users.map((user) => (
                <TextField
                  key={user.id}
                  label={user.name}
                  value={draft.nicknames[user.id] || ""}
                  onChange={(value) =>
                    setDraft((previous) => ({
                      ...previous,
                      nicknames: { ...previous.nicknames, [user.id]: value },
                    }))
                  }
                />
              ))}
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
  users,
  onClose,
  onSaved,
  onDeleted,
}: {
  cat: Cat;
  users: User[];
  onClose: () => void;
  onSaved: (cat: Cat) => void;
  onDeleted: (deletedCatId: string) => void;
}) {
  const [form, setForm] = useState({
    name: cat.name,
    personality: cat.personality,
    tone: cat.tone,
    backstory: cat.backstory,
  });
  const [nicknames, setNicknames] = useState<Record<string, string>>(
    Object.fromEntries(users.map((user) => [user.id, cat.nicknames.find((item) => item.userId === user.id)?.nickname || user.name])),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [error, setError] = useState("");
  const normalizedDeleteConfirmName = deleteConfirmName.trim();
  const canDelete = normalizedDeleteConfirmName === cat.name && !deleting;

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
        body: JSON.stringify({ nicknames }),
      }),
    ]);
    setSaving(false);

    if (!catResponse.ok || !nicknameResponse.ok) {
      setError("保存失败，请稍后再试");
      return;
    }
    const data = (await catResponse.json()) as { cat: Cat };
    const nicknameData = (await nicknameResponse.json()) as { cat: Partial<Cat> };
    onSaved({ ...data.cat, nicknames: nicknameData.cat.nicknames || data.cat.nicknames });
    onClose();
  }

  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("avatar", file);
    const response = await fetch(`/api/cats/${cat.id}/avatar`, { method: "POST", body: formData });
    const data = (await response.json()) as { cat?: Cat; error?: string };
    if (!response.ok || !data.cat) {
      setError(data.error || "头像上传失败");
      return;
    }
    onSaved(data.cat);
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
            <Avatar cat={cat} size={72} />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-medium shadow-sm">
              <Camera size={17} />
              上传头像
              <input type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
            </label>
          </div>

          <TextField label="名字" value={form.name} onChange={(value) => setForm((previous) => ({ ...previous, name: value }))} />
          <TextArea label="性格" value={form.personality} onChange={(value) => setForm((previous) => ({ ...previous, personality: value }))} />
          <TextArea label="语气" value={form.tone} onChange={(value) => setForm((previous) => ({ ...previous, tone: value }))} />
          <TextArea label="背景故事" value={form.backstory} onChange={(value) => setForm((previous) => ({ ...previous, backstory: value }))} />

          <div>
            <p className="mb-3 text-sm font-semibold text-stone-600">猫咪对用户的称呼</p>
            <div className="space-y-3">
              {users.map((user) => (
                <TextField
                  key={user.id}
                  label={user.name}
                  value={nicknames[user.id] || ""}
                  onChange={(value) => setNicknames((previous) => ({ ...previous, [user.id]: value }))}
                />
              ))}
            </div>
          </div>

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

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-stone-600">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm outline-none focus:border-stone-400" />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-stone-600">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-stone-400" />
    </label>
  );
}
