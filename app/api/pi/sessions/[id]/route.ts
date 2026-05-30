import { requireApiUser } from "@/lib/auth";
import { deleteSession } from "@/lib/pi/agent-manager";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiUser();
  } catch {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  deleteSession(id);
  return Response.json({ ok: true });
}
