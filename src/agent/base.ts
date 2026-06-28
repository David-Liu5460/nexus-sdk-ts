// 对应 Go: agent/base.go —— BaseAgent ReAct 循环
import type { Agent } from "./agent.ts";
import { withDefaults, type ResolvedAgentOptions, type AgentOptions } from "./option.ts";
import type { Context } from "../context/context.ts";
import type { ChatCompletionMessage, ChatCompletionResponse, ToolCall } from "../schema/chat.ts";
import type { GenerateOptions } from "../llm/llm.ts";
import type { BaseTool } from "../tool/tool.ts";
import { ErrMissingLLM, ErrMissingName, ErrMissingDesc, ErrMaxIterations } from "../schema/errors.ts";
import { dispatchEvent } from "../callback/callback.ts";
import { ContentState } from "../schema/event.ts";
import { InterruptionType } from "../schema/interruption.ts";
import { chain as chainFeedbacks } from "../feedback/feedback.ts";
import { filterEmptyMessage } from "./common.ts";
import { formatGoTemplate } from "../prompt/go-template.ts";

const INSTRUCTION_FLAG = "__nexus_instruction_injected__";

export class BaseAgent implements Agent {
  private opts: ResolvedAgentOptions;
  private stopped = false;
  // 对齐 Go BaseAgent.fdInfo：最终答案分支未通过时回写的纠正提示
  private fdInfo = "";

  constructor(opts: AgentOptions) {
    // 对齐 Go NewBaseAgent：name/desc/llm 缺失立即报错
    if (!opts.name) throw new ErrMissingName();
    if (!opts.description) throw new ErrMissingDesc();
    if (!opts.llm) throw new ErrMissingLLM();
    this.opts = withDefaults(opts);
  }

  name(): string { return this.opts.name!; }
  description(): string { return this.opts.description!; }
  stop(): void { this.stopped = true; this.opts.llm?.stop(); }

  // 对齐 Go shouldStop：stop 标志 OR 中断态 != None
  private shouldStop(ctx: Context): boolean {
    if (this.stopped) return true;
    return ctx.getInterruptionState().interruptionType !== InterruptionType.None;
  }

  // 工具集：opts.tools + ctx.getTools() + askUserTool，按 name 去重
  // （对齐 Go Plan：a.tools = append(a.tools, nexusCtx.GetTools()...) 后 slices.Contains 去重）
  private allTools(ctx: Context): BaseTool[] {
    const merged = [...(this.opts.tools ?? []), ...ctx.getTools()];
    if (this.opts.askUserTool) merged.push(this.opts.askUserTool);
    const seen = new Set<string>();
    const out: BaseTool[] = [];
    for (const t of merged) {
      const key = t.name().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out;
  }

  // 渲染系统指令：vars + name/current/prompt/with_context，经 go-template 渲染
  // （对齐 Go Plan 的 inputs 构造 + prompt.NewPromptTemplate().Format）
  private renderInstruction(): string {
    const tpl = this.opts.instruction;
    if (!tpl) return "";
    const inputs: Record<string, unknown> = { ...(this.opts.vars ?? {}) };
    inputs.name = this.name();
    inputs.current = new Date().toISOString().slice(0, 19).replace("T", " ");
    inputs.prompt = this.opts.prompt ?? "";
    if (this.opts.withContext) inputs.with_context = true;
    return formatGoTemplate(tpl, inputs);
  }

  // preHook：仅注入一次 system 指令（渲染后的 instruction 作为首条 system 消息）
  private preHook(ctx: Context): void {
    if (!this.opts.instruction) return;
    if (ctx.get<boolean>(INSTRUCTION_FLAG)) return;
    const rendered = this.renderInstruction();
    if (!rendered) return;
    ctx.addMessage({ role: "system", content: rendered });
    ctx.set(INSTRUCTION_FLAG, true);
  }

  async run(
    ctx: Context,
    messages: ChatCompletionMessage[],
    opts: GenerateOptions = {},
  ): Promise<ChatCompletionResponse> {
    this.stopped = false;
    this.preHook(ctx);
    for (const m of messages) ctx.addMessage(m);
    await this.opts.callback?.onAgentStart?.(this.name(), messages);
    try {
      const resp = await this.loop(ctx, opts);
      await this.opts.callback?.onAgentEnd?.(this.name(), resp);
      return resp;
    } catch (e) {
      await this.opts.callback?.onAgentEnd?.(this.name(), undefined, e as Error);
      throw e;
    }
  }

  // resume：askUser 中断后，喂入用户回答并从中断点续跑
  async resume(
    ctx: Context,
    answer: string,
    opts: GenerateOptions = {},
  ): Promise<ChatCompletionResponse> {
    this.stopped = false;
    const it = ctx.getInterruptionState();
    ctx.addMessage({ role: "user", content: answer });
    it.interruptionType = InterruptionType.None;
    it.consumed = true;
    it.isResumed = true;
    it.question = undefined;
    await this.opts.callback?.onAgentStart?.(this.name(), [{ role: "user", content: answer }]);
    try {
      const resp = await this.loop(ctx, opts);
      await this.opts.callback?.onAgentEnd?.(this.name(), resp);
      return resp;
    } catch (e) {
      await this.opts.callback?.onAgentEnd?.(this.name(), undefined, e as Error);
      throw e;
    }
  }

  // ReAct 主循环：shouldStop → Plan(LLM) → tool_calls 分支 / 最终答案分支
  private async loop(ctx: Context, opts: GenerateOptions): Promise<ChatCompletionResponse> {
    const maxIter = this.opts.maxIterations;
    const feedback =
      this.opts.feedbacks && this.opts.feedbacks.length > 0
        ? chainFeedbacks(...this.opts.feedbacks)
        : undefined;

    for (let i = 0; i < maxIter; i++) {
      if (this.shouldStop(ctx)) break;

      const resp = await this.plan(ctx, opts);
      ctx.addMessage(resp.message);
      const calls = resp.message.toolCalls ?? [];

      // 工具调用分支：逐个执行 + 每个 toolCall 跑 feedback（不通过用 prompt 替换结果）
      if (calls.length > 0) {
        for (const call of calls) {
          let result = await this.doAction(ctx, call);
          if (feedback) {
            const info = await feedback.feedback(ctx, this.name(), "", call);
            if (!info.pass) result = info.prompt ?? result;
          }
          ctx.addMessage({ role: "tool", name: call.function.name, toolCallId: call.id, content: result });
          await dispatchEvent(this.opts.callback, { state: ContentState.ToolResult, delta: result });

          // 中断检查：askUser 等会把 ctx 置为 Stop，快照并优雅退出
          if (ctx.getInterruptionState().interruptionType === InterruptionType.Stop) {
            ctx.setInterruptionNode(this.name());
            ctx.snapshotSession();
            return resp;
          }
        }
        continue;
      }

      // 最终答案分支：feedback 校验，未通过把 prompt 作为 user 消息回写重试
      if (feedback) {
        const info = await feedback.feedback(ctx, this.name(), resp.message.content ?? "");
        if (!info.pass) {
          const retried = (ctx.get<number>("__feedback_retries__") ?? 0) + 1;
          ctx.set("__feedback_retries__", retried);
          if (retried <= this.opts.maxFeedbackRetries) {
            this.fdInfo = info.prompt ?? "请修正后重试。";
            ctx.addMessage({ role: "user", content: this.fdInfo });
            continue;
          }
        }
      }
      return resp;
    }
    throw new ErrMaxIterations(maxIter);
  }

  // 对齐 Go Plan：加载历史 → filterEmptyMessage → filterMemory → LLMStart/End 回调包裹 generateContent
  private async plan(ctx: Context, opts: GenerateOptions): Promise<ChatCompletionResponse> {
    const cb = this.opts.callback;
    const tools = this.allTools(ctx);

    let history = filterEmptyMessage(ctx.loadAllMessages());
    if (this.opts.filterMemory) history = this.opts.filterMemory(history);

    const genOpts: GenerateOptions = {
      ...opts,
      tools,
      streamingFunc: (d) => { opts.streamingFunc?.(d); void dispatchEvent(cb, { state: ContentState.Answer, delta: d }); },
      reasoningStreamingFunc: (d) => { opts.reasoningStreamingFunc?.(d); void dispatchEvent(cb, { state: ContentState.Reasoning, delta: d }); },
      toolCallStreamingFunc: (d) => { opts.toolCallStreamingFunc?.(d); void dispatchEvent(cb, { state: ContentState.ToolCall, delta: d }); },
    };

    await cb?.onLLMStart?.(this.name(), history);
    try {
      const resp = await this.opts.llm!.generateContent(history, genOpts);
      await cb?.onLLMEnd?.(this.name(), resp);
      return resp;
    } catch (e) {
      await cb?.onLLMEnd?.(this.name(), undefined, e as Error);
      throw e;
    }
  }

  // 对应 Go doAction：按名查找并调用工具，包裹 ToolStart/End 回调
  private async doAction(ctx: Context, call: ToolCall): Promise<string> {
    const cb = this.opts.callback;
    await cb?.onToolStart?.(this.name(), call);
    const tool = this.allTools(ctx).find((t) => t.name().toLowerCase() === call.function.name.toLowerCase());
    let result: string;
    if (!tool) {
      result = `${call.function.name} is not a valid tool, please check your answer`;
    } else {
      try {
        result = await tool.call(ctx, call.function.arguments);
      } catch (e) {
        result = `failed to call tool ${call.function.name}, error: ${(e as Error).message}`;
      }
    }
    await cb?.onToolEnd?.(this.name(), call, result);
    return result;
  }
}
