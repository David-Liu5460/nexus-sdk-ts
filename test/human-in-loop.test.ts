// 节点级 HITL(HumanInLoopNode)测试:首问中断、resume 续跑、多轮追问、参数校验。
// 全程离线,基于 Graph + MemoryContext 的中断/快照/恢复机制。
import { test, expect, describe } from "bun:test";
import { Graph } from "../src/core/graph.ts";
import { gotoNode, gotoEnd } from "../src/core/command.ts";
import { MemoryContext } from "../src/context/memory.ts";
import { InterruptionType, type InterruptionState } from "../src/schema/interruption.ts";
import { newHumanInLoopNode } from "../src/node/human-in-loop.ts";

// 构造一个"计划 -> 审批(HIL) -> 执行/驳回"的审批图。
// resumeFunc 语义:
//   yes  => 通过,路由到 execute
//   no   => 驳回,路由到 reject
//   其他 => 多轮追问(interrupt=true)
function buildApprovalGraph(name = "approve") {
  const g = new Graph();
  g.addNode({
    name: "plan",
    func: async (ctx) => { ctx.set("plan", "上线方案"); return gotoNode(name); },
  });
  g.addNode(
    newHumanInLoopNode({
      name,
      askFunc: (ctx) => `是否批准【${ctx.get<string>("plan")}】? (yes/no)`,
      resumeFunc: (_ctx, input) => {
        const v = input.trim().toLowerCase();
        if (v === "yes") return { interrupt: false, next: gotoNode("execute") };
        if (v === "no") return { interrupt: false, next: gotoNode("reject") };
        return { interrupt: true, question: "请明确回答 yes 或 no" };
      },
    }),
  );
  g.addNode({ name: "execute", func: async (ctx) => { ctx.set("result", "executed"); return gotoEnd(); } });
  g.addNode({ name: "reject", func: async (ctx) => { ctx.set("result", "rejected"); return gotoEnd(); } });
  g.setEntryPoint("plan");
  return g;
}

// 用一份已保存的中断态 + 新回答构造续跑上下文(模拟真实 HITL 恢复:新 invoke 携带用户回答)
function resumeWith(saved: InterruptionState, answer: string): MemoryContext {
  const ctx = new MemoryContext({ query: answer });
  ctx.resume(structuredClone(saved));
  return ctx;
}

describe("HumanInLoopNode 节点级人机交互", () => {
  test("首次进入 => 发问并以 Stop 中断,停在 HIL 节点", async () => {
    const ctx = new MemoryContext();
    await buildApprovalGraph().compile().invoke(ctx);

    const it = ctx.getInterruptionState();
    expect(it.interruptionType).toBe(InterruptionType.Stop);
    expect(it.currentNode).toBe("approve");
    expect(it.question).toContain("是否批准");
    // 发问内容作为 assistant 消息落库
    const last = ctx.loadAllMessages().at(-1);
    expect(last?.role).toBe("assistant");
    expect(last?.name).toBe("approve");
    // pending 标记已随快照持久化
    expect((it.sessionStateSnapshot as any)["__hil_pending__:approve"]).toBe(true);
    // 尚未执行下游
    expect(ctx.get("result")).toBeUndefined();
  });

  test("resume 回答 yes => 路由到 execute", async () => {
    const ctxA = new MemoryContext();
    await buildApprovalGraph().compile().invoke(ctxA);

    const ctxB = resumeWith(ctxA.getInterruptionState(), "yes");
    await buildApprovalGraph().compile().invoke(ctxB);

    expect(ctxB.get<string>("result")).toBe("executed");
    // 续跑结束,无残留 Stop
    expect(ctxB.getInterruptionState().interruptionType).not.toBe(InterruptionType.Stop);
    // pending 已清除
    expect(ctxB.get<boolean>("__hil_pending__:approve")).toBe(false);
  });

  test("resume 回答 no => 路由到 reject", async () => {
    const ctxA = new MemoryContext();
    await buildApprovalGraph().compile().invoke(ctxA);

    const ctxB = resumeWith(ctxA.getInterruptionState(), "no");
    await buildApprovalGraph().compile().invoke(ctxB);

    expect(ctxB.get<string>("result")).toBe("rejected");
  });

  test("多轮追问:回答无法识别 => 再次 Stop 并给出新问题", async () => {
    const ctxA = new MemoryContext();
    await buildApprovalGraph().compile().invoke(ctxA);

    // 第一次回答 "maybe" => resumeFunc 触发 interrupt=true 再次反问
    const ctxB = resumeWith(ctxA.getInterruptionState(), "maybe");
    await buildApprovalGraph().compile().invoke(ctxB);

    const it = ctxB.getInterruptionState();
    expect(it.interruptionType).toBe(InterruptionType.Stop);
    expect(it.question).toBe("请明确回答 yes 或 no");
    expect(ctxB.get("result")).toBeUndefined();
    // pending 仍保持,等待下一轮回答
    expect((it.sessionStateSnapshot as any)["__hil_pending__:approve"]).toBe(true);

    // 第二轮回答 yes => 正常通过
    const ctxC = resumeWith(it, "yes");
    await buildApprovalGraph().compile().invoke(ctxC);
    expect(ctxC.get<string>("result")).toBe("executed");
  });

  test("参数校验:缺 askFunc / resumeFunc 抛错", () => {
    expect(() => newHumanInLoopNode({ resumeFunc: () => ({ interrupt: false }) } as any))
      .toThrow("humanInLoop askFunc is required");
    expect(() => newHumanInLoopNode({ askFunc: () => "q" } as any))
      .toThrow("humanInLoop resumeFunc is required");
  });
});
