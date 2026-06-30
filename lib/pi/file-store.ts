/**
 * Pi Agent File Store
 *
 * Manages temporary files for each agent session:
 *   - uploads:   tmp/pi/<sessionId>/uploads/<fileId>_<name>
 *   - generated: tmp/pi/<sessionId>/generated/<name>
 *
 * Files are registered in the AgentFile table so retention, cleanup, and
 * download/list behavior are driven by metadata instead of ad-hoc directory scans.
 */

import { mkdir, readFile, readdir, rm, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

const TMP_ROOT = path.join(process.cwd(), "tmp", "pi");
const UPLOAD_RETENTION_HOURS = 24;
const GENERATED_RETENTION_DAYS = 7;
const MAINTENANCE_INTERVAL_MS = 15 * 60 * 1000;

let maintenancePromise: Promise<MaintenanceSummary> | null = null;
let lastMaintenanceAt = 0;

export type AgentFileKind = "UPLOAD" | "GENERATED";

type AgentFileStatus = "ACTIVE" | "EXPIRED" | "DELETED";

export type UploadedFile = {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  expiresAt: string;
  /** Extracted text content for text-type files; undefined for binary */
  textContent?: string;
};

export type GeneratedFile = {
  name: string;
  size: number;
  expiresAt: string;
  /** Relative path for download URL: /api/pi/sessions/<id>/files/<name> */
  downloadPath: string;
};

export type MaintenanceSummary = {
  expiredRecords: number;
  orphanedFiles: number;
};

const TEXT_MIME_PREFIXES = ["text/", "application/json", "application/xml", "application/csv"];

function sanitizeSessionId(sessionId: string) {
  return sessionId.replace(/[^a-zA-Z0-9_\-]/g, "_");
}

function sanitizeFilename(filename: string) {
  const safe = path.basename(filename).replace(/[^a-zA-Z0-9._\-]/g, "_");
  return safe || `file-${randomUUID().slice(0, 8)}`;
}

function isWithinDir(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function sessionRoot(sessionId: string) {
  const sid = sanitizeSessionId(sessionId);
  return path.join(TMP_ROOT, sid);
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

function toStoragePath(sessionId: string, area: "uploads" | "generated", storedName: string) {
  return path.join(sanitizeSessionId(sessionId), area, storedName);
}

function resolveStoragePath(storagePath: string) {
  const absolute = path.resolve(TMP_ROOT, storagePath);
  if (!isWithinDir(TMP_ROOT, absolute)) {
    throw new Error("Invalid storage path");
  }
  return absolute;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isTextMime(mime: string): boolean {
  return TEXT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

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

async function safeUnlink(filePath: string) {
  try {
    await unlink(filePath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      throw error;
    }
  }
}

async function collectFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function cleanupExpiredRecords(now: Date) {
  const expired = await prisma.agentFile.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lte: now },
    },
    select: {
      id: true,
      storagePath: true,
    },
  });

  for (const file of expired) {
    await safeUnlink(resolveStoragePath(file.storagePath));
  }

  if (expired.length > 0) {
    await prisma.agentFile.updateMany({
      where: {
        id: { in: expired.map((file) => file.id) },
      },
      data: {
        status: "EXPIRED" satisfies AgentFileStatus,
      },
    });
  }

  return expired.length;
}

async function cleanupOrphanedFiles() {
  const tracked = await prisma.agentFile.findMany({
    where: { status: "ACTIVE" },
    select: { storagePath: true },
  });
  const trackedSet = new Set(tracked.map((file) => path.normalize(resolveStoragePath(file.storagePath))));
  const files = await collectFiles(TMP_ROOT);

  let orphanedFiles = 0;
  for (const file of files) {
    if (!trackedSet.has(path.normalize(file))) {
      await safeUnlink(file);
      orphanedFiles += 1;
    }
  }

  return orphanedFiles;
}

export async function cleanupPiFiles(): Promise<MaintenanceSummary> {
  const now = new Date();
  const expiredRecords = await cleanupExpiredRecords(now);
  const orphanedFiles = await cleanupOrphanedFiles();
  return { expiredRecords, orphanedFiles };
}

export function triggerPiFileMaintenance() {
  const now = Date.now();
  if (maintenancePromise || now - lastMaintenanceAt < MAINTENANCE_INTERVAL_MS) {
    return;
  }

  maintenancePromise = cleanupPiFiles()
    .catch((error) => {
      console.error("Pi file maintenance failed", error);
      return { expiredRecords: 0, orphanedFiles: 0 };
    })
    .finally(() => {
      maintenancePromise = null;
      lastMaintenanceAt = Date.now();
    });
}

export async function saveUploadedFile(
  sessionId: string,
  userId: string,
  originalName: string,
  buffer: Buffer,
  declaredMime?: string,
): Promise<UploadedFile> {
  const sid = sanitizeSessionId(sessionId);
  await ensureDirs(sid);

  const id = randomUUID().slice(0, 8);
  const sanitized = sanitizeFilename(originalName);
  const storedName = `${id}_${sanitized}`;
  const filePath = path.join(uploadsDir(sid), storedName);
  const resolved = path.resolve(filePath);
  if (!isWithinDir(uploadsDir(sid), resolved)) {
    throw new Error("Invalid file path");
  }

  await writeFile(resolved, buffer);

  const mimeType = declaredMime || guessMime(originalName);
  let textContent: string | undefined;

  if (isTextMime(mimeType)) {
    textContent = buffer.toString("utf-8");
  }

  const expiresAt = addHours(new Date(), UPLOAD_RETENTION_HOURS);
  await prisma.agentFile.create({
    data: {
      sessionId: sid,
      userId,
      kind: "UPLOAD",
      originalName,
      storedName,
      mimeType,
      size: buffer.length,
      storagePath: toStoragePath(sid, "uploads", storedName),
      status: "ACTIVE",
      expiresAt,
    },
  });

  triggerPiFileMaintenance();

  return {
    id,
    originalName,
    storedName,
    mimeType,
    size: buffer.length,
    expiresAt: expiresAt.toISOString(),
    textContent,
  };
}

export async function saveGeneratedFile(
  sessionId: string,
  userId: string,
  filename: string,
  buffer: Buffer,
): Promise<GeneratedFile> {
  const sid = sanitizeSessionId(sessionId);
  await ensureDirs(sid);

  const safeName = sanitizeFilename(filename);
  const filePath = path.join(generatedDir(sid), safeName);
  const resolved = path.resolve(filePath);
  if (!isWithinDir(generatedDir(sid), resolved)) {
    throw new Error("Invalid generated file path");
  }
  await writeFile(resolved, buffer);

  const downloadPath = `/api/pi/sessions/${sid}/files/${encodeURIComponent(safeName)}`;
  const expiresAt = addDays(new Date(), GENERATED_RETENTION_DAYS);

  await prisma.agentFile.upsert({
    where: {
      sessionId_kind_storedName: {
        sessionId: sid,
        kind: "GENERATED",
        storedName: safeName,
      },
    },
    create: {
      sessionId: sid,
      userId,
      kind: "GENERATED",
      originalName: filename,
      storedName: safeName,
      mimeType: guessMime(safeName),
      size: buffer.length,
      storagePath: toStoragePath(sid, "generated", safeName),
      downloadPath,
      status: "ACTIVE",
      expiresAt,
    },
    update: {
      userId,
      originalName: filename,
      mimeType: guessMime(safeName),
      size: buffer.length,
      storagePath: toStoragePath(sid, "generated", safeName),
      downloadPath,
      status: "ACTIVE",
      expiresAt,
      lastDownloadedAt: null,
    },
  });

  triggerPiFileMaintenance();

  return {
    name: safeName,
    size: buffer.length,
    expiresAt: expiresAt.toISOString(),
    downloadPath,
  };
}

export async function listGeneratedFiles(sessionId: string, userId: string): Promise<GeneratedFile[]> {
  const sid = sanitizeSessionId(sessionId);
  triggerPiFileMaintenance();

  const files = await prisma.agentFile.findMany({
    where: {
      sessionId: sid,
      userId,
      kind: "GENERATED",
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      storedName: true,
      size: true,
      expiresAt: true,
      downloadPath: true,
    },
  });

  return files.map((file) => ({
    name: file.storedName,
    size: file.size,
    expiresAt: file.expiresAt.toISOString(),
    downloadPath: file.downloadPath ?? `/api/pi/sessions/${sid}/files/${encodeURIComponent(file.storedName)}`,
  }));
}

export async function readGeneratedFile(
  sessionId: string,
  userId: string,
  filename: string,
): Promise<Buffer> {
  const sid = sanitizeSessionId(sessionId);
  const safe = sanitizeFilename(filename);

  const record = await prisma.agentFile.findFirst({
    where: {
      sessionId: sid,
      userId,
      kind: "GENERATED",
      storedName: safe,
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      storagePath: true,
    },
  });

  if (!record) {
    throw new Error("Generated file not found");
  }

  const buffer = await readFile(resolveStoragePath(record.storagePath));
  await prisma.agentFile.update({
    where: { id: record.id },
    data: { lastDownloadedAt: new Date() },
  });
  triggerPiFileMaintenance();
  return buffer;
}

export async function deleteSessionFiles(sessionId: string, userId?: string): Promise<void> {
  const sid = sanitizeSessionId(sessionId);
  const where = {
    sessionId: sid,
    status: "ACTIVE" satisfies AgentFileStatus,
    ...(userId ? { userId } : {}),
  };

  const files = await prisma.agentFile.findMany({
    where,
    select: {
      id: true,
      storagePath: true,
    },
  });

  for (const file of files) {
    await safeUnlink(resolveStoragePath(file.storagePath));
  }

  if (files.length > 0) {
    await prisma.agentFile.updateMany({
      where: {
        id: { in: files.map((file) => file.id) },
      },
      data: {
        status: "DELETED" satisfies AgentFileStatus,
      },
    });
  }

  await rm(sessionRoot(sid), { recursive: true, force: true });
}
