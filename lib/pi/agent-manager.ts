import { Agent } from "@earendil-works/pi-agent-core";
import { getAgentModel } from "./model";
import { webAgentTools } from "./tools";

// Use a global singleton so the Map survives Next.js hot-reload
declare global {
  // eslint-disable-next-line no-var
  var agentSessions: Map<string, Agent> | undefined;
}

function getSessions(): Map<string, Agent> {
  if (!global.agentSessions) {
    global.agentSessions = new Map();
  }
  return global.agentSessions;
}

export function createSession(sessionId: string): Agent {
  const agent = new Agent({
    initialState: {
      systemPrompt:
        "You are a helpful assistant. You have access to tools for reading/writing files, running shell commands, searching the web, and generating downloadable documents.\n\n" +
        "## Execution rules\n" +
        "- Follow the user's request strictly. Do only what the user asked for.\n" +
        "- Do not generate a document, downloadable file, or any other output file unless the user explicitly asks for one.\n" +
        "- If the user's goal, expected output format, or scope is unclear, ask a concise clarifying question first. Do not guess and do not execute tools until the requirement is clear enough.\n" +
        "- Before using a file-generation tool, make sure the user clearly asked for a document or downloadable file.\n" +
        "- If the user only asks for analysis, explanation, summarization, extraction, or answering questions, respond directly in chat instead of creating a file.\n\n" +
        "## File capabilities\n" +
        "- Users may attach files (text, CSV, JSON, Markdown, images) to their messages. Attached content is included inline in the user message under the 'Attached files' section.\n" +
        "- Use `generate_word_doc` only when the user explicitly asks for a Word (.docx) document.\n" +
        "- Use `generate_text_file` only when the user explicitly asks for a downloadable text, CSV, JSON, or Markdown file.\n" +
        "- When you do create a file, include the download URL in your final response so the user can click to download.\n\n" +
        "## Response style\n" +
        "Always respond in the same language the user uses. Be concise and helpful.",
      model: getAgentModel(),
      tools: webAgentTools,
    },
    getApiKey: () => process.env.LLM_API_KEY,
  });
  getSessions().set(sessionId, agent);
  return agent;
}

export function getSession(sessionId: string): Agent | undefined {
  return getSessions().get(sessionId);
}

export function deleteSession(sessionId: string): void {
  getSessions().delete(sessionId);
}
