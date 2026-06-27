// 对应 Go: schema/run_config.go
export interface Attachment {
  name: string;
  url: string;
  mediaType?: string;
}
export interface SkillItem {
  id: string;
  name?: string;
}
export interface AgentRunRequest {
  appName?: string;
  appId?: string;
  sessionId?: string;
  query: string;
  attachments?: Attachment[];
  skills?: SkillItem[];
}
