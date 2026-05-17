import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWhisperOverview } from "@/lib/whispers";

type Params = { params: Promise<{ cardId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const currentUser = await requireApiUser();
    const { cardId } = await params;
    const body = (await request.json()) as { content?: string };
    const content = body.content?.trim() || "";

    if (!content) {
      return NextResponse.json({ error: "回复内容不能为空" }, { status: 400 });
    }

    const card = await prisma.whisperCard.findUnique({ where: { id: cardId } });
    if (!card) {
      return NextResponse.json({ error: "原悄悄话不存在" }, { status: 404 });
    }

    const isParticipant = card.senderId === currentUser.id || card.recipientId === currentUser.id;
    if (!isParticipant) {
      return NextResponse.json({ error: "你不能回复这条悄悄话" }, { status: 403 });
    }

    const now = new Date();
    if (card.deliverAt > now) {
      return NextResponse.json({ error: "悄悄话送达后才能回复" }, { status: 400 });
    }

    const recipientId = card.senderId === currentUser.id ? card.recipientId : card.senderId;
    await prisma.whisperReply.create({
      data: {
        cardId: card.id,
        senderId: currentUser.id,
        recipientId,
        content,
      },
    });

    const overview = await getWhisperOverview(currentUser.id);
    return NextResponse.json(overview, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "回复悄悄话失败" }, { status: 500 });
  }
}
