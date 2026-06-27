// 对应 Go: context/memory/memory.go —— 纯内存参考实现（迁移起点）
import type { Context, Artifact } from "./context.ts";
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

  addMessage(msg: ChatCompletionMessage): void { this.messages.push(msg); }
  loadAllMessages(): ChatCompletionMessage[] { return [...this.messages]; }
  userQuery(): string { return this.query; }

  set(k: string, v: unknown): void { this.state.set(k, v); }
  get<T = unknown>(k: string): T | undefined { return this.state.get(k) as T | undefined; }
  map(): Record<string, unknown> { return Object.fromEntries(this.state); }
  setShared(k: string, v: unknown): void { this.shared.set(k, v); }
  getShared<T = unknown>(k: string): T | undefined { return this.shared.get(k) as T | undefined; }
  setPrivate(k: string, v: unknown): void { this.priv.set(k, v); }
  getPrivate<T = unknown>(k: string): T | undefined { return this.priv.get(k) as T | undefined; }

  addArtifact(a: Artifact): void { this.artifacts.set(a.id, a); }
  getArtifact(id: string): Artifact | undefined { return this.artifacts.get(id); }

  getTools(): BaseTool[] { return this.tools; }

  getInterruptionState(): InterruptionState { return this.interruption; }
  interrupt(question: string): void {
    this.interruption.question = question;
    this.interruption.interruptionType = InterruptionType.Stop;
  }
  setInterruptionNode(node: string): void { this.interruption.currentNode = node; }

  // 把当前 state map 快照进中断状态，供跨进程序列化与续跑重放
  snapshotSession(): void {
    this.interruption.sessionStateSnapshot = Object.fromEntries(this.state);
  }

  // 用外部 InterruptionState 回填本上下文：恢复 state 快照、标记 resumed、
  // 切到 Continue 让引擎从 currentNode 重放；不传 state 则就地恢复本上下文已有的中断态
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

  getInvocationId(): string { return this.invocationId; }
  release(): void { /* no-op for in-memory */ }
}
