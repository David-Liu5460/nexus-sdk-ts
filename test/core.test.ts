import { test, expect, describe } from "bun:test";
import { Graph } from "../src/core/graph.ts";
import { gotoNode, gotoEnd, updateState } from "../src/core/command.ts";
import { MemoryContext } from "../src/context/memory.ts";

describe("DAG core engine", () => {
  test("线性流转 + 状态更新", async () => {
    const g = new Graph();
    g.addNode({ name: "a", func: async () => updateState({ visited: ["a"] }) });
    g.addNode({
      name: "b",
      func: async (ctx) => {
        const v = (ctx.get<string[]>("visited") ?? []).concat("b");
        return updateState({ visited: v });
      },
    });
    g.addEdge("a", "b");
    g.setEntryPoint("a");

    const ctx = new MemoryContext();
    await g.compile().invoke(ctx);
    expect(ctx.get<string[]>("visited")).toEqual(["a", "b"]);
  });

  test("Command.goto 优先于静态边", async () => {
    const g = new Graph();
    g.addNode({ name: "start", func: async () => gotoNode("c") });
    g.addNode({ name: "b", func: async (ctx) => { ctx.set("hitB", true); return gotoEnd(); } });
    g.addNode({ name: "c", func: async (ctx) => { ctx.set("hitC", true); return gotoEnd(); } });
    g.addEdge("start", "b"); // 静态边指向 b，但 goto 指向 c
    g.setEntryPoint("start");

    const ctx = new MemoryContext();
    await g.compile().invoke(ctx);
    expect(ctx.get<boolean>("hitC")).toBe(true);
    expect(ctx.get<boolean>("hitB")).toBeUndefined();
  });

  test("条件边路由", async () => {
    const g = new Graph();
    g.addNode({ name: "router", func: async () => null });
    g.addNode({ name: "left", func: async (ctx) => { ctx.set("branch", "left"); return gotoEnd(); } });
    g.addNode({ name: "right", func: async (ctx) => { ctx.set("branch", "right"); return gotoEnd(); } });
    g.addConditionalEdge("router", () => "right");
    g.setEntryPoint("router");

    const ctx = new MemoryContext();
    await g.compile().invoke(ctx);
    expect(ctx.get<string>("branch")).toBe("right");
  });

  test("节点重试：前两次抛错，第三次成功", async () => {
    let attempts = 0;
    const g = new Graph();
    g.addNode({
      name: "flaky",
      config: { maxRetries: 2, retryDelayMs: 1 },
      func: async (ctx) => {
        attempts++;
        if (attempts < 3) throw new Error("transient");
        ctx.set("ok", true);
        return gotoEnd();
      },
    });
    g.setEntryPoint("flaky");

    const ctx = new MemoryContext();
    await g.compile().invoke(ctx);
    expect(attempts).toBe(3);
    expect(ctx.get<boolean>("ok")).toBe(true);
  });

  test("skipOnError：出错不中断流程", async () => {
    const g = new Graph();
    g.addNode({
      name: "boom",
      config: { skipOnError: true },
      func: async () => { throw new Error("ignored"); },
    });
    g.setEntryPoint("boom");
    const ctx = new MemoryContext();
    await expect(g.compile().invoke(ctx)).resolves.toBeUndefined();
  });
});
