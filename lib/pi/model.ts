import type { Model } from "@earendil-works/pi-ai";

/**
 * Build a custom Model object from project env vars.
 * Supports any OpenAI-compatible endpoint (DeepSeek, MiMo, etc.)
 */
export function getAgentModel(): Model<"openai-completions"> {
  return {
    id: process.env.LLM_MODEL ?? "deepseek-chat",
    name: "Agent LLM",
    api: "openai-completions",
    provider: "custom",
    baseUrl: process.env.LLM_BASE_URL ?? "",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 65536,
    maxTokens: 8192,
  };
}
