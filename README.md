# nexus-sdk-ts

> OceanAI Agent SDK v2.0 的 **Bun + TypeScript** 移植版。
> 源项目为 Go 模块 `code.byted.org/ad/nexus`（约 4.1 万行 / 210 个 .go 文件），核心是一套
> **LangGraph 风格的 DAG 编排引擎 + ReAct 智能体循环 + 三层上下文工程**。本仓库从 P0 核心层起步，
> 目标是不依赖任何字节内部基础设施即可本地闭环运行。

---

## 这是什么

一个**构建 Agent 应用的库 / SDK**（不是可执行程序）。它提供三块能力：

1. **DAG 编排引擎** —— 把工作流描述为有向图（节点 + 边 + 跳转指令），引擎负责调度、并发、重试、超时、中断恢复。
2. **ReAct 智能体** —— `Plan → 调用工具 → 观察结果 → 迭代` 的标准循环，内置最大迭代保护。
3. **可插拔的 LLM / Tool / Callback** —— LLM 走 OpenAI 兼容协议（含火山方舟），工具用 JSON Schema 描述，流式事件经统一回调分发。

当前实现的是 **P0 核心层**（语言无关、可独立验证）；字节内部强耦合能力（OceanAI / ByteRAG / Sandbox 等）在 `src/infra` 留了接口占位，走后续远程代理。

---

## 快速开始

```bash
bun install

bun run dev          # 最小 DAG 示例（3 节点流转）
bun test             # 全部单测（core + agent）
bun run typecheck    # tsc --noEmit
bun run build        # 打包到 dist/

bun run agent        # 带工具调用的 ReAct 示例（无 Key 走 Mock，有 Key 真连）
bun run check:llm    # 大模型连通性自测（纯文本流式）
```

### 接真实大模型（火山方舟 / OpenAI）

代码走 OpenAI 兼容的 `/chat/completions`，火山方舟同端点零改动即可用。复制 `.env.example` 配置后：

```bash
export ARK_API_KEY="你的方舟ApiKey"        # 填裸 Key，代码自动加 Bearer 前缀
export ARK_MODEL="ep-xxxxxxxxxxxx"          # 接入点ID，或模型名 doubao-seed-2-0-pro-260215
# ARK_BASE_URL 缺省 = https://ark.cn-beijing.volces.com/api/v3

bun run check:llm     # 先验证 Key 通
bun run agent         # 再跑完整工具调用闭环
```

> 也支持标准 OpenAI：设 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`（优先级高于 ARK_*）。

---

## 目录结构

```
src/
├── schema/      类型契约（所有模块基石）
│   ├── chat.ts          消息 / 工具调用 / 多模态 part / 响应
│   ├── event.ts         ContentState 流式内容态 + Event
│   ├── errors.ts        NexusError 体系（ErrMissingLLM / ErrMaxIterations ...）
│   ├── interruption.ts  中断状态与序列化
│   └── runconfig.ts     AgentRunRequest 等运行入参
├── core/        DAG 编排引擎
│   ├── command.ts       Command{goto,update} + 便捷构造器 + END
│   ├── node.ts          Node / NodeConfig（重试/超时/skipOnError）
│   ├── graph.ts         Graph：addNode/addEdge/addConditionalEdge/compile
│   └── application.ts   编译后的可执行图：invoke → 递归 execute
├── context/     上下文工程
│   ├── context.ts       Context 接口（消息/状态/产物/中断）
│   └── memory.ts        MemoryContext 纯内存参考实现
├── llm/         模型适配层
│   ├── llm.ts           LLM 接口 + GenerateOptions
│   ├── openai.ts        OpenAI 兼容实现（Bun fetch + SSE 流式增量）
│   ├── adapter.ts       schema <-> OpenAI wire 双向转换
│   ├── factory.ts       从环境变量建 LLM（兼容 ARK_* / OPENAI_*）
│   ├── mock.ts          MockLLM 离线脚本化（测试/示例用）
│   └── message.ts       消息构造器
├── tool/        工具抽象（BaseTool / AbstractTool，JSON Schema）
├── callback/    流式回调（Callback 接口 + dispatchEvent 事件分发）
├── agent/       智能体
│   ├── base.ts          BaseAgent ReAct 主循环
│   └── option.ts        AgentOptions + 默认值（maxIterations=30）
├── prompt/      Plan 模板层（对应 Go prompt/）
│   └── template.ts      Roadmap(Block/RecentTurns/Current)+工具清单 → 系统指令
└── infra/       应用层 + 字节内部基础设施适配
    ├── server.ts        P1：Bun.serve() SSE 服务端出口（占位）
    ├── oceanai.ts       P2：OceanAI REST + AutoCompaction 摘要远程代理
    ├── sandbox.ts       P2：AI-Sandbox 执行代理
    └── rag.ts           P2：ByteRAG 检索代理

examples/   minimal.ts（DAG）/ agent-tools.ts（ReAct+工具）/ check-llm.ts（连通性）
test/       core.test.ts（引擎）/ agent.test.ts（ReAct 闭环）
```

---

## 分层架构

```mermaid
flowchart TB
  subgraph Agent["智能体层 src/agent"]
    BA["BaseAgent · ReAct 循环"]
  end
  subgraph Capability["能力适配层"]
    LLM["llm · OpenAI 兼容/Mock"]
    TOOL["tool · BaseTool + Schema"]
    CB["callback · 事件分发"]
  end
  subgraph Context["上下文工程层 src/context"]
    CTX["Context 接口 / MemoryContext"]
  end
  subgraph Core["编排引擎层 src/core"]
    G["Graph → compile()"]
    APP["Application · invoke/execute"]
  end
  subgraph Schema["类型契约层 src/schema"]
    S["chat / event / errors / interruption"]
  end
  Agent --> Capability --> Context --> Core --> Schema
```

---

## Go → TS 分层映射规则

Go 版 Nexus 是六层架构。移植到本仓库时，**层级语义一一对应，但目录归属做了重组**：Go 把 `Graph/Application/Node` 都放在 `schema/` 包里，TS 版把「可执行的编排引擎」单独拆到 `src/core/`，`src/schema/` 只保留纯类型 / 接口。

| Go 层级 | Go 位置 | → 本仓库位置 | 状态 |
|---|---|---|---|
| 应用层 HTTP/Lark Bot/MCP Server | `deploys/` | `src/infra/server.ts` + 未来 `Bun.serve()` | 🔌 占位 |
| 编排层 Graph + Application | `schema/graph.go`、`schema/application.go` | **`src/core/`** | ✅ 已落地 |
| 智能体层 BaseAgent/SkillAgent/FornaxAgent | `agent/` | `src/agent/` | 🟡 仅 BaseAgent |
| 上下文层 NexusContext/OceanAIContext + Roadmap | `context/` | `src/context/` | 🟡 无 Roadmap |
| 能力层 LLM/Tool/Callback/Feedback/Eval/Node | `llm/ tool/ callback/ ...` | `src/llm/`、`src/tool/`、`src/callback/` | 🟡 LLM/Tool/Callback 已落地 |
| 基础层 schema 接口、prompt/log/utils | `schema/`、`prompt/`、`log/`、`utils/` | **`src/schema/`** + `src/prompt/` | 🟡 缺 log/utils |

**几条要记住的映射规则：**

1. **`schema/` 一拆为二** —— Go 的 `schema/` 同时包含「引擎实现」与「类型接口」；TS 版把可执行的 Graph/Application/Node/Command 拆到 `src/core/`，纯类型留在 `src/schema/`。这是与原架构图最大的不同点。
2. **能力层子包提升为顶层目录** —— Go 的 `llm/openai`、`tool/mcp`、`tool/rag` 等包内子目录，在 TS 版提升为 `src/llm/`、`src/tool/` 顶层目录，内部用文件区分（如 `llm/openai.ts`、`llm/factory.ts`）。
3. **应用层（deploys）后置** —— HTTP/MCP Server 用 `Bun.serve()` 重写（`src/infra/server.ts`，P1）；OceanAI/Lark 等内部平台耦合走 `src/infra/` 远程代理（P2）。
4. **基础层 prompt/log/utils** —— `prompt/`（Plan 模板）已建骨架；`log/`、`utils/` 按需补。FornaxAgent / Fornax LLM 等字节内部实现统一收敛到 P2 远程代理，不在本地重建。

---

## 核心数据流

### 1) DAG 引擎执行（编排层）

```mermaid
flowchart LR
  A["Graph.compile()"] --> B["Application.invoke(ctx)"]
  B --> C["execute(entryPoint)"]
  C --> D["executeNode<br/>重试 / 超时 / skipOnError"]
  D --> E["resolveNext<br/>下一节点优先级"]
  E -->|多个目标| F["Promise.all 并行分支"]
  E -->|END| Z["结束"]
  F --> C
```

**下一节点优先级**：`Command.goto` > 条件边(Conditional Edge) > 静态边(Static Edge) > `END`。
并发用 `Promise.all`（对应 Go 的 errgroup），超时用 `Promise.race + AbortController`（对应 `context.WithTimeout`）。

### 2) ReAct 智能体循环（BaseAgent）

```mermaid
flowchart TD
  S["run(ctx, messages)"] --> CK{"llm 是否存在?"}
  CK -->|否| ERR["throw ErrMissingLLM"]
  CK -->|是| LOOP{"i < maxIterations?"}
  LOOP -->|否| MX["throw ErrMaxIterations"]
  LOOP -->|是| PLAN["Plan: 载入历史 → llm.generateContent<br/>(流式增量→dispatchEvent)"]
  PLAN --> ADD["addMessage(响应)"]
  ADD --> HAS{"有 toolCalls?"}
  HAS -->|否| DONE["return 最终响应"]
  HAS -->|是| ACT["doAction: 逐个执行工具<br/>结果写回 tool 消息 + ToolResult 事件"]
  ACT --> LOOP
```

### 3) 流式事件分发（callback）

LLM 的增量 delta 被拆成三类，经 `dispatchEvent` 映射到统一回调：

```mermaid
flowchart LR
  D1["content 增量"] --> A["ContentState.Answer → onAnswer"]
  D2["reasoning 增量"] --> R["ContentState.Reasoning → onReasoning"]
  D3["tool_call 增量"] --> T["ContentState.ToolCall → onToolCall"]
  D4["工具返回"] --> TR["ContentState.ToolResult → onToolResult"]
```

`src/llm/openai.ts` 负责逐行解析 SSE（`data:` 行、`[DONE]` 终止、跨 chunk 缓冲），并按 `index` 把被切碎的 tool-call `arguments` 拼接完整。

---

## 三个示例怎么用

| 示例 | 跑什么 | 是否需要 Key |
|---|---|---|
| `examples/minimal.ts` | 纯引擎：plan → act → finish 三节点 DAG | 否 |
| `examples/agent-tools.ts` | ReAct + calculator 工具，算 `(1+2)*3` | 否（Mock）/ 是（真连） |
| `examples/check-llm.ts` | 纯文本流式连通性自测 | 是 |
| `examples/resume.ts` | 断点续跑：下单→审批中断→序列化→恢复重放 | 否 |

最小 DAG 用法：

```ts
import { Graph, gotoNode, gotoEnd, updateState } from "./src/index.ts";
import { MemoryContext } from "./src/context/memory.ts";

const g = new Graph();
g.addNode({ name: "plan", func: async () => gotoNode("act") });
g.addNode({ name: "act",  func: async () => updateState({ done: true }) });
g.addNode({ name: "finish", func: async () => gotoEnd() });
g.addEdge("act", "finish");
g.setEntryPoint("plan");

const ctx = new MemoryContext({ query: "hello" });
await g.compile().invoke(ctx);
```

---

## 迁移进度（P0 / P1 / P2）

| 优先级 | 范围 | 状态 |
|---|---|---|
| **P0** 语言无关核心 | schema / DAG 引擎 / 内存 Context / LLM 接口 / Tool / Callback / BaseAgent | ✅ 已实现并单测 |
| **P1** 生态平替 | MCP（@modelcontextprotocol/sdk）、Lark SDK、TOS/TCC | ⏳ 待接 |
| **P2** 字节内部强耦合 | OceanAI REST、ByteRAG、Sandbox、Trace、JWT、AutoCompaction 摘要 | 🔌 `src/infra` 留接口，走远程代理 |

> AutoCompaction 摘要继续复用远端 OceanAI 服务，不在本地重建摘要逻辑——这是源项目的关键架构约束。

### P0 核心引擎能力清单

| 能力 | 对齐 Go | 状态 | 位置 / 验证 |
|---|---|---|---|
| Graph / Application 递归执行 | `schema/application.go` | ✅ | `src/core/application.ts` |
| 并发分支 / 重试 / 超时 / skipOnError | `errgroup` + `NodeConfig` | ✅ | `executeNode`，`test/core.test.ts` |
| **Middleware 流转优先级** | `resolveNext` 顶层 | ✅ | `graph.useMiddleware()`，`test/middleware-resume.test.ts` |
| **中断恢复 resume / replay** | `InterruptionState` 续跑 | ✅ | `ctx.resume()` + 从中断节点重放，`test/middleware-resume.test.ts` |
| 三层 Roadmap / AutoContextEditing | `context/` 治理 | ⏳ | 待接（Plan 模板骨架见 `src/prompt/`）|

> 流转优先级现已完整对齐 Go：**Middleware > Command.goto > 条件边 > 静态边 > END**；中断支持「同进程恢复」与「序列化跨进程恢复」两种重放路径，端到端用法见 `examples/resume.ts`。

---

## Go → TypeScript 关键映射

| Go 机制 | 本项目对应 |
|---|---|
| goroutine + errgroup | `async/await` + `Promise.all` |
| `context.WithTimeout` | `Promise.race` + `AbortController` |
| `context.Context` 取消 | `AbortController` / `AbortSignal` 贯穿调用链 |
| error 多返回值 | 抛 `NexusError` 子类 |
| `sync.Map` | `Map`（单线程无需锁） |
| `kin-openapi/openapi3.Schema` | JSON Schema |
| 增量拼接 delta | SSE 逐 chunk 累积（`openai.ts`） |

---

## 技术栈

Bun 1.3+ · TypeScript 5.6（strict）· 无运行时第三方依赖（核心层）。测试用内置 `bun:test`，打包用 `bun build`。
