"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Bot,
  ChevronDown,
  Download,
  FileText,
  MessageSquarePlus,
  Paperclip,
  Square,
  Trash2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type User = { id: string; username: string; name: string };

type ToolCall = {
  id: string;
  name: string;
  label: string;
  args: Record<string, unknown>;
  result?: string;
  expanded: boolean;
};

/** A file the user has selected and already uploaded to the server. */
type Attachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  textContent?: string;
  /** Local object URL for image preview */
  previewUrl?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: ToolCall[];
  isStreaming: boolean;
  /** Attachments shown in user bubbles */
  attachments?: Pick<Attachment, "id" | "name" | "mimeType" | "previewUrl">[];
};

type Session = {
  clientId: string;      // local UI id
  serverId: string;      // server session id
  title: string;
  messages: Message[];
};

type SSEEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_start"; name: string; label: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; result: string }
  | { type: "agent_end" }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid() {
  return Math.random().toString(36).slice(2);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getThoughtStep(toolName: string, label: string) {
  switch (toolName) {
    case "read_file":
      return "先读取相关文件和上下文信息";
    case "write_file":
      return "整理内容并写入需要更新的文件";
    case "bash":
      return "补充执行必要命令来确认信息";
    case "web_search":
      return "先搜索补充资料";
    case "fetch_url":
      return "读取指定网页并提取重点";
    case "generate_word_doc":
      return "整理结果并生成可下载的 Word 文档";
    case "generate_text_file":
      return "整理结果并生成可下载的文本文件";
    default:
      return `处理步骤：${label}`;
  }
}

async function apiCreateSession(): Promise<string> {
  const res = await fetch("/api/pi/sessions", { method: "POST" });
  if (!res.ok) throw new Error("Failed to create session");
  const data = await res.json() as { sessionId: string };
  return data.sessionId;
}

async function apiDeleteSession(serverId: string) {
  await fetch(`/api/pi/sessions/${serverId}`, { method: "DELETE" });
}

async function apiAbort(serverId: string) {
  await fetch(`/api/pi/sessions/${serverId}/abort`, { method: "POST" });
}

async function apiUploadFiles(serverId: string, files: File[]): Promise<Attachment[]> {
  const form = new FormData();
  for (const f of files) form.append("file", f);
  const res = await fetch(`/api/pi/sessions/${serverId}/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error: string };
    throw new Error(err.error ?? "Upload failed");
  }
  const data = await res.json() as { files: Omit<Attachment, "previewUrl">[] };
  return data.files;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentChatUI({ user }: { user: User }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasInitializedSessionRef = useRef(false);
  const activeSession = sessions.find((s) => s.clientId === activeId) ?? null;

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages]);

  // Create a new chat session
  const handleNewChat = useCallback(async () => {
    const serverId = await apiCreateSession();
    const session: Session = {
      clientId: uid(),
      serverId,
      title: "New Chat",
      messages: [],
    };
    setSessions((prev) => [session, ...prev]);
    setActiveId(session.clientId);
  }, []);

  // Start with a session on first load
  useEffect(() => {
    if (hasInitializedSessionRef.current) {
      return;
    }
    hasInitializedSessionRef.current = true;
    void handleNewChat();
  }, [handleNewChat]);

  // Delete a session
  const handleDeleteSession = useCallback(
    async (clientId: string) => {
      const session = sessions.find((s) => s.clientId === clientId);
      if (!session) return;
      await apiDeleteSession(session.serverId);
      setSessions((prev) => prev.filter((s) => s.clientId !== clientId));
      if (activeId === clientId) {
        const remaining = sessions.filter((s) => s.clientId !== clientId);
        setActiveId(remaining[0]?.clientId ?? null);
      }
    },
    [sessions, activeId],
  );

  // File upload handler — called when user selects files
  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !activeSession) return;
      setIsUploading(true);
      setUploadError(null);
      try {
        const fileArray = Array.from(files);
        // Create local preview URLs for images
        const previewMap: Record<string, string> = {};
        for (const f of fileArray) {
          if (f.type.startsWith("image/")) {
            previewMap[f.name] = URL.createObjectURL(f);
          }
        }
        const uploaded = await apiUploadFiles(activeSession.serverId, fileArray);
        const withPreviews: Attachment[] = uploaded.map((att) => ({
          ...att,
          previewUrl: previewMap[att.name],
        }));
        setPendingAttachments((prev) => [...prev, ...withPreviews]);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "上传失败");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [activeSession],
  );

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  // Send a message
  const handleSend = useCallback(async () => {
    if ((!input.trim() && pendingAttachments.length === 0) || isStreaming || !activeSession) return;

    const attachmentsSnapshot = [...pendingAttachments];
    const userMsg: Message = {
      id: uid(),
      role: "user",
      content: input.trim(),
      toolCalls: [],
      isStreaming: false,
      attachments: attachmentsSnapshot.map(({ id, name, mimeType, previewUrl }) => ({
        id, name, mimeType, previewUrl,
      })),
    };
    const assistantMsg: Message = {
      id: uid(),
      role: "assistant",
      content: "",
      toolCalls: [],
      isStreaming: true,
    };
    const assistantMsgId = assistantMsg.id;
    const msgText = input.trim();

    // Update title from first message
    setSessions((prev) =>
      prev.map((s) =>
        s.clientId === activeSession.clientId
          ? {
              ...s,
              title: s.messages.length === 0 ? (msgText || attachmentsSnapshot[0]?.name || "文件上传").slice(0, 40) : s.title,
              messages: [...s.messages, userMsg, assistantMsg],
            }
          : s,
      ),
    );
    setInput("");
    setPendingAttachments([]);
    setUploadError(null);
    setIsStreaming(true);

    try {
      const res = await fetch(`/api/pi/sessions/${activeSession.serverId}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msgText || "请处理我上传的文件。",
          attachments: attachmentsSnapshot.map(({ id, name, mimeType, textContent }) => ({
            id, name, mimeType, textContent,
          })),
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // Track pending tool call by name (last started)
      let pendingToolName = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let event: SSEEvent;
          try {
            event = JSON.parse(line.slice(6)) as SSEEvent;
          } catch {
            continue;
          }

          if (event.type === "text_delta") {
            setSessions((prev) =>
              prev.map((s) =>
                s.clientId !== activeSession.clientId
                  ? s
                  : {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantMsgId
                          ? { ...m, content: m.content + event.delta }
                          : m,
                      ),
                    },
              ),
            );
          } else if (event.type === "tool_start") {
            pendingToolName = event.name;
            const toolCall: ToolCall = {
              id: uid(),
              name: event.name,
              label: event.label,
              args: event.args,
              expanded: true,
            };
            setSessions((prev) =>
              prev.map((s) =>
                s.clientId !== activeSession.clientId
                  ? s
                  : {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantMsgId
                          ? { ...m, toolCalls: [...m.toolCalls, toolCall] }
                          : m,
                      ),
                    },
              ),
            );
          } else if (event.type === "tool_end") {
            const toolName = event.name || pendingToolName;
            setSessions((prev) =>
              prev.map((s) =>
                s.clientId !== activeSession.clientId
                  ? s
                  : {
                      ...s,
                      messages: s.messages.map((m) => {
                        if (m.id !== assistantMsgId) return m;
                        const toolCalls = [...m.toolCalls];
                        // Fill result on last matching tool
                        for (let i = toolCalls.length - 1; i >= 0; i--) {
                          if (toolCalls[i].name === toolName && toolCalls[i].result === undefined) {
                            toolCalls[i] = { ...toolCalls[i], result: event.result };
                            break;
                          }
                        }
                        return { ...m, toolCalls };
                      }),
                    },
              ),
            );
          } else if (event.type === "agent_end") {
            setSessions((prev) =>
              prev.map((s) =>
                s.clientId !== activeSession.clientId
                  ? s
                  : {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
                      ),
                    },
              ),
            );
            setIsStreaming(false);
          } else if (event.type === "error") {
            setSessions((prev) =>
              prev.map((s) =>
                s.clientId !== activeSession.clientId
                  ? s
                  : {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantMsgId
                          ? {
                              ...m,
                              content: m.content || `Error: ${event.message}`,
                              isStreaming: false,
                            }
                          : m,
                      ),
                    },
              ),
            );
            setIsStreaming(false);
          }
        }
      }
    } catch (err) {
      setSessions((prev) =>
        prev.map((s) =>
          s.clientId !== activeSession.clientId
            ? s
            : {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content: m.content || `Error: ${err instanceof Error ? err.message : String(err)}`,
                        isStreaming: false,
                      }
                    : m,
                ),
              },
        ),
      );
      setIsStreaming(false);
    }
  }, [input, pendingAttachments, isStreaming, activeSession]);

  const handleAbort = useCallback(async () => {
    if (!activeSession) return;
    await apiAbort(activeSession.serverId);
    setSessions((prev) =>
      prev.map((s) =>
        s.clientId !== activeSession.clientId
          ? s
          : {
              ...s,
              messages: s.messages.map((m) =>
                m.isStreaming ? { ...m, isStreaming: false } : m,
              ),
            },
      ),
    );
    setIsStreaming(false);
  }, [activeSession]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const hasMessages = !!(activeSession && activeSession.messages.length > 0);
  const canSend = (input.trim().length > 0 || pendingAttachments.length > 0) && !isStreaming && !!activeSession;

  /* Hidden file input */
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      accept="image/*,.txt,.md,.csv,.json,.html,.htm,.xml,.js,.ts,.py"
      className="hidden"
      onChange={(e) => void handleFileSelect(e.target.files)}
    />
  );

  /* Attachment chips shown above textarea */
  const attachmentChips = pendingAttachments.length > 0 ? (
    <div className="flex flex-wrap gap-2 px-1 pb-2 pt-1">
      {pendingAttachments.map((att) => (
        <div key={att.id} className="flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 pl-2 pr-1 py-1 text-xs text-gray-700 max-w-[180px]">
          {att.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={att.previewUrl} alt={att.name} className="h-4 w-4 rounded object-cover shrink-0" />
          ) : (
            <FileText size={12} className="shrink-0 text-gray-500" />
          )}
          <span className="truncate">{att.name}</span>
          <button
            onClick={() => removeAttachment(att.id)}
            className="shrink-0 rounded-full p-0.5 hover:bg-gray-300 transition-colors"
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  ) : null;

  /* Shared input bar — rendered in empty-state center OR at page bottom */
  const inputBar = (
    <div className="rounded-[20px] border border-gray-200 bg-white shadow-sm focus-within:border-gray-300 transition-colors overflow-hidden">
      {fileInput}
      {attachmentChips && (
        <div className="px-3 pt-2 pb-0">{attachmentChips}</div>
      )}
      <div className="flex items-end gap-2 px-4 py-3">
        {/* File upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming || !activeSession || isUploading}
          className="shrink-0 self-end mb-0.5 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="上传文件或图片"
        >
          {isUploading ? (
            <span className="h-4 w-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
          ) : (
            <Paperclip size={16} />
          )}
        </button>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 192)}px`;
          }}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? "正在生成…" : isUploading ? "上传中…" : "有问题，尽管问"}
          disabled={isStreaming || !activeSession}
          rows={1}
          className="flex-1 resize-none bg-transparent text-[15px] text-[#0d0d0d] placeholder-gray-400 outline-none disabled:opacity-50 overflow-y-auto leading-6"
          style={{ minHeight: "24px", maxHeight: "192px" }}
        />
        <div className="shrink-0 self-end mb-0.5">
          {isStreaming ? (
            <button
              onClick={() => void handleAbort()}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2f2f2f] hover:bg-black transition-colors"
              title="停止生成"
            >
              <Square size={12} className="text-white" fill="white" />
            </button>
          ) : (
            <button
              onClick={() => void handleSend()}
              disabled={!canSend}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2f2f2f] disabled:bg-gray-200 hover:bg-black disabled:cursor-not-allowed transition-colors"
              title="发送"
            >
              <ArrowUp size={16} className={canSend ? "text-white" : "text-gray-400"} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
      {uploadError && (
        <div className="px-4 pb-2 text-xs text-red-500">{uploadError}</div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen bg-white text-[#0d0d0d] font-sans antialiased">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="flex w-[260px] shrink-0 flex-col bg-[#f4f4f4]">
        {/* Logo + back button */}
        <div className="px-3 pt-3 pb-2 flex items-center gap-1">
          <button
            onClick={() => router.push("/")}
            title="返回主页"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 transition-colors shrink-0"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
            <Bot size={20} className="text-[#0d0d0d]" />
            <span className="text-[15px] font-semibold">Pi Agent</span>
          </div>
        </div>

        {/* Quick actions */}
        <div className="px-3 space-y-0.5">
          <button
            onClick={() => void handleNewChat()}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-gray-700 hover:bg-gray-200 transition-colors text-left"
          >
            <MessageSquarePlus size={16} className="text-gray-500 shrink-0" />
            <span>新聊天</span>
          </button>
        </div>

        {/* Session list */}
        {sessions.length > 0 && (
          <div className="mt-4 px-3 flex-none">
            <p className="mb-1 px-2 text-[11px] font-medium text-gray-400 uppercase tracking-wide">最近</p>
            <div className="space-y-0.5">
              {sessions.map((s) => (
                <div
                  key={s.clientId}
                  onClick={() => setActiveId(s.clientId)}
                  className={clsx(
                    "group flex items-center rounded-lg px-2 py-2 text-sm cursor-pointer transition-colors",
                    s.clientId === activeId
                      ? "bg-gray-200 text-[#0d0d0d]"
                      : "text-gray-600 hover:bg-gray-200 hover:text-[#0d0d0d]",
                  )}
                >
                  <span className="flex-1 truncate pr-1">{s.title}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); void handleDeleteSession(s.clientId); }}
                    className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded text-gray-400 hover:text-red-500 transition-all"
                    aria-label="删除会话"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1" />

        {/* User profile */}
        <div className="px-3 py-3 border-t border-gray-200">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div className="h-7 w-7 rounded-full bg-gray-700 flex items-center justify-center text-white text-xs font-semibold shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="flex-1 truncate text-sm font-medium text-[#0d0d0d]">{user.name}</span>
          </div>
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden bg-white">

        {hasMessages ? (
          /* ── Conversation view ── */
          <>
            {/* Thin header */}
            <div className="flex items-center px-6 h-12 border-b border-gray-100 shrink-0">
              <span className="flex items-center gap-1 text-sm font-semibold text-[#0d0d0d]">
                Pi Agent <ChevronDown size={14} className="text-gray-400" />
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[760px] px-4 py-8 space-y-8">
                {activeSession!.messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Bottom input */}
            <div className="px-4 pb-5 pt-3 border-t border-gray-100 shrink-0">
              <div className="mx-auto max-w-[760px]">
                {inputBar}
                <p className="mt-2 text-center text-[11px] text-gray-400">
                  Enter 发送&nbsp;·&nbsp;Shift+Enter 换行&nbsp;·&nbsp;📎 上传文件
                </p>
              </div>
            </div>
          </>
        ) : (
          /* ── Empty / welcome state ── */
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <h2 className="text-[32px] font-semibold text-[#0d0d0d] mb-5 tracking-tight">
              你在忙什么？
            </h2>
            <div className="w-full max-w-[680px]">
              {inputBar}
              {/* Suggestion chips */}
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {[
                  { label: "上传文件分析" },
                  { label: "生成Word文档" },
                  { label: "读取文件" },
                  { label: "执行命令" },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => { setInput(chip.label); textareaRef.current?.focus(); }}
                    className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

function MessageBubble({
  msg,
}: {
  msg: Message;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex flex-col items-end gap-2">
        {/* Attachment previews */}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-end max-w-[72%]">
            {msg.attachments.map((att) =>
              att.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={att.id}
                  src={att.previewUrl}
                  alt={att.name}
                  className="h-28 max-w-[200px] rounded-2xl object-cover border border-gray-200"
                />
              ) : (
                <div key={att.id} className="flex items-center gap-2 rounded-2xl bg-[#f4f4f4] border border-gray-200 px-3 py-2 text-xs text-gray-600 max-w-[200px]">
                  <FileText size={14} className="shrink-0 text-gray-400" />
                  <span className="truncate">{att.name}</span>
                </div>
              ),
            )}
          </div>
        )}
        {msg.content && (
          <div className="max-w-[72%] rounded-3xl bg-[#f4f4f4] px-5 py-3 text-[15px] text-[#0d0d0d] whitespace-pre-wrap break-words leading-7">
            {msg.content}
          </div>
        )}
      </div>
    );
  }

  // Assistant
  const thoughtSteps = msg.toolCalls.reduce<string[]>((steps, toolCall) => {
    const nextStep = getThoughtStep(toolCall.name, toolCall.label);
    if (!steps.includes(nextStep)) {
      steps.push(nextStep);
    }
    return steps;
  }, []);
  const showThoughts = msg.isStreaming || thoughtSteps.length > 0;

  return (
    <div className="flex items-start gap-3">
      {/* Bot avatar */}
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0d0d0d]">
        <Bot size={16} className="text-white" />
      </div>

      <div className="flex-1 min-w-0 space-y-2.5 pt-0.5">
        {showThoughts && (
          <ThoughtSummary
            steps={thoughtSteps}
            isStreaming={msg.isStreaming}
            hasContent={msg.content.length > 0}
          />
        )}

        {/* Text content with inline download link rendering */}
        {(msg.content || msg.isStreaming) && (
          <div className="text-[15px] text-[#0d0d0d] leading-7 whitespace-pre-wrap break-words">
            <AssistantContent content={msg.content} />
            {msg.isStreaming && (
              <span className="inline-block w-[3px] h-[18px] bg-gray-800 animate-[blink_1s_ease-in-out_infinite] ml-0.5 align-text-bottom rounded-full" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ThoughtSummary
// ---------------------------------------------------------------------------

function ThoughtSummary({
  steps,
  isStreaming,
  hasContent,
}: {
  steps: string[];
  isStreaming: boolean;
  hasContent: boolean;
}) {
  const displaySteps =
    steps.length > 0 ? steps : [hasContent ? "正在整理最终回复" : "正在理解问题并规划处理步骤"];

  return (
    <div className="w-full rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
        <span>处理思路</span>
        {isStreaming ? (
          <span className="flex gap-[3px] items-center">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-[bounce_0.8s_infinite_0ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-[bounce_0.8s_infinite_150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-[bounce_0.8s_infinite_300ms]" />
          </span>
        ) : (
          <span className="text-[11px] font-medium text-emerald-700">已完成</span>
        )}
      </div>
      <ol className="mt-2 space-y-1 text-sm leading-6 text-amber-950/85">
        {displaySteps.map((step, index) => (
          <li key={`${index}-${step}`}>
            {index + 1}. {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssistantContent — renders text with inline download buttons for /api/pi/... links
// ---------------------------------------------------------------------------

/**
 * Splits assistant text into segments.
 * Any Markdown link whose href starts with /api/pi/sessions/.../files/
 * is rendered as a download button instead of inline text.
 */
function AssistantContent({ content }: { content: string }) {
  const DOWNLOAD_LINK_RE = /\[([^\]]+)\]\((\/api\/pi\/sessions\/[^)]+\/files\/[^)]+)\)/g;

  const parts: { type: "text" | "download"; text: string; url?: string; label?: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  DOWNLOAD_LINK_RE.lastIndex = 0;
  while ((match = DOWNLOAD_LINK_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: "download", text: match[0], label: match[1], url: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: "text", text: content.slice(lastIndex) });
  }

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "download" && part.url) {
          const filename = decodeURIComponent(part.url.split("/").pop() ?? "file");
          return (
            <a
              key={i}
              href={part.url}
              download={filename}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 transition-colors no-underline mx-0.5"
            >
              <Download size={14} />
              <span>{part.label ?? filename}</span>
            </a>
          );
        }
        return <span key={i}>{part.text}</span>;
      })}
    </>
  );
}
