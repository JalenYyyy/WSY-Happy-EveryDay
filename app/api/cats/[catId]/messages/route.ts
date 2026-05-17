import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { requireApiUser } from "@/lib/auth";
import { consumeActionThrottle } from "@/lib/action-throttle";
import { allowedImageTypes, detectImageMimeType, getImageExtension } from "@/lib/image-upload";
import { buildMemorySummary, chatCompletion } from "@/lib/llm";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ catId: string }> };

const MESSAGE_ACTION_LIMIT = 12;
const MESSAGE_ACTION_WINDOW_MS = 60 * 1000;

function fileToDataUrl(mimeType: string, buffer: Buffer) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

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
    const contentType = request.headers.get("content-type") || "";
    let text = "";
    let imageUrl: string | undefined;
    let imageDataUrl: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("image");
      const caption = String(formData.get("content") || "").trim();

      if (!(file instanceof File)) {
        return NextResponse.json({ error: "请上传 png、jpg、webp 或 gif 图片" }, { status: 400 });
      }

      if (file.size > 4 * 1024 * 1024) {
        return NextResponse.json({ error: "图片不能超过 4MB" }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const mimeType = detectImageMimeType(buffer);
      if (!mimeType || !allowedImageTypes.has(mimeType)) {
        return NextResponse.json({ error: "请上传 png、jpg、webp 或 gif 图片" }, { status: 400 });
      }

      const ext = getImageExtension(mimeType);
      const filename = `${catId}-${Date.now()}.${ext}`;
      const uploadDir = path.join(process.cwd(), "public", "uploads", "moments");
      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, filename), buffer);

      imageUrl = `/uploads/moments/${filename}`;
      imageDataUrl = fileToDataUrl(mimeType, buffer);
      text = caption || "请看看这张图片里猫咪现在是什么心情，也按你的性格回复我。";
    } else {
      const body = (await request.json()) as { content?: string };
      text = body.content?.trim() || "";
    }

    if (!text && !imageUrl) {
      return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
    }

    const throttleResult = await consumeActionThrottle({
      scope: "message-send",
      subjectId: user.id,
      limit: MESSAGE_ACTION_LIMIT,
      windowMs: MESSAGE_ACTION_WINDOW_MS,
    });
    if (!throttleResult.allowed) {
      return NextResponse.json(
        { error: `发送太频繁了，请在 ${Math.ceil(throttleResult.retryAfterSeconds / 60)} 分钟后再试` },
        { status: 429, headers: { "Retry-After": String(throttleResult.retryAfterSeconds) } },
      );
    }

    const cat = await prisma.cat.findUnique({
      where: { id: catId },
      include: {
        memory: true,
        nicknames: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      },
    });

    if (!cat) {
      return NextResponse.json({ error: "猫咪不存在" }, { status: 404 });
    }

    const userMessage = await prisma.message.create({
      data: {
        catId,
        userId: user.id,
        role: "USER",
        content: text,
        messageType: imageUrl ? "IMAGE" : "TEXT",
        imageUrl,
      },
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
      imageDataUrl,
    });

    const catMessage = await prisma.message.create({
      data: { catId, role: "CAT", content: completion.content },
      include: { user: { select: { id: true, name: true } } },
    });

    if (imageUrl) {
      await prisma.catMoment.create({
        data: {
          catId,
          imageUrl,
          caption: `${completion.content}\n${new Date().toLocaleString("zh-CN")}`,
        },
      });
    }

    await prisma.catMemory.upsert({
      where: { catId },
      update: {
        summary: buildMemorySummary(cat.memory?.summary || "", user.name, text),
        relationship: `最近常和${user.name}一起聊天，小家气氛更熟悉了。`,
      },
      create: {
        catId,
        summary: buildMemorySummary("", user.name, text),
        relationship: `最近常和${user.name}一起聊天，小家气氛更熟悉了。`,
      },
    });

    const currentProfile = cat.nicknames.find((item) => item.userId === user.id);
    await prisma.catUserName.upsert({
      where: { catId_userId: { catId, userId: user.id } },
      update: {
        memorySummary: buildMemorySummary(currentProfile?.memorySummary || "", user.name, imageUrl ? `[图片] ${text}` : text),
        relationship: `${cat.name}越来越熟悉${user.name}的节奏了。`,
      },
      create: {
        catId,
        userId: user.id,
        nickname: user.name,
        preference: "",
        memorySummary: buildMemorySummary("", user.name, imageUrl ? `[图片] ${text}` : text),
        relationship: `${cat.name}正在慢慢认识${user.name}。`,
      },
    });

    return NextResponse.json({ messages: [userMessage, catMessage], usedFallback: completion.usedFallback });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "发送消息失败" }, { status: 500 });
  }
}
