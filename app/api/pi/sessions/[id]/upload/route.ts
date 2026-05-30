import { requireApiUser } from "@/lib/auth";
import { getSession } from "@/lib/pi/agent-manager";
import { saveUploadedFile } from "@/lib/pi/file-store";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB per file

export async function POST(
  req: Request,
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

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const results = [];
  const fileEntries = formData.getAll("file");

  for (const entry of fileEntries) {
    if (!(entry instanceof File)) continue;

    if (entry.size > MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: `文件 "${entry.name}" 超过 20MB 限制` },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await entry.arrayBuffer());
    const uploaded = await saveUploadedFile(id, entry.name, buffer, entry.type || undefined);

    results.push({
      id: uploaded.id,
      name: uploaded.originalName,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
      textContent: uploaded.textContent,
    });
  }

  return Response.json({ files: results });
}
