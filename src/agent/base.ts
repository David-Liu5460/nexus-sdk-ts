// 对应 Go: agent/base.go —— BaseAgent ReAct 循环
import type { Agent } from "./agent.ts";
import { withDefaults, type AgentOptions } from "./option.ts";
import type { Context } from "../context/context.ts";
import type { ChatCompletionMessage, ChatCompletionResponse } from "../schema/chat.ts";
import type { GenerateOptions } from "../llm/llm.ts";
import { ErrMissingLLM, ErrMaxIterations } from "../schema/errors.ts";
import { dispatchEvent } from "../callback/callback.ts";
import { ContentState } from "../schema/event.ts";

export class BaseAgent implements Agent {
  private opts: AgentOptions & { maxIterations: number };
  private stopped = false;

  constructor(opts: AgentOptions) {
    this.opts = withDefaults(opts);
  }

  name(): string { return this.opts.name ?? "base-agent"; }
  description(): string { return this.opts.description ?? ""; }
  stop(): void { this.stopped = true; this.opts.llm?.stop(); }

  async run(
    ctx: Context,
    messages: ChatCompletionMessage[],
    opts: GenerateOptions = {},
  ): Promise<ChatCompletionResponse> {
    if (!this.opts.llm) throw new ErrMissingLLM();
    for (const m of messages) ctx.addMessage(m);

    const cb = this.opts.callback;
    const maxIter = this.opts.maxIterations;

    for (let i = 0; i < maxIter; i++) {
      if (this.stopped) break;

      // Plan：加载上下文消息，调用 LLM；通过 streamingFunc 把增量转成 Event 分发给 Callback
      const history = ctx.loadAllMessages();
      const genOpts: GenerateOptions = {
        ...opts,
        tools: this.opts.tools,
        streamingFunc: (d) => {
          opts.streamingFunc?.(d);
          void dispatchEvent(cb, { state: ContentState.Answer, delta: d });
        },
        reasoningStreamingFunc: (d) => {
          opts.reasoningStreamingFunc?.(d);
          void dispatchEvent(cb, { state: ContentState.Reasoning, delta: d });
        },
        toolCallStreamingFunc: (d) => {
          opts.toolCallStreamingFunc?.(d);
          void dispatchEvent(cb, { state: ContentState.ToolCall, delta: d });
        },
      };

      const resp = await this.opts.llm.generateContent(history, genOpts);
      ctx.addMessage(resp.message);

      // 无工具调用 => 结束
      const calls = resp.message.toolCalls ?? [];
      if (calls.length === 0) return resp;

      // doAction：逐个执行工具，结果回写为 tool 消息并作为 ToolResult 事件分发
      for (const call of calls) {
        const result = await this.doAction(ctx, call.function.name, call.function.arguments);
        ctx.addMessage({
          role: "tool",
          name: call.function.name,
          toolCallId: call.id,
          content: result,
        });
        await dispatchEvent(cb, { state: ContentState.ToolResult, delta: result });
      }
      // TODO: AutoContextEditing 治理（P2：远端 OceanAI 服务）
    }
    throw new ErrMaxIterations(maxIter);
  }

  // 对应 Go: doAction —— 按名查找并调用工具
  private async doAction(ctx: Context, toolName: string, args: string): Promise<string> {
    const tool = (this.opts.tools ?? []).find((t) => t.name() === toolName);
    if (!tool) return `error: tool not found: ${toolName}`;
    try {
      return await tool.call(ctx, args);
    } catch (e) {
      return `error: ${(e as Error).message}`;
    }
  }
}
