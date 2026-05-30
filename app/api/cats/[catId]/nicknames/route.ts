import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ catId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const currentUser = await requireApiUser();
    const { catId } = await params;
    const body = (await request.json()) as { nickname?: string };
    const nickname = body.nickname?.trim() || "";

    const cat = await prisma.cat.findUnique({
      where: { id: catId },
      select: { id: true },
    });
    if (!cat) {
      return NextResponse.json({ error: "猫咪不存在" }, { status: 404 });
    }

    if (!nickname) {
      await prisma.catUserName.deleteMany({
        where: {
          userId: currentUser.id,
        },
      });
      return NextResponse.json({ nickname: "" });
    }

    const cats = await prisma.cat.findMany({
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    await prisma.$transaction(
      cats.map((item) =>
        prisma.catUserName.upsert({
          where: {
            catId_userId: {
              catId: item.id,
              userId: currentUser.id,
            },
          },
          update: { nickname },
          create: {
            catId: item.id,
            userId: currentUser.id,
            nickname,
          },
        }),
      ),
    );

    return NextResponse.json({ nickname });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "更新称呼失败" }, { status: 500 });
  }
}
