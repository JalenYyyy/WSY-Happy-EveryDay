import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ catId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireApiUser();
    const { catId } = await params;
    const moments = await prisma.catMoment.findMany({
      where: { catId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ moments });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "获取猫圈失败" }, { status: 500 });
  }
}