// 对应 Go: tool/askuser_tool.go —— Human-in-the-Loop（向用户提问并挂起 Agent）
//
// 设计要点（与 Go 行为对齐）：
//   - AskUserTool 被 LLM 当作普通工具调用；它不返回有意义的内容，
//     而是调用 ctx.interrupt(question)，把 Context 的中断类型置为 Stop。
//   - BaseAgent 在每轮 doAction 结束后检查 ctx 中断状态：若为 Stop，则
//     snapshotSession() 快照当前 state，优雅退出 run() 并返回携带问题的响应，
//     由调用方决定何时拿到用户回答后 resume 续跑。
import { AbstractTool, type JSONSchema } from "./tool.ts";
import type { Context } from "../context/context.ts";

export interface AskUserParam {
  question: string;
}

export const ASK_USER_TOOL_NAME = "ask_user";

export class AskUserTool extends AbstractTool {
  name(): string { return ASK_USER_TOOL_NAME; }
  description(): string {
    return "向用户提问以获取继续任务所需的关键信息；调用后任务会挂起，等待用户回答。";
  }
  schema(): JSONSchema {
    return {
      type: "object",
      properties: {
        question: { type: "string", description: "要向用户提出的问题" },
      },
      required: ["question"],
    };
  }
  strict(): boolean { return true; }

  async call(ctx: Context, args: string): Promise<string> {
    let question = "";
    try {
      const p = JSON.parse(args) as Partial<AskUserParam>;
      question = (p.question ?? "").trim();
    } catch {
      // 参数解析失败时，退化为把原始 args 当作问题
      question = args.trim();
    }
    if (!question) question = "需要补充更多信息以继续。";
    // 触发中断：把 Context 标记为 Stop，并记录待回答的问题
    ctx.interrupt(question);
    // 返回值会被写成 tool 消息占位；真正的恢复由 agent.resume(answer) 完成
    return `__ASK_USER__:${question}`;
  }
}
