// 对应 Go: schema/callback.go (Callback 接口) + callback/ (事件映射)
//
// TS 侧把 Go 的两类回调统一在一个可选实现的 Callback 接口里:
//   1) 事件流回调(onEvent/onAnswer/...): 对齐 Go EventCallback + 各 StreamingFunc;
//   2) 生命周期回调(onAgentStart/...): 对齐 Go AgentStart/End、LLMStart/End、ToolStart/End。
// 所有方法都是可选的, 业务按需实现; dispatchEvent 仅负责事件流分发,
// 生命周期钩子由 BaseAgent 在 run/loop/doAction 的相应阶段直接调用。
import { ContentState, type Event } from "../schema/event.ts";
import type { ChatCompletionMessage, ChatCompletionResponse, ToolCall } from "../schema/chat.ts";

export interface Callback {
  // —— 事件流(增量) ——
  onEvent?(ev: Event): void | Promise<void>;
  onAnswer?(delta: string): void | Promise<void>;
  onReasoning?(delta: string): void | Promise<void>;
  onToolCall?(delta: string): void | Promise<void>;
  onToolResult?(delta: string): void | Promise<void>;

  // —— 生命周期(对齐 Go AgentStart/End、LLMStart/End、ToolStart/End) ——
  onAgentStart?(agentName: string, messages: ChatCompletionMessage[]): void | Promise<void>;
  onAgentEnd?(agentName: string, result: ChatCompletionResponse | undefined, err?: Error): void | Promise<void>;
  onLLMStart?(agentName: string, messages: ChatCompletionMessage[]): void | Promise<void>;
  onLLMEnd?(agentName: string, output: ChatCompletionResponse | undefined, err?: Error): void | Promise<void>;
  onToolStart?(agentName: string, tool: ToolCall): void | Promise<void>;
  onToolEnd?(agentName: string, tool: ToolCall, result: string): void | Promise<void>;
}

// 把 Event 分发到细分回调(对应 Go eventCallback 映射)
export async function dispatchEvent(cb: Callback | undefined, ev: Event): Promise<void> {
  if (!cb) return;
  await cb.onEvent?.(ev);
  const d = ev.delta ?? "";
  switch (ev.state) {
    case ContentState.Answer: await cb.onAnswer?.(d); break;
    case ContentState.Reasoning: await cb.onReasoning?.(d); break;
    case ContentState.ToolCall: await cb.onToolCall?.(d); break;
    case ContentState.ToolResult: await cb.onToolResult?.(d); break;
  }
}
