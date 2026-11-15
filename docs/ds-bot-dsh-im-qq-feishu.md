# 开发文档：ds-bot 机器人接入 dsh-im（QQ/飞书）+ 三问题处置

> 状态：设计稿（2026-11-15）· 基线：ds-bot 0.3.6（stable ← v0.3.6）、dsh-im 5.10.0（detached ← v5.10.0）、dsh 0.2.1-rc.5
> 调研对象：`plugins/DS-Bot/ds-bot`、`plugins/dsh-im`。本文所有 `file:line` 均为当前检出内的实证位置。

## 1. 背景与目标

- 用户只需要 ds-bot 的 Bot 队伍能力（长活会话/记忆/协作），IM 入口换成 dsh-im 的 QQ + 飞书，**只为消息格式与送达质量**，不用 dsh-im 其他功能。
- 顺带处置三个历史问题：
  1. dsh-im QQ 会话发起后台任务后，回复时主会话丢失与 IM 的链接、漏消息；
  2. ds-bot 爱发用户提问（ask_user 卡）——去掉。原则：**按推荐来，确实没法继续才直接中断**；
  3. ds-bot 容易断链——期望换 IM 入口后消除。

## 2. 结论（TL;DR）

1. **架构只能走"桥"**：dsh-im 负责 QQ/飞书连接与消息渲染，ds-bot 的 Bot 会话作为被绑定的目标会话（`bindDsBot`），ds-bot 自带的 IM 平台适配器停用。两个插件不能同时连同一个 QQ appid/飞书应用（WS 网关互抢事件），"ds-bot 连接 + 只借 dsh-im 格式"行不通；而 dsh-im 已内置官方桥（`bindDsBot` + 滚动跟随 + 问题卡同步），这是唯一干净路径。
2. **问题 2 改 ds-bot**：删 `ask_user` 工具注册、禁用 `show_view` 交互视图、改写 prompt.js 三处提问规则。约 4 个文件的改动。
3. **问题 1 改 dsh-im**：根因是后台任务的"补发登记"会在会话重绑（尤其 ds-bot part 滚动）后被 `bound()` 检查静默删除 + 服务轮次默认不投递（`deliverModelAnswers` 默认关）。修复 `bound()` 跟随 ds-bot 滚动，并配置层打开投递开关。
4. **问题 3 大部分随架构解决**：ds-bot 断链最痛的三条路径（IM 中继"在线才发"、QQ 被动窗口 permanent 丢弃、卡片先记账后发送）都在被替换的 ds-bot IM 层里；dsh-im 侧有 deferred delivery、投递记账、被动预算管理。ds-bot 会话层与 Bot↔Bot 协作的少数丢失路径保留（见 §7）。

## 3. 机制调研摘要

### 3.1 dsh-im ↔ ds-bot 桥（方案的骨架）

- **绑定**：设置页「绑定 DS Bot」→ RPC `ds-bot.bind`（`plugin-src/host/delivery-rpc.mjs:6-19`）→ `DeliveryService.bindDsBot`（`delivery-service.mjs:196`）→ `delivery-adapter.mjs:494-518`：校验**仅私聊**（`:496`）、防冲突（同一 IM bot × 同一 ds-bot bot 只能一对一，`:501-503`）→ `state.setSession(conversationKey, bot.sessionId)`（`:509`）。此后该私聊的 `conversationKey → sessionId` 直接指向 ds-bot Bot 的**当前活会话**。
- **入站**：QQ/飞书消息 → dsh-im 正常管线（队列/去重/命令/上下文增强）→ `askInWorkspaceSession`（`src/channels/shared/workspace-session.mjs:94`）→ `resolveDsBotSession` 解析绑定 → 注入 ds-bot 会话。**滚动已处理**：part 切换时预解析轮询跟随（`bot-workspace-store.mjs:2002-2031`）、回合中途滚动用 `waitForTransferredReply` 无感续答（`:2611-2650`）、投递侧 `describeViaDsBot` 兜底旧映射（`delivery-service.mjs:537-567`）。
- **出站**：IM 发起的回合由渠道自己的渲染管线回（QQ markdown / 飞书流式卡）；**非 IM 轮次**（web、定时任务、后台任务的服务轮次）走 `session-sync-coordinator.mjs`，但受两个**默认关闭**的开关控制（`delivery-sync-settings.mjs:12-22`）：`mirrorUserInput`、`deliverModelAnswers`。
- **问题卡同步**：ds-bot `ask_user` 卡经 `ds-bot-question-sync.mjs` 呈现——**飞书有交互问题卡，QQ 降级为"请去桌面端回答"文本**（`delivery-service.mjs:395-402`）。
- **绑定后锁定**：`/new`、会话切换、bot 工作区切换被拒（`bot-workspace-store.mjs:1873-1877,2721`）；模型变更转为 bot 级（`:2537-2562`）。
- **永不送达 IM**：`message_bot` 回复、`show_view` 视图、checkpoint/handoff 记录、记忆复审活动（桥接报告 §c/§d）。

### 3.2 dsh-im QQ 渠道与后台任务补发（问题 1）

- 入站：WS 网关（`src/channels/qq/qq-runtime.mjs:160-308`）+ 15s ConnectionSupervisor 自愈；消息先持久化再入队、重启重放（`qq-bridge.mjs:843-862,804-841`）。
- 出站：`sendMarkdownReply`（`src/channels/qq/markdown-reply.mjs:45`）markdown 分片（共享 `chunkMarkdownParts`，4500 字符）→ `msg_type=2`，被平台拒（40034090）逐片回退纯文本；被动回复预算 c2c 4 条/群 5 条，超出转主动发送。
- **超时/后台任务补发**（README §147 的实现）：`deferred-delivery-coordinator.mjs` + `deferred-delivery.mjs` + `deferred-state.mjs`（持久化在 bot `state.json` 的 `deferred`）。链路：ask 停滞超时且会话不在运行 → 抛 `harness-reply-timeout`（`harness-client.mjs:2292-2308`）→ `trackTimeout` 登记（**门槛：`state.sessionFor(key) === entry.sessionId`**，`deferred-delivery-coordinator.mjs:213`）→ 30s 轮询 + `turn/end` 加急 + 重连 `resume()` → `readOutcome` 按 `promptRpcId` 定位回合提取最终文本 → `#deliverDeferredOutcome`（`qq-bridge.mjs:921-939`，被动窗口过期走主动发送）。
- **静默丢弃点**（问题 1 根因候选，按可能性排序）：
  - **R1 会话重绑使 `bound()` 失败**（coordinator `:45,123,130`）：后台任务运行期间发生 `/new`、`/conv`、工作区切换（`clearSessions`）、**ds-bot part 滚动重绑**（`bot-workspace-store.mjs:2024`）、bot 状态文件损坏重置（`qq/state-store.mjs:125-136`）→ 待补发条目被无通知删除 → 结果永不投递，新消息跑在新会话里 = "主会话丢了与 IM 的链接"。
  - **R2 服务轮次默认不投递**：前台回合正常结束、后台任务结果作为后续服务轮次到来 → 仅当 `deliverModelAnswers=true` 才投（`session-sync-coordinator.mjs:55-61,255-278`；默认 false，`index.mjs:112-122` 强制空目标）→ DSH 里能看到答案、QQ 永远收不到。
  - **R3 非 timeout 失败不登记**：ask 在长等待中因 WS 断线 `AbortError`/harness 重连失败而死 → 不抛 `harness-reply-timeout` → **不进补发登记**，任务结果成孤儿（`workspace-session.mjs:223-232` 只捕一种错误码）。
  - **R4 QQ 主动配额**：补发多走主动通道，配额拒绝 3 次后 `failed`（coordinator `:181-184`）。
  - 次要：QQ 渠道未接 `createBindingAnnouncer`（`qq/production.mjs:78-85` 未包装 state store），`session-pre-bind/unbind` 事件不发。

### 3.3 dsh-im 消息格式管线（用户要的"发消息格式"）

| | QQ | 飞书 |
|---|---|---|
| 流式 | 无（`stream_messages` 不可靠已禁用，`qq-bridge.mjs:1299`） | CardKit 流式卡 28000 字符/卡（`feishu-channel.mjs:171-191`） |
| 过程展示 | "正在输入" typing（`qq-runtime.mjs:213`） | 实时过程卡 24KB（`feishu-cards.mjs:1038`）/ 逐步 post / 原生直播 CoT（`live-cot.mjs:80`） |
| 最终答案 | markdown `msg_type=2` + 40034090 回退纯文本；切分 4500（共享 `markdown-chunks.mjs:236`） | 卡原生 markdown / 文本回退 9000 字符（`message-utils.mjs:588`） |
| 附件 | 文件消息能力 + 当日配额 | `im:resource`，30MB |

可复用发送入口（备用方案用）：同 Host 插件 `ctx.dshIm.send(botId, targetId, text, {format})`（`plugin-src/host/index.mjs:139-159`）、HTTP `POST /api/dsh-im/delivery/messages`（`delivery-http.mjs:3`）、Connection RPC 通道 `/dsh-im-delivery`。

### 3.4 ds-bot 提问机制清单（问题 2 的拆除面）

| 机制 | 位置 | 结束回合 | 处置 |
|---|---|---|---|
| `ask_user` 工具 | `src/host/tools.js:669-721` | 是（concludeTurn） | **删除注册**（选项 schema 只有 label/description，无推荐字段） |
| `show_view` 交互视图（choice/confirm/form） | `tools.js:725-755`；deep-view `ANSWERS=['options','confirm','form','submit']` | await_reply 默认 true | **禁用交互视图**（展示类图表/数字/表格保留） |
| DSH `ask_user_question` | 已被 ds-bot 封禁（`tools.js:994-1032`） | — | 保持现状 |
| `request_secret` / `request_connector` / mail 确认卡 | `secrets.js:422` / `connectors/index.js:515` / `connectors/mail/index.js:240` | 是 | **保留**（安全语义，非"选择题"） |
| 工具审批 | `approvals.js:26-96` | 挂起等答 | 保留（权限语义） |
| 鼓励提问的 prompt 规则 | `prompt.js:10,17,18` | — | **改写** |
| goal-grill 话术 | `goals.js:416-421`（"each with your recommended answer, so the user can reply 'as recommended'"） | — | 保留——正是"按推荐来"的现成模板 |

记忆复审**不**向用户提问（`memory-review.js` 静默后台跑）；learning 卡仅 web 端。

### 3.5 ds-bot 断链路径（问题 3 评估）

被方案**直接消除**的（属于将被停用的 ds-bot IM 层）：
- IM 文本中继"在线才发"，掉线即丢（`im/index.js:1029-1046`）——最典型丢消息路径；
- QQ 被动窗口过期/配额被拒 → permanent → 队列静默丢弃（`im/platforms/qq.js:239-247` + `im/index.js:352-362`）；
- 卡片先记账后发送，发送失败重启后不重发（`im/index.js:569-577`）；
- ds-bot 飞书 markdown 不渲染（纯文本 JSON，`im/platforms/feishu.js:327-343`）、QQ 2000 字符裸分段——格式层面的"断链感"。

随桥接**由 dsh-im 接管**的：part 滚动跟随、补发记账（resume.js 机制保留在 ds-bot 会话层，双保险）。

**保留的**（不在本次范围）：群聊 roomInbox 仅内存（`turns.js:181`）、reply 二次失败静默（`turns.js:51-80`）、群批处理 wake 一次性（`groups.js:663-666`）——均属 Bot↔Bot/群协作路径，桥接仅绑私聊不触及。

## 4. 方案

### 4.1 架构选型

**选定：方案 A —— dsh-im 当门面，ds-bot 出 Bot，`bindDsBot` 桥接。**

```
QQ 官方 ──WS──┐                     ┌─ 渲染/补发/被动预算（dsh-im QQ 渠道）
              ├─ dsh-im ──bindDsBot─┤
飞书 ──长连接──┘                     └─ askInWorkspaceSession → ds-bot Bot 会话
                                        （prompt/记忆/分段/工具/协作全在 ds-bot）
```

否决的备选：
- **B（ds-bot 留连接、只借格式）**：同一 QQ appid/飞书应用不能被两个插件同时长连接（事件互抢）；ds-bot 的 IM 适配器必须整体让位。
- **C（完全改用 dsh-im 本地会话）**：丢掉 ds-bot 的队伍/记忆/长活会话，等于换产品，不符合目标。

### 4.2 Phase 0 —— 配置层（零代码，先行验证）

1. 桌面端确认两插件均已启用且同 Host（dsh-im 不能配置外部 `harnessBaseUrl`，否则绑定被拒，`index.mjs:100-105`）。
2. **停用 ds-bot 的 IM 连接**：设置里删除/不配置 ds-bot 侧 QQ、飞书连接（若曾配过，必须先删，避免与 dsh-im 抢同一应用）。
3. dsh-im 添加 QQ bot（AppID+AppSecret）与飞书 bot（扫码或 App ID+Secret）；飞书按需补全权限（`im:message:readonly` 收图、`im:resource` 回传文件）。
4. ds-bot 建好目标 Bot（或沿用现有）。
5. 在 QQ/飞书**私聊**里先发一条消息（绑定前置条件：该私聊已有会话，`delivery-adapter.mjs:504-506`）。
6. dsh-im 设置 → IM 机器人 → 机器人卡片 →「绑定 DS Bot」页：选私聊 + 目标 ds-bot Bot，绑定。
7. **打开投递同步开关**（问题 1 的 R2 配置解）：机器人卡片的投递同步设置开 `deliverModelAnswers`（后台/定时任务结果送达 IM）；`mirrorUserInput` 按喜好（web 输入镜像到 IM）。
8. 验证：QQ/飞书私聊发消息 → ds-bot Bot 按其人设/记忆回答，QQ 走 markdown、飞书走流式卡；`/status`、`/new`（应报 `ds-bot-bound`）、模型变更应 bot 级生效。

### 4.3 Phase 1 —— ds-bot 去提问化（问题 2，改 ds-bot）

改动原则：Bot 能自行决策就按自己的推荐执行并在回复里说明；只有缺**只有用户能提供**的信息（密钥、凭据、不可逆授权）才停轮直接说明，不挂卡等答。

1. **`src/host/tools.js`**：
   - 删除 `ask_user` 的 `defineTool` 注册（`tools.js:669-721`）。`state.questions`、`questionReply`、`answerQuestion` 等下游逻辑保留为死代码兼容（老卡/老客户端只读展示），不扩大改动面。
   - `show_view`（`tools.js:725-755`）：交互视图拒绝——校验处对 deep-view `ANSWERS` 类节点（options/confirm/form/submit）返回错误提示"展示型视图可用，等待回答的视图已停用：直接在回复里给出推荐与结论"。展示类（图表/关键数字/表格/计算器展示）不受影响。
2. **`src/host/prompt.js`**（TEAM_RULES 三处改写，英文，保持既有文风）：
   - 第 10 行：去掉 "or ask the user with ask_user" 分支，改为需要用户决策时在回复里给出编号选项**与你的推荐**，按推荐继续执行（沿用 goal-grill 话术模板）。
   - 第 17 行（ask_user 整行）：改为 "Decide yourself and act on your recommendation; say what you chose and why in one line. Only stop and tell the user what you need when you cannot continue without something only they can provide (a key, a credential, a confirmation), and do not wait for an answer card."
   - 第 18 行（show_view 行）：去掉 "a choice, confirmation or short form" 与 "A view that asks for an answer ends your turn" 语义，保留展示语义。
   - 群聊 relay 段（`promptFor` 的 room 分支）不涉及提问，不动。
3. **Bot instructions 数据**：用户各 Bot 的 instructions 里如有引导提问的措辞，Phase 1 验证时一并清理（数据不是代码）。
4. **构建与验证**（在 `ds-bot/`）：`npm run build`（client.js 随源码提交）→ `npm test` → `node scripts/build-client.mjs --check` → `npm run lint` → 冒烟（改了 `src/host/`）：`CONTEXT_WINDOW=100000 CHECK_RATIO=0.45 dev/bench.sh smoke 3096 8796 reset && node dev/smoke.mjs smoke 3096`。
5. 重装进桌面端（GUI 或 `dsh plugin --profile desktop add`），验证：让 Bot 做"两个方案二选一"的任务 → 应自行按推荐执行并说明理由；缺密钥任务 → 停轮文字说明，无卡。
6. **顺带效应**：ask_user 移除后，桥上的问题卡同步（`ds-bot-question-sync.mjs`）与 QQ "去桌面端回答"降级文本自然消失。

### 4.4 Phase 2 —— dsh-im 后台任务补发修复（问题 1，改 dsh-im）

1. **R1：`bound()` 跟随 ds-bot 滚动**（核心修复，`src/channels/shared/deferred-delivery-coordinator.mjs`）：
   - `register` 时若该 key 存在 ds-bot 绑定，在 entry 记录 `dsBotId`（从 `workspaces.dsBotBindingFor(botId, key)` 取，adapter 已有该数据）。
   - `bound(entry)`（coordinator `:45`）从单一等式改为：`state.sessionFor(entry.key) === entry.sessionId` **或**（`entry.dsBotId` 存在且 `dsBot.resolve(entry.dsBotId)` 成功且 `entry.sessionId ∈ resolve().parts`（`ds-bot-client.mjs:105-111` 已返回 parts 列表，可判断旧 part 归属））。即：ds-bot 滚动不等于丢链接，结果仍归属原 Bot，照常补发到原私聊。
   - 补发投递目标不变（`deferredDeliveryTarget(entry.target)` 只依赖 IM 侧 target，不依赖 sessionId 对齐）。
2. **R3：非 timeout 失败也登记**（`src/channels/shared/workspace-session.mjs:223-232`）：
   - ask 捕获分支扩为：`harness-reply-timeout` 照旧；`AbortError`/连接类失败（`harness-connect-failed` 等）且能确认回合已受理（promptRpcId 存在）→ 同样 `trackTimeout`，entry 标记 `unconfirmed: true`，`readOutcome` 对 unconfirmed 条目先按 `entry.turn` 定位、定位不到则从 `afterSeq` 起扫首个 `turn/end`（现有 legacy 路径已支持，coordinator `:101-106`），两轮无果再删。
3. **R4（不改代码，文档化）**：QQ 主动通道配额现实如此，补发 3 次退避已尽力；说明文档提示用户群聊被动窗口仅 5 分钟，长后台任务的群内补发大概率走主动通道。
4. **顺手修（可选，低风险）**：QQ 渠道 state store 包装 `createBindingAnnouncer`（对齐 `plugin-src/host/channels/shared/production.mjs:103-123` 的做法），让 QQ 也发 `session-pre-bind/unbind` 事件，供外部订阅方维护会话→IM 表。
5. **构建与验证**（在 `dsh-im/`）：`npm run build`（client+host 两产物）→ `npm test` → `node scripts/verify-package.mjs`（或直接 `npm run check`）→ 重装进桌面端。
6. **场景验证**：QQ 私聊 → 让 Bot 起一个 >10 分钟的后台任务（如长 shell job）→ 等超时通知 → 不发任何消息等任务结束 → 结果应补发到 QQ；期间在 ds-bot 侧触发一次 part 滚动（长对话自然触发或调小 checkRatio 重现）→ 补发仍应到达（R1 修复点）；再验证任务期间发新消息、`/stop`、web 端同会话操作均不漏不重。

## 5. 三个问题 × 处置对照

| 问题 | 根因 | 处置 | 阶段 |
|---|---|---|---|
| 1. QQ 后台任务丢链接/漏消息 | R1 补发条目被重绑删除（含 ds-bot 滚动）+ R2 服务轮次默认不投 + R3 断线不登记 | `bound()` 跟随 ds-bot parts；unconfirmed 登记；开 `deliverModelAnswers` | Phase 2 + Phase 0.7 |
| 2. ds-bot 爱发提问 | ask_user/show_view 交互卡 + prompt 三处鼓励 | 删工具、禁交互视图、改写规则，"按推荐来 + 无法继续直接中断" | Phase 1 |
| 3. ds-bot 断链 | 最痛路径全在 ds-bot 自带 IM 层（在线才发/被动窗口 permanent 丢弃/卡片记账不补发/无 markdown 渲染） | 架构换血：dsh-im 接管连接与投递；滚动跟随由桥处理 | Phase 0 即消除，残余路径见 §7 |

## 6. 实施顺序与工作量估计

| 阶段 | 内容 | 仓库 | 改动量 |
|---|---|---|---|
| Phase 0 | 配置 + 桥验证 | 无代码 | 0 行 |
| Phase 1 | 去提问化 | ds-bot | prompt.js 3 处 + tools.js 2 处，~100 行内；重建 client.js |
| Phase 2 | 补发修复 | dsh-im | coordinator + workspace-session，~80-120 行；（可选）QQ announcer ~10 行 |

顺序建议：Phase 0 先行（立刻可用、验证桥与开关是否已解决大半问题 1/3）→ Phase 1 → 观察一周 → Phase 2（若后台任务场景仍复现再动；R2 开关可能已覆盖多数实际场景）。

## 7. 风险、限制与回滚

1. **仅私聊**：`bindDsBot` 拒绝群聊 key（`delivery-adapter.mjs:496`），问题/审批同步同样 private-only。QQ/飞书群聊内 @bot 走 dsh-im 本地会话（无 ds-bot 能力）。若未来要群，需要 ds-bot 暴露群成员会话解析 API 并放宽桥校验——列为后续可选，不在本期。
2. **一对一绑定**：一个 IM bot × 一个 ds-bot bot；同一 ds-bot bot 跨渠道（QQ+飞书各绑一个 IM bot）可并行，但问题卡会因多候选降级为文本提示（`delivery-service.mjs:385,444`）。
3. **绑定后的操作锁定**：`/new`、会话/工作区切换被拒（设计如此）；`/clear` 会真的清 ds-bot 会话上下文——文档要提醒。
4. **Part 滚动语义**：绑定跟随的是"Bot 当前 part"，checkpoint/handoff 对 IM 透明（好事）；但 `deliverModelAnswers` 开启后，web 端在同一 Bot 会话里的所有最终回复都会镜像到 IM——介意噪音就只开必要开关。
5. **`ask_user` 移除是行为收窄**：依赖问卡的既有工作流（若有）会改为"直接执行推荐"。回滚 = 还原 tools.js/prompt.js 提交即可；无数据迁移。
6. **dsh-im 改动回滚**：deferred 格式新增可选字段 `dsBotId`，旧 entry 无此字段走原逻辑，向后兼容；回滚还原文件即可，`state.json` 的 deferred 条目自愈（最多 4 条/会话，30s 轮询期短）。
7. **版本漂移**：ds-bot 0.3.6 声明基线 dsh 0.2.2-rc.1，本工作区 dsh 钉 0.2.1-rc.5；Phase 1/2 改动均为插件内部逻辑，不新增 dsh API 依赖，风险不变。改动前各仓库从当前 tag 建迭代分支（DS-Bot 遵循其 `dev` 分支 PR 规范，dsh-im 遵循其自身规范）。

## 8. 验证清单（合并验收）

- [ ] QQ 私聊消息 → ds-bot Bot 回答，markdown 渲染、分段正确、typing 出现
- [ ] 飞书私聊消息 → 流式卡/过程卡按所选模式呈现；@bot 开话题 → 话题内仍指向同一绑定会话（注意：话题是 dsh-im 本地会话语义，绑定只对私聊平铺生效——飞书话题开启时建议关闭 `mentionTopicReply`）
- [ ] 二选一任务 → Bot 自行按推荐执行，无 ask_user 卡（Phase 1）
- [ ] 缺密钥任务 → 停轮文字说明，`request_secret` 卡仍正常（保留项）
- [ ] 后台任务：超时通知 → 不操作等结果 → QQ 补发到达（Phase 2）
- [ ] 后台任务期间 ds-bot part 滚动 → 补发仍到达（Phase 2 R1）
- [ ] 后台任务期间 WS 断线重连 → 结果不丢（Phase 2 R3）
- [ ] `/new` 报 `ds-bot-bound`；`/stop` 只停本聊天提交的回合
- [ ] ds-bot 桌面端 chat 与 IM 私聊同会话并行，两边历史一致
- [ ] `npm test`/`lint`/`check` 两仓库全绿；冒烟通过
