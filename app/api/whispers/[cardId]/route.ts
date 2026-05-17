import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWhisperOverview } from "@/lib/whispers";

type Params = { params: Promise<{ cardId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const currentUser = await requireApiUser();
    const { cardId } = await params;
    const body = (await request.json()) as {
      content?: string;
      deliverAt?: string;
    };

    const content = body.content?.trim() || "";
    const deliverAt = body.deliverAt ? new Date(body.deliverAt) : null;

    const card = await prisma.whisperCard.findUnique({ where: { id: cardId } });
    if (!card || card.senderId !== currentUser.id) {
      return NextResponse.json({ error: "这条悄悄话不存在" }, { status: 404 });
    }

    if (card.deliverAt <= new Date()) {
      return NextResponse.json({ error: "悄悄话送达后不能再编辑" }, { status: 400 });
    }

    if (!content) {
      return NextResponse.json({ error: "悄悄话内容不能为空" }, { status: 400 });
    }

    if (!deliverAt || Number.isNaN(deliverAt.getTime())) {
      return NextResponse.json({ error: "请选择有效的送达时间" }, { status: 400 });
    }

    await prisma.whisperCard.update({
      where: { id: cardId },
      data: {
        content,
        deliverAt,
        editedAt: new Date(),
      },
    });

    const overview = await getWhisperOverview(currentUser.id);
    return NextResponse.json(overview);
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "更新悄悄话失败" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const currentUser = await requireApiUser();
    const { cardId } = await params;

    const card = await prisma.whisperCard.findUnique({ where: { id: cardId } });
    if (!card || card.senderId !== currentUser.id) {
      return NextResponse.json({ error: "这条悄悄话不存在" }, { status: 404 });
    }

    await prisma.whisperCard.delete({ where: { id: cardId } });

    const overview = await getWhisperOverview(currentUser.id);
    return NextResponse.json({ deletedCardId: cardId, overview });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "删除悄悄话失败" }, { status: 500 });
  }
}
