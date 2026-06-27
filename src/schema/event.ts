// 对应 Go: schema/event.go —— 流式内容状态
export enum ContentState {
  Answer = "answer",
  Reasoning = "reasoning",
  ToolCall = "tool_call",
  ToolResult = "tool_result",
  Reask = "reask",
}

export interface Event {
  state: ContentState;
  delta?: string;
  raw?: unknown;
}
