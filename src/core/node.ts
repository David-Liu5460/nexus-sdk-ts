// 对应 Go: schema/node.go
import type { Command } from "./command.ts";
import type { Context } from "../context/context.ts";
import type { Callback } from "../callback/callback.ts";

export interface NodeConfig {
  maxRetries?: number;     // 默认 0
  retryDelayMs?: number;   // 默认 0
  timeoutMs?: number;      // 默认 无超时
  skipOnError?: boolean;   // 默认 false
}

export type RegisterStopFunc = (fn: () => void) => void;

export type NodeFunc = (
  ctx: Context,
  registerStop: RegisterStopFunc,
  callback?: Callback,
) => Promise<Command | null>;

export interface Node {
  name: string;
  func: NodeFunc;
  close?: () => Promise<void> | void;
  config?: NodeConfig;
}
