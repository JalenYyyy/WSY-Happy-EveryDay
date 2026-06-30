import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookie, createSessionToken } from "@/lib/auth";
import { hashPassword, isHashedPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

type LoginThrottleState = {
  count: number;
  firstFailedAt: number;
  lockedUntil: number | null;
};

function getLoginAttemptKey(request: Request, username: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || request.headers.get("x-real-ip") || "local";
  return `${ip}:${username || "unknown"}`;
}

function getLoginThrottleStoreKey(key: string) {
  return `loginThrottle:${key}`;
}

async function getLoginThrottleState(key: string) {
  const record = await prisma.appSetting.findUnique({ where: { key: getLoginThrottleStoreKey(key) } });
  if (!record) return null;

  let state: LoginThrottleState | null = null;
  try {
    state = JSON.parse(record.value) as LoginThrottleState;
  } catch {
    await clearLoginFailures(key);
    return null;
  }

  if (!state) return null;

  const now = Date.now();
  if (state.lockedUntil && state.lockedUntil > now) {
    return state;
  }

  if (now - state.firstFailedAt > LOGIN_WINDOW_MS) {
    await clearLoginFailures(key);
    return null;
  }

  if (state.lockedUntil && state.lockedUntil <= now) {
    await clearLoginFailures(key);
    return null;
  }

  return state;
}

async function registerLoginFailure(key: string) {
  const now = Date.now();
  const existing = await getLoginThrottleState(key);

  if (!existing) {
    await prisma.appSetting.upsert({
      where: { key: getLoginThrottleStoreKey(key) },
      update: { value: JSON.stringify({ count: 1, firstFailedAt: now, lockedUntil: null }) },
      create: {
        key: getLoginThrottleStoreKey(key),
        value: JSON.stringify({ count: 1, firstFailedAt: now, lockedUntil: null }),
      },
    });
    return;
  }

  const nextCount = existing.count + 1;
  await prisma.appSetting.upsert({
    where: { key: getLoginThrottleStoreKey(key) },
    update: {
      value: JSON.stringify({
        count: nextCount,
        firstFailedAt: existing.firstFailedAt,
        lockedUntil: nextCount >= MAX_LOGIN_FAILURES ? now + LOGIN_WINDOW_MS : existing.lockedUntil,
      }),
    },
    create: {
      key: getLoginThrottleStoreKey(key),
      value: JSON.stringify({
        count: nextCount,
        firstFailedAt: existing.firstFailedAt,
        lockedUntil: nextCount >= MAX_LOGIN_FAILURES ? now + LOGIN_WINDOW_MS : existing.lockedUntil,
      }),
    },
  });
}

async function clearLoginFailures(key: string) {
  await prisma.appSetting.deleteMany({ where: { key: getLoginThrottleStoreKey(key) } });
}

export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, name: true },
  });

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const { username, password } = (await request.json()) as {
    username?: string;
    password?: string;
  };

  const normalizedUsername = username?.trim() || "";
  const attemptKey = getLoginAttemptKey(request, normalizedUsername);
  const throttleState = await getLoginThrottleState(attemptKey);

  if (throttleState?.lockedUntil && throttleState.lockedUntil > Date.now()) {
    const retryAfterSeconds = Math.max(1, Math.ceil((throttleState.lockedUntil - Date.now()) / 1000));
    return NextResponse.json(
      { error: `尝试次数过多，请在 ${Math.ceil(retryAfterSeconds / 60)} 分钟后再试` },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  const user = await prisma.user.findUnique({ where: { username: normalizedUsername } });
  if (!user || !(await verifyPassword(password || "", user.password))) {
    await registerLoginFailure(attemptKey);
    return NextResponse.json({ error: "账号或密码不正确" }, { status: 401 });
  }

  await clearLoginFailures(attemptKey);

  let sessionPassword = user.password;
  if (!isHashedPassword(user.password)) {
    sessionPassword = await hashPassword(password || "");
    await prisma.user.update({
      where: { id: user.id },
      data: { password: sessionPassword },
    });
  }

  const cookieStore = await cookies();
  cookieStore.set(authCookie.name, createSessionToken(user.id, sessionPassword), authCookie.options);

  return NextResponse.json({ user: { id: user.id, username: user.username, name: user.name, avatarUrl: user.avatarUrl } });
}

export async function PATCH(request: Request) {
  const { username, currentPassword, newPassword } = (await request.json()) as {
    username?: string;
    currentPassword?: string;
    newPassword?: string;
  };

  const normalizedUsername = username?.trim() || "";
  const normalizedCurrentPassword = currentPassword?.trim() || "";
  const normalizedNewPassword = newPassword?.trim() || "";

  if (!normalizedUsername) {
    return NextResponse.json({ error: "请选择要修改密码的用户" }, { status: 400 });
  }

  if (!normalizedCurrentPassword) {
    return NextResponse.json({ error: "请输入当前密码" }, { status: 400 });
  }

  if (normalizedNewPassword.length < 4) {
    return NextResponse.json({ error: "新密码至少需要 4 位" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { username: normalizedUsername } });
  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  if (!(await verifyPassword(normalizedCurrentPassword, user.password))) {
    return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { password: await hashPassword(normalizedNewPassword) },
  });

  return NextResponse.json({ message: "密码已更新" });
}
