// 对应 Go: llm/message.go —— 消息构造器
import type { ChatCompletionMessage } from "../schema/chat.ts";

export const newUserMessage = (content: string): ChatCompletionMessage =>
  ({ role: "user", content });
export const newSystemMessage = (content: string): ChatCompletionMessage =>
  ({ role: "system", content });
export const newAssistantMessage = (content: string): ChatCompletionMessage =>
  ({ role: "assistant", content });
export const newToolMessage = (content: string, name: string, toolCallId: string): ChatCompletionMessage =>
  ({ role: "tool", content, name, toolCallId });
