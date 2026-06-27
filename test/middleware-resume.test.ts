// Middleware 优先级 + 中断恢复(resume/replay) 测试
import { test, expect, describe } from "bun:test";
import { Graph } from "../src/core/graph.ts";
import { gotoNode, gotoEnd, updateState } from "../src/core/command.ts";
import { MemoryContext } from "../src/context/memory.ts";
import {
  InterruptionType,
  serializeInterruption,
  deserializeInterruption,
} from "../src/schema/interruption.ts";

describe("Middleware 流转优先级", () => {
  test("middleware 返回非空路由 => 覆盖 Command.goto", async () => {
    const g = new Graph();
    g.addNode({ name: "start", func: async () => gotoNode("b") }); // goto 指向 b
    g.addNode({ name: "b", func: async (ctx) => { ctx.set("hit", "b"); return gotoEnd(); } });
    g.addNode({ name: "c", func: async (ctx) => { ctx.set("hit", "c"); return gotoEnd(); } });
    // 中间件强制把 start 的下一跳改成 c，优先级高于 goto
    g.useMiddleware((name) => (name === "start" ? ["c"] : undefined));
    g.setEntryPoint("start");

    const ctx = new MemoryContext();
    await g.compile().invoke(ctx);
    expect(ctx.get<string>("hit")).toBe("c");
  });

  test("middleware 返回 undefined => 下沉到常规优先级(goto)", async () => {
    const g = new Graph();
    g.addNode({ name: "start", func: async () => gotoNode("real") });
    g.addNode({ name: "real", func: async (ctx) => { ctx.set("hit", "real"); return gotoEnd(); } });
    g.useMiddleware(() => undefined); // 不拦截
    g.setEntryPoint("start");

    const ctx = new MemoryContext();
    await g.compile().invoke(ctx);
    expect(ctx.get<string>("hit")).toBe("real");
  });

  test("多个 middleware 按注册顺序短路：第一个命中的胜出", async () => {
    const order: string[] = [];
    const g = new Graph();
    g.addNode({ name: "n", func: async (ctx) => { ctx.set("hit", "n"); return gotoEnd(); } });
    g.addNode({ name: "x", func: async (ctx) => { ctx.set("hit", "x"); return gotoEnd(); } });
    g.addNode({ name: "y", func: async (ctx) => { ctx.set("hit", "y"); return gotoEnd(); } });
    // 仅在解析节点 "n" 时记录，专注验证 n 这一跳的短路行为
    g.useMiddleware((name) => { if (name === "n") order.push("mw1"); return name === "n" ? ["x"] : undefined; });
    g.useMiddleware((name) => { if (name === "n") order.push("mw2"); return name === "n" ? ["y"] : undefined; });
    g.setEntryPoint("n");

    const ctx = new MemoryContext();
    await g.compile().invoke(ctx);
    expect(ctx.get<string>("hit")).toBe("x");        // mw1 先命中，路由到 x
    expect(order).toEqual(["mw1"]);          // 解析 n 时 mw1 短路，mw2 未执行
  });
});

// 构造一个会在第 N 次进入 "work" 节点时请求中断的图
function buildInterruptibleGraph() {
  const g = new Graph();
  g.addNode({
    name: "work",
    func: async (ctx) => {
      const count = (ctx.get<number>("count") ?? 0) + 1;
      ctx.set("count", count);
      ctx.set("steps", (ctx.get<string[]>("steps") ?? []).concat(`work#${count}`));
      if (count === 2) ctx.interrupt("需要人工确认");  // 第二次进入时中断
      return gotoNode("work"); // 自循环
    },
  });
  g.setEntryPoint("work");
  return g;
}

describe("中断恢复 resume/replay", () => {
  test("Stop 中断后停在中断节点，并写入快照", async () => {
    const ctx = new MemoryContext();
    await buildInterruptibleGraph().compile().invoke(ctx);

    const it = ctx.getInterruptionState();
    expect(it.interruptionType).toBe(InterruptionType.Stop);
    expect(it.currentNode).toBe("work");
    expect(it.question).toBe("需要人工确认");
    expect(it.sessionStateSnapshot).toBeDefined();
    expect((it.sessionStateSnapshot as any).count).toBe(2);
    // 只跑到第二次就停了，没有第三次
    expect(ctx.get<string[]>("steps")).toEqual(["work#1", "work#2"]);
  });

  test("同进程 resume：从中断节点重放，继续推进", async () => {
    const ctx = new MemoryContext();
    const app = buildInterruptibleGraph().compile();
    await app.invoke(ctx);
    expect(ctx.getInterruptionState().interruptionType).toBe(InterruptionType.Stop);

    // 人工确认后恢复：清掉"第二次就中断"的条件(把 count 抬高)，再 resume 重放
    ctx.set("count", 5);
    ctx.resume();
    const it = ctx.getInterruptionState();
    expect(it.isResumed).toBe(true);
    expect(it.interruptionType).toBe(InterruptionType.Continue);

    // 重放：因为 count 已 >2，不会再触发中断；用 maxSteps 限制自循环避免无限跑
    await app.invoke(ctx, { maxSteps: 3 }).catch((e) => {
      expect(String(e)).toContain("exceeded max steps"); // 自循环到上限正常
    });
    // 重放确实从 work 继续推进了（count 增长）
    expect(ctx.get<number>("count")!).toBeGreaterThan(5);
  });

  test("跨进程 resume：序列化中断态 -> 反序列化 -> 新上下文重放", async () => {
    // 进程 A：跑到中断
    const ctxA = new MemoryContext();
    await buildInterruptibleGraph().compile().invoke(ctxA);
    const blob = serializeInterruption(ctxA.getInterruptionState());

    // 进程 B：全新上下文，仅凭序列化串恢复
    const restored = deserializeInterruption(blob);
    expect(restored.currentNode).toBe("work");
    expect((restored.sessionStateSnapshot as any).count).toBe(2);

    const ctxB = new MemoryContext();
    // 抬高 count 让重放不再中断
    restored.sessionStateSnapshot = { ...restored.sessionStateSnapshot, count: 9 };
    ctxB.resume(restored);

    expect(ctxB.get<number>("count")).toBe(9);          // 快照已回填
    expect(ctxB.getInterruptionState().isResumed).toBe(true);

    const appB = buildInterruptibleGraph().compile();
    await appB.invoke(ctxB, { maxSteps: 2 }).catch(() => { /* 自循环到上限 */ });
    expect(ctxB.get<number>("count")!).toBeGreaterThan(9); // 从快照基础上继续推进
  });

  test("resume 后从指定节点开始，而非图入口", async () => {
    const visited: string[] = [];
    const g = new Graph();
    g.addNode({ name: "entry", func: async () => { visited.push("entry"); return gotoNode("mid"); } });
    g.addNode({ name: "mid", func: async () => { visited.push("mid"); return gotoNode("tail"); } });
    g.addNode({ name: "tail", func: async () => { visited.push("tail"); return gotoEnd(); } });
    g.setEntryPoint("entry");
    const app = g.compile();

    const ctx = new MemoryContext();
    // 手工构造一个"停在 mid"的中断态并 resume
    ctx.interrupt("pause");
    ctx.setInterruptionNode("mid");
    ctx.snapshotSession();
    ctx.resume();

    await app.invoke(ctx);
    // 应从 mid 开始重放：不应再次执行 entry
    expect(visited).toEqual(["mid", "tail"]);
  });
});
