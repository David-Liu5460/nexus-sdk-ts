// 示例：断点续跑（interrupt → 序列化 → 反序列化 → resume/replay）
// 场景：一个"下单 → 人工审批 → 发货"的流程。跑到审批节点时挂起，
// 把中断状态序列化(可落库/落盘/进 MQ)；之后凭这串状态在"新进程"恢复并跑完。
import { Graph } from "../src/core/graph.ts";
import { gotoNode, gotoEnd, updateState } from "../src/core/command.ts";
import { MemoryContext } from "../src/context/memory.ts";
import {
  InterruptionType,
  serializeInterruption,
  deserializeInterruption,
} from "../src/schema/interruption.ts";

// 构建流程图：submit → review(可中断) → ship
function buildGraph() {
  const g = new Graph();

  g.addNode({
    name: "submit",
    func: async (ctx) => {
      ctx.set("order", "#A1001");
      ctx.set("log", (ctx.get<string[]>("log") ?? []).concat("submit:已下单"));
      return gotoNode("review");
    },
  });

  g.addNode({
    name: "review",
    func: async (ctx) => {
      // 未审批通过 => 请求中断，等待人工介入
      if (!ctx.get<boolean>("approved")) {
        ctx.set("log", (ctx.get<string[]>("log") ?? []).concat("review:等待人工审批…"));
        ctx.interrupt("订单 #A1001 需要主管审批，请确认是否放行");
        return null; // 本节点不再往下走，引擎会在中断检查处停下
      }
      ctx.set("log", (ctx.get<string[]>("log") ?? []).concat("review:审批通过"));
      return gotoNode("ship");
    },
  });

  g.addNode({
    name: "ship",
    func: async (ctx) => {
      ctx.set("log", (ctx.get<string[]>("log") ?? []).concat("ship:已发货"));
      return gotoEnd();
    },
  });

  g.setEntryPoint("submit");
  return g;
}

async function main() {
  // ===== 进程 A：首次执行，跑到 review 中断 =====
  console.log("=== 进程 A：首次执行 ===");
  const ctxA = new MemoryContext({ query: "下单并发货" });
  await buildGraph().compile().invoke(ctxA);

  const itA = ctxA.getInterruptionState();
  console.log("流转日志:", ctxA.get<string[]>("log"));
  console.log("中断类型:", itA.interruptionType, "| 停在节点:", itA.currentNode);
  console.log("待办问题:", itA.question);

  if (itA.interruptionType !== InterruptionType.Stop) {
    console.log("未触发中断，示例结束");
    return;
  }

  // 把中断状态序列化（真实场景：写 DB / Redis / MQ，等待人工审批回调）
  const blob = serializeInterruption(itA);
  console.log("\n--- 序列化中断态(可持久化) ---\n", blob);

  // ===== 进程 B：人工审批通过后，凭序列化串恢复并续跑 =====
  console.log("\n=== 进程 B：恢复并续跑 ===");
  const restored = deserializeInterruption(blob);
  // 人工审批结果写回快照，重放时 review 节点据此放行
  restored.sessionStateSnapshot = { ...restored.sessionStateSnapshot, approved: true };

  const ctxB = new MemoryContext();
  ctxB.resume(restored);           // 回填快照 + 标记 isResumed + 切 Continue
  console.log("恢复后 isResumed:", ctxB.getInterruptionState().isResumed);

  // invoke 检测到 resumed => 从中断节点 review 重放，而非从 submit 重新开始
  await buildGraph().compile().invoke(ctxB);

  console.log("续跑后流转日志:", ctxB.get<string[]>("log"));
  console.log("最终状态:", ctxB.getInterruptionState().interruptionType);
  console.log("\n注意: 续跑日志不含 submit —— 证明是从 review 重放，而非重头执行。");
}

main().catch((e) => { console.error(e); process.exit(1); });
