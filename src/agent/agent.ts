// 对应 Go: schema/agent.go —— Agent 接口
import type { Context } from "../context/context.ts";
import type { ChatCompletionMessage, ChatCompletionResponse } from "../schema/chat.ts";
import type { GenerateOptions } from "../llm/llm.ts";

export interface Agent {
  run(
    ctx: Context,
    messages: ChatCompletionMessage[],
    opts?: GenerateOptions,
  ): Promise<ChatCompletionResponse>;
  name(): string;
  description(): string;
  stop(): void;
}
