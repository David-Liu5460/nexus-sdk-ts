// 示例：自定义 Agent —— 实现 Agent 接口（不继承 BaseAgent）
// 对应文档：read_me/04-agent/3.自定义Agent (TS).md
//
// 演示两个自定义 Agent：
//   1) EchoAgent      —— 纯逻辑、无 LLM：把用户最后一条消息原样回显
//   2) ChainOfThought —— 带 LLM（离线用 MockLLM）：注入"先思考再回答"的 system 提示
// 二者都实现 src/agent/agent.ts 的 Agent 接口（run / resume / name / description / stop）。
//
// 运行：bun run examples/custom-agent.ts
import type { Agent } from "../src/agent/agent.ts";
import type { Context } from "../src/context/context.ts";
import type { ChatCompletionMessage, ChatCompletionResponse } from "../src/schema/chat.ts";
import type { LLM, GenerateOptions } from "../src/llm/llm.ts";
import { MemoryContext } from "../src/context/memory.ts";
import { MockLLM } from "../src/llm/mock.ts";
import { newUserMessage, newSystemMessage } from "../src/llm/message.ts";
import { ErrStop } from "../src/schema/errors.ts";

// —— 1) 最简自定义 Agent：无 LLM，回显最后一条消息 ——
class EchoAgent implements Agent {
  private stopped = false;
  constructor(private readonly agentName: string) {}

  name(): string { return this.agentName; }
  description(): string { return "将用户输入原样返回的 Echo Agent"; }
  stop(): void { this.stopped = true; }

  async run(ctx: Context, messages: ChatCompletionMessage[]): Promise<ChatCompletionResponse> {
    if (this.stopped) throw new ErrStop();
    // 优先用入参的最后一条消息，否则回看 Context 历史
    let last = "";
    if (messages.length > 0) {
      last = messages[messages.length - 1]!.content ?? "";
    } else {
      const history = ctx.loadAllMessages();
      if (history.length > 0) last = history[history.length - 1]!.content ?? "";
    }
    const message: ChatCompletionMessage = {
      role: "assistant",
      content: "Echo: " + last,
      name: this.agentName,
    };
    ctx.addMessage(message);
    return { message, finishReason: "stop" };
  }

  async resume(ctx: Context, answer: string): Promise<ChatCompletionResponse> {
    return this.run(ctx, [newUserMessage(answer)]);
  }
}

// —— 2) 带 LLM 的自定义 Agent：注入思维链 system 提示，再调用 LLM ——
class ChainOfThoughtAgent implements Agent {
  private stopped = false;
  constructor(private readonly agentName: string, private readonly llm: LLM) {}

  name(): string { return this.agentName; }
  description(): string { return "使用思维链的推理 Agent"; }
  stop(): void { this.stopped = true; this.llm.stop(); }

  async run(
    ctx: Context,
    messages: ChatCompletionMessage[],
    opts?: GenerateOptions,
  ): Promise<ChatCompletionResponse> {
    if (this.stopped) throw new ErrStop();
    const prompt: ChatCompletionMessage[] = [
      newSystemMessage("请先逐步思考，再给出最终答案。格式：\n思考：...\n答案：..."),
    ];
    prompt.push(...(messages.length > 0 ? messages : ctx.loadAllMessages()));

    const resp = await this.llm.generateContent(prompt, opts);
    ctx.addMessage(resp.message);
    return resp;
  }

  async resume(ctx: Context, answer: string, opts?: GenerateOptions): Promise<ChatCompletionResponse> {
    return this.run(ctx, [newUserMessage(answer)], opts);
  }
}

async function main() {
  // —— Demo 1：EchoAgent ——
  console.log("=== Demo 1: EchoAgent（无 LLM）===");
  const echo = new EchoAgent("echo");
  const ctx1 = new MemoryContext({ query: "你好，自定义 Agent" });
  const r1 = await echo.run(ctx1, [newUserMessage(ctx1.userQuery())]);
  console.log("[run]   ", r1.message.content);
  const r1b = await echo.resume(ctx1, "再回显一句");
  console.log("[resume]", r1b.message.content);

  // —— Demo 2：ChainOfThoughtAgent（离线 MockLLM）——
  console.log("\n=== Demo 2: ChainOfThoughtAgent（MockLLM 离线）===");
  const llm = new MockLLM([
    { content: "思考：用户在问候。\n答案：你好！我是一个自定义的思维链 Agent。" },
  ]);
  const cot = new ChainOfThoughtAgent("cot", llm);
  const ctx2 = new MemoryContext({ query: "自我介绍一下" });
  const r2 = await cot.run(ctx2, [newUserMessage(ctx2.userQuery())]);
  console.log("[run]\n" + r2.message.content);
  console.log("\n[消息轨迹]", ctx2.loadAllMessages().map((m) => m.role).join(" → "));
}

main().catch((e) => { console.error(e); process.exit(1); });
