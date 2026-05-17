import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ChatApp from "@/components/chat-app";
import { getWhisperOverview } from "@/lib/whispers";

export default async function HomePage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const [cats, users, initialWhispers] = await Promise.all([
    prisma.cat.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        nicknames: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        memory: true,
        _count: { select: { messages: true } },
      },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true, name: true, avatarUrl: true, bio: true },
    }),
    getWhisperOverview(user.id),
  ]);

  return <ChatApp currentUser={user} initialCats={cats} users={users} initialWhispers={initialWhispers} />;
}
