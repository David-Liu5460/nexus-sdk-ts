// 对应 Go: schema/command.go
export const END = "END";

export interface Command {
  goto?: string[];
  update?: Record<string, unknown>;
}

export class CommandBuilder {
  private cmd: Command = {};
  goto(...nodes: string[]): this { this.cmd.goto = nodes; return this; }
  update(patch: Record<string, unknown>): this {
    this.cmd.update = { ...(this.cmd.update ?? {}), ...patch };
    return this;
  }
  build(): Command { return this.cmd; }
}

export const gotoNode = (n: string): Command => ({ goto: [n] });
export const gotoNodes = (...n: string[]): Command => ({ goto: n });
export const gotoEnd = (): Command => ({ goto: [END] });
export const updateState = (patch: Record<string, unknown>): Command => ({ update: patch });
export const gotoWithUpdate = (n: string, patch: Record<string, unknown>): Command =>
  ({ goto: [n], update: patch });
