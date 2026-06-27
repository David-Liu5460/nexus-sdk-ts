// 对应 Go: schema/interruption_state.go
export enum InterruptionType {
  None = "none",
  Continue = "continue",
  Stop = "stop",
}

export interface InterruptionState {
  question?: string;
  currentNode?: string;
  turnIds: string[];
  interruptionType: InterruptionType;
  isResumed: boolean;
  consumed: boolean;
  sessionStateSnapshot?: Record<string, unknown>;
}

export function serializeInterruption(s: InterruptionState): string {
  return JSON.stringify(s);
}
export function deserializeInterruption(raw: string): InterruptionState {
  return JSON.parse(raw) as InterruptionState;
}
