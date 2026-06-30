import crypto from "crypto";
import { getAuthSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const recoveryAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const recoveryCodeGroups = 3;
const recoveryCodeGroupLength = 4;

export const recoveryCodeLifetimeMs = 1000 * 60 * 60 * 24 * 30;

export type RecoveryStatus = {
  configured: boolean;
  expired: boolean;
  codeSuffix: string | null;
  expiresAt: string | null;
  generatedAt: string | null;
};

export function normalizeRecoveryCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(value: string) {
  return crypto.createHmac("sha256", getAuthSecret()).update(`recovery:${normalizeRecoveryCode(value)}`).digest("hex");
}

export function verifyRecoveryCode(input: string, storedHash: string) {
  const nextHash = hashRecoveryCode(input);
  if (nextHash.length !== storedHash.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(nextHash), Buffer.from(storedHash));
}

function createRawRecoveryCode() {
  let value = "";
  for (let index = 0; index < recoveryCodeGroups * recoveryCodeGroupLength; index += 1) {
    value += recoveryAlphabet[Math.floor(Math.random() * recoveryAlphabet.length)];
  }
  return value;
}

export function createRecoveryCode() {
  const rawCode = createRawRecoveryCode();
  const groups = Array.from({ length: recoveryCodeGroups }, (_, index) =>
    rawCode.slice(index * recoveryCodeGroupLength, (index + 1) * recoveryCodeGroupLength),
  );
  return groups.join("-");
}

function toRecoveryStatus(record: { codeSuffix: string; expiresAt: Date; updatedAt: Date }): RecoveryStatus {
  const expiresAt = record.expiresAt.toISOString();
  return {
    configured: true,
    expired: record.expiresAt.getTime() <= Date.now(),
    codeSuffix: record.codeSuffix,
    expiresAt,
    generatedAt: record.updatedAt.toISOString(),
  };
}

export async function getRecoveryStatus(userId: string): Promise<RecoveryStatus> {
  const record = await prisma.passwordRecovery.findUnique({
    where: { userId },
    select: { codeSuffix: true, expiresAt: true, updatedAt: true },
  });

  if (!record) {
    return {
      configured: false,
      expired: false,
      codeSuffix: null,
      expiresAt: null,
      generatedAt: null,
    };
  }

  return toRecoveryStatus(record);
}

export async function issueRecoveryCode(userId: string) {
  const recoveryCode = createRecoveryCode();
  const normalizedCode = normalizeRecoveryCode(recoveryCode);
  const record = await prisma.passwordRecovery.upsert({
    where: { userId },
    update: {
      codeHash: hashRecoveryCode(normalizedCode),
      codeSuffix: normalizedCode.slice(-4),
      expiresAt: new Date(Date.now() + recoveryCodeLifetimeMs),
    },
    create: {
      userId,
      codeHash: hashRecoveryCode(normalizedCode),
      codeSuffix: normalizedCode.slice(-4),
      expiresAt: new Date(Date.now() + recoveryCodeLifetimeMs),
    },
    select: { codeSuffix: true, expiresAt: true, updatedAt: true },
  });

  return {
    recoveryCode,
    status: toRecoveryStatus(record),
  };
}
