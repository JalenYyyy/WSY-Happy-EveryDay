import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ catId: string }> };

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);

export async function POST(request: Request, { params }: Params) {
  try {
    await requireApiUser();
    const { catId } = await params;
    const formData = await request.formData();
    const file = formData.get("avatar");

    if (!(file instanceof File) || !allowedTypes.has(file.type)) {
      return NextResponse.json({ error: "请上传 png、jpg、webp、gif 或 svg 图片" }, { status: 400 });
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "头像不能超过 2MB" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const filename = `${catId}-${Date.now()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "cats");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()));

    const avatarUrl = `/uploads/cats/${filename}`;
    const cat = await prisma.cat.update({
      where: { id: catId },
      data: { avatarUrl },
      include: { nicknames: { include: { user: { select: { id: true, name: true } } } }, memory: true },
    });

    return NextResponse.json({ cat });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "上传头像失败" }, { status: 500 });
  }
}
