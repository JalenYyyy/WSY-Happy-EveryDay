import { requireApiUser } from "@/lib/auth";
import { getSession } from "@/lib/pi/agent-manager";
import { asyncSession } from "@/lib/pi/tools";

type Attachment = {
  id: string;
  name: string;
  mimeType: string;
  textContent?: string;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await (async () => {
    try {
      return await requireApiUser();
    } catch {
      return null;
    }
  })();

  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const agent = getSession(id);
  if (!agent) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const body = await req.json() as { message: string; attachments?: Attachment[] };
  const { message, attachments } = body;

  // Build the full message text, appending file contents if any
  let fullMessage = message;
  if (attachments && attachments.length > 0) {
    const fileParts: string[] = [];
    for (const att of attachments) {
      if (att.textContent) {
        fileParts.push(
          `--- Attached file: ${att.name} (${att.mimeType}) ---\n${att.textContent}\n--- End of ${att.name} ---`,
        );
      } else {
        fileParts.push(`--- Attached file: ${att.name} (${att.mimeType}) [binary, content not extractable] ---`);
      }
    }
    fullMessage = `${message}\n\nAttached files:\n${fileParts.join("\n\n")}`;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      // Run the agent prompt within the AsyncLocalStorage context so tools can access session id
      asyncSession.run({ sessionId: id, userId: user.id }, () => {
        const unsubscribe = agent.subscribe(async (event) => {
          if (event.type === "message_update") {
            const ae = event.assistantMessageEvent;
            if (ae.type === "text_delta") {
              send({ type: "text_delta", delta: ae.delta });
            }
          } else if (event.type === "tool_execution_start") {
            send({
              type: "tool_start",
              name: event.toolName,
              label: (event as { toolName: string; toolLabel?: string; args: unknown }).toolLabel ?? event.toolName,
              args: (event as { toolName: string; args: unknown }).args,
            });
          } else if (event.type === "tool_execution_end") {
            const result = (event as { toolCallId: string; result: { content: Array<{ type: string; text?: string }> } }).result;
            const text = result?.content?.find((b) => b.type === "text")?.text ?? "";
            send({ type: "tool_end", name: (event as { toolName?: string }).toolName ?? "", result: text });
          } else if (event.type === "agent_end") {
            send({ type: "agent_end" });
            unsubscribe();
            controller.close();
          }
        });

        // Abort agent if client disconnects
        req.signal.addEventListener("abort", () => {
          agent.abort();
        });

        agent.prompt(fullMessage).catch((err: Error) => {
          send({ type: "error", message: err.message });
          // unsubscribe may not be defined if subscribe failed
          try { unsubscribe(); } catch {}
          controller.close();
        });
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
