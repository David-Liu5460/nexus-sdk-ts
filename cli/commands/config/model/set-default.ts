import type { Command } from "commander";

import { ensureHelixentHomeEnv, isHelixentSetupComplete, loadConfig, saveConfig } from "@/cli/config";

import { promptSelectModelName } from "./prompt-select-model";

export function registerSetDefaultCommand(parent: Command): void {
  parent
    .command("set-default [model_name]")
    .description("Set the default model by name")
    .action(async (modelName?: string) => {
      ensureHelixentHomeEnv();

      if (!isHelixentSetupComplete()) {
        console.error("No configuration found. Run `helixent config model add` to add a model first.");
        process.exit(1);
      }

      const config = loadConfig();
      const resolvedName =
        modelName ??
        (await promptSelectModelName(config, { actionLabel: "set as default" }).catch((err: unknown) => {
          console.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }));

      const exists = config.models.some((m) => m.name === resolvedName);
      if (!exists) {
        console.error(`Model "${resolvedName}" not found.`);
        process.exit(1);
      }

      config.defaultModel = resolvedName;
      saveConfig(config);
      console.info(`Default model set to "${resolvedName}".`);
    });
}

