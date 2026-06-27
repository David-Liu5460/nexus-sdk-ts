// MockLLM —— 离线/无网络可验证的脚本化 LLM（用于 ReAct 闭环测试与示例）
import type { LLM, GenerateOptions } from "./llm.ts";
import type { ChatCompletionMessage, ChatCompletionResponse } from "../schema/chat.ts";

export interface ScriptedTurn {
  content?: string;
  toolCalls?: { id: string; name: string; arguments: string }[];
}

// 按调用次序依次返回脚本；耗尽后重复最后一条
export class MockLLM implements LLM {
  private idx = 0;
  private stopped = false;

  constructor(private script: ScriptedTurn[]) {
    if (script.length === 0) throw new Error("MockLLM requires at least one scripted turn");
  }

  async generate(messages: ChatCompletionMessage[], opts?: GenerateOptions): Promise<ChatCompletionResponse> {
    return this.generateContent(messages, opts);
  }

  async generateContent(
    _messages: ChatCompletionMessage[],
    opts: GenerateOptions = {},
  ): Promise<ChatCompletionResponse> {
    if (this.stopped) throw new Error("MockLLM stopped");
    const turn = this.script[Math.min(this.idx, this.script.length - 1)]!;
    this.idx++;

    const content = turn.content ?? "";
    if (content && opts.streamingFunc) {
      for (const ch of content) opts.streamingFunc(ch);
    }
    if (turn.toolCalls && opts.toolCallStreamingFunc) {
      for (const tc of turn.toolCalls) opts.toolCallStreamingFunc(tc.arguments);
    }

    const message: ChatCompletionMessage = { role: "assistant", content };
    if (turn.toolCalls && turn.toolCalls.length > 0) {
      message.toolCalls = turn.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }

    return {
      message,
      finishReason: message.toolCalls ? "tool_calls" : "stop",
    };
  }

  stop(): void { this.stopped = true; }
}
