// 对应 Go: schema/context.go —— 核心 Context 接口（多智能体协作中枢）
//
// 设计说明：Go 里有两个上下文——stdlib `ctx`（取消/超时/trace 控制信号）
// 与框架 `nexusCtx`（消息/Roadmap/工具/状态/中断/产物 的业务数据中枢）。
// TS 中取消信号交给原生 AbortController/AbortSignal，故只保留一个 Context，
// 它等价于 Go 的 nexusCtx。
import type { ChatCompletionMessage } from "../schema/chat.ts";
import type { InterruptionState } from "../schema/interruption.ts";
import type { Roadmap, NodeIndex, Artifact } from "../schema/roadmap.ts";
import type { BaseTool } from "../tool/tool.ts";

// 重新导出完整 Artifact（含 ArtifactType 等），保持 context.* 旧引用可用。
export type { Artifact } from "../schema/roadmap.ts";
export { ArtifactType } from "../schema/roadmap.ts";

export interface Context {
  // ---- 消息存储 ----
  addMessage(msg: ChatCompletionMessage): void;
  loadAllMessages(): ChatCompletionMessage[];
  userQuery(): string;

  // ---- Roadmap 三层上下文索引 ----
  // loadRoadmap：返回三层 Roadmap 快照；本地参考实现无远端填充时返回 undefined。
  loadRoadmap(): Roadmap | undefined;
  // getNodes：按 Agent 名取该 Agent 在 Roadmap 中的节点索引列表。
  getNodes(name: string): NodeIndex[];
  // autoContextEditing：工具调用后触发的上下文裁剪钩子（真实裁剪在远端）。
  autoContextEditing(): Promise<void>;
  // autoCompaction：Agent 运行后触发的历史压缩钩子（真实摘要在远端 OceanAI）。
  autoCompaction(): Promise<void>;

  // ---- 状态管理 ----
  set(key: string, value: unknown): void;
  get<T = unknown>(key: string): T | undefined;
  map(): Record<string, unknown>;
  setShared(key: string, value: unknown): void;
  getShared<T = unknown>(key: string): T | undefined;
  // listShared：列出全部共享 KV（对应 Go ListShared）。
  listShared(): Record<string, unknown>;
  setPrivate(key: string, value: unknown): void;
  getPrivate<T = unknown>(key: string): T | undefined;

  // ---- 产物 Artifact（完整 CRUD，对齐 Go nexuscontext）----
  addArtifact(a: Artifact): void;
  getArtifact(id: string): Artifact | undefined;
  getArtifacts(): Artifact[];
  updateArtifact(a: Artifact): void;
  deleteArtifact(id: string): void;
  // getCurrentArtifacts：当前轮（current invocation）产生的产物。
  getCurrentArtifacts(): Artifact[];
  // getPreTurnArtifacts：此前轮次累计的产物。
  getPreTurnArtifacts(): Artifact[];

  // ---- 工具 ----
  getTools(): BaseTool[];

  // ---- 中断 ----
  getInterruptionState(): InterruptionState;
  interrupt(question: string): void;
  setInterruptionNode(node: string): void;

  // ---- 中断恢复（resume/replay）----
  // snapshotSession：把当前 state map 快照进 InterruptionState，供续跑重放。
  snapshotSession(): void;
  // resume：用外部（可跨进程反序列化得到）的 InterruptionState 回填本上下文，
  // 标记 isResumed=true、interruptionType=Continue，引擎据此从 currentNode 重放。
  resume(state?: InterruptionState): void;

  // ---- 元信息 ----
  getInvocationId(): string;
  release(): Promise<void> | void;
}
