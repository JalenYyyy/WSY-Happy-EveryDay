import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireApiUser();
    const cats = await prisma.cat.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        nicknames: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        memory: true,
        _count: { select: { messages: true } },
      },
    });
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true, name: true, avatarUrl: true, bio: true },
    });
    return NextResponse.json({ cats, users });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "获取猫咪失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireApiUser();
    const body = (await request.json()) as {
      name?: string;
      personality?: string;
      tone?: string;
      backstory?: string;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "猫咪名字不能为空" }, { status: 400 });
    }

    const cat = await prisma.cat.create({
      data: {
        name: body.name.trim(),
        avatarUrl: "/avatars/cat-cream.svg",
        personality: body.personality?.trim() || "亲人、好奇、喜欢陪伴。",
        tone: body.tone?.trim() || "温柔自然，像熟悉的家人。",
        backstory: body.backstory?.trim() || "这是一只刚加入小家的猫咪。",
        memory: {
          create: {
            summary: "刚来到这个小家，正在认识两位主人。",
            relationship: "正在熟悉中。",
          },
        },
      },
    });

    const users = await prisma.user.findMany();
    await prisma.catUserName.createMany({
      data: users.map((user) => ({
        catId: cat.id,
        userId: user.id,
        nickname: user.name,
        preference: user.id === currentUser.id ? "喜欢自然、贴近生活的回应。" : "",
        memorySummary: "",
        relationship: `正在和${user.name}慢慢熟悉中。`,
      })),
    });

    return NextResponse.json({ cat });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "已经有同名猫咪了，请换一个名字" }, { status: 409 });
    }
    return NextResponse.json({ error: "创建猫咪失败" }, { status: 500 });
  }
}
