// 对应 Go: schema/application.go —— 递归执行器 + 并发 + 重试/超时 + 中断 + 中间件 + 续跑
import type { Graph, ConditionFunc, Middleware } from "./graph.ts";
import type { Node, NodeConfig } from "./node.ts";
import { END, type Command } from "./command.ts";
import type { Context } from "../context/context.ts";
import type { Callback } from "../callback/callback.ts";
import { InterruptionType } from "../schema/interruption.ts";

export interface InvokeOptions {
  callback?: Callback;
  maxSteps?: number; // 防御性上限，默认 1000
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// 单节点执行：含重试 / 超时 / skipOnError
async function executeNode(
  node: Node,
  ctx: Context,
  callback?: Callback,
): Promise<Command | null> {
  const cfg: NodeConfig = node.config ?? {};
  const maxRetries = cfg.maxRetries ?? 0;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const stopFns: Array<() => void> = [];
      const registerStop = (fn: () => void) => { stopFns.push(fn); };
      const run = node.func(ctx, registerStop, callback);

      if (cfg.timeoutMs && cfg.timeoutMs > 0) {
        const ac = new AbortController();
        const timeout = new Promise<never>((_, reject) => {
          const t = setTimeout(() => {
            stopFns.forEach((f) => f());
            ac.abort();
            reject(new Error(`node ${node.name} timeout after ${cfg.timeoutMs}ms`));
          }, cfg.timeoutMs);
          ac.signal.addEventListener("abort", () => clearTimeout(t));
        });
        return await Promise.race([run, timeout]);
      }
      return await run;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        if (cfg.retryDelayMs) await sleep(cfg.retryDelayMs);
        continue;
      }
    }
  }

  if (cfg.skipOnError) return null;
  throw lastErr;
}

export class Application {
  constructor(private graph: Graph) {}

  async invoke(ctx: Context, opts: InvokeOptions = {}): Promise<void> {
    const it = ctx.getInterruptionState();
    // 续跑：被恢复的上下文从中断节点重放，而非从入口重新开始
    const resuming =
      it.isResumed &&
      it.interruptionType === InterruptionType.Continue &&
      !!it.currentNode;
    const entry = resuming ? it.currentNode! : this.graph.entryPoint!;

    if (resuming) {
      // 进入重放：消费一次中断态，避免下一节点又被当成续跑入口
      it.interruptionType = InterruptionType.None;
      it.consumed = true;
    }

    await this.execute([entry], ctx, opts, 0);
  }

  // 递归执行：流转优先级 Middleware > Command.goto > 条件边 > 静态边 > END
  private async execute(
    current: string[],
    ctx: Context,
    opts: InvokeOptions,
    step: number,
  ): Promise<void> {
    const maxSteps = opts.maxSteps ?? 1000;
    if (step > maxSteps) throw new Error(`exceeded max steps: ${maxSteps}`);

    const nextSet = new Set<string>();

    // 并发执行当前一批节点（对应 Go errgroup）
    const results = await Promise.all(
      current
        .filter((name) => name !== END)
        .map(async (name) => {
          const node = this.graph.nodes.get(name);
          if (!node) throw new Error(`node not found: ${name}`);
          const cmd = await executeNode(node, ctx, opts.callback);
          return { name, cmd };
        }),
    );

    // 中断检查：Stop => 快照本轮状态 + 记录中断节点，优雅返回（可后续 resume 重放）
    const interruption = ctx.getInterruptionState();
    if (interruption.interruptionType === InterruptionType.Stop) {
      if (results[0]) ctx.setInterruptionNode(results[0].name);
      ctx.snapshotSession();
      return;
    }

    for (const { name, cmd } of results) {
      this.applyUpdate(ctx, cmd);
      const next = this.resolveNext(name, cmd, ctx);
      next.forEach((n) => nextSet.add(n));
    }

    const nextNodes = [...nextSet].filter((n) => n !== END);
    if (nextNodes.length === 0) return; // 到达 END
    await this.execute(nextNodes, ctx, opts, step + 1);
  }

  private applyUpdate(ctx: Context, cmd: Command | null): void {
    if (cmd?.update) {
      for (const [k, v] of Object.entries(cmd.update)) ctx.set(k, v);
    }
  }

  private resolveNext(name: string, cmd: Command | null, ctx: Context): string[] {
    // 0. Middleware 最高优先级：按注册顺序，第一个返回非空路由的胜出
    for (const mw of this.graph.middlewares as Middleware[]) {
      const r = mw(name, cmd, ctx);
      if (r && r.length > 0) return r;
    }
    // 1. Command.goto
    if (cmd?.goto && cmd.goto.length > 0) return cmd.goto;
    // 2. 条件边
    const cond: ConditionFunc | undefined = this.graph.conditionalEdges.get(name);
    if (cond) {
      const r = cond(ctx);
      return Array.isArray(r) ? r : [r];
    }
    // 3. 静态边
    const edges = this.graph.edges.get(name);
    if (edges && edges.length > 0) return edges;
    // 4. END
    return [END];
  }
}
