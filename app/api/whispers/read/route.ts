import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWhisperOverview } from "@/lib/whispers";

export async function POST() {
  try {
    const currentUser = await requireApiUser();
    const now = new Date();

    await prisma.whisperCard.updateMany({
      where: {
        recipientId: currentUser.id,
        readAt: null,
        deliverAt: { lte: now },
      },
      data: { readAt: now },
    });

    await prisma.whisperReply.updateMany({
      where: {
        recipientId: currentUser.id,
        readAt: null,
        card: {
          deliverAt: { lte: now },
        },
      },
      data: { readAt: now },
    });

    const overview = await getWhisperOverview(currentUser.id);
    return NextResponse.json(overview);
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "更新已读状态失败" }, { status: 500 });
  }
}
