// BaseAgent 与 Go agent/base.go 对齐能力测试：
// name/desc 校验、生命周期回调、逐工具 Feedback 拦截、vars+go-template 指令渲染、工具去重。
// 全部用 MockLLM，离线可跑。
import { test, expect } from "bun:test";
import { BaseAgent } from "../src/agent/base.ts";
import { MemoryContext } from "../src/context/memory.ts";
import { MockLLM } from "../src/llm/mock.ts";
import { AbstractTool } from "../src/tool/tool.ts";
import { FuncFeedback } from "../src/feedback/feedback.ts";
import { ErrMissingName, ErrMissingDesc, ErrMissingLLM } from "../src/schema/errors.ts";
import type { Context } from "../src/context/context.ts";
import { newUserMessage } from "../src/llm/message.ts";

class EchoTool extends AbstractTool {
  constructor(private label = "echo") { super(); }
  name() { return this.label; }
  description() { return "原样返回输入"; }
  async call(_ctx: Context, args: string) {
    const { text } = JSON.parse(args) as { text: string };
    return `echo:${text}`;
  }
}

// ---------- 构造期校验（对齐 Go NewBaseAgent） ----------

test("构造校验：缺 name 抛 ErrMissingName", () => {
  const llm = new MockLLM([{ content: "x" }]);
  expect(() => new BaseAgent({ description: "d", llm } as any)).toThrow(ErrMissingName);
});

test("构造校验：缺 description 抛 ErrMissingDesc", () => {
  const llm = new MockLLM([{ content: "x" }]);
  expect(() => new BaseAgent({ name: "a", llm } as any)).toThrow(ErrMissingDesc);
});

test("构造校验：缺 llm 抛 ErrMissingLLM", () => {
  expect(() => new BaseAgent({ name: "a", description: "d" } as any)).toThrow(ErrMissingLLM);
});

test("name()/description() 返回构造入参", () => {
  const llm = new MockLLM([{ content: "x" }]);
  const agent = new BaseAgent({ name: "navi", description: "导航助手", llm });
  expect(agent.name()).toBe("navi");
  expect(agent.description()).toBe("导航助手");
});

// ---------- 生命周期回调（对齐 Go AgentStart/End、LLMStart/End、ToolStart/End） ----------

test("生命周期回调：onAgentStart/End、onLLMStart/End、onToolStart/End 均被触发", async () => {
  const tool = new EchoTool();
  const llm = new MockLLM([
    { content: "调用", toolCalls: [{ id: "c1", name: "echo", arguments: JSON.stringify({ text: "hi" }) }] },
    { content: "done" },
  ]);
  const ctx = new MemoryContext({ tools: [tool] });
  const trace: string[] = [];
  const agent = new BaseAgent({
    name: "t", description: "d", llm, tools: [tool],
    callback: {
      onAgentStart: (n) => { trace.push(`agentStart:${n}`); },
      onAgentEnd: (n, _r, e) => { trace.push(`agentEnd:${n}:${e ? "err" : "ok"}`); },
      onLLMStart: (n) => { trace.push(`llmStart:${n}`); },
      onLLMEnd: (n, _o, e) => { trace.push(`llmEnd:${n}:${e ? "err" : "ok"}`); },
      onToolStart: (n, tc) => { trace.push(`toolStart:${n}:${tc.function.name}`); },
      onToolEnd: (n, tc, r) => { trace.push(`toolEnd:${n}:${tc.function.name}:${r}`); },
    },
  });

  await agent.run(ctx, [newUserMessage("go")]);

  expect(trace[0]).toBe("agentStart:t");
  expect(trace[trace.length - 1]).toBe("agentEnd:t:ok");
  expect(trace).toContain("llmStart:t");
  expect(trace).toContain("llmEnd:t:ok");
  expect(trace).toContain("toolStart:t:echo");
  expect(trace).toContain("toolEnd:t:echo:echo:hi");
});

test("生命周期回调：异常路径 onAgentEnd 收到 err", async () => {
  const tool = new EchoTool();
  const llm = new MockLLM([
    { content: "loop", toolCalls: [{ id: "c1", name: "echo", arguments: JSON.stringify({ text: "z" }) }] },
  ]);
  const ctx = new MemoryContext({ tools: [tool] });
  let endErr: Error | undefined;
  const agent = new BaseAgent({
    name: "t", description: "d", llm, tools: [tool], maxIterations: 2,
    callback: { onAgentEnd: (_n, _r, e) => { endErr = e; } },
  });
  await expect(agent.run(ctx, [newUserMessage("go")])).rejects.toBeInstanceOf(Error);
  expect(endErr).toBeInstanceOf(Error);
});

// ---------- 逐工具 Feedback 拦截（对齐 Go: info.Msg 覆盖 result） ----------

test("逐工具 Feedback：未通过时用 prompt 替换工具结果", async () => {
  const tool = new EchoTool();
  const llm = new MockLLM([
    { content: "调用", toolCalls: [{ id: "c1", name: "echo", arguments: JSON.stringify({ text: "secret" }) }] },
    { content: "final" },
  ]);
  const ctx = new MemoryContext({ tools: [tool] });
  // 工具分支(toolCall 存在)拦截，把结果替换为提示语
  const agent = new BaseAgent({
    name: "t", description: "d", llm, tools: [tool],
    feedbacks: [new FuncFeedback((_content, toolCall) =>
      toolCall ? { pass: false, prompt: "[拦截] 工具结果不可用" } : { pass: true },
    )],
  });

  await agent.run(ctx, [newUserMessage("go")]);

  const toolMsg = ctx.loadAllMessages().find((m) => m.role === "tool");
  expect(toolMsg?.content).toBe("[拦截] 工具结果不可用");
});

// ---------- vars + go-template 指令渲染（对齐 Go Plan inputs） ----------

test("指令渲染：vars + name/current/prompt 注入并被 go-template 渲染", async () => {
  const llm = new MockLLM([{ content: "ok" }]);
  const ctx = new MemoryContext();
  const agent = new BaseAgent({
    name: "rpt-agent", description: "d", llm,
    instruction: "Agent={{ .name }} Role={{ .role }}{{ if .with_context }} CTX-ON{{ end }}",
    vars: { role: "分析师" },
    withContext: true,
  });

  await agent.run(ctx, [newUserMessage("hi")]);

  const sys = ctx.loadAllMessages().find((m) => m.role === "system");
  expect(sys?.content).toContain("Agent=rpt-agent");
  expect(sys?.content).toContain("Role=分析师");
  expect(sys?.content).toContain("CTX-ON");
});

test("指令渲染：withContext=false 时条件块不渲染", async () => {
  const llm = new MockLLM([{ content: "ok" }]);
  const ctx = new MemoryContext();
  const agent = new BaseAgent({
    name: "a", description: "d", llm,
    instruction: "X{{ if .with_context }} CTX{{ end }}",
    withContext: false,
  });
  await agent.run(ctx, [newUserMessage("hi")]);
  const sys = ctx.loadAllMessages().find((m) => m.role === "system");
  expect(sys?.content).toBe("X");
});

// ---------- 工具去重 + ctx.getTools() 合并（对齐 Go Plan dedup） ----------

test("工具合并去重：opts.tools 与 ctx.getTools() 同名工具只保留一个", async () => {
  const t1 = new EchoTool("echo");
  const t2 = new EchoTool("echo"); // 同名，应被去重
  const llm = new MockLLM([{ content: "ok" }]);
  const ctx = new MemoryContext({ tools: [t2] });
  let toolCount = -1;
  const agent = new BaseAgent({
    name: "t", description: "d", llm, tools: [t1],
    callback: { onLLMStart: () => {} },
  });
  // 用 filterMemory 钩子不行，改用 generateContent 侧的 tools：借助一个探针 LLM
  const probe = new MockLLM([{ content: "ok" }]);
  (probe as any).generateContent = async (_m: any, opts: any) => {
    toolCount = (opts.tools ?? []).length;
    return { message: { role: "assistant", content: "ok" }, finishReason: "stop" };
  };
  const agent2 = new BaseAgent({ name: "t", description: "d", llm: probe, tools: [t1] });
  const ctx2 = new MemoryContext({ tools: [t2] });
  await agent2.run(ctx2, [newUserMessage("hi")]);
  expect(toolCount).toBe(1);
  void agent; // 保留引用避免未使用告警
});
