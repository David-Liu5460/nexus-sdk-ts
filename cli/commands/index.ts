import type { Command } from "commander";

import { registerConfigCommands } from "./config";

export function registerCommands(program: Command): void {
  registerConfigCommands(program);
}
