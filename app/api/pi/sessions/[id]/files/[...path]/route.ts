import { requireApiUser } from "@/lib/auth";
import { readGeneratedFile } from "@/lib/pi/file-store";
import path from "path";

const MIME_BY_EXT: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".zip": "application/zip",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> },
) {
  try {
    await requireApiUser();
  } catch {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const { id, path: pathSegments } = await params;
  const filename = pathSegments.join("/");

  let buffer: Buffer;
  try {
    buffer = await readGeneratedFile(id, filename);
  } catch {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const safeName = encodeURIComponent(path.basename(filename));

  // Convert Node.js Buffer to ArrayBuffer for strict TypeScript BodyInit compatibility
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  return new Response(ab, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${safeName}`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-cache",
    },
  });
}
