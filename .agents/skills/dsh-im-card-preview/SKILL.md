---
name: dsh-im-card-preview
description: dsh-im 飞书"任务过程"流式卡片（stepStreamCard）的离线预览与视觉迭代：动画帧、usage footer、面板折叠默认态。当用户要改过程卡片样式、迭代卡片动画/底部信息条、问卡片语法、或要快速预览卡片效果而不发真实消息时使用。
---

# dsh-im 飞书过程卡离线预览与迭代

适用对象：`plugins/dsh-im` 的飞书**实时过程卡**（设置里"任务过程展示 = 实时过程卡 / streaming_card"，聊天里那张纤薄无色标题 `任务过程` 卡）。钉钉 AI 卡是钉钉官方模板（标题/状态由钉钉渲染，插件只控内容区），QQ 是 stream 消息，都不在本 skill 范围。

## 卡片架构速查

| 文件 | 职责 |
|------|------|
| `src/channels/feishu/feishu-cards.mjs` | `stepStreamCard(blocks, { status, stepCardPanels, spinnerFrame, usage })` → 卡片 JSON 字符串（schema 2.0；元素只有 `markdown` / `collapsible_panel` / `hr`）；面板合并置顶、纤薄标题、状态行（运行态 = `STEP_STREAM_SPINNER_FRAMES[frame]`）、F3 usage 行 `stepUsageLine`；`STEP_STREAM_CARD_MAX_BYTES`=24k、表数上限 5、超限分片 `splitStepStreamCardBlocks` |
| `src/channels/feishu/bridge.mjs` | 流式生命周期：`#ensureStepCard`（含 `eager`/`animTick`/`usage` 字段）/`#appendStepCardUpdate`/`#streamStepCardAnswer`/`#finishStepCard`；每卡状态在 `#stepCards` Map；patch 节流 `STEP_STREAM_PATCH_MIN_INTERVAL_MS` = **1000ms**；`#syncStepCardChunks` 对内容不变的消息跳过 patch（去重）；动画定时器 `#ensureStepCardAnimationTimer` 每秒 tick 一次 `animTick += 1` 并排队重绘，`#queueStepCardRender` 的补帧循环（`renderQueuedDirty`）保证飞行渲染期间落队的增量不丢 |
| `src/channels/feishu/step-push-mode.mjs` | 面板默认态 `DEFAULT_FEISHU_STEP_CARD_PANELS`：`thinkingExpanded: false, toolsExpanded: false`（2026-11-25 定稿：两类面板默认收起；收起时**省略 `expanded` 字段**——真机实验项，可能让客户端保留用户手动展开态） |
| `plugin-src/client/bot-general-settings.js` | 设置页"展开思考过程/展开工具摘要"开关（per-bot 覆盖默认值） |

"流式"没有特殊协议：卡片是一条 `msg_type=interactive` 消息，反复 `im.v1.message.patch` 同一条消息的 JSON（≤1 帧/秒），内容没变会被去重跳过——所以任何"动画"都必须逐帧改变 JSON。

## 离线预览（不发真实消息）

```sh
cd plugins/dsh-im
node scripts/step-card-preview.mjs     # 生成 .preview/step-card-preview.html（已 gitignore）
```

双击生成的 HTML 直接打开即可（自动化验证时 `file:` 不可导航，用任意静态服务器走 `http://127.0.0.1`）。页面四区（全部由生产 `stepStreamCard` 直接产出，2026-11-25 起 `finalCard` mock 已退役）：

1. **刚开卡 · 空内容**（eager open 空态 + 动画帧轮播）
2. **运行中**（动画 A 帧轮播播放器；帧间隔选 1000ms 才是真机节奏，500ms 仅脑补）
3. **已完成**（+ F3 usage footer）
4. **已停止**

每张卡都有"复制 JSON"按钮——粘进飞书开放平台的**卡片搭建工具**（card builder）可核对官方真实渲染。

## 迭代工作流

1. **视觉探索**：改 `feishu-cards.mjs` 的 `stepStreamCard`（或 `scripts/step-card-preview.mjs` 里的 demo 数据），重跑脚本、刷新浏览器。零 API 消耗。
2. **回归**：`npm run check`（build + node --test + verify-package；dingtalk/discord/device-auth 的少量失败为环境性预存，与卡片无关）。卡片单测在 `test/channels/feishu/feishu-cards.test.mjs`（渲染形状）与 `test/channels/feishu/bridge.test.mjs`（生命周期/计数/eager open），改输出形状或时序时同步补断言。
3. **真机验收**：预览是近似渲染（字体/间距/折叠交互/patch 频控只有飞书客户端说了算），往测试群发真实消息收尾。

改动落地链：`src/` 或 `plugin-src/` 都是源码，**必须 `npm run build` 重建 `lib/`（client.js + index.js）并与源码同提交**；link 安装进桌面端后重启生效（装法见 skill dsh-plugin-install）。

## usage 数据链路（已实现）

dsh 本体不用改：session 事件流的 `assistant/message` 事件自带 `usage`（inputTokens/outputTokens/cacheReadTokens…）和 `message.source.model/provider`；`turn/end` 事件**不带** usage。实现链：`src/channels/shared/harness-client.mjs` 的 `HarnessReplyTracker.#accumulateUsage` 对本 turn 的 `assistant/message` 逐条累加并记 `source.model`（多步 turn 累加；子任务内部不经主事件流，不计入）→ `#ask` 结束时经 `options.onUsage({...tracker.turnUsage})` 带出 → bridge `#answerWithStepPush` 的 `turnUsage` → `#finishStepCard({ usage })`（`stopped` 时强制置 null，"已停止"不带 footer）→ `stepUsageLine` 渲染 F3 行。全角右括号后的分隔点不补空格（`（缓存 M）· 输出`）。

## 定稿设计（2026-11-25 用户拍板，均已实现）

- **动画 = A 变体**：状态行点数渐增 `_运行中 · / · · / · · ·_` 循环，状态行置于卡片最尾。帧由每卡 `animTick` 计数驱动：动画定时器每秒 tick `+1` 并排队重绘；**内容渲染复用当前帧不换帧**——这是去重正确性的关键（若按墙钟推导帧，任何内容渲染都会因帧变化产生多余 patch，"内容不变不 patch"的语义被破坏）
- **usage footer = F3 变体**：独立代码行 `` `模型 X · 输入 N（缓存 M）· 输出 K` ``，完成态封存时追加；"已停止"不带
- **面板默认收起**：`DEFAULT_FEISHU_STEP_CARD_PANELS.toolsExpanded: false`；收起时省略 `expanded` 字段（真机实验：客户端可能保留用户手动展开态）
- **同类过程块合并并置顶**：整 turn 一个 💭 思考过程、一个 🛠️ 工具摘要，置于卡片顶部、正文在其下
- **纤薄标题**：header 不带 `template` 字段（无蓝色色带）；标题文案"任务过程"
- **完成态不重排**：无"过程详情"wrapper，保持流式布局，只换状态行 + 追加 footer
- **eager open**：turn 开始即开卡（空态占位 `' '` + 动画行），首个事件前就有"已接单"反馈；交互换卡后新卡等真实内容再开（`eager = false`）

## 已知约束与坑

- 动画 = 空闲期定时 patch（1 帧/秒），长任务持续消耗 patch 配额（10 分钟 ≈ 600 次/turn）；并发多任务按应用级 QPS 累计，可降为 2s/帧。
- **补帧循环**（`renderQueuedDirty`）：渲染是串行链 + 入口快照（`splitStepStreamCardBlocks` 在渲染入口冻结 blocks），eager open 后首个事件恰落在"eager 渲染在飞行中"的窗口里，若只是跳过排队会**永久吞掉首个内容渲染**（曾导致 6 个测试失败）。现在被跳过的排队会打 dirty 标记，链尾循环补渲染直到没有新内容；`#finishStepCard` await 整条链，天然覆盖补帧。
- 卡片 JSON `expanded` 收起态省略字段：真机上如果客户端不保留手动展开态，需要回退为显式 `expanded: false`（会牺牲"用户展开状态跨 patch 保留"的可能性）。
- patch 语义是 HTTPS `im.v1.message.patch` 每帧上传整卡 JSON（非增量、非 WS）；飞书侧另有应用级频控。
- 面板折叠状态在 patch 后会被 JSON 重置（官方 2.0 `collapsible_panel` 无交互回调），根治需 cardkit 实体迁移（另立项）。
