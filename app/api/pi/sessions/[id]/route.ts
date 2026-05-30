import { requireApiUser } from "@/lib/auth";
import { deleteSession } from "@/lib/pi/agent-manager";
import { deleteSessionFiles } from "@/lib/pi/file-store";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await (async () => {
    try {
      return await requireApiUser();
    } catch {
      return null;
    }
  })();

  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  await deleteSessionFiles(id, user.id);
  deleteSession(id);
  return Response.json({ ok: true });
}
