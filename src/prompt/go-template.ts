// 对应 Go: prompt/prompt_template.go —— PromptTemplate.Format 的最小子集移植。
//
// Go BaseAgent 的系统指令(base_instruction.txt)用的是 Go text/template 语法:
//   {{ .key }}                    变量替换
//   {{ if .key }}...{{ end }}     条件块(key 为真值时渲染)
//   {{ if .key }}...{{ else }}... {{ end }}
// 这里实现一个零依赖的等价渲染器, 覆盖 Agent 指令模板实际用到的语法子集,
// 以便把 Go 侧的 prompts/base_instruction.txt 原样搬过来直接用。

export type TemplateValues = Record<string, unknown>;

// 真值判定对齐 Go text/template: 空字符串/0/false/null/undefined/空数组/空对象 视为 false。
function isTruthy(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.length > 0;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

function stringify(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

interface Token {
  kind: "text" | "var" | "if" | "else" | "end";
  // text: 原文; var/if: 变量名(去掉前导 .)
  value: string;
}

// 词法分析: 把模板切成 文本 / {{ ... }} 动作 序列。
function tokenize(tpl: string): Token[] {
  const tokens: Token[] = [];
  const re = /\{\{(.*?)\}\}/gs;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl)) !== null) {
    if (m.index > last) tokens.push({ kind: "text", value: tpl.slice(last, m.index) });
    const expr = m[1]!.trim();
    if (expr === "end") {
      tokens.push({ kind: "end", value: "" });
    } else if (expr === "else") {
      tokens.push({ kind: "else", value: "" });
    } else if (expr.startsWith("if ")) {
      tokens.push({ kind: "if", value: normalizeKey(expr.slice(3).trim()) });
    } else {
      tokens.push({ kind: "var", value: normalizeKey(expr) });
    }
    last = re.lastIndex;
  }
  if (last < tpl.length) tokens.push({ kind: "text", value: tpl.slice(last) });
  return tokens;
}

// 去掉变量引用的前导点: ".prompt" -> "prompt"
function normalizeKey(ref: string): string {
  return ref.startsWith(".") ? ref.slice(1) : ref;
}

// 递归渲染 token 流, 返回 [渲染结果, 消费到的 token 下标]。
function renderTokens(
  tokens: Token[],
  start: number,
  values: TemplateValues,
  stopOnElseEnd: boolean,
): [string, number] {
  let out = "";
  let i = start;
  while (i < tokens.length) {
    const tok = tokens[i]!;
    if (tok.kind === "text") {
      out += tok.value;
      i++;
    } else if (tok.kind === "var") {
      out += stringify(values[tok.value]);
      i++;
    } else if (tok.kind === "if") {
      const cond = isTruthy(values[tok.value]);
      // 渲染 then 分支(直到 else/end)
      const [thenStr, afterThen] = renderTokens(tokens, i + 1, values, true);
      let branchStr = cond ? thenStr : "";
      let cursor = afterThen;
      if (tokens[cursor]?.kind === "else") {
        const [elseStr, afterElse] = renderTokens(tokens, cursor + 1, values, true);
        if (!cond) branchStr = elseStr;
        cursor = afterElse;
      }
      // cursor 此刻指向 end
      out += branchStr;
      i = cursor + 1; // 跳过 end
    } else if (tok.kind === "else" || tok.kind === "end") {
      if (stopOnElseEnd) return [out, i];
      i++; // 容错: 孤立的 else/end 直接忽略
    } else {
      i++;
    }
  }
  return [out, i];
}

// Format: 渲染 Go 风格模板。语法错误时尽量降级(返回原样文本), 不抛异常。
export function formatGoTemplate(tpl: string, values: TemplateValues = {}): string {
  const tokens = tokenize(tpl);
  const [out] = renderTokens(tokens, 0, values, false);
  return out;
}
