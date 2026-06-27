// 对应 Go: agent/option.go
import type { LLM } from "../llm/llm.ts";
import type { BaseTool } from "../tool/tool.ts";
import type { Callback } from "../callback/callback.ts";

export const DEFAULT_MAX_ITERATIONS = 30;

export interface AgentOptions {
  name?: string;
  description?: string;
  llm?: LLM;
  tools?: BaseTool[];
  maxIterations?: number;
  callback?: Callback;
  vars?: Record<string, unknown>;
}

export function withDefaults(opts: AgentOptions): Required<Pick<AgentOptions, "maxIterations">> & AgentOptions {
  return { ...opts, maxIterations: opts.maxIterations ?? DEFAULT_MAX_ITERATIONS };
}
