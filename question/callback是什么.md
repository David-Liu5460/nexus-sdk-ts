# src/callback/ 是干什么的
README.md#L79 提到的 callback/ 模块，是整个 SDK 的 流式事件出口 ——把 Agent 在运行中产生的"片段级"信号，从内部传给外部消费者（UI、日志、SSE 转发等）。它由两个东西组成（见 callback.ts ）：

## 1. Callback 接口：让调用方订阅四类流式事件
callback.ts#L4-L10 定义了五个 可选 钩子，对应 ContentState 枚举：

钩子 触发时机 典型用途 onEvent(ev) 任何事件都先经过这里 统一日志/埋点 onAnswer(delta) LLM 正文 token 增量 往前端逐字吐字 onReasoning(delta) LLM reasoning_content 增量 展示"思考过程" onToolCall(delta) tool_calls.arguments 增量 显示"正在调用工具…" onToolResult(result) 工具执行完毕后的完整结果 显示工具返回

调用方只实现关心的钩子即可，全部可选（ examples/agent-tools.ts#L61-L65 就只订阅了 3 个）。

## 2. dispatchEvent：把 Event 路由到对应钩子
callback.ts#L13-L23 是一段非常薄的"分发器"。它先无差别调一次 onEvent ，再按 ev.state switch 到对应细分钩子。这对应 Go 版的 eventCallback 映射，作用是 让上层不必自己写 switch ：底层只要构造一个 Event 调用 dispatchEvent ，调用方实现哪几个钩子，事件就分发到哪几个钩子。

## 3. 谁在产生这些事件？—— BaseAgent
把 Callback 接进系统的地方是 BaseAgent.run ：

- LLM 的三个流式回调（ streamingFunc / reasoningStreamingFunc / toolCallStreamingFunc ）在 ReAct 循环里被改写成"先调用上层传入的 streamingFunc，再 dispatchEvent 一个对应 ContentState 的事件"。
- 每个工具执行完后，把结果作为 ContentState.ToolResult 事件分发出去（ base.ts#L72 ）。
## 4. 这个模块解决的设计问题
它把" 事件产生方 （LLM SSE 解析器、Agent 工具调度）"和" 事件消费方 （CLI / Web SSE / 日志 / 埋点）"完全解耦：

- LLM 侧（ openai.ts#L173-L196 ）不需要知道有没有 UI、写不写日志，只管把 delta 喂进函数指针。
- Agent 侧只产出语义化的 Event{state, delta} ，不关心下游怎么消费。
- 调用方只实现自己关心的钩子，不用关心事件是从 SSE、还是工具结果、还是 reasoning 流来的。
一句话： callback/ = Agent 的"观察者接口 + 类型化事件路由器"，是流式 ReAct 能"边跑边吐"给外部的桥梁。