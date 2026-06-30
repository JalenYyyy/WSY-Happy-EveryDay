import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    await request.formData();
    await requireApiUser();
    return NextResponse.json({ error: "当前版本只保留名字，不支持用户头像" }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "设置头像失败" }, { status: 500 });
  }
}
