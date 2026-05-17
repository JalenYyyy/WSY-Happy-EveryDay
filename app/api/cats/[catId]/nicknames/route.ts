import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ catId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const currentUser = await requireApiUser();
    const { catId } = await params;
    const body = (await request.json()) as { nickname?: string; preference?: string };
    const nickname = body.nickname?.trim();
    const preference = body.preference?.trim() || "";

    if (!nickname) {
      return NextResponse.json({ error: "称呼不能为空" }, { status: 400 });
    }

    await prisma.catUserName.upsert({
      where: { catId_userId: { catId, userId: currentUser.id } },
      update: { nickname, preference },
      create: {
        catId,
        userId: currentUser.id,
        nickname,
        preference,
        memorySummary: "",
        relationship: `正在和${currentUser.name}慢慢熟悉中。`,
      },
    });

    const cat = await prisma.cat.findUnique({
      where: { id: catId },
      include: { nicknames: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } }, memory: true },
    });
    return NextResponse.json({ cat });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "更新称呼失败" }, { status: 500 });
  }
}
