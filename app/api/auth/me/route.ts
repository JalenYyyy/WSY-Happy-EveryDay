import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const currentUser = await getCurrentUser();
  const user = currentUser
    ? {
        id: currentUser.id,
        username: currentUser.username,
        name: currentUser.name,
      }
    : null;
  return NextResponse.json({ user });
}

export async function PATCH(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json()) as {
    name?: string;
  };

  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: "名字不能为空" }, { status: 400 });
  }

  try {
    const dbUser = await prisma.user.findUnique({ where: { id: currentUser.id } });
    if (!dbUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const user = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        name,
        username: name,
        bio: "",
        avatarUrl: null,
      },
      select: { id: true, username: true, name: true },
    });

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "名字已被占用" }, { status: 409 });
    }

    return NextResponse.json({ error: "保存名字失败" }, { status: 500 });
  }
}
