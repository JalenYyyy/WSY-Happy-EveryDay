import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ChatApp from "@/components/chat-app";
import { getWhisperOverview } from "@/lib/whispers";

export default async function HomePage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const [rawCats, users, initialWhispers, globalNickname] = await Promise.all([
    prisma.cat.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { messages: true } } },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true, name: true, avatarUrl: true },
    }),
    getWhisperOverview(user.id),
    prisma.catUserName.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { nickname: true },
    }),
  ]);

  const cats = rawCats.map((cat) => ({
    ...cat,
    nickname: globalNickname?.nickname || "",
  }));

  return <ChatApp currentUser={user} initialCats={cats} users={users} initialWhispers={initialWhispers} />;
}
