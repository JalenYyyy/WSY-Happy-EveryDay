import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "cat_session";

export function getAuthSecret() {
  const secret = process.env.APP_SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_SESSION_SECRET is required in production");
  }
  return "local-dev-cat-session-secret";
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getAuthSecret()).update(payload).digest("hex");
}

function createSessionStateKey(password: string) {
  return crypto.createHmac("sha256", getAuthSecret()).update(`session:${password}`).digest("hex");
}

export function createSessionToken(userId: string, password: string) {
  const payload = Buffer.from(
    JSON.stringify({ userId, sessionKey: createSessionStateKey(password), exp: Date.now() + 1000 * 60 * 60 * 24 * 30 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token?: string) {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId: string;
      sessionKey: string;
      exp: number;
    };
    if (!session.userId || !session.sessionKey || Date.now() > session.exp) return null;
    return session;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true, name: true, avatarUrl: true, bio: true, password: true },
  });

  if (!user || session.sessionKey !== createSessionStateKey(user.password)) {
    return null;
  }

  const { password: _password, ...safeUser } = user;
  return safeUser;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireApiUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Response(JSON.stringify({ error: "未登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

export const authCookie = {
  name: SESSION_COOKIE,
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  },
};
