// 对应 Go: llm/openai/openai.go —— OpenAI 兼容实现（Bun 原生 fetch + SSE 流式增量拼接）
import type { LLM, GenerateOptions } from "./llm.ts";
import type {
  ChatCompletionMessage,
  ChatCompletionResponse,
  FinishReason,
  ToolCall,
  Usage,
} from "../schema/chat.ts";
import { schemaMessageToOpenAI, openAIMessageToSchema, toolToOpenAI } from "./adapter.ts";

export interface OpenAIClientConfig {
  baseURL: string;        // 例如 https://api.openai.com/v1
  apiKey: string;
  defaultModel?: string;
  // 建流失败重试次数（对应 Go 侧的 3 次重试）
  streamRetries?: number;
}

// 流式增量累积器：把 SSE 的 delta 拼成完整 message
interface StreamAccumulator {
  content: string;
  reasoning: string;
  toolCalls: Map<number, { id: string; name: string; arguments: string }>;
  finishReason: FinishReason;
  usage?: Usage;
}

export class OpenAILLM implements LLM {
  private abortController: AbortController | null = null;

  constructor(private cfg: OpenAIClientConfig) {}

  async generate(messages: ChatCompletionMessage[], opts: GenerateOptions = {}): Promise<ChatCompletionResponse> {
    return this.generateContent(messages, opts);
  }

  async generateContent(
    messages: ChatCompletionMessage[],
    opts: GenerateOptions = {},
  ): Promise<ChatCompletionResponse> {
    const stream = opts.stream ?? true;
    const body: Record<string, unknown> = {
      model: opts.model ?? this.cfg.defaultModel ?? "gpt-4o-mini",
      messages: messages.map(schemaMessageToOpenAI),
      stream,
    };
    if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
    if (opts.temperature !== undefined) body.temperature = opts.temperature;
    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools.map(toolToOpenAI);
      body.tool_choice = opts.toolChoice ?? "auto";
    }
    if (stream) body.stream_options = { include_usage: true };

    return stream ? this.generateStream(body, opts) : this.generateOnce(body, opts);
  }

  stop(): void {
    this.abortController?.abort();
  }

  // 非流式：单次请求
  private async generateOnce(
    body: Record<string, unknown>,
    opts: GenerateOptions,
  ): Promise<ChatCompletionResponse> {
    const res = await this.doFetch(body, opts.signal);
    if (!res.ok) {
      throw new Error(`OpenAI request failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as any;
    const choice = json.choices?.[0] ?? {};
    return {
      message: openAIMessageToSchema(choice.message ?? {}),
      finishReason: (choice.finish_reason ?? "stop") as FinishReason,
      usage: mapUsage(json.usage),
    };
  }

  // 流式：建流 + SSE 增量拼接（带建流重试）
  private async generateStream(
    body: Record<string, unknown>,
    opts: GenerateOptions,
  ): Promise<ChatCompletionResponse> {
    const retries = this.cfg.streamRetries ?? 3;
    let lastErr: unknown;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await this.doFetch(body, opts.signal);
        if (!res.ok || !res.body) {
          throw new Error(`OpenAI stream failed: ${res.status} ${await res.text()}`);
        }
        return await this.consumeStream(res.body, opts);
      } catch (e) {
        lastErr = e;
        if (opts.signal?.aborted) throw e;
      }
    }
    throw new Error(`OpenAI stream failed after ${retries} attempts: ${(lastErr as Error)?.message}`);
  }

  private async doFetch(body: Record<string, unknown>, externalSignal?: AbortSignal): Promise<Response> {
    this.abortController = new AbortController();
    if (externalSignal) {
      if (externalSignal.aborted) this.abortController.abort();
      else externalSignal.addEventListener("abort", () => this.abortController?.abort(), { once: true });
    }
    return fetch(`${this.cfg.baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: this.abortController.signal,
    });
  }

  // 逐行解析 text/event-stream，累积 delta 并触发回调
  private async consumeStream(
    stream: ReadableStream<Uint8Array>,
    opts: GenerateOptions,
  ): Promise<ChatCompletionResponse> {
    const acc: StreamAccumulator = {
      content: "",
      reasoning: "",
      toolCalls: new Map(),
      finishReason: "stop",
    };
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          let chunk: any;
          try { chunk = JSON.parse(data); } catch { continue; }
          this.applyChunk(chunk, acc, opts);
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      message: this.buildMessage(acc),
      finishReason: acc.finishReason,
      usage: acc.usage,
    };
  }

  // 处理单个 SSE chunk：拆分 content / reasoning / tool_calls 增量
  private applyChunk(chunk: any, acc: StreamAccumulator, opts: GenerateOptions): void {
    if (chunk.usage) acc.usage = mapUsage(chunk.usage);
    const choice = chunk.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) acc.finishReason = choice.finish_reason as FinishReason;

    const delta = choice.delta ?? {};

    if (typeof delta.content === "string" && delta.content.length > 0) {
      acc.content += delta.content;
      opts.streamingFunc?.(delta.content);
    }

    const reasoning = delta.reasoning_content ?? delta.reasoning;
    if (typeof reasoning === "string" && reasoning.length > 0) {
      acc.reasoning += reasoning;
      opts.reasoningStreamingFunc?.(reasoning);
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const i = tc.index ?? 0;
        const cur = acc.toolCalls.get(i) ?? { id: "", name: "", arguments: "" };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) {
          cur.arguments += tc.function.arguments;
          opts.toolCallStreamingFunc?.(tc.function.arguments);
        }
        acc.toolCalls.set(i, cur);
      }
    }
  }

  private buildMessage(acc: StreamAccumulator): ChatCompletionMessage {
    const msg: ChatCompletionMessage = { role: "assistant", content: acc.content };
    if (acc.toolCalls.size > 0) {
      const calls: ToolCall[] = [...acc.toolCalls.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, c]) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: c.arguments },
        }));
      msg.toolCalls = calls;
    }
    return msg;
  }
}

function mapUsage(u: any): Usage | undefined {
  if (!u) return undefined;
  return {
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    totalTokens: u.total_tokens ?? 0,
  };
}
