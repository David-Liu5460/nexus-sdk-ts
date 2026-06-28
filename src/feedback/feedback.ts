// 对应 Go: feedback/ —— Agent 输出质量评估与反馈链
//
// Feedback 在每一轮 LLM 产出后运行:
//   * 最终答案分支: content=本轮 assistant 文本, toolCall=undefined。
//     若 pass=false, BaseAgent 把 prompt 作为 user 反馈消息回写, 要求模型自我修正。
//   * 工具调用分支: content="", toolCall=本次工具调用。
//     若 pass=false, BaseAgent 用 prompt 替换该工具的执行结果(对齐 Go: info.Msg 覆盖 result)。
// 从而构成"产出 -> 评估 -> 再产出 / 拦截"的纠错闭环(对齐 Go schema.Feedback)。
import type { Context } from "../context/context.ts";
import type { ChatCompletionMessage, ToolCall } from "../schema/chat.ts";

export interface FeedbackInfo {
  // 是否通过校验。true 表示本轮产出可接受, 无需重试/替换
  pass: boolean;
  // 未通过时回写给模型的纠正提示(最终答案分支作为下一轮 user 消息; 工具分支替换工具结果)
  // 对齐 Go FeedbackInfo.Msg
  prompt?: string;
  // 可选: 估算 token 数, 对齐 Go FeedbackInfo.Token, 暂作透传
  token?: number;
}

export interface Feedback {
  // content: 最终答案分支为 assistant 文本; 工具分支为空。
  // toolCall: 工具调用分支携带本次 ToolCall; 最终答案分支为 undefined。
  feedback(
    ctx: Context,
    agentName: string,
    content: string,
    toolCall?: ToolCall,
  ): FeedbackInfo | Promise<FeedbackInfo>;
}

// Chain: 按顺序运行多个 Feedback, 遇到第一个未通过即短路返回(对齐 Go feedback.Chain)
export function chain(...fds: Feedback[]): Feedback {
  return {
    async feedback(ctx, agentName, content, toolCall): Promise<FeedbackInfo> {
      for (const fd of fds) {
        const info = await fd.feedback(ctx, agentName, content, toolCall);
        if (!info.pass) return info;
      }
      return { pass: true };
    },
  };
}

// JSONFeedback: 校验 assistant 最终输出是否为合法 JSON(对齐 Go JSONFeedback)。
// 仅作用于最终答案分支; 工具调用分支直接放行。
export class JSONFeedback implements Feedback {
  constructor(private readonly hint: string = "上一条回复不是合法 JSON，请只输出合法 JSON。") {}
  feedback(_ctx: Context, _agentName: string, content: string, toolCall?: ToolCall): FeedbackInfo {
    if (toolCall) return { pass: true };
    const text = content.trim();
    if (!text) return { pass: false, prompt: this.hint };
    try {
      JSON.parse(text);
      return { pass: true };
    } catch {
      return { pass: false, prompt: this.hint };
    }
  }
}

// FuncFeedback: 用一个纯函数快速构造 Feedback, 便于业务自定义校验。
// 函数可读取 toolCall 以实现工具级拦截(如危险工具二次确认)。
export class FuncFeedback implements Feedback {
  constructor(private readonly fn: (content: string, toolCall?: ToolCall) => FeedbackInfo) {}
  feedback(_ctx: Context, _agentName: string, content: string, toolCall?: ToolCall): FeedbackInfo {
    return this.fn(content, toolCall);
  }
}

export type { ChatCompletionMessage };
