// 对应 Go: schema/context.go —— 核心 Context 接口（多智能体协作中枢）
import type { ChatCompletionMessage } from "../schema/chat.ts";
import type { InterruptionState } from "../schema/interruption.ts";
import type { BaseTool } from "../tool/tool.ts";

export interface Artifact {
  id: string;
  name?: string;
  content: unknown;
}

export interface Context {
  // 消息存储
  addMessage(msg: ChatCompletionMessage): void;
  loadAllMessages(): ChatCompletionMessage[];
  userQuery(): string;

  // 状态管理
  set(key: string, value: unknown): void;
  get<T = unknown>(key: string): T | undefined;
  map(): Record<string, unknown>;
  setShared(key: string, value: unknown): void;
  getShared<T = unknown>(key: string): T | undefined;
  setPrivate(key: string, value: unknown): void;
  getPrivate<T = unknown>(key: string): T | undefined;

  // 产物
  addArtifact(a: Artifact): void;
  getArtifact(id: string): Artifact | undefined;

  // 工具
  getTools(): BaseTool[];

  // 中断
  getInterruptionState(): InterruptionState;
  interrupt(question: string): void;
  setInterruptionNode(node: string): void;

  // 中断恢复（resume/replay）
  // snapshotSession：把当前 state map + 消息条数快照进 InterruptionState，供续跑重放
  snapshotSession(): void;
  // resume：用外部（可跨进程反序列化得到）的 InterruptionState 回填本上下文，
  // 标记 isResumed=true、interruptionType=Continue，引擎据此从 currentNode 重放
  resume(state?: InterruptionState): void;

  // 元信息
  getInvocationId(): string;
  release(): Promise<void> | void;
}
