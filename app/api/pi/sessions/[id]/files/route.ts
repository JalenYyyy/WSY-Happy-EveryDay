import { requireApiUser } from "@/lib/auth";
import { getSession } from "@/lib/pi/agent-manager";
import { listGeneratedFiles, triggerPiFileMaintenance } from "@/lib/pi/file-store";

export async function GET(
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
  const agent = getSession(id);
  if (!agent) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const files = await listGeneratedFiles(id, user.id);
  triggerPiFileMaintenance();
  return Response.json({ files });
}
