// 连通性自测：纯文本流式，验证真实大模型是否打通（最快路径，不带工具）
// 用法：先设好 ARK_API_KEY + ARK_MODEL（或 OPENAI_*），再 bun run examples/check-llm.ts
import { resolveEnvLLMConfig, llmFromEnv } from "../src/llm/factory.ts";
import { newUserMessage, newSystemMessage } from "../src/llm/message.ts";

async function main() {
  const cfg = resolveEnvLLMConfig();
  if (!cfg) {
    console.error("✗ 未检测到 API Key。请设置 ARK_API_KEY + ARK_MODEL（或 OPENAI_API_KEY）后重试。");
    process.exit(1);
  }
  console.log(`→ baseURL : ${cfg.baseURL}`);
  console.log(`→ model   : ${cfg.defaultModel ?? "(未设置，将用默认)"}`);
  console.log(`→ apiKey  : ${cfg.apiKey.slice(0, 4)}***（已读取）\n`);

  const llm = llmFromEnv()!;
  process.stdout.write("流式输出：");
  const resp = await llm.generateContent(
    [newSystemMessage("你是一个简洁的助手。"), newUserMessage("用一句话证明你在线：现在能听到我说话吗？")],
    { stream: true, streamingFunc: (d) => { process.stdout.write(d); } },
  );
  console.log("\n\n✓ 打通成功");
  console.log("完整内容：", resp.message.content);
  console.log("finishReason：", resp.finishReason);
  if (resp.usage) console.log("usage：", JSON.stringify(resp.usage));
}

main().catch((e) => {
  console.error("\n✗ 调用失败：", (e as Error).message);
  console.error("排查：1) Key 是否有效  2) ARK_MODEL 是否填了接入点ID/模型名  3) baseURL 是否为 .../api/v3");
  process.exit(1);
});
