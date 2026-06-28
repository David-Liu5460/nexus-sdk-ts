// 对应 Go: node/human_in_loop.go —— 节点级人机交互(HITL)封装
// 把"中断 → 询问用户 → 恢复执行"的完整流程封装成一个 NodeFunc/Node,
// 作为图(Graph)中的固定审批/反问检查点。
//
// 与工具级 askUser 的区别:
//   - HumanInLoopNode 是「节点级」:在图里固定位置触发,由编排流程决定时机(确定性审批卡点)
//   - askUser Tool   是「工具调用级」:由 LLM 在 ReAct 循环中自行决定何时反问
import type { Context } from "../context/context.ts";
import type { Callback } from "../callback/callback.ts";
import { dispatchEvent } from "../callback/callback.ts";
import { ContentState } from "../schema/event.ts";
import type { Command } from "../core/command.ts";
import type { Node, NodeConfig, NodeFunc, RegisterStopFunc } from "../core/node.ts";

// HumanInLoopAskFunc:触发反问逻辑的回调,返回要问用户的问题
// (对齐 Go HumanInLoopAskFunc)
export type HumanInLoopAskFunc = (ctx: Context) => string | Promise<string>;

// HumanInLoopResumeResult:resumeFunc 的返回结构
//   - interrupt=true  => 需要再次反问(多轮追问),question 为新问题
//   - interrupt=false => 反问结束,next 为继续执行的路由指令(可为 null 走默认边)
export interface HumanInLoopResumeResult {
  interrupt: boolean;
  question?: string;
  next?: Command | null;
}

// HumanInLoopResumeFunc:接收用户回答后的处理逻辑
// userInput 取自 ctx.userQuery()(对齐 Go nexusCtx.UserQuery().Query)
// (对齐 Go HumanInLoopResumeFunc,把 (interrupt, question, command, err) 收敛为对象 + throw)
export type HumanInLoopResumeFunc = (
  ctx: Context,
  userInput: string,
) => HumanInLoopResumeResult | Promise<HumanInLoopResumeResult>;

// HumanInLoopOptions:创建参数(对齐 Go 的 WithHILName/WithAskFunc/WithResumeFunc/WithHILNodeConfig/WithCustomData)
export interface HumanInLoopOptions {
  name?: string;                          // WithHILName,默认 "human_in_loop"
  askFunc: HumanInLoopAskFunc;            // WithAskFunc(必填)
  resumeFunc: HumanInLoopResumeFunc;      // WithResumeFunc(必填)
  config?: NodeConfig;                    // WithHILNodeConfig
  customData?: Record<string, unknown>;  // WithCustomData
}

export const DEFAULT_HIL_NODE_NAME = "human_in_loop";
// 每个 HIL 节点在 ctx state 中记录自身"已发问、等待回答"的标记前缀。
// 该状态会随 snapshotSession() 落入中断快照,并在 resume() 时回填,
// 因此节点能跨进程/跨 invoke 判断"本节点是否处于待恢复态"。
const PENDING_PREFIX = "__hil_pending__:";

// newHumanInLoopNode:创建一个节点级 HITL 节点(对齐 Go NewHumanInLoopNode)
// 返回可直接 graph.addNode 的 Node;askFunc/resumeFunc 缺失时抛错。
export function newHumanInLoopNode(opts: HumanInLoopOptions): Node {
  if (!opts.askFunc) throw new Error("humanInLoop askFunc is required");
  if (!opts.resumeFunc) throw new Error("humanInLoop resumeFunc is required");

  const name = opts.name ?? DEFAULT_HIL_NODE_NAME;
  const askFunc = opts.askFunc;
  const resumeFunc = opts.resumeFunc;
  const pendingKey = PENDING_PREFIX + name;

  const func: NodeFunc = async (
    ctx: Context,
    _registerStop: RegisterStopFunc,
    callback?: Callback,
  ): Promise<Command | null> => {
    const state = ctx.getInterruptionState();
    const pending = ctx.get<boolean>(pendingKey) === true;
    // 仅当"本节点此前已发问(pending)"且"当前 invoke 是被恢复的"时,才走 resume 分支。
    // 否则(首次进入,或恢复目标是别的节点)一律走 ask 分支。
    const resumeForThisNode = pending && state.isResumed;

    if (!resumeForThisNode) {
      // —— Ask 分支:发问并中断 ——
      const question = await askFunc(ctx);
      ctx.addMessage({ role: "assistant", name, content: question });
      await emit(callback, question);
      ctx.set(pendingKey, true);  // 标记待恢复(随快照持久化)
      ctx.interrupt(question);    // 置 Stop,引擎将快照并优雅退出
      return null;
    }

    // —— Resume 分支:处理用户回答 ——
    const userInput = ctx.userQuery();
    const result = await resumeFunc(ctx, userInput);

    if (result.interrupt) {
      // 多轮追问:再次发问并中断,pending 保持 true
      const question = result.question ?? "";
      ctx.addMessage({ role: "assistant", name, content: question });
      await emit(callback, question);
      ctx.interrupt(question);
      return null;
    }

    // 反问结束:清除待恢复标记,返回路由指令(null 则走默认边)
    ctx.set(pendingKey, false);
    return result.next ?? null;
  };

  return { name, func, config: opts.config };
}

// emit:把问题文案经 callback 以 Answer 事件分发(对齐 Go cb.StreamingFuncCallback)
async function emit(callback: Callback | undefined, question: string): Promise<void> {
  if (!callback || !question) return;
  await dispatchEvent(callback, { state: ContentState.Answer, delta: question });
}
