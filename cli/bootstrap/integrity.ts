import { readFileSync } from "node:fs";

import { parse as yamlParse } from "yaml";

import {
  ensureHelixentHomeDirectory,
  ensureHelixentHomeEnv,
  getConfigFilePath,
  isHelixentSetupComplete,
  loadConfig,
  saveConfig,
} from "@/cli/config";

import { runFirstRunWizard } from "./first-run-wizard";

export async function validateIntegrity(): Promise<void> {
  ensureHelixentHomeEnv();

  // When `config.yaml` exists but has no configured models, we still need bootstrap.
  // Note: `helixentConfigSchema` requires `models.length >= 1`, so we can't rely on `loadConfig()`
  // alone to detect the "empty models" case.
  if (isHelixentSetupComplete()) {
    try {
      const config = loadConfig();
      if (config.models.length > 0) {
        return;
      }
      // If schema constraints change in the future, keep this as a safety check.
    } catch (err) {
      // Detect `models: []` even when schema validation fails.
      try {
        const raw = readFileSync(getConfigFilePath(), "utf8");
        const parsed: unknown = yamlParse(raw);
        const modelsLen = Array.isArray((parsed as { models?: unknown }).models)
          ? (parsed as { models: unknown[] }).models.length
          : undefined;

        if (modelsLen === 0) {
          // Fall through to bootstrap.
        } else {
          // Preserve previous behavior for other invalid config formats.
          throw err;
        }
      } catch {
        // If we can't inspect the YAML, fall back to bootstrap instead of crashing.
      }
    }
    // Fall through to bootstrap.
  }

  ensureHelixentHomeDirectory();
  try {
    const config = await runFirstRunWizard();
    saveConfig(config);
    console.info(`\n\nHelixent setup completed. Config saved to: ${getConfigFilePath()}\n\n`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
