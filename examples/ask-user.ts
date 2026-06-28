// 示例：Human-in-the-Loop（askUser 中断 → 拿到用户回答 → resume 续跑）
// 场景：助手在回答前需要先问用户一个关键问题；调用 ask_user 工具后挂起，
// 主程序拿到问题、模拟用户输入答案，再 agent.resume(answer) 继续把任务跑完。
//
// 运行：bun run examples/ask-user.ts
import { BaseAgent } from "../src/agent/base.ts";
import { MemoryContext } from "../src/context/memory.ts";
import { MockLLM } from "../src/llm/mock.ts";
import { AskUserTool, ASK_USER_TOOL_NAME } from "../src/tool/askuser.ts";
import { newUserMessage } from "../src/llm/message.ts";
import { InterruptionType } from "../src/schema/interruption.ts";

async function main() {
  const ask = new AskUserTool();

  // 脚本化 LLM：第一轮调用 ask_user 工具发问；resume 之后第二轮给出最终答案
  const llm = new MockLLM([
    {
      content: "为了给你推荐合适的城市，我需要先了解你的偏好。",
      toolCalls: [
        { id: "ask-1", name: ASK_USER_TOOL_NAME, arguments: JSON.stringify({ question: "你更喜欢海边还是山区?" }) },
      ],
    },
    { content: "根据你的偏好，推荐你去三亚——典型的海边度假城市。" },
  ]);

  const ctx = new MemoryContext({ tools: [ask] });
  const agent = new BaseAgent({
    name: "travel-agent",
    description: "旅行推荐助手",
    instruction: "你是一个旅行推荐助手，信息不足时先用 ask_user 工具向用户提问。",
    llm,
    askUserTool: ask,
    callback: {
      onAnswer: (d) => { process.stdout.write(d); },
    },
  });

  console.log("=== 第一阶段：运行直到挂起 ===");
  await agent.run(ctx, [newUserMessage("帮我推荐一个旅游城市")]);

  const it = ctx.getInterruptionState();
  if (it.interruptionType !== InterruptionType.Stop) {
    console.log("\n[未触发中断，流程已直接结束]");
    return;
  }
  console.log(`\n[已挂起] Agent 向用户提问：${it.question}`);
  console.log(`[已快照] 当前状态键：${Object.keys(it.sessionStateSnapshot ?? {}).join(", ") || "(空)"}`);

  // 模拟：从前端/IM 拿到用户的真实回答
  const userAnswer = "我喜欢海边";
  console.log(`\n=== 第二阶段：用户回答「${userAnswer}」后续跑 ===`);
  const resp = await agent.resume(ctx, userAnswer);

  console.log(`\n\n[最终答案] ${resp.message.content}`);
  console.log(`[中断状态] ${ctx.getInterruptionState().interruptionType}`);
  console.log(`[消息轨迹] ${ctx.loadAllMessages().map((m) => m.role).join(" → ")}`);
}

main().catch((e) => {
  console.error("示例运行失败：", e);
  process.exit(1);
});
