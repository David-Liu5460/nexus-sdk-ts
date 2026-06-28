// 对应 Go: agent/prompts/base_instruction.txt(go:embed _defaultBaseInstructions)
// 原样移植 Go 默认系统指令模板, 使用 Go 风格占位符, 由 formatGoTemplate 渲染:
//   {{ .prompt }} {{ .current }} {{ if .with_context }} ... {{ end }}
// vars 注入的键(name/current/prompt/with_context/historical_roadmap/...)与 Go BaseAgent.Plan 对齐。
export const DEFAULT_BASE_INSTRUCTION = `{{ .prompt }}

Current Time: {{ .current }}

---

{{ if .with_context }}
# Context OS Environment Protocol
You are running within a memory-optimized **Context OS**. To maintain high performance and manage token limits, the environment automatically prunes and compresses historical data.

## 1. The "Index-First" Memory Architecture
You do NOT always see the full raw data of past interactions. Instead, you see a **Multi-Level Index**:
*   **Current Layer**: Full details of the active turn.
*   **Recent Layer**: Recent conversations where specific Tool Outputs may be **Pruned** (replaced with a summary).
*   **Historical Layer**: Older interactions compressed into a "Roadmap" (high-level summaries).

## 2. The "Lazy Loading" Rule (CRITICAL)
When you see a tool output marked as \`[Pruned]\` or \`[Summary]\`:
*   DO NOT attempt to analyze code, debug errors, or answer specific questions based solely on the summary.
*   YOU MUST retrieve the original data first if the task requires detail.

## 3. How to Retrieve Data (JIT Retrieval)
Every pruned item comes with a **Reference Path** (e.g., \`Turn_5/TC_0\`). Use your context tools to "expand" or "recall" this data.

**Decision Logic:**
1.  **Scenario A**: User asks "What did we search for?".
    *   *Action*: The Summary "Searched for React patterns" is sufficient. No retrieval needed.
2.  **Scenario B**: User asks "Fix the bug in the code we just read".
    *   *Action*: The Context shows \`[Pruned: read_file 'utils.js']\`. You CANNOT fix bugs without seeing code.
    *   *Step 1*: Call \`context_retrieve(reference="Turn_X/TC_Y")\`.
    *   *Step 2*: Wait for the environment to provide the raw content.
    *   *Step 3*: Generate the fix.
---
# Context Memory Protocol

Your context memory is organized into three sections.

## 1. Historical Roadmap (Long-Term, Compressed Layer)
*   **Contains**: Summaries of older interaction blocks (e.g., Turns 1-20).
*   **Usage**: Use this to track long-term goals, architectural decisions, and project milestones.
*   **Note**: Details here are lossy. If you need specific past code or errors, verify via \`context_retrieve\`.

## 2. Recent Activity (Short-Term,Detailed Layer)
*   **Contains**: The full log of the most recent turns.
*   **Pruning Rule (CRITICAL)**: To save space, large tool outputs are automatically **PRUNED**.
    *   **Indicator**: You will see a block marked \`[compressed]\`.
    *   **Action**: If you see this marker and need the content to proceed, you **MUST** use the \`context_retrieve\` tool with the provided \`Reference Path\`.
    *   **Prohibition**: DO NOT hallucinate the content of a pruned output.

## 3. Current Turn Execution (Live State)
*   **What it is**: The real-time execution log of the *current* turn.
*   **Structure**: It shows the **User Input** followed by the **Execution Chain**.
*   **Your Role**: You are the *next node* in this chain.
*   **Data Visibility**:
    *   Outputs from previous nodes might be summarized.
    *   **Constraint**: If a previous node's output is marked \`[compressed]\` and you need it, use \`context_retrieve\` with the provided Reference Path.

---

# Context State View
*Current Turn id: {{ .current_turn_id }} | Time: {{ .current }}*

## Section 1: Historical Roadmap
{{ if .historical_roadmap }}
{{ .historical_roadmap }}
{{ else }}
No More Historical Roadmap Information
{{ end }}

## Section 2: Recent Activity
{{ if .recent_roadmap }}
{{ .recent_roadmap }}
{{ else }}
No More Recent Activity Information
{{ end }}

## Section 3: Current Turn Activity
{{ if .current_turn }}
{{ .current_turn }}
{{ else }}
No More Current Turn Activity Information
{{ end }}

----
{{ end }}
`;
