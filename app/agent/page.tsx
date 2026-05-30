import { requireUser } from "@/lib/auth";
import { AgentChatUI } from "@/components/agent/chat-ui";

export default async function AgentPage() {
  const user = await requireUser();
  return <AgentChatUI user={user} />;
}
