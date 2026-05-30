import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getRecoveryStatus, normalizeRecoveryCode, issueRecoveryCode, verifyRecoveryCode } from "@/lib/auth-recovery";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const MAX_RECOVERY_FAILURES = 5;
const RECOVERY_WINDOW_MS = 10 * 60 * 1000;

type RecoveryThrottleState = {
  count: number;
  firstFailedAt: number;
  lockedUntil: number | null;
};

function getRecoveryAttemptKey(request: Request, username: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || request.headers.get("x-real-ip") || "local";
  return `${ip}:${username || "unknown"}`;
}

function getRecoveryThrottleStoreKey(key: string) {
  return `passwordRecoveryThrottle:${key}`;
}

async function clearRecoveryFailures(key: string) {
  await prisma.appSetting.deleteMany({ where: { key: getRecoveryThrottleStoreKey(key) } });
}

async function getRecoveryThrottleState(key: string) {
  const record = await prisma.appSetting.findUnique({ where: { key: getRecoveryThrottleStoreKey(key) } });
  if (!record) return null;

  let state: RecoveryThrottleState | null = null;
  try {
    state = JSON.parse(record.value) as RecoveryThrottleState;
  } catch {
    await clearRecoveryFailures(key);
    return null;
  }

  if (!state) return null;

  const now = Date.now();
  if (state.lockedUntil && state.lockedUntil > now) {
    return state;
  }

  if (now - state.firstFailedAt > RECOVERY_WINDOW_MS) {
    await clearRecoveryFailures(key);
    return null;
  }

  if (state.lockedUntil && state.lockedUntil <= now) {
    await clearRecoveryFailures(key);
    return null;
  }

  return state;
}

async function registerRecoveryFailure(key: string) {
  const now = Date.now();
  const existing = await getRecoveryThrottleState(key);

  if (!existing) {
    await prisma.appSetting.upsert({
      where: { key: getRecoveryThrottleStoreKey(key) },
      update: { value: JSON.stringify({ count: 1, firstFailedAt: now, lockedUntil: null }) },
      create: {
        key: getRecoveryThrottleStoreKey(key),
        value: JSON.stringify({ count: 1, firstFailedAt: now, lockedUntil: null }),
      },
    });
    return;
  }

  const nextCount = existing.count + 1;
  await prisma.appSetting.upsert({
    where: { key: getRecoveryThrottleStoreKey(key) },
    update: {
      value: JSON.stringify({
        count: nextCount,
        firstFailedAt: existing.firstFailedAt,
        lockedUntil: nextCount >= MAX_RECOVERY_FAILURES ? now + RECOVERY_WINDOW_MS : existing.lockedUntil,
      }),
    },
    create: {
      key: getRecoveryThrottleStoreKey(key),
      value: JSON.stringify({
        count: nextCount,
        firstFailedAt: existing.firstFailedAt,
        lockedUntil: nextCount >= MAX_RECOVERY_FAILURES ? now + RECOVERY_WINDOW_MS : existing.lockedUntil,
      }),
    },
  });
}

export async function GET() {
  try {
    const currentUser = await requireApiUser();
    return NextResponse.json({ status: await getRecoveryStatus(currentUser.id) });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "读取恢复码状态失败" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const currentUser = await requireApiUser();
    const data = await issueRecoveryCode(currentUser.id);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "生成恢复码失败" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { username, recoveryCode, adminPassword, newPassword } = (await request.json()) as {
    username?: string;
    recoveryCode?: string;
    adminPassword?: string;
    newPassword?: string;
  };

  const normalizedUsername = username?.trim() || "";
  const normalizedRecoveryCode = normalizeRecoveryCode(recoveryCode || "");
  const normalizedAdminPassword = adminPassword?.trim() || "";
  const normalizedNewPassword = newPassword?.trim() || "";
  const configuredAdminPassword = process.env.ADMIN_RESET_PASSWORD?.trim() || "";

  if (!normalizedUsername) {
    return NextResponse.json({ error: "请选择要重置密码的用户" }, { status: 400 });
  }

  if (!normalizedRecoveryCode && !normalizedAdminPassword) {
    return NextResponse.json({ error: "请输入恢复码或管理员密码" }, { status: 400 });
  }

  if (normalizedNewPassword.length < 4) {
    return NextResponse.json({ error: "新密码至少需要 4 位" }, { status: 400 });
  }

  const attemptKey = getRecoveryAttemptKey(request, normalizedUsername);
  const throttleState = await getRecoveryThrottleState(attemptKey);
  if (throttleState?.lockedUntil && throttleState.lockedUntil > Date.now()) {
    const retryAfterSeconds = Math.max(1, Math.ceil((throttleState.lockedUntil - Date.now()) / 1000));
    return NextResponse.json(
      { error: `尝试次数过多，请在 ${Math.ceil(retryAfterSeconds / 60)} 分钟后再试` },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  const user = await prisma.user.findUnique({
    where: { username: normalizedUsername },
    select: {
      id: true,
      passwordRecovery: {
        select: { codeHash: true, expiresAt: true },
      },
    },
  });

  const recovery = user?.passwordRecovery;
  const recoveryValid =
    !!recovery &&
    recovery.expiresAt.getTime() > Date.now() &&
    verifyRecoveryCode(normalizedRecoveryCode, recovery.codeHash);
  const adminPasswordValid = Boolean(configuredAdminPassword) && normalizedAdminPassword === configuredAdminPassword;

  if (!user || (!recoveryValid && !adminPasswordValid)) {
    await registerRecoveryFailure(attemptKey);
    return NextResponse.json({ error: "恢复码或管理员密码不正确，或恢复码已失效" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: await hashPassword(normalizedNewPassword) },
    }),
    prisma.passwordRecovery.deleteMany({ where: { userId: user.id } }),
  ]);

  await clearRecoveryFailures(attemptKey);

  return NextResponse.json({ message: "密码已重置，请直接使用新密码登录" });
}
