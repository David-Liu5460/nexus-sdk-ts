// 对应 Go: schema/chat.go —— 消息与多模态结构
export type RoleType = "system" | "user" | "assistant" | "tool";

export type FinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | "null";

export interface FunctionCall {
  name: string;
  arguments: string; // JSON 字符串
}

export interface ToolCall {
  id: string;
  type: "function";
  function: FunctionCall;
}

export interface ChatMessagePart {
  type: "text" | "image" | "video";
  text?: string;
  url?: string;
}

export interface ChatCompletionMessage {
  role: RoleType;
  content?: string;
  name?: string;
  parts?: ChatMessagePart[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatCompletionResponse {
  message: ChatCompletionMessage;
  finishReason: FinishReason;
  usage?: Usage;
}
