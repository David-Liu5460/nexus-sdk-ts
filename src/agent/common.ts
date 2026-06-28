// 对应 Go: agent/common.go —— Agent 层通用工具函数
import type { ChatCompletionMessage } from "../schema/chat.ts";

// FilterEmptyMessage：过滤掉内容为空且不含工具调用的消息。
// 对齐 Go agent.FilterEmptyMessage：保留 Content != "" || len(ToolCalls) != 0 的消息，
// 避免空 assistant 占位消息污染喂给 LLM 的上下文。
export function filterEmptyMessage(
  messages: ChatCompletionMessage[],
): ChatCompletionMessage[] {
  return messages.filter(
    (m) => (m.content ?? "") !== "" || (m.toolCalls?.length ?? 0) > 0,
  );
}
