// 对应 Go: context/memory/memory.go + context/nexuscontext/nexuscontext.go
// —— 纯内存参考实现（迁移起点）。
//
// 说明:Go 侧 memory.go 是「空壳」实现(多数方法 no-op),nexuscontext.go 是
// 真实的 KV/Artifact 实现。TS 这里把两者合并为单一 MemoryContext:
//   * KV(state/shared/private)、Artifact CRUD —— 对齐 nexuscontext 真实语义
//   * Roadmap / getNodes / auto* —— 对齐 memory 空壳语义(本地无远端填充)
import type { Context } from "./context.ts";
import type { Artifact } from "../schema/roadmap.ts";
import type { Roadmap, NodeIndex } from "../schema/roadmap.ts";
import type { ChatCompletionMessage } from "../schema/chat.ts";
import { InterruptionType, type InterruptionState } from "../schema/interruption.ts";
import type { BaseTool } from "../tool/tool.ts";

export interface MemoryContextOptions {
  invocationId?: string;
  query?: string;
  tools?: BaseTool[];
}

export class MemoryContext implements Context {
  private messages: ChatCompletionMessage[] = [];
  private state = new Map<string, unknown>();
  private shared = new Map<string, unknown>();
  private priv = new Map<string, unknown>();
  private artifacts = new Map<string, Artifact>();
  // 上一轮(及更早)已沉淀的产物 ID;当前轮新增的不在此集合内。
  private preTurnArtifactIds = new Set<string>();
  private tools: BaseTool[];
  private invocationId: string;
  private query: string;
  private interruption: InterruptionState = {
    turnIds: [],
    interruptionType: InterruptionType.None,
    isResumed: false,
    consumed: false,
  };

  constructor(opts: MemoryContextOptions = {}) {
    this.invocationId = opts.invocationId ?? crypto.randomUUID();
    this.query = opts.query ?? "";
    this.tools = opts.tools ?? [];
  }

  // ---- 消息存储 ----
  addMessage(msg: ChatCompletionMessage): void { this.messages.push(msg); }
  loadAllMessages(): ChatCompletionMessage[] { return [...this.messages]; }
  userQuery(): string { return this.query; }

  // ---- Roadmap 三层索引（本地无远端填充，对齐 Go memory 空壳）----
  // 本地参考实现不维护 Roadmap;真实三层索引在远端 OceanAI 填充。
  loadRoadmap(): Roadmap | undefined { return undefined; }
  // 无 Roadmap 时不存在节点索引,返回空列表。
  getNodes(_name: string): NodeIndex[] { return []; }
  // 上下文裁剪钩子:真实裁剪发生在远端,本地为 no-op。
  async autoContextEditing(): Promise<void> { /* remote-only, no-op locally */ }
  // 历史压缩钩子:真实摘要发生在远端 OceanAI,本地为 no-op。
  async autoCompaction(): Promise<void> { /* remote-only, no-op locally */ }

  // ---- 状态管理 ----
  set(k: string, v: unknown): void { this.state.set(k, v); }
  get<T = unknown>(k: string): T | undefined { return this.state.get(k) as T | undefined; }
  map(): Record<string, unknown> { return Object.fromEntries(this.state); }
  setShared(k: string, v: unknown): void { this.shared.set(k, v); }
  getShared<T = unknown>(k: string): T | undefined { return this.shared.get(k) as T | undefined; }
  listShared(): Record<string, unknown> { return Object.fromEntries(this.shared); }
  setPrivate(k: string, v: unknown): void { this.priv.set(k, v); }
  getPrivate<T = unknown>(k: string): T | undefined { return this.priv.get(k) as T | undefined; }

  // ---- 产物 Artifact（完整 CRUD，对齐 Go nexuscontext）----
  addArtifact(a: Artifact): void { this.artifacts.set(a.id, a); }
  getArtifact(id: string): Artifact | undefined { return this.artifacts.get(id); }
  getArtifacts(): Artifact[] { return [...this.artifacts.values()]; }
  updateArtifact(a: Artifact): void {
    // 仅更新已存在的产物(对齐 Go UpdateArtifact 按 ArtifactId 定位)。
    if (this.artifacts.has(a.id)) this.artifacts.set(a.id, a);
  }
  deleteArtifact(id: string): void {
    this.artifacts.delete(id);
    this.preTurnArtifactIds.delete(id);
  }
  // 当前轮产物:不在「往轮」集合中的部分。
  getCurrentArtifacts(): Artifact[] {
    return [...this.artifacts.values()].filter((a) => !this.preTurnArtifactIds.has(a.id));
  }
  // 往轮产物:已沉淀到上一轮及更早的部分。
  getPreTurnArtifacts(): Artifact[] {
    return [...this.artifacts.values()].filter((a) => this.preTurnArtifactIds.has(a.id));
  }
  // 把当前轮产物标记为「往轮」(供续跑/多轮场景区分新旧产物)。
  markTurnBoundary(): void {
    for (const id of this.artifacts.keys()) this.preTurnArtifactIds.add(id);
  }

  // ---- 工具 ----
  getTools(): BaseTool[] { return this.tools; }

  // ---- 中断 ----
  getInterruptionState(): InterruptionState { return this.interruption; }
  interrupt(question: string): void {
    this.interruption.question = question;
    this.interruption.interruptionType = InterruptionType.Stop;
  }
  setInterruptionNode(node: string): void { this.interruption.currentNode = node; }

  // 把当前 state map 快照进中断状态,供跨进程序列化与续跑重放。
  snapshotSession(): void {
    this.interruption.sessionStateSnapshot = Object.fromEntries(this.state);
  }

  // 用外部 InterruptionState 回填本上下文:恢复 state 快照、标记 resumed、
  // 切到 Continue 让引擎从 currentNode 重放;不传 state 则就地恢复本上下文已有的中断态。
  resume(state?: InterruptionState): void {
    const s = state ?? this.interruption;
    if (s.sessionStateSnapshot) {
      this.state = new Map(Object.entries(s.sessionStateSnapshot));
    }
    this.interruption = {
      ...s,
      interruptionType: InterruptionType.Continue,
      isResumed: true,
      consumed: false,
    };
  }

  // ---- 元信息 ----
  getInvocationId(): string { return this.invocationId; }
  release(): void { /* no-op for in-memory */ }
}
