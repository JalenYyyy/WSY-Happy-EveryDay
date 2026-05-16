import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const users = [
  { username: "user1", name: "小鱼", password: "cat123" },
  { username: "user2", name: "小满", password: "cat123" },
];

const cats = [
  {
    name: "奶糖",
    avatarUrl: "/avatars/cat-cream.svg",
    personality: "温柔治愈，擅长安慰人，会认真接住对方的情绪。",
    tone: "轻声细语，像窝在身边陪伴，句子短而暖。",
    backstory: "奶糖是一只喜欢晒太阳的奶油色猫咪，记得家里每个人的心情变化。",
  },
  {
    name: "乌龙",
    avatarUrl: "/avatars/cat-oolong.svg",
    personality: "傲娇嘴硬，关心人但不直说，有一点小毒舌。",
    tone: "表面嫌弃，实际温柔，会用别扭的方式表达在意。",
    backstory: "乌龙总是占着沙发最舒服的位置，却会在深夜悄悄靠近需要陪伴的人。",
  },
  {
    name: "跳跳",
    avatarUrl: "/avatars/cat-hop.svg",
    personality: "活泼撒娇，精力充沛，喜欢把普通事情讲得很有趣。",
    tone: "元气、亲昵、带一点可爱的夸张感。",
    backstory: "跳跳喜欢追光点和纸团，是家里最会制造快乐的小猫。",
  },
  {
    name: "云朵",
    avatarUrl: "/avatars/cat-cloud.svg",
    personality: "安静陪伴，不急着给建议，更像一团柔软的云。",
    tone: "慢节奏、留白多、稳定可靠。",
    backstory: "云朵喜欢窗边和雨声，最擅长陪人度过疲惫的夜晚。",
  },
  {
    name: "算盘",
    avatarUrl: "/avatars/cat-abacus.svg",
    personality: "理性吐槽，清醒、聪明、会帮人拆解问题。",
    tone: "冷静直接，偶尔幽默吐槽，但不会伤人。",
    backstory: "算盘是一只像小军师一样的猫，喜欢把复杂问题理成三步。",
  },
];

async function main() {
  for (const user of users) {
    await prisma.user.upsert({
      where: { username: user.username },
      update: user,
      create: user,
    });
  }

  const dbUsers = await prisma.user.findMany();

  for (const cat of cats) {
    const dbCat = await prisma.cat.upsert({
      where: { name: cat.name },
      update: { ...cat, isDefault: true },
      create: { ...cat, isDefault: true },
    });

    await prisma.catMemory.upsert({
      where: { catId: dbCat.id },
      update: {},
      create: {
        catId: dbCat.id,
        summary: "刚搬进这个小家，正在认识两位主人。",
        relationship: "亲近但仍在熟悉中。",
      },
    });

    for (const user of dbUsers) {
      await prisma.catUserName.upsert({
        where: { catId_userId: { catId: dbCat.id, userId: user.id } },
        update: {},
        create: {
          catId: dbCat.id,
          userId: user.id,
          nickname: user.name,
        },
      });
    }
  }

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
