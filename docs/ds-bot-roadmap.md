# ds-bot 迭代 Roadmap：IM 换血 · standard 模板 · lane 协议 · 工作区面板 · 原生卡片

> 状态：roadmap（2026-11-18）· 基线：DS-Bot stable @ v0.3.8（`5e9b7da8`）、dsh-im detached @ v5.10.0（`c826bfa4`）、dsh stable @ `dsh-v0.2.1-rc.5`
> R1 的详细设计稿：[ds-bot-dsh-im-qq-feishu.md](./ds-bot-dsh-im-qq-feishu.md)（基于 ds-bot 0.3.6 调研，落地前在 0.3.8 复核 file:line）
> 本文 `file:line` 均为当前检出的实证位置；ds-bot 路径相对 `plugins/DS-Bot/ds-bot/`，dsh 路径相对 `dsh/`。

## 0. 六条线与需求对照

| 线 | 内容 | 对应需求 | 性质 |
|---|---|---|---|
| R0 | 基线对齐——**已裁决不做**（0.2.1-rc.5 实测可用） | 已关闭 | — |
| R1 | IM 换血：dsh-im 桥接接管 QQ/飞书，废除 ds-bot 自带 IM 层 | 需求 1 | ds-bot + dsh-im |
| R2 | 新增 standard 模板 Bot（无 message_bot/协作提示词） | 需求 2 | ds-bot |
| R3 | lane 通信协议（lane = 普通 dsh 会话，standard Bot 派活/收反馈） | 需求 3 | ds-bot |
| R4 | 面板扩展：原始工作区模式（每工作区一块会话板，lane 上板） | 需求 4 | ds-bot |
| R5 | 撤掉会话替身，回归 dsh 原生会话卡片（思考/工具调用/详情可调） | 需求 5 | ds-bot |

**依赖链**：R1a（配置桥）→ R2 → R3 → R4；R1b（废除代码）在 R1a 验证通过后执行；R5 与 R2/R4 并行分步（standard Bot 先行），team Bot 撤皮收尾；R1c（dsh-im 补发修复）视 R1a 后观察决定。R0 已裁决不做（见决策记录）。

---

## R0 基线——已裁决：不重定（2026-11-18）

- **dsh 0.2.1-rc.5 已实测可用（用户验证），基线不动，此后勿再提议重定**。本事实已同步记入工作区 AGENTS.md 与 skill ds-bot-dev；R3–R5 依赖的 `sessionController` / `workspaceController` / `sidebarRightTabs` / slots API 均已在该基线上实证存在（见各线 file:line）。
- 仅当真实出现 API 不兼容报错时才按 skill **dsh-release-bump** 重定到 `dsh-v0.2.2-rc.1`；`stash@{0}` 维持现状（弹取条件不变）。
- dsh-im 现为 detached @ v5.10.0：R1c 动代码前建 `stable` 分支，让改动有基线可归。

## R1 IM 换血（需求 1）

目标：QQ/飞书的连接、消息格式、送达质量全权交给 dsh-im，ds-bot 只出 Bot 能力（长活会话/记忆/协作）；ds-bot 自带 IM 平台层**代码废除**（设计稿原本只到配置层桥接，废除代码是本 roadmap 新增范围）。

### R1a 桥接验证（0 行代码，设计稿 §4.2 Phase 0）

两插件同 Host、ds-bot 侧 QQ/飞书连接清空、dsh-im 配置 QQ bot + 飞书 bot、私聊绑定 `bindDsBot`、开 `deliverModelAnswers`。验证清单见设计稿 §8。

### R1b 废除 ds-bot IM 层（改 ds-bot，M1 后执行）

| 面 | 内容 |
|---|---|
| 废除 | host：`src/host/im/`（`index.js` 文本中继"在线才发"、`platforms/qq.js` 被动窗口、`platforms/feishu.js` 纯文本卡）及 `channel.js` 中 IM 连接管理端点；client：`im-page.js` 与连接相关设置 UI |
| 保留 | 群聊 rooms（Bot↔Bot 群协作，与 IM 平台层无关）；`connectors/`（mail 等，非 IM）；`resume.js` 补发记账（会话层双保险） |
| 前置 | **R1a 验证通过后再删**（先并行、后删除） |
| 不可逆面 | dsh-im 未覆盖的渠道（TG/微信等）随删除消失——已确认只需飞书+QQ 即可执行 |

验收：设计稿 §8 清单 + 删除后 `npm test` / `lint` / `--check` + 冒烟全绿；设置页无 ds-bot IM 入口；绑定、滚动跟随、模型变更 bot 级生效均正常。

### R1c dsh-im 后台任务补发修复（改 dsh-im，可选、观察后）

原设计稿 Phase 2：`bound()` 跟随 ds-bot part 滚动（R1）、断线失败也登记补发（R3）。R2 配置开关（`deliverModelAnswers`）已在 R1a 解决大半，观察一周再决定是否动代码。

## R2 新增 standard 模板 Bot（需求 2）

**现状**：Bot 记录无类型字段（`roster.js:211-226` buildBot 字段表），类型是结构性的——Main Bot 走 `state.mainBotIds`、本地 CLI 走 `model` 的 `local-` 前缀、DSH Agent 是独立的 `state.agents`。"bot-message 语义"（代码中即 `message_bot` 协作体系）全部来自注入物：

- `promptFor` 给**所有** Bot 拼 MAIN_RULES（仅 Main）+ TEAM_RULES（全员协作规则）：`prompt.js:49-55`；
- TEAM_TOOLS 给所有 Bot 会话注册 `message_bot` / `list_bots` / `reply` / `update_bot` / `stop_bot` 等协作工具，工具 description 本身带协作语义：`constants.js:74-81` + `tools.js:929-966`。

新增 `template` 字段区分（`'team'` 默认 | `'standard'`），standard = 干净模板（仅身份 + instructions，无协作规则、无协作工具）：

| 改动点 | 位置 | 内容 |
|---|---|---|
| 存储字段 | `roster.js:211-226` buildBot | 加 `template`；存量 Bot 迁移默认 `'team'`，零行为变化 |
| 创建链路 | `client/bot-draft.js:21-30` → `channel.js:392` → roster | payload 透传；`create-bot.js` 表单加模板选择（团队 Bot / Standard） |
| 提示词分支 | `prompt.js:49-55` promptFor | standard：仅 `# Your identity`（name/role/instructions），不拼 MAIN_RULES/TEAM_RULES |
| 工具 scope | `tools.js:956-966` syncScopedTools + `constants.js` TEAM_TOOLS | standard 会话不注册协作工具——不注册即干净 |
| 引用文案 | `tools.js:39` DELEGATION_REFUSAL、`memory.js:417-419`、`memory-copy.js:19,28`、`roster.js:233-243` kickoff OWN_RULES | standard 分支换无协作措辞 |
| 客户端 | `cells.js` / `mark.js` 仅展示层 | 可不改 |

**决策（已定，2026-11-18）：ask_user 全局拆**——按原设计稿 Phase 1 全量执行（删 `ask_user` 工具注册、禁 `show_view` 交互视图、改写 prompt 三处，§4.3），team 与 standard 一律拆（ask_user 判定没用）。桥上的问题卡同步（`ds-bot-question-sync.mjs`）与 QQ"去桌面端回答"降级文本随之自然消失。

验收：创建 Standard Bot → 其会话 system prompt 无 MAIN_RULES/TEAM_RULES、无协作工具；既有 team Bot 零变化；构建检查全套绿。

> **进度（2026-11-18）**：已落地于 DS-Bot 分支 `feat/standard-template`（`ab6b2689`）——template 字段/创建链路/提示词分支/工具 scope/文案分支/i18n（7 语言）/create 表单选择，连同裁决的 ask_user 全局退役（含交互视图拒绝）；设计文档在 DS-Bot `docs/plans/2026-11-18-standard-template.md`。`npm test` 2887 过（3 个失败均为本工作区环境性：link/ 缺依赖 ×2、Windows symlink EPERM ×1）、lint/--check 绿、冒烟 51 步全绿（`dev/bench.sh`+mock）。**尚未装进桌面端**；push/PR 待定。

## R3 lane 通信协议（需求 3）

**定义**：lane = 一个**普通 dsh 会话**（header.origin 未设置，`packages/core/session/src/types.ts:95-124`），挂在工作区账目下，由 standard Bot 派活与收反馈。派活 = 向该会话 prompt；反馈 = ds-bot host 监听 lane 会话事件提取结果并回投 Bot 会话。

dsh 侧 API 全部已实证可用（先例：ds-bot `agents.js:40` 建普通会话、dsh-im `harness-client.mjs` 全套 session rpc）：

| 能力 | API | 位置 |
|---|---|---|
| 建 lane | `sessionController.create({workspaceId})`，可指定 sessionId、可带 agentPreset | `packages/api/session-controller/src/index.ts:300`、`commands.ts:111-150`、types `:288-297` |
| 派活 | `sessionController.prompt({sessionId, mode:'queue', content})` | `index.ts:461-486` |
| 收反馈（推） | `ctx.on('session/event', …, {global:true})` 监听 `turn/end` | `known-event-types.ts:79-80`；dsh-im 先例 `modern-harness-api.mjs:279-284` |
| 收反馈（拉） | `sessionController.page` / `follow` 流 | `index.ts:524` / `:536` |
| 工作区归属 | `workspace.attachSession`（registry 账目 `sessionIds`） | `packages/workspace/workspace/src/index.ts:669-712` |

ds-bot 侧新增（host `lanes.js` + 工具）：

1. **lane 注册表**：`{sessionId, workspaceId, title, status, botId, taskId, createdAt}` 落 Bot 状态文件；
2. **任务信封协议**：prompt content 用约定信封（目标 / 上下文 / 产出要求 / 回报格式）。lane 侧零依赖——普通会话直接读题干活，不需要装任何插件；回报 = lane 最终回合文本按信封约定结构化（如首行 `LANE-RESULT:` 头 + markdown 正文；定稿放在实现设计文档）；
3. **反馈回投**：`turn/end` → 提取最终文本 → 注入所属 Bot 当前 part；Bot 端工具 `lane_send` / `lane_status` / `lane_read` / `lane_cancel`；
4. **归属保护**：lane session 登记进 `indexSessions`（`store.js:533-578`），避免被 `adoptAgentSession` 收编（`agents.js:49-59` 的 owned 检查）；lane 是普通会话、无 parts 分段机制，与 Bot 会话滚动天然隔离。

**决策（已定，2026-11-18）：lane 跟随 agentPreset**——创建 lane 时当前预设是什么就带什么，不做 lane 专属限权设计；lane 内危险操作照常走 dsh approvals。

验收：standard Bot 在会话里 `lane_send` 派活 → lane 会话独立跑完 → 结果文本回投 Bot 会话；`/api/bot` 路由可查 lane 列表（`channel.js:947-957` 路由机制现成）。

## R4 面板：原始工作区模式（需求 4）

**现状**：右栏 `BotPanel`（`browser-pane.js:523`，三视图 DetailsDrawer/BrowserView/SideChatView `:734-743`）只服务 Bot；"DSH Agent 区域"= plain 模式下撤掉会话替身后的原生主视图（`surface.js:7-9` groupsFor + `index.js:1320-1331`），一次只能看一个。

新增**工作区板**视图：

- **tab 注册**：`ctx.sidebarRightTabs.register` + slot `sidebar.right.pane.tab`（`packages/client/ui-sidebar-right/README.md:79-88`）；ds-bot 已有 `sidebarRight` 消费先例（changes-review 详情面板）。
- **数据源**：`workspaceController.follow` 流（`packages/api/workspace-controller/src/index.ts:205-232`，baseline+增量含每 workspace 的 `sessionIds`）→ 经 host lane 注册表映射出 lane → 按**工作区分组**的会话板（每板列出 lane 卡：标题/状态/最后活动/所属 Bot）。
- **交互**：板内"新建 lane"（调 host lane 端点）；点 lane → 主区以 plain 模式打开该 lane 的原生会话（即 R5 机制）。
- 侧栏 AgentRow（`sidebar.js:206-267`）保留不动。

验收：右栏出现工作区板 tab；standard Bot 派活的 lane 实时上板；点开 lane 看到原生 dsh 会话全细节。

## R5 回归 dsh 原生会话卡片（需求 5）

**现状（"掩盖细节"的机制清单，全部是 slots 替身，优先级 -100 压过原生）**：

| 替身 | 效果 | 位置 |
|---|---|---|
| assistant-step → AssistantCell | 正文过滤 tool-call 标签；思考仅 `prefs.thinking` 才渲染且走自研聚合 | `index.js:1245-1250`、`cells.js:264-320`、`turn-reasoning.js:1-8` |
| tool-call → ToolCell | 只画 DRAWN 白名单工具，普通工具卡（shell/read/write…）**完全不显示**，运行中化为一句 activity | `cells.js:1124`、`:1242-1265` |
| compaction / context → CellEmpty | dsh 压缩卡与 context 行被清空 | `index.js:1264-1270` |
| composer 各 dock → Nothing | 权限/计划/模型/活动/用量 dock 全隐藏 | `index.js:1282-1288` |
| user / steering → UserMessageCell、turnTail | 替换原卡、隐藏 copy/branch 行 | `index.js:1271-1278`、`:1254-1256` |

**原生回归机制现成**：`groupsFor` 返回 `conversation:false` 即全部撤下还原（plain 模式已验证，`surface.js:5-9`）。原生侧即刻获得：ReasoningRow 思考折叠卡（`ui-chat/src/client/chat/ReasoningRow.tsx:44`）、ToolCallTree 工具树 + 各工具 toolview（`ui-tool/src/client/apply.ts:38-47`）、卡片内 DisclosureRow 详情展开与右栏 dock 详情面板（`ui-sidebar-right/README.md:79-88`）。

**分步**：

1. standard Bot 先行（R2 交付即原生渲染，无历史包袱）；
2. lane 会话原生（R4 点开即 plain，天然原生）;
3. team Bot 撤皮收尾：逐替身盘点去留——真有价值的（BotMention @高亮、user-text 规则、Bot 身份徽标）以原生之上的轻量注入重建（独立 slot 或 user 卡附加徽标），纯掩盖的（DRAWN 白名单、dock 清空、压缩卡清空）直接撤；ask_user/show_view 卡相关替身随全局拆除一并删除；
4. 验收：Bot 会话可见思考卡、工具调用树、可展开详情、右栏 dock 详情面板可用；"哪个 Bot 在说"在原生渲染下仍有标记；压缩/context 卡恢复显示；回滚 = 还原 index.js 安装清单提交。

---

## 里程碑

| 里程碑 | 内容 | 前置 |
|---|---|---|
| M1 | 桥接验证通过，QQ/飞书经 dsh-im 到达 ds-bot Bot（R1a） | — |
| M2 | standard 模板 Bot 可创建、可用（R2） | — |
| M3 | lane 协议闭环：派活 → 干活 → 反馈回 Bot（R3） | M2 |
| M4 | 工作区板上板（R4） | M3 |
| M5 | ds-bot IM 层代码废除（R1b） | M1 |
| M6 | team Bot 原生卡片回归完成（R5 收尾） | M2（分步进行） |
| M7 | dsh-im 补发修复（R1c，视 M1 后观察） | M1 |

## 决策记录（2026-11-18）

| 决策点 | 裁决 |
|---|---|
| dsh 基线（原 R0） | **不重定**。0.2.1-rc.5 实测可用，勿再提议；仅真实 API 不兼容时才重定（已同步 AGENTS.md / skill ds-bot-dev） |
| ask_user 去留（R2） | **全局拆**。按设计稿 Phase 1 全量执行，team/standard 一律无 ask_user（判定没用）；桥上问题卡同步随之消失 |
| lane 权限（R3） | **跟随 agentPreset**。当前预设是什么就带什么，不做 lane 专属限权；危险操作照常走 approvals |

## 风险

1. **替身功能回归**（R5）：@提及、身份徽标等真需求需以原生方式重建；逐替身盘点，勿一刀切。
2. **废除不可逆面**（R1b）：dsh-im 未覆盖的渠道（TG 等）随删除消失；git 历史可回。
3. **各线开工规范**：ds-bot 内遵循其 `dev` 分支 PR 规范（`feat/lane-*` 等）；每线落地时的详细实现设计文档放 DS-Bot 仓库 `docs/plans/`（上游惯例），本文件只维护路线与决策记录。
