// 对应 Go: schema/context.go —— 三层 Roadmap 上下文索引 + Artifact 产物
//
// Roadmap 是上下文工程的核心数据结构：把一次会话的全部对话历史，按
// 「历史层 / 近期层 / 当前层」三级粒度索引并逐级摘要，喂给 LLM 时只带
// 必要密度的信息，从而在不超 token 预算的前提下保留长程记忆。
//
//   历史层 Blocks       —— 久远轮次，已压缩为 BlockIndex（粗摘要）
//   近期层 RecentTurns  —— 最近 N 轮，保留 TurnIndex（中等粒度）
//   当前层 Current      —— 最活跃的当前轮，TurnIndex（最细粒度）
//
// ⚠️ P0：本文件只迁移「数据结构」。各层的真实摘要填充（AutoCompaction /
// AutoContextEditing）发生在远端 OceanAI 服务（见 src/infra/oceanai.ts），
// 本地 SDK 不重建摘要算法——这是源项目的硬约束。
//
// 命名约定：Go 中带 `json:"-"` 的 *Prompt 字段是「运行期临时渲染结果」，
// 不参与序列化，这里统一标记为可选（?）。

/** 产物类型，对应 Go ArtifactType。 */
export enum ArtifactType {
  File = "file",
  Lark = "lark",
  Sheet = "sheet",
}

/**
 * 产物（Artifact）—— Agent 运行过程中产出的可追溯实体：文件、飞书文档、
 * 在线表格等。对应 Go schema/context.go 的 Artifact struct（完整字段）。
 */
export interface Artifact {
  /** 产物唯一 ID（Go: ArtifactId，唯一必填字段）。 */
  id: string;
  type?: ArtifactType;
  title?: string;
  author?: string;
  path?: string;
  /** 产物内容（文本 / 序列化结果等）。 */
  content?: string;
  /** 产生该产物的调用 ID（Go: InvocationId int64）。 */
  invocationId?: number;
  /** 可见性级别。 */
  visibilityLevel?: string;
  label?: string;
}

/**
 * 三层共有的索引基类，对应 Go 的内嵌 CommonIndex。
 * 通过 TS 接口继承（extends）模拟 Go 的结构体内嵌。
 */
export interface CommonIndex {
  summary?: string;
  keyPoints?: string[];
  artifacts?: Artifact[];
}

/** 工具调用索引，对应 Go ToolIndex。 */
export interface ToolIndex {
  toolCallId?: string;
  toolName?: string;
  content?: string;
  summary?: string;
  /** 原始工具调用（保留以便重放 / 追溯）。 */
  toolCall?: import("./chat.ts").ToolCall;
  result?: string;
  /** 是否已卸载（offload）到外部存储以节省上下文。 */
  offload?: boolean;
  /** 压缩后的工具调用（摘要版）。 */
  toolCallSummary?: import("./chat.ts").ToolCall;
  resultSummary?: string;
}

/** 节点级索引（一次 Agent/Node 执行），对应 Go NodeIndex。 */
export interface NodeIndex extends CommonIndex {
  namespace?: string;
  name?: string;
  input?: string;
  tools?: ToolIndex[];
  output?: string;
  /** 节点级产物（Go: NodeIndex.Artifacts，覆盖 CommonIndex 的同名字段）。 */
  artifacts?: Artifact[];
}

/** 轮次级索引（一问一答的完整一轮），对应 Go TurnIndex。 */
export interface TurnIndex extends CommonIndex {
  turnId: number;
  input?: string;
  attachments?: import("./runconfig.ts").Attachment[];
  /** 该轮包含的节点摘要（Go json:"nodes"）。 */
  nodesSummary?: NodeIndex[];
  /** 轮次级产物（Go: TurnIndex.Artifacts）。 */
  artifacts?: Artifact[];
  output?: string;
}

/** 历史块索引（多轮压缩成一块），对应 Go BlockIndex。 */
export interface BlockIndex extends CommonIndex {
  blockId: number;
  /** 块内各轮摘要（Go json:"turns"）。 */
  turnsSummary?: TurnIndex[];
}

/**
 * 三层 Roadmap 主结构，对应 Go schema/context.go 的 Roadmap struct。
 * *Prompt 字段是渲染期临时产物（Go json:"-"），不参与持久化。
 */
export interface Roadmap {
  /** 当前轮 ID（Go json:"-"，运行期游标）。 */
  turnId?: number;

  /** 历史层：已压缩的久远轮次块。 */
  blocks?: BlockIndex[];
  /** 历史层渲染后的 prompt 片段（临时）。 */
  blocksPrompt?: string;

  /** 近期层:最近 N 轮的完整索引。 */
  recentTurns?: TurnIndex[];
  /** 近期层渲染后的 prompt 片段（临时）。 */
  recentTurnsPrompt?: string;

  /** 当前层:最活跃的当前轮。 */
  current?: TurnIndex;
  /** 当前层渲染后的 prompt 片段（临时）。 */
  currentPrompt?: string;
}

/**
 * 命名空间，对应 Go schema/context.go 的 Namespace。
 * 用于在多智能体协作中区分不同 Agent 实例的私有数据。
 */
export interface Namespace {
  agentName: string;
  agentInstanceHash: string;
}
