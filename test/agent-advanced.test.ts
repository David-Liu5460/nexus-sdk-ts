// BaseAgent 增强能力测试：askUser/HITL 中断+续跑、instruction 注入、
// Feedback 纠错链、filterMemory 裁剪。全部用 MockLLM，离线可跑。
import { test, expect } from "bun:test";
import { BaseAgent } from "../src/agent/base.ts";
import { MemoryContext } from "../src/context/memory.ts";
import { MockLLM } from "../src/llm/mock.ts";
import { AbstractTool } from "../src/tool/tool.ts";
import { AskUserTool, ASK_USER_TOOL_NAME } from "../src/tool/askuser.ts";
import { JSONFeedback, FuncFeedback } from "../src/feedback/feedback.ts";
import type { Context } from "../src/context/context.ts";
import { newUserMessage } from "../src/llm/message.ts";
import { InterruptionType } from "../src/schema/interruption.ts";

class EchoTool extends AbstractTool {
  name() { return "echo"; }
  description() { return "原样返回输入"; }
  async call(_ctx: Context, args: string) {
    const { text } = JSON.parse(args) as { text: string };
    return `echo:${text}`;
  }
}

// ---------- askUser / HITL ----------

test("askUser：调用后 Agent 挂起为 Stop 并快照状态", async () => {
  const ask = new AskUserTool();
  const llm = new MockLLM([
    { content: "我需要更多信息", toolCalls: [{ id: "a1", name: ASK_USER_TOOL_NAME, arguments: JSON.stringify({ question: "你叫什么名字?" }) }] },
    { content: "你好，小明" },
  ]);
  const ctx = new MemoryContext({ tools: [ask] });
  ctx.set("draft", "wip"); // 用于验证快照
  const agent = new BaseAgent({ name: "t", description: "测试用", llm, askUserTool: ask });

  await agent.run(ctx, [newUserMessage("帮我打个招呼")]);

  const it = ctx.getInterruptionState();
  expect(it.interruptionType).toBe(InterruptionType.Stop);
  expect(it.question).toBe("你叫什么名字?");
  expect(it.currentNode).toBe("t");
  expect(it.sessionStateSnapshot?.draft).toBe("wip");
});

test("askUser → resume：喂入用户回答后从中断点续跑到最终答案", async () => {
  const ask = new AskUserTool();
  const llm = new MockLLM([
    { content: "提问", toolCalls: [{ id: "a1", name: ASK_USER_TOOL_NAME, arguments: JSON.stringify({ question: "你叫什么名字?" }) }] },
    { content: "你好，小明！" },
  ]);
  const ctx = new MemoryContext({ tools: [ask] });
  const agent = new BaseAgent({ name: "t", description: "测试用", llm, askUserTool: ask });

  await agent.run(ctx, [newUserMessage("帮我打个招呼")]);
  expect(ctx.getInterruptionState().interruptionType).toBe(InterruptionType.Stop);

  const resp = await agent.resume(ctx, "我叫小明");

  expect(resp.message.content).toBe("你好，小明！");
  expect(ctx.getInterruptionState().interruptionType).toBe(InterruptionType.None);
  const roles = ctx.loadAllMessages().map((m) => m.role);
  // user(原问题) → assistant(askUser调用) → tool(占位) → user(回答) → assistant(最终)
  expect(roles).toEqual(["user", "assistant", "tool", "user", "assistant"]);
});

// ---------- instruction 注入 ----------

test("instruction：preHook 把系统指令作为首条 system 消息且仅注入一次", async () => {
  const llm = new MockLLM([{ content: "ok1" }, { content: "ok2" }]);
  const ctx = new MemoryContext();
  const agent = new BaseAgent({ name: "t", description: "测试用", llm, instruction: "你是测试助手" });

  await agent.run(ctx, [newUserMessage("一")]);
  await agent.run(ctx, [newUserMessage("二")]); // 第二轮不应重复注入

  const systems = ctx.loadAllMessages().filter((m) => m.role === "system");
  expect(systems.length).toBe(1);
  expect(systems[0]!.content).toBe("你是测试助手");
  expect(ctx.loadAllMessages()[0]!.role).toBe("system");
});

// ---------- Feedback 纠错链 ----------

test("Feedback：非法 JSON 触发一次重试，第二轮通过", async () => {
  const llm = new MockLLM([
    { content: "not json" },           // 第一轮：JSONFeedback 不通过
    { content: '{"ok":true}' },        // 第二轮：通过
  ]);
  const ctx = new MemoryContext();
  const agent = new BaseAgent({ name: "t", description: "测试用", llm, feedbacks: [new JSONFeedback()] });

  const resp = await agent.run(ctx, [newUserMessage("给我 JSON")]);

  expect(resp.message.content).toBe('{"ok":true}');
  // 回写了一条纠正用的 user 消息
  const users = ctx.loadAllMessages().filter((m) => m.role === "user");
  expect(users.length).toBe(2);
});

test("Feedback：超过最大重试次数后返回最后一次产出", async () => {
  const llm = new MockLLM([{ content: "always-bad" }]);
  const ctx = new MemoryContext();
  const agent = new BaseAgent({
    name: "t", description: "测试用", llm,
    feedbacks: [new FuncFeedback(() => ({ pass: false, prompt: "再来" }))],
    maxFeedbackRetries: 2,
  });

  const resp = await agent.run(ctx, [newUserMessage("go")]);
  expect(resp.message.content).toBe("always-bad");
  expect(ctx.get<number>("__feedback_retries__")).toBe(3);
});

// ---------- filterMemory 裁剪 ----------

test("filterMemory：Plan 前裁剪历史，只保留最近 N 条", async () => {
  let seenLen = -1;
  const llm = new MockLLM([{ content: "done" }]);
  const ctx = new MemoryContext();
  // 预置若干历史
  for (let i = 0; i < 5; i++) ctx.addMessage(newUserMessage(`old-${i}`));

  const agent = new BaseAgent({
    name: "t", description: "测试用", llm,
    filterMemory: (msgs) => {
      const kept = msgs.slice(-2);
      seenLen = kept.length;
      return kept;
    },
  });

  await agent.run(ctx, [newUserMessage("new")]);
  // filterMemory 收到 6 条(5 旧 + 1 新)，裁成 2 条喂给 LLM
  expect(seenLen).toBe(2);
  // 但上下文本身不被裁剪
  expect(ctx.loadAllMessages().length).toBeGreaterThanOrEqual(6);
});
