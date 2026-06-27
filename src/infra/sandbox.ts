// AI-Sandbox 远端代理（P2）。对齐 Go: 安全代码执行环境。
export interface SandboxClient {
  exec(cmd: string): Promise<{ stdout: string; stderr: string; code: number }>;
}
