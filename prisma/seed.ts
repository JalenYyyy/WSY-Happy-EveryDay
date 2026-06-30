import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/password";

const prisma = new PrismaClient();

const users = [
  {
    id: "default-user-1",
    username: "月",
    name: "月",
    avatarUrl: null,
    bio: "",
    password: "cat123",
  },
  {
    id: "default-user-2",
    username: "泽",
    name: "泽",
    avatarUrl: null,
    bio: "",
    password: "cat123",
  },
];

const cats = [
  {
    name: "耐耐",
    avatarUrl: "",
    personality: "",
    tone: "",
    backstory: "",
  },
  {
    name: "咪仔",
    avatarUrl: "",
    personality: "",
    tone: "",
    backstory: "",
  },
  {
    name: "布丁",
    avatarUrl: "",
    personality: "",
    tone: "",
    backstory: "",
  },
  {
    name: "丢丢",
    avatarUrl: "",
    personality: "",
    tone: "",
    backstory: "",
  },
  {
    name: "希乐乐",
    avatarUrl: "",
    personality: "",
    tone: "",
    backstory: "",
  },
];

async function migrateDefaultUserId(user: (typeof users)[number]) {
  const [existingById, existingByUsername] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id } }),
    prisma.user.findUnique({ where: { username: user.username } }),
  ]);

  if (!existingByUsername || existingByUsername.id === user.id || existingById) {
    return;
  }

  await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "id" = ? WHERE "id" = ?`,
    user.id,
    existingByUsername.id,
  );
}

async function main() {
  for (const user of users) {
    await migrateDefaultUserId(user);
    const hashedPassword = await hashPassword(user.password);
    await prisma.user.upsert({
      where: { id: user.id },
      update: { ...user, password: hashedPassword },
      create: { ...user, password: hashedPassword },
    });
  }

  await prisma.user.updateMany({
    data: {
      avatarUrl: null,
      bio: "",
    },
  });

  const dbUsers = await prisma.user.findMany({
    where: { id: { in: users.map((user) => user.id) } },
  });

  await prisma.passwordRecovery.deleteMany({
    where: { userId: { in: dbUsers.map((user) => user.id) } },
  });

  for (const cat of cats) {
    const existingCat =
      (await prisma.cat.findUnique({ where: { name: cat.name } })) ||
      (await prisma.cat.findFirst({
        where: {
          isDefault: true,
          avatarUrl: cat.avatarUrl,
        },
      }));

    const dbCat = existingCat
      ? await prisma.cat.update({
          where: { id: existingCat.id },
          data: { ...cat, isDefault: true },
        })
      : await prisma.cat.create({
          data: { ...cat, isDefault: true },
        });

      void dbCat;
    }

  await prisma.cat.updateMany({
    data: {
      avatarUrl: "",
      personality: "",
      tone: "",
      backstory: "",
    },
  });

  await prisma.catMemory.deleteMany();
  await prisma.catUserName.deleteMany();

  await prisma.appSetting.upsert({
    where: { key: "llmProvider" },
    update: { value: "openai-compatible" },
    create: { key: "llmProvider", value: "openai-compatible" },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
