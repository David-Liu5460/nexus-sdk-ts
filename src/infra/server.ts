// 服务端出口（P1）。对齐 Go deploys/ 的 HTTP Server / MCP Server。
// 计划基于 Bun.serve() 暴露 SSE 流式接口，把 Agent 跑成服务。
// 注意：当前为类型/占位骨架，未启动任何监听进程。
export interface ServeOptions {
  port?: number;
  // 处理一次 Agent 调用并以 SSE 流式回写
  handler?: (req: Request) => Promise<Response>;
}

export const SERVER_TODO =
  "P1: implement SSE endpoint via Bun.serve() — not yet wired";
