// MemoryContext 上下文工程能力测试，对齐 Go context/nexuscontext + memory 语义：
// 消息存储、state/shared/private KV、Artifact 完整 CRUD、往轮/当前轮产物划分、
// listShared、中断快照 snapshotSession/resume、Roadmap/getNodes/auto* 本地钩子语义。
// 全部离线可跑。
import { test, expect } from "bun:test";
import { MemoryContext } from "../src/context/memory.ts";
import { ArtifactType, type Artifact } from "../src/schema/roadmap.ts";
import { InterruptionType } from "../src/schema/interruption.ts";
import { newUserMessage } from "../src/llm/message.ts";

// ---------- 消息存储 ----------

test("消息：addMessage / loadAllMessages 顺序保留且返回副本", () => {
  const ctx = new MemoryContext({ query: "hi" });
  ctx.addMessage(newUserMessage("a"));
  ctx.addMessage(newUserMessage("b"));
  const all = ctx.loadAllMessages();
  expect(all.length).toBe(2);
  expect(all[0]?.content).toBe("a");
  expect(all[1]?.content).toBe("b");
  // 返回的是副本，外部修改不影响内部
  all.pop();
  expect(ctx.loadAllMessages().length).toBe(2);
});

test("userQuery 返回构造期 query", () => {
  expect(new MemoryContext({ query: "问题" }).userQuery()).toBe("问题");
});

// ---------- KV：state / shared / private ----------

test("state：set/get/map", () => {
  const ctx = new MemoryContext();
  ctx.set("k", 1);
  expect(ctx.get<number>("k")).toBe(1);
  expect(ctx.get("missing")).toBeUndefined();
  expect(ctx.map()).toEqual({ k: 1 });
});

test("shared：setShared/getShared/listShared", () => {
  const ctx = new MemoryContext();
  ctx.setShared("x", "v");
  ctx.setShared("y", 2);
  expect(ctx.getShared<string>("x")).toBe("v");
  expect(ctx.listShared()).toEqual({ x: "v", y: 2 });
});

test("private：setPrivate/getPrivate 与 shared 隔离", () => {
  const ctx = new MemoryContext();
  ctx.setPrivate("p", "secret");
  expect(ctx.getPrivate<string>("p")).toBe("secret");
  // private 不出现在 shared 列表
  expect(ctx.listShared()).toEqual({});
});

// ---------- Artifact 完整 CRUD ----------

const mkArt = (id: string): Artifact => ({
  id, type: ArtifactType.File, title: `t-${id}`, content: `c-${id}`,
});

test("Artifact：add/get/getArtifacts", () => {
  const ctx = new MemoryContext();
  ctx.addArtifact(mkArt("1"));
  ctx.addArtifact(mkArt("2"));
  expect(ctx.getArtifact("1")?.title).toBe("t-1");
  expect(ctx.getArtifact("nope")).toBeUndefined();
  expect(ctx.getArtifacts().map((a) => a.id).sort()).toEqual(["1", "2"]);
});

test("Artifact：updateArtifact 仅更新已存在项", () => {
  const ctx = new MemoryContext();
  ctx.addArtifact(mkArt("1"));
  ctx.updateArtifact({ id: "1", title: "new" });
  expect(ctx.getArtifact("1")?.title).toBe("new");
  // 不存在的不会被创建
  ctx.updateArtifact({ id: "ghost", title: "x" });
  expect(ctx.getArtifact("ghost")).toBeUndefined();
});

test("Artifact：deleteArtifact", () => {
  const ctx = new MemoryContext();
  ctx.addArtifact(mkArt("1"));
  ctx.deleteArtifact("1");
  expect(ctx.getArtifact("1")).toBeUndefined();
  expect(ctx.getArtifacts()).toEqual([]);
});

test("Artifact：当前轮 vs 往轮（markTurnBoundary）", () => {
  const ctx = new MemoryContext();
  ctx.addArtifact(mkArt("old"));
  // 标记边界前的产物算作「往轮」
  ctx.markTurnBoundary();
  ctx.addArtifact(mkArt("new"));
  expect(ctx.getPreTurnArtifacts().map((a) => a.id)).toEqual(["old"]);
  expect(ctx.getCurrentArtifacts().map((a) => a.id)).toEqual(["new"]);
});

// ---------- Roadmap / getNodes / auto* 本地钩子语义 ----------

test("Roadmap 本地无填充：loadRoadmap=undefined, getNodes=[]", () => {
  const ctx = new MemoryContext();
  expect(ctx.loadRoadmap()).toBeUndefined();
  expect(ctx.getNodes("any")).toEqual([]);
});

test("auto* 为本地 no-op，可安全 await 且不抛错", async () => {
  const ctx = new MemoryContext();
  await expect(ctx.autoContextEditing()).resolves.toBeUndefined();
  await expect(ctx.autoCompaction()).resolves.toBeUndefined();
});

// ---------- 中断快照 / 恢复 ----------

test("interrupt 设置 Stop 与问题文本", () => {
  const ctx = new MemoryContext();
  ctx.interrupt("继续吗？");
  const s = ctx.getInterruptionState();
  expect(s.interruptionType).toBe(InterruptionType.Stop);
  expect(s.question).toBe("继续吗？");
});

test("snapshotSession 把 state 快照进中断态", () => {
  const ctx = new MemoryContext();
  ctx.set("progress", 42);
  ctx.snapshotSession();
  expect(ctx.getInterruptionState().sessionStateSnapshot).toEqual({ progress: 42 });
});

test("resume：用外部 InterruptionState 回填并切到 Continue", () => {
  const ctx = new MemoryContext();
  ctx.resume({
    turnIds: [],
    interruptionType: InterruptionType.Stop,
    isResumed: false,
    consumed: true,
    currentNode: "nodeX",
    sessionStateSnapshot: { restored: "yes" },
  });
  const s = ctx.getInterruptionState();
  expect(s.interruptionType).toBe(InterruptionType.Continue);
  expect(s.isResumed).toBe(true);
  expect(s.consumed).toBe(false);
  expect(s.currentNode).toBe("nodeX");
  // state 被快照恢复
  expect(ctx.get<string>("restored")).toBe("yes");
});

test("resume 不传参则就地恢复本上下文已有中断态", () => {
  const ctx = new MemoryContext();
  ctx.set("v", 1);
  ctx.snapshotSession();
  ctx.resume();
  expect(ctx.getInterruptionState().interruptionType).toBe(InterruptionType.Continue);
  expect(ctx.get<number>("v")).toBe(1);
});

// ---------- 元信息 ----------

test("getInvocationId 默认生成、可注入", () => {
  expect(new MemoryContext({ invocationId: "fixed" }).getInvocationId()).toBe("fixed");
  expect(new MemoryContext().getInvocationId().length).toBeGreaterThan(0);
});

test("release 为 no-op，不抛错", () => {
  expect(() => new MemoryContext().release()).not.toThrow();
});
