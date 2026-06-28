// 示例:节点级 Human-in-Loop(HumanInLoopNode)审批图
// 场景:一个"生成方案 -> 人工审批 -> 执行/驳回"的确定性审批流。
// 审批卡点是图里的固定节点(而非由 LLM 决定),首次进入即发问并中断;
// 拿到回答后用同一份中断态 + 新 query 续跑,resumeFunc 决定通过/驳回/再追问。
//
// 运行:bun run examples/hil-node.ts
import { Graph } from "../src/core/graph.ts";
import { gotoNode, gotoEnd } from "../src/core/command.ts";
import { MemoryContext } from "../src/context/memory.ts";
import { InterruptionType, type InterruptionState } from "../src/schema/interruption.ts";
import { newHumanInLoopNode } from "../src/node/human-in-loop.ts";

function buildGraph() {
  const g = new Graph();
  g.addNode({ name: "plan", func: async (ctx) => { ctx.set("plan", "把服务扩容到 10 个实例"); return gotoNode("approve"); } });
  g.addNode(
    newHumanInLoopNode({
      name: "approve",
      askFunc: (ctx) => `是否批准【${ctx.get<string>("plan")}】? 请回答 yes / no`,
      resumeFunc: (_ctx, input) => {
        const v = input.trim().toLowerCase();
        if (v === "yes") return { interrupt: false, next: gotoNode("execute") };
        if (v === "no") return { interrupt: false, next: gotoNode("reject") };
        return { interrupt: true, question: "无法识别,请明确回答 yes 或 no" };
      },
    }),
  );
  g.addNode({ name: "execute", func: async (ctx) => { ctx.set("result", "✅ 已执行扩容"); return gotoEnd(); } });
  g.addNode({ name: "reject", func: async (ctx) => { ctx.set("result", "🚫 已驳回"); return gotoEnd(); } });
  g.setEntryPoint("plan");
  return g;
}

// 模拟一次"恢复":携带用户回答的新上下文 + 回填中断态
function resumeWith(saved: InterruptionState, answer: string): MemoryContext {
  const ctx = new MemoryContext({ query: answer });
  ctx.resume(structuredClone(saved));
  return ctx;
}

async function main() {
  // 1) 首跑:走到审批节点 => 发问并中断
  const ctx = new MemoryContext();
  await buildGraph().compile().invoke(ctx);
  let it = ctx.getInterruptionState();
  console.log("[中断] 类型 =", it.interruptionType, "| 停在节点 =", it.currentNode);
  console.log("[提问]", it.question);

  // 2) 用户先回个含糊答案 "maybe" => 触发多轮追问
  console.log("\n>> 用户回答: maybe");
  const ctx2 = resumeWith(it, "maybe");
  await buildGraph().compile().invoke(ctx2);
  it = ctx2.getInterruptionState();
  console.log("[再次中断]", it.interruptionType, "| 追问:", it.question);

  // 3) 用户回答 "yes" => 审批通过,继续执行下游
  console.log("\n>> 用户回答: yes");
  const ctx3 = resumeWith(it, "yes");
  await buildGraph().compile().invoke(ctx3);
  console.log("[完成] 中断类型 =", ctx3.getInterruptionState().interruptionType);
  console.log("[结果]", ctx3.get<string>("result"));
}

main().catch((e) => { console.error(e); process.exit(1); });
