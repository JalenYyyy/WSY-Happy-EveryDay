import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { allowedImageTypes, avatarUploadLimitBytes, detectImageMimeType, prepareAvatarImage } from "@/lib/image-upload";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ catId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    await requireApiUser();
    const { catId } = await params;
    const formData = await request.formData();
    const file = formData.get("avatar");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传 png、jpg、webp 或 gif 图片" }, { status: 400 });
    }

    if (file.size > avatarUploadLimitBytes) {
      return NextResponse.json({ error: "原始头像不能超过 10MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = detectImageMimeType(buffer);
    if (!mimeType || !allowedImageTypes.has(mimeType)) {
      return NextResponse.json({ error: "请上传 png、jpg、webp 或 gif 图片" }, { status: 400 });
    }

    const preparedAvatar = await prepareAvatarImage(buffer, mimeType);
    const ext = preparedAvatar.extension;
    const filename = `${catId}-${Date.now()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "cats");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), preparedAvatar.buffer);

    const avatarUrl = `/uploads/cats/${filename}`;
    const existingCat = await prisma.cat.findUnique({ where: { id: catId }, select: { avatarUrl: true } });

    const cat = await prisma.cat.update({
      where: { id: catId },
      data: { avatarUrl },
      include: { nicknames: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } }, memory: true },
    });

    if (existingCat?.avatarUrl?.startsWith("/uploads/cats/") && existingCat.avatarUrl !== avatarUrl) {
      await unlink(path.join(process.cwd(), "public", existingCat.avatarUrl)).catch(() => {});
    }

    return NextResponse.json({ cat });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message || "上传头像失败" }, { status: 400 });
    }
    return NextResponse.json({ error: "上传头像失败" }, { status: 500 });
  }
}
