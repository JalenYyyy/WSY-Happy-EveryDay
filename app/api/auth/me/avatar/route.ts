import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { allowedImageTypes, avatarUploadLimitBytes, detectImageMimeType, prepareAvatarImage } from "@/lib/image-upload";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const currentUser = await requireApiUser();
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
    const filename = `${currentUser.id}-${Date.now()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "users");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), preparedAvatar.buffer);

    const existingUser = await prisma.user.findUnique({ where: { id: currentUser.id }, select: { avatarUrl: true } });
    const nextAvatarUrl = `/uploads/users/${filename}`;

    const user = await prisma.user.update({
      where: { id: currentUser.id },
      data: { avatarUrl: nextAvatarUrl },
      select: { id: true, username: true, name: true, avatarUrl: true, bio: true },
    });

    if (existingUser?.avatarUrl?.startsWith("/uploads/users/") && existingUser.avatarUrl !== nextAvatarUrl) {
      await unlink(path.join(process.cwd(), "public", existingUser.avatarUrl)).catch(() => {});
    }

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message || "上传头像失败" }, { status: 400 });
    }
    return NextResponse.json({ error: "上传头像失败" }, { status: 500 });
  }
}