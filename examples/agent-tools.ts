// 示例：带工具调用的最小 ReAct Agent
// 默认用 MockLLM 离线跑通闭环；设置 ARK_API_KEY / OPENAI_API_KEY 时自动切换真实流式实现。
import { BaseAgent } from "../src/agent/base.ts";

// 本地调试默认凭证：未通过环境变量显式设置时，回退到下面的默认值，
// 这样无需每次 export。已 export 的值优先（??= 仅在 undefined 时赋值）。
// ⚠️ 注意：这是写死在源码里的明文 Key，切勿提交到公共仓库或泄露。
process.env.ARK_API_KEY ??= "0e01770b-decd-4d99-a057-310c84282ec2";
process.env.ARK_MODEL ??= "doubao-seed-2-0-pro-260215";

import { MemoryContext } from "../src/context/memory.ts";
import { AbstractTool } from "../src/tool/tool.ts";
import type { Context } from "../src/context/context.ts";
import { MockLLM } from "../src/llm/mock.ts";
import { llmFromEnv } from "../src/llm/factory.ts";
import type { LLM } from "../src/llm/llm.ts";
import { newUserMessage } from "../src/llm/message.ts";

// 一个简单计算器工具：入参 { expr: "1+2*3" }
class CalculatorTool extends AbstractTool {
  name(): string { return "calculator"; }
  description(): string { return "计算一个算术表达式，支持 + - * / 和括号"; }
  schema() {
    return {
      type: "object",
      properties: {
        expr: { type: "string", description: "算术表达式，如 (1+2)*3" },
      },
      required: ["expr"],
    };
  }
  strict(): boolean { return true; }

  async call(_ctx: Context, args: string): Promise<string> {
    const { expr } = JSON.parse(args) as { expr: string };
    if (!/^[\d\s+\-*/().]+$/.test(expr)) return `error: unsupported expression: ${expr}`;
    const value = Function(`"use strict"; return (${expr});`)();
    return JSON.stringify({ expr, value });
  }
}

function buildLLM(): LLM {
  const real = llmFromEnv();
  if (real) {
    console.log("[demo] 检测到 API Key，使用真实大模型\n");
    return real;
  }
  console.log("[demo] 未检测到 API Key，使用 MockLLM 离线运行\n");
  return new MockLLM([
    {
      content: "我需要计算一下。",
      toolCalls: [{ id: "call_1", name: "calculator", arguments: JSON.stringify({ expr: "(1+2)*3" }) }],
    },
    { content: "计算结果是 9。" },
  ]);
}

async function main() {
  const tools = [new CalculatorTool()];
  const ctx = new MemoryContext({ query: "(1+10)*3 等于多少？请调用 calculator 工具计算后回答。", tools });
  const agent = new BaseAgent({
    name: "calc-agent",
    description: "演示工具调用的计算助手",
    llm: buildLLM(),
    tools,
    callback: {
      onAnswer: (d) => { process.stdout.write(d); },
      onToolCall: (d) => { process.stdout.write(`\n[tool-call delta] ${d}\n`); },
      onToolResult: (r) => { process.stdout.write(`[tool-result] ${r}\n`); },
    },
  });

  const resp = await agent.run(ctx, [newUserMessage(ctx.userQuery())]);
  console.log("\n\n=== 最终回答 ===");
  console.log(resp.message.content);
}

main().catch((e) => { console.error(e); process.exit(1); });
