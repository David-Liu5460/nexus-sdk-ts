// OceanAI 平台远端代理（P2）。
// 对应 Go: context/oceanaicontext/oceanaicontext.go（1723 行，强耦合
// go-openai / nexus-llm / pkg/oceanai / hertz / tiktoken-go）。
//
// ⚠️ 关键约束：三层 Roadmap 的「真实填充」与 AutoCompaction/AutoContextEditing
// 的「真实摘要计算」都发生在远端 OceanAI 服务。本地 SDK 不重建摘要算法，
// 仅以接口隔离 + 远程代理形状占位；MemoryContext 的对应方法为本地 no-op 钩子。

import type { Context } from "../context/context.ts";

/** 远端 OceanAI REST 客户端的最小接口形状。 */
export interface OceanAIRestClient {
  /** 远端任务创建。 */
  createTask(payload: unknown): Promise<unknown>;
  /** AutoCompaction：把指定轮次压缩成摘要（计算留在远端服务）。 */
  compact(turnIds: string[]): Promise<{ summary: string }>;
  /** AutoContextEditing：远端裁剪当前上下文，返回裁剪后的状态句柄。 */
  edit(invocationId: string): Promise<{ trimmed: boolean }>;
}

/**
 * OceanAIContext 的 P2 远端代理占位说明。
 *
 * 该上下文实现 schema Context 接口，但其 loadRoadmap / autoContextEditing /
 * autoCompaction 等方法在生产环境委托给 {@link OceanAIRestClient}，
 * 由远端 OceanAI 服务完成 Roadmap 填充与摘要压缩。
 *
 * 本仓库当前不提供本地可运行实现（避免重建远端摘要算法）。需要接入时，
 * 由实现方注入 OceanAIRestClient，并在 autoContextEditing/autoCompaction
 * 中转发到远端，再用返回结果回填本地 Roadmap 视图。
 *
 * 在此之前，请使用 MemoryContext 作为本地参考实现。
 */
export interface OceanAIContextProxyOptions {
  client: OceanAIRestClient;
  /** 委托给本地内存上下文承载 KV / 消息 / Artifact 等非远端能力。 */
  local: Context;
}

/** 占位常量：标识 OceanAIContext 走远端代理，未在本地落地。 */
export const OCEANAI_CONTEXT_REMOTE_PROXY =
  "P2: OceanAIContext Roadmap/compaction runs on remote OceanAI service; use MemoryContext locally.";
