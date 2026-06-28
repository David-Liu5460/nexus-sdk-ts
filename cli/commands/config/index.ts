import type { Command } from "commander";

import { registerModelCommands } from "./model";

export function registerConfigCommands(program: Command): void {
  const config = program.command("config").description("Manage Helixent configuration");
  registerModelCommands(config);
}
