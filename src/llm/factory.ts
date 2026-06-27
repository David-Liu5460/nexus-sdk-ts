// 从环境变量构建 LLM —— 同时兼容 OpenAI 与火山方舟(Ark)的 OpenAI 兼容端点
import { OpenAILLM } from "./openai.ts";
import type { LLM } from "./llm.ts";

// Ark OpenAI 兼容端点默认 base URL（北京）
const ARK_DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export interface EnvLLMConfig {
  baseURL: string;
  apiKey: string;
  defaultModel?: string;
}

// 读取环境变量，优先级：显式 OPENAI_* > ARK_*
// - OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL
// - ARK_API_KEY    / ARK_BASE_URL（缺省用方舟北京端点） / ARK_MODEL
export function resolveEnvLLMConfig(env: Record<string, string | undefined> = process.env): EnvLLMConfig | null {
  const openaiKey = env.OPENAI_API_KEY;
  if (openaiKey) {
    return {
      apiKey: openaiKey,
      baseURL: env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      defaultModel: env.OPENAI_MODEL,
    };
  }
  const arkKey = env.ARK_API_KEY;
  if (arkKey) {
    return {
      apiKey: arkKey,
      baseURL: env.ARK_BASE_URL ?? ARK_DEFAULT_BASE_URL,
      defaultModel: env.ARK_MODEL, // 方舟通常填接入点 ID，如 ep-xxxxx
    };
  }
  return null;
}

// 有 Key 则返回真实 OpenAILLM，否则返回 null（调用方可回退到 MockLLM）
export function llmFromEnv(env: Record<string, string | undefined> = process.env): LLM | null {
  const cfg = resolveEnvLLMConfig(env);
  if (!cfg) return null;
  return new OpenAILLM(cfg);
}
