// 对应 Go: schema/graph.go
import type { Node } from "./node.ts";
import type { Command } from "./command.ts";
import type { Context } from "../context/context.ts";
import { Application } from "./application.ts";

export type ConditionFunc = (ctx: Context) => string | string[];

// Middleware：流转优先级最高的全局拦截器（对应 Go resolveNext 顶层）。
// 返回非空数组 => 覆盖 goto/条件边/静态边；返回 undefined => 下沉到常规优先级。
export type Middleware = (
  name: string,
  cmd: Command | null,
  ctx: Context,
) => string[] | undefined;

export interface GraphOptions {
  namespace?: string;
}

export class Graph {
  readonly nodes = new Map<string, Node>();
  readonly edges = new Map<string, string[]>();
  readonly conditionalEdges = new Map<string, ConditionFunc>();
  // 按注册顺序执行的中间件链；第一个返回非空路由的胜出。
  readonly middlewares: Middleware[] = [];
  entryPoint?: string;
  namespace: string;

  constructor(opts: GraphOptions = {}) {
    this.namespace = opts.namespace ?? "default";
  }

  addNode(node: Node): this {
    if (this.nodes.has(node.name)) throw new Error(`duplicate node: ${node.name}`);
    this.nodes.set(node.name, node);
    return this;
  }

  addEdge(from: string, to: string): this {
    const list = this.edges.get(from) ?? [];
    list.push(to);
    this.edges.set(from, list);
    return this;
  }

  addConditionalEdge(from: string, cond: ConditionFunc): this {
    this.conditionalEdges.set(from, cond);
    return this;
  }

  // 注册中间件（可多次调用，按注册顺序短路求值）
  useMiddleware(mw: Middleware): this {
    this.middlewares.push(mw);
    return this;
  }

  setEntryPoint(name: string): this {
    this.entryPoint = name;
    return this;
  }

  compile(): Application {
    if (!this.entryPoint) throw new Error("entry point not set");
    if (!this.nodes.has(this.entryPoint)) {
      throw new Error(`entry point node not found: ${this.entryPoint}`);
    }
    return new Application(this);
  }
}
