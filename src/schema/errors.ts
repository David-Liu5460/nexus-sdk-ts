// 对应 Go: schema/agent.go 中的 error vars
export class NexusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
export class ErrMissingLLM extends NexusError {
  constructor() { super("missing LLM"); }
}
export class ErrMissingName extends NexusError {
  constructor() { super("missing agent name"); }
}
export class ErrMissingDesc extends NexusError {
  constructor() { super("missing agent description"); }
}
export class ErrStop extends NexusError {
  constructor() { super("agent stopped"); }
}
export class ErrNotFinished extends NexusError {
  constructor() { super("agent not finished"); }
}
export class ErrMaxIterations extends NexusError {
  constructor(n: number) { super(`reached max iterations: ${n}`); }
}
