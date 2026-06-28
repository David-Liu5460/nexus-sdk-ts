// 对应 Go: agent/option.go
import type { LLM } from "../llm/llm.ts";
import type { BaseTool } from "../tool/tool.ts";
import type { Callback } from "../callback/callback.ts";
import type { Feedback } from "../feedback/feedback.ts";
import type { ChatCompletionMessage } from "../schema/chat.ts";

export const DEFAULT_MAX_ITERATIONS = 30;

export type FilterMemoryFunc = (messages: ChatCompletionMessage[]) => ChatCompletionMessage[];

export interface AgentOptions {
  name?: string;
  description?: string;
  llm?: LLM;
  tools?: BaseTool[];
  maxIterations?: number;
  callback?: Callback;
  vars?: Record<string, unknown>;
  instruction?: string;
  prompt?: string;
  withContext?: boolean;
  feedbacks?: Feedback[];
  filterMemory?: FilterMemoryFunc;
  askUserTool?: BaseTool;
  maxFeedbackRetries?: number;
}

export type ResolvedAgentOptions = AgentOptions &
  Required<Pick<AgentOptions, "maxIterations" | "maxFeedbackRetries" | "withContext">>;

export function withDefaults(opts: AgentOptions): ResolvedAgentOptions {
  return {
    ...opts,
    maxIterations: opts.maxIterations ?? DEFAULT_MAX_ITERATIONS,
    maxFeedbackRetries: opts.maxFeedbackRetries ?? 3,
    withContext: opts.withContext ?? true,
  };
}
