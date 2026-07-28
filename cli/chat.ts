// nexus-sdk-ts 交互式对话 REPL（零额外依赖，基于 node:readline）
//
// 在终端里和 BaseAgent 持续多轮对话：
//   - 默认离线用 MockLLM；设置 ARK_API_KEY / OPENAI_API_KEY 时自动切真实大模型（流式打字机输出）
//   - 内置 calculator 工具，演示 ReAct 工具调用闭环
//   - 斜杠命令：/clear 清空对话、/help 帮助、/exit | /quit 退出
//   - 整个会话共用一个 MemoryContext，因此 Agent 记得上文
//
// 运行：bun run chat
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";

import { BaseAgent } from "../src/agent/base.ts";
import { MemoryContext } from "../src/context/memory.ts";
import { AbstractTool } from "../src/tool/tool.ts";
import type { Context } from "../src/context/context.ts";
import { MockLLM } from "../src/llm/mock.ts";
import { llmFromEnv } from "../src/llm/factory.ts";
import type { LLM } from "../src/llm/llm.ts";
import { newUserMessage } from "../src/llm/message.ts";

// —— 本地调试默认凭证（已 export 的环境变量优先；??= 仅在未设置时回退）——
// ⚠️ 明文 Key，切勿提交到公共仓库或泄露。不需要可删除这两行，自动回退 MockLLM。
process.env.ARK_API_KEY ??= "0e01770b-decd-4d99-a057-310c84282ec2";
process.env.ARK_MODEL ??= "doubao-seed-2-0-pro-260215";

// 一个简单计算器工具：入参 { expr: "1+2*3" }
class CalculatorTool extends AbstractTool {
  name(): string { return "calculator"; }
  description(): string { return "计算一个算术表达式，支持 + - * / 和括号"; }
  schema() {
    return {
      type: "object",
      properties: { expr: { type: "string", description: "算术表达式，如 (1+2)*3" } },
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

// 天气查询工具：入参 { city: "北京" }，返回 mock 数据
class WeatherTool extends AbstractTool {
  name(): string { return "get_weather"; }
  description(): string { return "查询指定城市的当前天气"; }
  schema() {
    return {
      type: "object",
      properties: { city: { type: "string", description: "城市名称，如 北京" } },
      required: ["city"],
    };
  }
  strict(): boolean { return true; }
  async call(_ctx: Context, args: string): Promise<string> {
    const { city } = JSON.parse(args) as { city: string };
    // mock：用城市名做种子，给出稳定但“看起来随机”的天气
    const conditions = ["晴", "多云", "阴", "小雨", "雷阵雨", "雪"];
    const seed = [...(city ?? "")].reduce((s, c) => s + c.charCodeAt(0), 0);
    const condition = conditions[seed % conditions.length]!;
    const temp = 5 + (seed % 28);            // 5 ~ 32 ℃
    const humidity = 30 + (seed % 60);       // 30 ~ 89 %
    const wind = 1 + (seed % 6);             // 1 ~ 6 级
    return JSON.stringify({
      city,
      condition,
      temperature: `${temp}℃`,
      humidity: `${humidity}%`,
      wind: `${wind}级`,
    });
  }
}

function buildLLM(): { llm: LLM; real: boolean } {
  const real = llmFromEnv();
  if (real) return { llm: real, real: true };
  // 离线脚本：循环回答（耗尽后重复最后一条）
  return {
    llm: new MockLLM([
      { content: "你好！我是离线 Mock 模式的对话助手。设置 ARK_API_KEY 后即可切换到真实大模型。" },
    ]),
    real: false,
  };
}

const COLORS = {
  dim: (s: string) => `\u001b[2m${s}\u001b[0m`,
  cyan: (s: string) => `\u001b[36m${s}\u001b[0m`,
  green: (s: string) => `\u001b[32m${s}\u001b[0m`,
  yellow: (s: string) => `\u001b[33m${s}\u001b[0m`,
};

function printHelp() {
  output.write(
    [
      COLORS.dim("可用命令："),
      COLORS.dim("  /clear        清空对话历史，开始新会话"),
      COLORS.dim("  /help         显示本帮助"),
      COLORS.dim("  /exit, /quit  退出"),
      "",
    ].join("\n") + "\n",
  );
}

async function main() {
  const tools = [new CalculatorTool(), new WeatherTool()];
  const { llm, real } = buildLLM();

  // 整个会话共用一个 Context，让 Agent 记住上文
  let ctx = new MemoryContext({ tools });
  const agent = new BaseAgent({
    name: "chat-agent",
    description: "命令行交互对话助手",
    instruction: "你是一个有帮助的中文助手。需要算术计算时调用 calculator 工具；需要查询天气时调用 get_weather 工具。",
    llm,
    tools,
    callback: {
      onAnswer: (d) => output.write(d),  // 流式正文（打字机效果）
      // 工具调用：onToolResult 在每次工具执行后触发一次，用于提示工具产出
      onToolResult: (r) => output.write(COLORS.dim(`\n[工具] ${r}\n`)),
    },
  });

  output.write(COLORS.cyan("\n  nexus-sdk-ts 对话 REPL") + "\n");
  output.write(
    COLORS.dim(`  模型模式：${real ? `真实大模型（${process.env.ARK_MODEL ?? process.env.OPENAI_MODEL ?? "?"}）` : "离线 MockLLM"}`) + "\n",
  );
  printHelp();

  const rl = createInterface({ input, output });

  const prompt = () => output.write(COLORS.green("你 › "));
  prompt();

  for await (const line of rl) {
    const text = line.trim();

    if (text === "") { prompt(); continue; }
    if (text === "/exit" || text === "/quit") break;
    if (text === "/help") { printHelp(); prompt(); continue; }
    if (text === "/clear") {
      ctx = new MemoryContext({ tools });   // 丢弃旧上下文 = 清空记忆
      output.write(COLORS.yellow("（已清空对话历史）") + "\n");
      prompt();
      continue;
    }

    output.write(COLORS.cyan("助手 › "));
    try {
      const resp = await agent.run(ctx, [newUserMessage(text)]);
      // 回调已流式打印过正文；若某些实现未走流式，这里兜底补一次
      if (!resp.message.content) output.write(COLORS.dim("(无内容)"));
      output.write("\n");
    } catch (e) {
      output.write("\n" + COLORS.yellow(`出错：${(e as Error).message}`) + "\n");
    }
    prompt();
  }

  rl.close();
  output.write(COLORS.dim("\n再见 👋\n"));
}

main().catch((e) => { console.error(e); process.exit(1); });
