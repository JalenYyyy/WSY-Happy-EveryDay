import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";

type Params = { params: Promise<{ catId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    await request.formData();
    await requireApiUser();
    await params;
    return NextResponse.json({ error: "当前版本只保留名字，不支持猫咪头像" }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "设置猫咪头像失败" }, { status: 500 });
  }
}
