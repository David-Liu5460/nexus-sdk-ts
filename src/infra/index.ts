// 字节内部基础设施 / 应用层适配（对齐 Go: deploys/ + 内部耦合）。
// 每个能力以接口隔离，按 P1/P2 排期补齐：
//   P1：server（Bun.serve SSE 出口）
//   P2：oceanai / sandbox / rag 远程代理；Lark、TOS/TCC、RocketMQ、Trace、JWT 后续接入
export * from "./oceanai.ts";
export * from "./sandbox.ts";
export * from "./rag.ts";
export * from "./server.ts";

// 提示：Lark → @larksuiteoapi/node-sdk；TOS/TCC → REST 适配；
// ByteRAG(Kitex) / RocketMQ / Fornax-Argos trace 暂以远程代理或占位实现。
export const INFRA_TODO = "P2 adapters: implement via remote proxy when needed";
