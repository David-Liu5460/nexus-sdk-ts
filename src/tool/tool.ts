// 对应 Go: schema/tool.go —— BaseTool 接口
import type { Context } from "../context/context.ts";

// 工具入参 Schema：迁移方案中用 JSON Schema（可由 zod-to-json-schema 生成）
export type JSONSchema = Record<string, unknown>;

export interface BaseTool {
  name(): string;
  description(): string;
  schema(): JSONSchema;
  strict(): boolean;
  call(ctx: Context, args: string): Promise<string>;
}

// 便捷基类，方便后续实现具体工具
export abstract class AbstractTool implements BaseTool {
  abstract name(): string;
  abstract description(): string;
  schema(): JSONSchema { return { type: "object", properties: {} }; }
  strict(): boolean { return false; }
  abstract call(ctx: Context, args: string): Promise<string>;
}
