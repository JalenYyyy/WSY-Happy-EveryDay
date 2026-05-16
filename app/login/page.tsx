"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cat, LockKeyhole } from "lucide-react";

const presets = [
  { username: "user1", label: "小鱼", password: "cat123" },
  { username: "user2", label: "小满", password: "cat123" },
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState(presets[0].username);
  const [password, setPassword] = useState(presets[0].password);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-soft backdrop-blur">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sage text-ink">
            <Cat size={26} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">猫咪小家</h1>
            <p className="text-sm text-stone-500">两个人和五只猫咪的共享聊天空间</p>
          </div>
        </div>

        <form onSubmit={login} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {presets.map((preset) => (
              <button
                key={preset.username}
                type="button"
                onClick={() => {
                  setUsername(preset.username);
                  setPassword(preset.password);
                }}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  username === preset.username
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-white text-stone-700"
                }`}
              >
                <span className="block text-sm font-medium">{preset.label}</span>
                <span className="block text-xs opacity-70">{preset.username}</span>
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

          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}

          <button
            disabled={loading}
            className="h-12 w-full rounded-2xl bg-ink text-sm font-semibold text-white shadow-sm transition hover:bg-stone-700 disabled:opacity-60"
          >
            {loading ? "正在进入..." : "进入小家"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-stone-400">默认密码：cat123</p>
      </section>
    </main>
  );
}
