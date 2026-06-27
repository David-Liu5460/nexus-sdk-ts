// 最小可运行示例：构建一个 3 节点 DAG 并执行
import { Graph } from "../src/core/graph.ts";
import { gotoNode, gotoEnd, updateState } from "../src/core/command.ts";
import { MemoryContext } from "../src/context/memory.ts";

const g = new Graph();
g.addNode({ name: "plan", func: async () => { console.log("→ plan"); return gotoNode("act"); } });
g.addNode({ name: "act", func: async () => { console.log("→ act"); return updateState({ done: true }); } });
g.addNode({ name: "finish", func: async () => { console.log("→ finish"); return gotoEnd(); } });
g.addEdge("act", "finish");
g.setEntryPoint("plan");

const ctx = new MemoryContext({ query: "hello nexus" });
await g.compile().invoke(ctx);
console.log("state:", ctx.map());
