import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { allowedImageTypes, detectImageMimeType, getImageExtension } from "@/lib/image-upload";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const currentUser = await requireApiUser();
    const formData = await request.formData();
    const file = formData.get("avatar");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传 png、jpg、webp 或 gif 图片" }, { status: 400 });
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "头像不能超过 2MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = detectImageMimeType(buffer);
    if (!mimeType || !allowedImageTypes.has(mimeType)) {
      return NextResponse.json({ error: "请上传 png、jpg、webp 或 gif 图片" }, { status: 400 });
    }

    const ext = getImageExtension(mimeType);
    const filename = `${currentUser.id}-${Date.now()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "users");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    const existingUser = await prisma.user.findUnique({ where: { id: currentUser.id }, select: { avatarUrl: true } });
    if (existingUser?.avatarUrl?.startsWith("/uploads/users/")) {
      await unlink(path.join(process.cwd(), "public", existingUser.avatarUrl)).catch(() => {});
    }

    const user = await prisma.user.update({
      where: { id: currentUser.id },
      data: { avatarUrl: `/uploads/users/${filename}` },
      select: { id: true, username: true, name: true, avatarUrl: true, bio: true },
    });

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "上传头像失败" }, { status: 500 });
  }
}