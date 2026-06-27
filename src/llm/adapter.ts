// 对应 Go: llm/openai/adapter.go —— schema <-> OpenAI 消息双向转换
import type { ChatCompletionMessage, ToolCall } from "../schema/chat.ts";
import type { BaseTool } from "../tool/tool.ts";

// schema 消息 -> OpenAI wire 格式
export function schemaMessageToOpenAI(m: ChatCompletionMessage): Record<string, unknown> {
  const out: Record<string, unknown> = { role: m.role };
  if (m.content !== undefined) out.content = m.content;
  if (m.name) out.name = m.name;
  if (m.toolCallId) out.tool_call_id = m.toolCallId;
  if (m.toolCalls && m.toolCalls.length > 0) {
    out.tool_calls = m.toolCalls.map((tc) => ({
      id: tc.id,
      type: tc.type,
      function: { name: tc.function.name, arguments: tc.function.arguments },
    }));
  }
  return out;
}

// OpenAI message 对象 -> schema 消息
export function openAIMessageToSchema(raw: any): ChatCompletionMessage {
  const toolCalls: ToolCall[] | undefined = raw.tool_calls?.map((tc: any) => ({
    id: tc.id,
    type: "function" as const,
    function: { name: tc.function?.name ?? "", arguments: tc.function?.arguments ?? "" },
  }));
  return {
    role: (raw.role ?? "assistant") as ChatCompletionMessage["role"],
    content: raw.content ?? "",
    ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
  };
}

// BaseTool -> OpenAI tool 定义
export function toolToOpenAI(t: BaseTool): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: t.name(),
      description: t.description(),
      parameters: t.schema(),
      ...(t.strict() ? { strict: true } : {}),
    },
  };
}
