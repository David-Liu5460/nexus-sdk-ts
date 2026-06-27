// 对应 Go: callback 接口 + ContentState 映射
import { ContentState, type Event } from "../schema/event.ts";

export interface Callback {
  onEvent?(ev: Event): void | Promise<void>;
  onAnswer?(delta: string): void | Promise<void>;
  onReasoning?(delta: string): void | Promise<void>;
  onToolCall?(delta: string): void | Promise<void>;
  onToolResult?(delta: string): void | Promise<void>;
}

// 把 Event 分发到细分回调（对应 Go eventCallback 映射）
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
