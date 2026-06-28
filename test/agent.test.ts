// BaseAgent ReAct 闭环测试（用 MockLLM，离线可跑）
import { test, expect } from "bun:test";
import { BaseAgent } from "../src/agent/base.ts";
import { MemoryContext } from "../src/context/memory.ts";
import { MockLLM } from "../src/llm/mock.ts";
import { AbstractTool } from "../src/tool/tool.ts";
import type { Context } from "../src/context/context.ts";
import { newUserMessage } from "../src/llm/message.ts";
import { ErrMaxIterations } from "../src/schema/errors.ts";

class EchoTool extends AbstractTool {
  public lastArgs = "";
  name() { return "echo"; }
  description() { return "原样返回输入"; }
  async call(_ctx: Context, args: string) {
    this.lastArgs = args;
    const { text } = JSON.parse(args) as { text: string };
    return `echo:${text}`;
  }
}

test("ReAct 闭环：工具调用一轮后给出最终回答", async () => {
  const tool = new EchoTool();
  const llm = new MockLLM([
    { content: "调用工具", toolCalls: [{ id: "c1", name: "echo", arguments: JSON.stringify({ text: "hi" }) }] },
    { content: "FINAL_hi" },
  ]);
  const ctx = new MemoryContext({ tools: [tool] });
  const agent = new BaseAgent({ name: "t", description: "测试用", llm, tools: [tool] });

  const resp = await agent.run(ctx, [newUserMessage("回显 hi")]);

  expect(resp.message.content).toBe("FINAL_hi");
  expect(tool.lastArgs).toBe(JSON.stringify({ text: "hi" }));
  const msgs = ctx.loadAllMessages();
  expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
  expect(msgs[2]!.content).toBe("echo:hi");
});

test("无工具调用时立即返回", async () => {
  const llm = new MockLLM([{ content: "直接回答" }]);
  const ctx = new MemoryContext();
  const agent = new BaseAgent({ name: "t", description: "测试用", llm });
  const resp = await agent.run(ctx, [newUserMessage("hi")]);
  expect(resp.message.content).toBe("直接回答");
  expect(resp.finishReason).toBe("stop");
});

test("流式回调收到 Answer/ToolCall/ToolResult 事件", async () => {
  const tool = new EchoTool();
  const llm = new MockLLM([
    { content: "X", toolCalls: [{ id: "c1", name: "echo", arguments: JSON.stringify({ text: "y" }) }] },
    { content: "done" },
  ]);
  const ctx = new MemoryContext({ tools: [tool] });
  const answers: string[] = [];
  const toolCalls: string[] = [];
  const toolResults: string[] = [];
  const agent = new BaseAgent({
    name: "t", description: "测试用", llm, tools: [tool],
    callback: {
      onAnswer: (d) => { answers.push(d); },
      onToolCall: (d) => { toolCalls.push(d); },
      onToolResult: (r) => { toolResults.push(r); },
    },
  });
  await agent.run(ctx, [newUserMessage("go")]);
  expect(answers.join("")).toContain("done");
  expect(toolCalls.join("")).toContain("y");
  expect(toolResults).toContain("echo:y");
});

test("达到 MaxIterations 抛 ErrMaxIterations", async () => {
  const tool = new EchoTool();
  const llm = new MockLLM([
    { content: "loop", toolCalls: [{ id: "c1", name: "echo", arguments: JSON.stringify({ text: "z" }) }] },
  ]);
  const ctx = new MemoryContext({ tools: [tool] });
  const agent = new BaseAgent({ name: "t", description: "测试用", llm, tools: [tool], maxIterations: 3 });
  await expect(agent.run(ctx, [newUserMessage("go")])).rejects.toBeInstanceOf(ErrMaxIterations);
});
