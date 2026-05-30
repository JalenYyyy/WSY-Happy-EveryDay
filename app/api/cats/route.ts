import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireApiUser();
    const [rawCats, users, globalNickname] = await Promise.all([
      prisma.cat.findMany({
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { messages: true } } },
      }),
      prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, username: true, name: true, avatarUrl: true },
      }),
      prisma.catUserName.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        select: { nickname: true },
      }),
    ]);
    const cats = rawCats.map((cat) => ({
      ...cat,
      nickname: globalNickname?.nickname || "",
    }));
    return NextResponse.json({ cats, users });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "获取猫咪失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const body = (await request.json()) as {
      name?: string;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "猫咪名字不能为空" }, { status: 400 });
    }

    const cat = await prisma.cat.create({
      data: {
        name: body.name.trim(),
        avatarUrl: "",
        personality: "",
        tone: "",
        backstory: "",
      },
    });

    const globalNickname = await prisma.catUserName.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { nickname: true },
    });

    return NextResponse.json({ cat: { ...cat, nickname: globalNickname?.nickname || "" } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "已经有同名猫咪了，请换一个名字" }, { status: 409 });
    }
    return NextResponse.json({ error: "创建猫咪失败" }, { status: 500 });
  }
}
