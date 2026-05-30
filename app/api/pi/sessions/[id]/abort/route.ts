import { requireApiUser } from "@/lib/auth";
import { getSession } from "@/lib/pi/agent-manager";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiUser();
  } catch {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const agent = getSession(id);
  if (!agent) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  agent.abort();
  return Response.json({ ok: true });
}
