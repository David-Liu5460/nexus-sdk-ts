Nexus 是字节跳动广告技术团队开发的企业级多智能体框架（Go），以"图编排 + 上下文驱动 + 高度可插拔"为核心，支持 ReAct Agent、Multi-Agent 图编排、Context 分层压缩、DeepConf 多路评审、Human-in-Loop 等能力。
- 联系我们：需求沟通、接入使用指导、技术支持请加 OceanAI 用户交流群，业务合作或 AI Agent 调优经验交流，请联系 @李小宇 @刘永超 @梁楚义 @陈威 
暂时无法在飞书文档外展示此内容

【使用必读】
1. 当前OceanAI相关服务只在中国区集群部署，因安全限制原因，无法在TT集群使用和部署SDK应用。

辅助能力
为了帮助用户快速了解和基于Nexus 进行开发，以及在coco claude-code trae 上也能实现nexus应用的开发，我们提供了两种模式供用户使用
Nexus机器人
在线使用（两个平台均可）
- https://oceancloud.bytedance.net/ocean_ai/chatbot?agentId=386&hide_header=1&spaceId=59
- https://oceanai.aipa.bytedance.net/?appName=nexus&requestMethod=POST&serverUrl=https%3A%2F%2Fzjilh089.fn.bytedance.net%2Frun_sse
用户群内艾特
[图片]
Nexus Skill
https://oceancloud.bytedance.net/ocean_ai/context/skill/manage/363
这个skill，可以下载并加载到claude-code coco trae 等cli里面使用
通过 /nexus 来加载这个skill


---
目录
- 第一章：快速开始
  - [核心概念] — Agent、Graph、Context、Tool、Callback 概念介绍
  - [5 分钟快速上手] — 第一个 Agent、第一个 Graph，强烈建议参考这个文档初始化项目
  - [自定义安装与配置] — 环境要求、依赖安装、基本配置

- 第二章：架构概览
  - [整体架构概览] — 分层架构、数据流、设计理念
  - [模块地图] — 各包职责、依赖关系

- 第三章：Schema 层
  - [核心接口定义] — Agent、LLM、Tool、Callback、Context 接口定义
  - [数据类型]— ChatMessage、ToolCall、Roadmap 等核心数据结构
  - [Command 系统] — 节点控制命令、路由机制

- 第四章：Agent
  - [BaseAgent] — ReAct 循环、选项配置、运行机制
  - [FornaxAgent] — FornaxAgent
  - [SkillAgent] — 技能加载、Skill 文件格式
  - [自定义 Agent] — 实现 schema.Agent 接口
  - [选择合适的Agent] - 根据你的业务需求，选择合适的Agent来实现

- 第五章：Graph 图编排
  - [Graph 基础] — 节点、边、编译、执行
  - [条件路由] — ConditionalEdge、动态路由
  - [中间件] — GraphMiddleware、全局拦截
  - [Human-in-Loop 节点] — 内置 HIL 节点配置
  - [Multi-Agent 图示例] — 多 Agent 协作、并行执行
  
- 第六章：Context 上下文
  - [Context 概述] — Context 接口、生命周期
  - [上下文压缩与裁剪] — AutoCompaction、AutoContextEditing
  - [Roadmap 分层] — 三层 Roadmap、历史/近期/当前
  - [状态管理] — Shared/Private 状态
  - [OceanAI Context] — 生产级 Context 实现
    
- 第七章：LLM
  - [LLM 接口] — schema.LLM、GenerateOption
  - [OpenAI LLM] — OpenAI/Azure 对接
  - [Fornax LLM] — 内部 Fornax 平台对接
  - [自定义 LLM] — 实现 schema.LLM 接口
    
- 第八章：Tool 工具
  - [Tool 接口] — BaseTool 接口、Schema 定义
  - [RAG 工具] — ByteRAG 检索增强工具
  - [文件工具] — Read、Write、GrepSearch 等 11 个内置工具
  - [MCP 工具] — 通用 MCP、FAAS MCP、OceanAI MCP
  - [AskUser 工具] — 用户交互工具
  - [自定义工具] — 实现 BaseTool 接口
    
- 第九章：Callback 回调
  - [Callback 接口] — 11 个回调钩子定义
  - [内置 Callback] — EventCallback、EventHttpCallback、ChainCallback、EmptyCallback
  - [Lark Callback] — 飞书机器人消息推送
  - [自定义 Callback] — 实现 schema.Callback 接口
    
- 第十章：Human-in-the-Loop
  - [中断类型] — None/Continue/Stop 三种中断
  - [触发HITL的两种方式] — 使用 AskUserTool 和 HumanInLoopNode，用户介入
  - [恢复执行] — 中断恢复机制、状态快照
    
- 第十一章：Eval 评估
  - [多路规划] — 多路召回与规划
  - [评估引擎] — EvalEngine 工作原理
  - [DeepConf 算法] — 多路评审、置信度融合

- 第十二章：Feedback 反馈
  - [Feedback 核心定义] — Feedback 接口、Chain 组合、质量反馈机制
  - [内置 Feedback] — JSON Feedback、内置实现
    
- 第十三章：平台集成与部署
  - [Lark 机器人] — 飞书机器人集成与部署使用
  - [HTTP Server 部署] — deploys/http 部署模式，启动自定义Agent

- 第十四章：更多辅助功能
  - [日志配置] — log 包、结构化日志
  - [提示词模板] — PromptTemplate、变量替换
  - [沙箱执行] — Sandbox 沙箱详解

- 第十五章：示例集
  - [单 Agent 示例] — 最简 BaseAgent 示例
  - [Multi-Agent 图示例] — 多 Agent 图编排
  - [Plan-Act 示例] — 规划-执行模式


---
模块速查表
code.byted.org/ad/nexus/
├── schema/          # 所有核心接口定义（必读）
├── agent/           # BaseAgent、SkillAgent、FornaxAgent
├── context/         # NexusContext、OceanAIContext
├── llm/             # Fornax、OpenAI 等 LLM 实现
├── tool/            # File、MCP、RAG、AskUser 工具
├── callback/        # EventCallback、LarkCallback 等
├── feedback/        # 反馈链机制
├── eval/            # DeepConf 评估引擎
├── node/            # 内置节点（HumanInLoop）
├── prompt/          # Prompt 模板
├── deploys/         # HTTP/Lark 部署模式
└── examples/        # 完整可运行示mn例

---
关键约定
- NodeFunc 签名：func(ctx context.Context, nctx schema.Context, registerStopFunc func(func(schema.Context)), callback schema.Callback) (*schema.Command, error)
- Agent.Run 签名：Run(ctx, nctx, messages []ChatCompletionMessage, opts ...GenerateOption) (*ChatCompletionResponse, error)
- Graph 创建：schema.NewGraph(nctx, opts...) → g.Compile() → app.Invoke(ctx, msg)
- 中断类型：InterruptionTypeNone / InterruptionTypeContinue / InterruptionTypeStop

---
