import { existsSync, unlinkSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const dbPath = path.join(process.cwd(), "prisma", "dev.db");

if (process.argv.includes("--reset") && existsSync(dbPath)) {
  unlinkSync(dbPath);
}

const prisma = new PrismaClient();

async function ensureColumn(table: string, column: string, definition: string) {
  const columns = (await prisma.$queryRawUnsafe(`PRAGMA table_info("${table}");`)) as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition};`);
  }
}

async function getColumnNames(table: string) {
  const columns = (await prisma.$queryRawUnsafe(`PRAGMA table_info("${table}");`)) as Array<{ name: string }>;
  return columns.map((column) => column.name);
}

async function migrateWhisperCardTable() {
  const columns = await getColumnNames("WhisperCard");

  if (!columns.includes("expiresAt")) {
    return;
  }

  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF;");

  try {
    await prisma.$executeRawUnsafe("BEGIN IMMEDIATE;");
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "WhisperCard_new" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "senderId" TEXT NOT NULL,
        "recipientId" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "deliverAt" DATETIME NOT NULL,
        "editedAt" DATETIME,
        "readAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "WhisperCard_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "WhisperCard_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "WhisperCard_new" (
        "id",
        "senderId",
        "recipientId",
        "content",
        "deliverAt",
        "editedAt",
        "readAt",
        "createdAt",
        "updatedAt"
      )
      SELECT
        "id",
        "senderId",
        "recipientId",
        "content",
        "deliverAt",
        "editedAt",
        "readAt",
        "createdAt",
        "updatedAt"
      FROM "WhisperCard";
    `);
    await prisma.$executeRawUnsafe('DROP TABLE "WhisperCard";');
    await prisma.$executeRawUnsafe('ALTER TABLE "WhisperCard_new" RENAME TO "WhisperCard";');
    await prisma.$executeRawUnsafe("COMMIT;");
  } catch (error) {
    await prisma.$executeRawUnsafe("ROLLBACK;");
    throw error;
  } finally {
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON;");
  }
}

async function main() {
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON;");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "username" TEXT NOT NULL UNIQUE,
      "name" TEXT NOT NULL,
      "avatarUrl" TEXT,
      "bio" TEXT NOT NULL DEFAULT '',
      "password" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Cat" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL UNIQUE,
      "avatarUrl" TEXT NOT NULL,
      "personality" TEXT NOT NULL,
      "tone" TEXT NOT NULL,
      "backstory" TEXT NOT NULL,
      "isDefault" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CatUserName" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "catId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "nickname" TEXT NOT NULL,
      "preference" TEXT NOT NULL DEFAULT '',
      "memorySummary" TEXT NOT NULL DEFAULT '',
      "relationship" TEXT NOT NULL DEFAULT '',
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "CatUserName_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "CatUserName_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await ensureColumn("User", "avatarUrl", "TEXT");
  await ensureColumn("User", "bio", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("CatUserName", "preference", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("CatUserName", "memorySummary", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("CatUserName", "relationship", "TEXT NOT NULL DEFAULT ''");

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "CatUserName_catId_userId_key"
    ON "CatUserName"("catId", "userId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Message" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "catId" TEXT NOT NULL,
      "userId" TEXT,
      "role" TEXT NOT NULL,
      "messageType" TEXT NOT NULL DEFAULT 'TEXT',
      "content" TEXT NOT NULL,
      "imageUrl" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Message_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);

  await ensureColumn("Message", "messageType", "TEXT NOT NULL DEFAULT 'TEXT'");
  await ensureColumn("Message", "imageUrl", "TEXT");

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Message_catId_createdAt_idx"
    ON "Message"("catId", "createdAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CatMoment" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "catId" TEXT NOT NULL,
      "imageUrl" TEXT NOT NULL,
      "caption" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CatMoment_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CatMoment_catId_createdAt_idx"
    ON "CatMoment"("catId", "createdAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CatMemory" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "catId" TEXT NOT NULL UNIQUE,
      "summary" TEXT NOT NULL DEFAULT '',
      "relationship" TEXT NOT NULL DEFAULT '',
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "CatMemory_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AppSetting" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "key" TEXT NOT NULL UNIQUE,
      "value" TEXT NOT NULL,
      "updatedAt" DATETIME NOT NULL
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PasswordRecovery" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL UNIQUE,
      "codeHash" TEXT NOT NULL,
      "codeSuffix" TEXT NOT NULL,
      "expiresAt" DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "PasswordRecovery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PasswordRecovery_userId_key"
    ON "PasswordRecovery"("userId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WhisperCard" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "senderId" TEXT NOT NULL,
      "recipientId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "deliverAt" DATETIME NOT NULL,
      "editedAt" DATETIME,
      "readAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "WhisperCard_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "WhisperCard_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await migrateWhisperCardTable();

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WhisperCard_senderId_recipientId_deliverAt_idx"
    ON "WhisperCard"("senderId", "recipientId", "deliverAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WhisperCard_recipientId_deliverAt_idx"
    ON "WhisperCard"("recipientId", "deliverAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WhisperCard_recipientId_readAt_idx"
    ON "WhisperCard"("recipientId", "readAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AgentFile" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "sessionId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "kind" TEXT NOT NULL,
      "originalName" TEXT NOT NULL,
      "storedName" TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      "size" INTEGER NOT NULL,
      "storagePath" TEXT NOT NULL UNIQUE,
      "downloadPath" TEXT,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "expiresAt" DATETIME NOT NULL,
      "lastDownloadedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "AgentFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "AgentFile_sessionId_kind_storedName_key"
    ON "AgentFile"("sessionId", "kind", "storedName");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AgentFile_sessionId_status_expiresAt_idx"
    ON "AgentFile"("sessionId", "status", "expiresAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AgentFile_userId_status_expiresAt_idx"
    ON "AgentFile"("userId", "status", "expiresAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WhisperReply" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "cardId" TEXT NOT NULL,
      "senderId" TEXT NOT NULL,
      "recipientId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "readAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "WhisperReply_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "WhisperCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "WhisperReply_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "WhisperReply_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WhisperReply_cardId_createdAt_idx"
    ON "WhisperReply"("cardId", "createdAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WhisperReply_recipientId_readAt_idx"
    ON "WhisperReply"("recipientId", "readAt");
  `);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
