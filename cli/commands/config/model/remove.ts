import type { Command } from "commander";

import { ensureHelixentHomeEnv, isHelixentSetupComplete, loadConfig, saveConfig } from "@/cli/config";

import { promptSelectModelName } from "./prompt-select-model";

export function registerRemoveCommand(parent: Command): void {
  parent
    .command("remove [model_name]")
    .description("Remove a model configuration by name")
    .action(async (modelName?: string) => {
      ensureHelixentHomeEnv();

      if (!isHelixentSetupComplete()) {
        console.error("No configuration found. Nothing to remove.");
        process.exit(1);
      }

      const config = loadConfig();
      if (config.models.length === 1) {
        console.error("Cannot remove the last model. At least one model must be configured.");
        process.exit(1);
      }

      const resolvedName =
        modelName ??
        (await promptSelectModelName(config, { actionLabel: "remove" }).catch((err: unknown) => {
          console.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }));

      const idx = config.models.findIndex((m) => m.name === resolvedName);
      if (idx === -1) {
        console.error(`Model "${resolvedName}" not found.`);
        process.exit(1);
      }

      config.models.splice(idx, 1);

      if (config.defaultModel === resolvedName) {
        config.defaultModel = config.models[0]?.name;
      }

      saveConfig(config);
      console.info(`Model "${resolvedName}" removed.`);
    });
}
