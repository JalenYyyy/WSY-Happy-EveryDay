/**
 * Pi Agent File Store
 *
 * Manages temporary files for each agent session:
 *   - uploads:   tmp/pi/<sessionId>/uploads/<fileId>_<name>
 *   - generated: tmp/pi/<sessionId>/generated/<name>
 */

import { mkdir, readFile, readdir, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const TMP_ROOT = path.join(process.cwd(), "tmp", "pi");

function sanitizeSessionId(sessionId: string) {
  return sessionId.replace(/[^a-zA-Z0-9_\-]/g, "_");
}

export function uploadsDir(sessionId: string) {
  const sid = sanitizeSessionId(sessionId);
  return path.join(TMP_ROOT, sid, "uploads");
}

export function generatedDir(sessionId: string) {
  const sid = sanitizeSessionId(sessionId);
  return path.join(TMP_ROOT, sid, "generated");
}

export async function ensureDirs(sessionId: string) {
  await mkdir(uploadsDir(sessionId), { recursive: true });
  await mkdir(generatedDir(sessionId), { recursive: true });
}

// ---------------------------------------------------------------------------
// Upload helpers
// ---------------------------------------------------------------------------

export type UploadedFile = {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  /** Extracted text content for text-type files; undefined for binary */
  textContent?: string;
};

const TEXT_MIME_PREFIXES = ["text/", "application/json", "application/xml", "application/csv"];

function isTextMime(mime: string): boolean {
  return TEXT_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

/** Detect MIME from filename extension (fallback). */
function guessMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".html": "text/html",
    ".htm": "text/html",
    ".xml": "text/xml",
    ".js": "text/javascript",
    ".ts": "text/typescript",
    ".py": "text/x-python",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
  };
  return map[ext] ?? "application/octet-stream";
}

export async function saveUploadedFile(
  sessionId: string,
  originalName: string,
  buffer: Buffer,
  declaredMime?: string,
): Promise<UploadedFile> {
  const sid = sanitizeSessionId(sessionId);
  await ensureDirs(sid);

  const id = randomUUID().slice(0, 8);
  const sanitized = originalName.replace(/[^a-zA-Z0-9._\-]/g, "_");
  const storedName = `${id}_${sanitized}`;
  const filePath = path.join(uploadsDir(sid), storedName);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(uploadsDir(sid)))) {
    throw new Error("Invalid file path");
  }

  await writeFile(resolved, buffer);

  const mimeType = declaredMime || guessMime(originalName);
  let textContent: string | undefined;

  if (isTextMime(mimeType)) {
    try {
      textContent = buffer.toString("utf-8");
    } catch {
      // not valid UTF-8 — skip text extraction
    }
  }

  return {
    id,
    originalName,
    storedName,
    mimeType,
    size: buffer.length,
    textContent,
  };
}

// ---------------------------------------------------------------------------
// Generated file helpers
// ---------------------------------------------------------------------------

export type GeneratedFile = {
  name: string;
  size: number;
  /** Relative path for download URL: /api/pi/sessions/<id>/files/<name> */
  downloadPath: string;
};

export async function saveGeneratedFile(
  sessionId: string,
  filename: string,
  buffer: Buffer,
): Promise<GeneratedFile> {
  const sid = sanitizeSessionId(sessionId);
  await ensureDirs(sid);

  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._\-]/g, "_");
  const filePath = path.join(generatedDir(sid), safeName);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(generatedDir(sid)))) {
    throw new Error("Invalid generated file path");
  }
  await writeFile(resolved, buffer);
  return {
    name: safeName,
    size: buffer.length,
    downloadPath: `/api/pi/sessions/${sid}/files/${encodeURIComponent(safeName)}`,
  };
}

export async function listGeneratedFiles(sessionId: string): Promise<GeneratedFile[]> {
  const sid = sanitizeSessionId(sessionId);
  const dir = generatedDir(sid);
  try {
    const entries = await readdir(dir);
    const files: GeneratedFile[] = [];
    for (const entry of entries) {
      const p = path.join(dir, entry);
      const s = await stat(p);
      if (s.isFile()) {
        files.push({
          name: entry,
          size: s.size,
          downloadPath: `/api/pi/sessions/${sid}/files/${encodeURIComponent(entry)}`,
        });
      }
    }
    return files;
  } catch {
    return [];
  }
}

export async function readGeneratedFile(sessionId: string, filename: string): Promise<Buffer> {
  const sid = sanitizeSessionId(sessionId);
  const safe = path.basename(filename); // prevent traversal
  const filePath = path.join(generatedDir(sid), safe);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(generatedDir(sid)))) throw new Error("Invalid file path");
  return readFile(resolved);
}

export async function deleteSessionFiles(sessionId: string): Promise<void> {
  const dirs = [uploadsDir(sessionId), generatedDir(sessionId)];
  for (const dir of dirs) {
    try {
      const entries = await readdir(dir);
      await Promise.all(entries.map((e) => unlink(path.join(dir, e)).catch(() => {})));
    } catch {
      // directory may not exist
    }
  }
}
