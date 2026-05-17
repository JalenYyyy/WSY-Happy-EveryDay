import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
const username = process.env.SMOKE_USERNAME || `smoke-user-${Date.now()}`;
const wrongPassword = process.env.SMOKE_WRONG_PASSWORD || "wrong-pass";

async function main() {
  const statuses: number[] = [];
  let lastError = "";

  for (let index = 0; index < 6; index += 1) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: wrongPassword }),
    });

    statuses.push(response.status);
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    lastError = payload.error || lastError;
  }

  const records = await prisma.appSetting.findMany({
    where: { key: { startsWith: "loginThrottle:" } },
    orderBy: { updatedAt: "desc" },
  });
  const record = records.find((item) => item.key.endsWith(`:${username}`)) || null;
  const parsed = record ? (JSON.parse(record.value) as { count: number; firstFailedAt: number; lockedUntil: number | null }) : null;

  const passed =
    statuses.slice(0, 5).every((status) => status === 401) &&
    statuses[5] === 429 &&
    Boolean(parsed?.lockedUntil) &&
    parsed?.count === 5;

  console.log(
    JSON.stringify(
      {
        passed,
        statuses,
        lastError,
        throttleKey: record?.key || null,
        throttleRecord: parsed
          ? {
              count: parsed.count,
              hasLockedUntil: Boolean(parsed.lockedUntil),
            }
          : null,
      },
      null,
      2,
    ),
  );

  if (!passed) {
    process.exitCode = 1;
  }

  if (record) {
    await prisma.appSetting.deleteMany({ where: { key: record.key } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });