import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ catId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireApiUser();
    const { catId } = await params;
    const body = (await request.json()) as {
      name?: string;
      personality?: string;
      tone?: string;
      backstory?: string;
    };

    const cat = await prisma.cat.update({
      where: { id: catId },
      data: {
        name: body.name?.trim(),
        personality: body.personality?.trim(),
        tone: body.tone?.trim(),
        backstory: body.backstory?.trim(),
      },
      include: {
        nicknames: { include: { user: { select: { id: true, name: true } } } },
        memory: true,
      },
    });

    return NextResponse.json({ cat });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "更新猫咪失败" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    await requireApiUser();
    const { catId } = await params;
    const body = (await request.json().catch(() => ({}))) as { confirmName?: string };

    const [cat, catCount] = await Promise.all([
      prisma.cat.findUnique({ where: { id: catId } }),
      prisma.cat.count(),
    ]);

    if (!cat) {
      return NextResponse.json({ error: "猫咪不存在" }, { status: 404 });
    }

    if (catCount <= 1) {
      return NextResponse.json({ error: "至少需要保留一只猫咪" }, { status: 400 });
    }

    if (body.confirmName?.trim() !== cat.name) {
      return NextResponse.json({ error: "确认名称不匹配，未删除猫咪" }, { status: 400 });
    }

    await prisma.cat.delete({ where: { id: catId } });

    if (cat.avatarUrl.startsWith("/uploads/cats/")) {
      await unlink(path.join(process.cwd(), "public", cat.avatarUrl)).catch(() => {});
    }

    return NextResponse.json({ deletedCatId: catId });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "删除猫咪失败" }, { status: 500 });
  }
}
