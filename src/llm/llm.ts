// 对应 Go: schema/llm.go —— LLM 接口与生成选项
import type { ChatCompletionMessage, ChatCompletionResponse } from "../schema/chat.ts";
import type { BaseTool } from "../tool/tool.ts";

export interface GenerateOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: BaseTool[];
  toolChoice?: "auto" | "none" | string;
  thinking?: boolean;
  stream?: boolean;
  streamingFunc?: (delta: string) => void;
  reasoningStreamingFunc?: (delta: string) => void;
  toolCallStreamingFunc?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface LLM {
  generate(messages: ChatCompletionMessage[], opts?: GenerateOptions): Promise<ChatCompletionResponse>;
  generateContent(messages: ChatCompletionMessage[], opts?: GenerateOptions): Promise<ChatCompletionResponse>;
  stop(): void;
}
