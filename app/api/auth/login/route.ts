import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookie, createSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const { username, password } = (await request.json()) as {
    username?: string;
    password?: string;
  };

  const user = await prisma.user.findUnique({ where: { username: username || "" } });
  if (!user || user.password !== password) {
    return NextResponse.json({ error: "账号或密码不正确" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(authCookie.name, createSessionToken(user.id), authCookie.options);

  return NextResponse.json({ user: { id: user.id, username: user.username, name: user.name } });
}
