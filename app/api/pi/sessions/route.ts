import { randomUUID } from "crypto";
import { requireApiUser } from "@/lib/auth";
import { createSession } from "@/lib/pi/agent-manager";

export async function POST() {
  try {
    await requireApiUser();
  } catch {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const sessionId = randomUUID();
  createSession(sessionId);
  return Response.json({ sessionId });
}
