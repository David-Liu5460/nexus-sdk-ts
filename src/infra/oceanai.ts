// OceanAI 平台远端代理（P2）。对齐 Go: 内部 OceanAI REST + AutoCompaction 摘要。
// 仅接口隔离，具体实现走远程代理，本地不重建摘要算法（源项目关键约束）。
export interface OceanAIRestClient {
  // 远端任务创建
  createTask(payload: unknown): Promise<unknown>;
  // AutoCompaction：压缩摘要计算留在远端服务
  compact(turnIds: string[]): Promise<{ summary: string }>;
}
