// ByteRAG 检索远端代理（P2）。Go 侧为 Kitex，本地经远程代理收敛。
export interface RagClient {
  retrieve(query: string, topK?: number): Promise<string[]>;
}
