import { unlink } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ catId: string; momentId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireApiUser();
    const { catId, momentId } = await params;
    const moment = await prisma.catMoment.findUnique({ where: { id: momentId } });

    if (!moment || moment.catId !== catId) {
      return NextResponse.json({ error: "朋友圈内容不存在" }, { status: 404 });
    }

    await prisma.catMoment.delete({ where: { id: momentId } });

    if (moment.imageUrl.startsWith("/uploads/moments/")) {
      await unlink(path.join(process.cwd(), "public", moment.imageUrl)).catch(() => {});
    }

    return NextResponse.json({ deletedMomentId: momentId });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "删除朋友圈失败" }, { status: 500 });
  }
}