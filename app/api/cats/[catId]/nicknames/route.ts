import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ catId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireApiUser();
    const { catId } = await params;
    const body = (await request.json()) as { nicknames?: Record<string, string> };

    const entries = Object.entries(body.nicknames || {}).filter(([, value]) => value.trim());
    await Promise.all(
      entries.map(([userId, nickname]) =>
        prisma.catUserName.upsert({
          where: { catId_userId: { catId, userId } },
          update: { nickname: nickname.trim() },
          create: { catId, userId, nickname: nickname.trim() },
        }),
      ),
    );

    const cat = await prisma.cat.findUnique({
      where: { id: catId },
      include: { nicknames: { include: { user: { select: { id: true, name: true } } } } },
    });
    return NextResponse.json({ cat });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "更新称呼失败" }, { status: 500 });
  }
}
