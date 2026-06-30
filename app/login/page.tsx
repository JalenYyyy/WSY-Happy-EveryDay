import LoginPageClient from "./login-page-client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, name: true },
  });

  return <LoginPageClient initialUsers={users} />;
}
