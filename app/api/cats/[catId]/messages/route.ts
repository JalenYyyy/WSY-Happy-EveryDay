import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { buildMemorySummary, chatCompletion } from "@/lib/llm";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ catId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireApiUser();
    const { catId } = await params;
    const messages = await prisma.message.findMany({
      where: { catId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ messages });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "获取消息失败" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireApiUser();
    const { catId } = await params;
    const { content } = (await request.json()) as { content?: string };
    const text = content?.trim();

    if (!text) {
      return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
    }

    const cat = await prisma.cat.findUnique({
      where: { id: catId },
      include: {
        memory: true,
        nicknames: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    if (!cat) {
      return NextResponse.json({ error: "猫咪不存在" }, { status: 404 });
    }

    const userMessage = await prisma.message.create({
      data: { catId, userId: user.id, role: "USER", content: text },
      include: { user: { select: { id: true, name: true } } },
    });

    const recentMessages = await prisma.message.findMany({
      where: { catId },
      orderBy: { createdAt: "desc" },
      take: 14,
    });

    const completion = await chatCompletion({
      cat,
      currentUser: user,
      recentMessages: recentMessages.reverse(),
      userMessage: text,
    });

    const catMessage = await prisma.message.create({
      data: { catId, role: "CAT", content: completion.content },
      include: { user: { select: { id: true, name: true } } },
    });

    await prisma.catMemory.upsert({
      where: { catId },
      update: {
        summary: buildMemorySummary(cat.memory?.summary || "", user.name, text),
        relationship: `和${user.name}持续聊天中，关系更熟悉了。`,
      },
      create: {
        catId,
        summary: buildMemorySummary("", user.name, text),
        relationship: `和${user.name}持续聊天中，关系更熟悉了。`,
      },
    });

    return NextResponse.json({ messages: [userMessage, catMessage], usedFallback: completion.usedFallback });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "发送消息失败" }, { status: 500 });
  }
}
