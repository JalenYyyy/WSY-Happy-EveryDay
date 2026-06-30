import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookie } from "@/lib/auth";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(authCookie.name);
  return NextResponse.json({ ok: true });
}
