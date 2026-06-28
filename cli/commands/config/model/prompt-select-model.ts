import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline/promises";

import type { HelixentConfig } from "@/cli/config";

type PromptSelectModelNameOptions = {
  /** Short verb phrase used in UI, e.g. "remove" / "set as default". */
  actionLabel: string;
  /** When set, this model will not be offered as a choice. */
  excludeName?: string;
};

export async function promptSelectModelName(
  config: HelixentConfig,
  opts: PromptSelectModelNameOptions,
): Promise<string> {
  const models = config.models.filter((m) => m.name !== opts.excludeName);
  if (models.length === 0) {
    throw new Error("No models available to select.");
  }

  // Commander actions can be invoked in contexts where stdin is not a TTY
  // (e.g. when stdin is piped), even though the user is still at a terminal.
  // Use /dev/tty when available so interactive selection still works.
  const input = process.stdin.isTTY ? process.stdin : createReadStream("/dev/tty");
  const output = process.stdout.isTTY ? process.stdout : createWriteStream("/dev/tty");

  console.info("Configured models:\n");
  for (const [i, m] of models.entries()) {
    const isDefault = config.defaultModel ? config.defaultModel === m.name : false;
    console.info(`  ${i + 1}. ${m.name}${isDefault ? " (default)" : ""}`);
  }
  console.info();

  const rl = createInterface({ input, output });
  try {
    // Keep prompting until we get a valid selection or EOF.
    // readline/promises throws on closed input; we treat that as cancellation.
    while (true) {
      const raw = (await rl.question(`Select a model to ${opts.actionLabel} (1-${models.length}): `)).trim();
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 1 && n <= models.length) {
        return models[n - 1]!.name;
      }
      console.error(`Invalid selection "${raw}". Please enter a number between 1 and ${models.length}.`);
    }
  } finally {
    rl.close();
    // If we had to open /dev/tty streams, ensure they close.
    if (input !== process.stdin) input.destroy();
    if (output !== process.stdout) output.end();
  }
}

