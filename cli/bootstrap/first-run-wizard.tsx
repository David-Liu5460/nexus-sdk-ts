import { Box, render, Text, useInput } from "ink";

import type { HelixentConfig } from "@/cli/config";

import { currentTheme } from "../tui/themes";

import { runModelWizard } from "./model-wizard";

function WelcomeScreen({ onContinue, onAbort }: { onContinue: () => void; onAbort: () => void }) {
  useInput((_input, key) => {
    if (key.return) {
      onContinue();
    }
    if (key.escape) {
      onAbort();
    }
  });

  console.info(`_  _ ____ _    _ _  _ ____ _  _ ___
|__| |___ |    |  \\/  |___ |\\ |  |
|  | |___ |___ | _/\\_ |___ | \\|  | \n\n`);

  return (
    <Box flexDirection="column" rowGap={1}>
      <Text bold color="cyan">
        Welcome to Helixent
      </Text>
      <Text>First run setup: choose a model provider, enter your API key, and pick a model name.</Text>
      <Text color={currentTheme.colors.dimText}>Press Enter to continue, or Esc to quit.</Text>
    </Box>
  );
}

function showWelcomeScreen(): Promise<void> {
  return new Promise((resolve) => {
    const instance = render(
      <WelcomeScreen
        onContinue={() => {
          instance.unmount();
          resolve();
        }}
        onAbort={() => {
          instance.unmount();
          process.exit(1);
        }}
      />,
    );
  });
}

export async function runFirstRunWizard(): Promise<HelixentConfig> {
  await showWelcomeScreen();
  const entry = await runModelWizard();
  return { models: [entry], defaultModel: entry.name };
}
