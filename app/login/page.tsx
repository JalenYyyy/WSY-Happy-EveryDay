"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Cat, KeyRound, LockKeyhole, X } from "lucide-react";

type LoginUser = {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
};

export default function LoginPage() {
  const router = useRouter();
  const [users, setUsers] = useState<LoginUser[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState("");

  async function readApiResult<T>(response: Response) {
    const data = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(data.error || "请求失败，请稍后再试");
    }
    return data;
  }

  useEffect(() => {
    fetch("/api/auth/login")
      .then((response) => readApiResult<{ users?: LoginUser[] }>(response))
      .then((data) => {
        const nextUsers = data.users || [];
        setUsers(nextUsers);
        setUsername((previous) => previous || nextUsers[0]?.username || "");
      })
      .catch((error: unknown) => {
        setUsers([]);
        setError(error instanceof Error ? error.message : "加载用户列表失败，请刷新重试");
      });
  }, []);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    setLoading(false);
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error || "登录失败");
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!username || passwordSaving) return;

    const currentPassword = passwordForm.currentPassword.trim();
    const newPassword = passwordForm.newPassword.trim();
    const confirmPassword = passwordForm.confirmPassword.trim();

    if (!currentPassword) {
      setError("请输入当前密码");
      return;
    }

    if (!newPassword) {
      setError("请输入新密码");
      return;
    }

    if (newPassword.length < 4) {
      setError("新密码至少需要 4 位");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }

    setPasswordSaving(true);
    setError("");
    setPasswordNotice("");

    const response = await fetch("/api/auth/login", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, currentPassword, newPassword }),
    });

    const data = (await response.json()) as { message?: string; error?: string };
    setPasswordSaving(false);

    if (!response.ok) {
      setError(data.error || "修改密码失败");
      return;
    }

    setPassword(newPassword);
    setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setPasswordNotice(data.message || "密码已更新");
    setPasswordDialogOpen(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-soft backdrop-blur">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sage text-ink">
            <Cat size={26} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">小月天天开心</h1>
          </div>
        </div>

        <form onSubmit={login} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => {
                  setUsername(user.username);
                }}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  username === user.username
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-white text-stone-700"
                }`}
              >
                <span className="mb-2 flex items-center gap-2">
                  {user.avatarUrl ? (
                    <Image src={user.avatarUrl} alt={user.name} width={28} height={28} className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sage text-xs font-semibold text-ink">{user.name.charAt(0)}</span>
                  )}
                  <span className="block text-sm font-medium">{user.name}</span>
                </span>
                <span className="block text-xs opacity-70">{user.username}</span>
              </button>
            ))}
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-stone-600">密码</span>
            <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4">
              <LockKeyhole size={18} className="text-stone-400" />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                className="h-12 flex-1 border-0 bg-transparent outline-none"
              />
            </div>
          </label>

          <div className="flex items-center justify-between rounded-2xl bg-stone-100/80 px-4 py-3 text-sm text-stone-600">
            <span>{username ? `当前选择：${users.find((user) => user.username === username)?.name || username}` : "请先选择一个用户"}</span>
            <button
              type="button"
              disabled={!username}
              onClick={() => {
                setError("");
                setPasswordNotice("");
                setPasswordDialogOpen(true);
              }}
              className="inline-flex items-center gap-1 font-medium text-stone-700 disabled:opacity-40"
            >
              <KeyRound size={15} />
              修改密码
            </button>
          </div>

          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}
          {passwordNotice ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{passwordNotice}</p> : null}

          <button
            disabled={loading || !username}
            className="h-12 w-full rounded-2xl bg-ink text-sm font-semibold text-white shadow-sm transition hover:bg-stone-700 disabled:opacity-60"
          >
            {loading ? "正在登录..." : "登录"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-stone-400">初始密码是 cat123；后续改密码请直接在登录页处理。</p>
      </section>

      {passwordDialogOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/20 p-4 backdrop-blur-sm">
          <form onSubmit={changePassword} className="w-full max-w-md rounded-[28px] bg-[#fbfaf8] shadow-soft">
            <header className="flex h-16 items-center justify-between border-b border-stone-200 px-5">
              <div>
                <h2 className="text-lg font-semibold">修改密码</h2>
                <p className="text-xs text-stone-500">为当前选中的用户修改登录密码</p>
              </div>
              <button
                type="button"
                onClick={() => setPasswordDialogOpen(false)}
                className="rounded-full p-2 hover:bg-stone-100"
              >
                <X size={20} />
              </button>
            </header>

            <div className="space-y-4 p-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-stone-600">用户</span>
                <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                  {users.find((user) => user.username === username)?.name || username}
                  <span className="ml-2 text-xs text-stone-400">{username}</span>
                </div>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-stone-600">当前密码</span>
                <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4">
                  <LockKeyhole size={18} className="text-stone-400" />
                  <input
                    value={passwordForm.currentPassword}
                    onChange={(event) => setPasswordForm((previous) => ({ ...previous, currentPassword: event.target.value }))}
                    type="password"
                    className="h-12 flex-1 border-0 bg-transparent outline-none"
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-stone-600">新密码</span>
                <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4">
                  <KeyRound size={18} className="text-stone-400" />
                  <input
                    value={passwordForm.newPassword}
                    onChange={(event) => setPasswordForm((previous) => ({ ...previous, newPassword: event.target.value }))}
                    type="password"
                    className="h-12 flex-1 border-0 bg-transparent outline-none"
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-stone-600">确认新密码</span>
                <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4">
                  <KeyRound size={18} className="text-stone-400" />
                  <input
                    value={passwordForm.confirmPassword}
                    onChange={(event) => setPasswordForm((previous) => ({ ...previous, confirmPassword: event.target.value }))}
                    type="password"
                    className="h-12 flex-1 border-0 bg-transparent outline-none"
                  />
                </div>
              </label>
            </div>

            <footer className="flex gap-2 border-t border-stone-200 p-4">
              <button
                type="submit"
                disabled={passwordSaving || !username}
                className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-ink text-sm font-semibold text-white disabled:opacity-50"
              >
                {passwordSaving ? "保存中..." : "确认修改"}
              </button>
              <button
                type="button"
                onClick={() => setPasswordDialogOpen(false)}
                className="h-12 rounded-2xl bg-white px-5 text-sm font-semibold text-stone-600"
              >
                取消
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </main>
  );
}
