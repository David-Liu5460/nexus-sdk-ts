// Plan 模板层（对应 Go: prompt/ 基础层）
// 职责：把三层 Roadmap（Block / RecentTurns / Current）与工具清单拼装成系统指令。
// 当前为骨架占位：提供最小可用的渲染函数与可替换的模板常量，
// 真正的 Roadmap 注入待 P0-3（三层 Roadmap）与 P0-6（Plan 模板化）落地。

export interface PromptParts {
  // 历史压缩块摘要（Roadmap.Block），P0-3 接入后填充
  blocks?: string;
  // 近期轮次（Roadmap.RecentTurns）
  recentTurns?: string;
  // 当前轮次（Roadmap.Current）
  current?: string;
  // 可用工具的简述清单
  toolsBrief?: string;
}

// 默认系统指令模板。{{slot}} 为占位槽，renduerSystemPrompt 负责替换。
export const DEFAULT_SYSTEM_TEMPLATE = [
  "You are a helpful agent built on the nexus-sdk-ts ReAct loop.",
  "{{blocks}}",
  "{{recentTurns}}",
  "{{current}}",
  "{{toolsBrief}}",
].join("\n");

// 用 PromptParts 渲染系统指令；空槽位自动省略，避免出现空行噪声。
export function renderSystemPrompt(
  parts: PromptParts = {},
  template: string = DEFAULT_SYSTEM_TEMPLATE,
): string {
  const slots: Record<string, string | undefined> = {
    blocks: parts.blocks,
    recentTurns: parts.recentTurns,
    current: parts.current,
    toolsBrief: parts.toolsBrief,
  };
  return template
    .split("\n")
    .map((line) => {
      const m = line.match(/^\{\{(\w+)\}\}$/);
      if (m) return slots[m[1]!] ?? "";
      return line;
    })
    .filter((line, i) => !(line === "" && i > 0))
    .join("\n")
    .trim();
}
