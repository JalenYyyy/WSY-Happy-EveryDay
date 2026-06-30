import { NextResponse } from "next/server";
import { consumeActionThrottle } from "@/lib/action-throttle";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWhisperOverview } from "@/lib/whispers";

const WHISPER_CREATE_LIMIT = 6;
const WHISPER_CREATE_WINDOW_MS = 10 * 60 * 1000;

export async function GET() {
  try {
    const currentUser = await requireApiUser();
    const overview = await getWhisperOverview(currentUser.id);
    return NextResponse.json(overview);
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "获取悄悄话失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireApiUser();
    const body = (await request.json()) as {
      recipientId?: string;
      content?: string;
      deliverAt?: string;
    };

    const content = body.content?.trim() || "";
    const recipientId = body.recipientId?.trim() || "";
    const deliverAt = body.deliverAt ? new Date(body.deliverAt) : null;

    if (!recipientId || recipientId === currentUser.id) {
      return NextResponse.json({ error: "请选择另一位用户作为收件人" }, { status: 400 });
    }

    if (!content) {
      return NextResponse.json({ error: "悄悄话内容不能为空" }, { status: 400 });
    }

    if (!deliverAt || Number.isNaN(deliverAt.getTime())) {
      return NextResponse.json({ error: "请选择有效的送达时间" }, { status: 400 });
    }

    const throttleResult = await consumeActionThrottle({
      scope: "whisper-create",
      subjectId: currentUser.id,
      limit: WHISPER_CREATE_LIMIT,
      windowMs: WHISPER_CREATE_WINDOW_MS,
    });
    if (!throttleResult.allowed) {
      return NextResponse.json(
        { error: `写得太快了，请在 ${Math.ceil(throttleResult.retryAfterSeconds / 60)} 分钟后再试` },
        { status: 429, headers: { "Retry-After": String(throttleResult.retryAfterSeconds) } },
      );
    }

    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true },
    });

    if (!recipient) {
      return NextResponse.json({ error: "收件人不存在" }, { status: 404 });
    }

    await prisma.whisperCard.create({
      data: {
        senderId: currentUser.id,
        recipientId,
        content,
        deliverAt,
      },
    });

    const overview = await getWhisperOverview(currentUser.id);
    return NextResponse.json(overview, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "创建悄悄话失败" }, { status: 500 });
  }
}
