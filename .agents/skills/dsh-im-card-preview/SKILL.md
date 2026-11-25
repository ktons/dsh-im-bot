---
name: dsh-im-card-preview
description: dsh-im 飞书"任务过程"流式卡片（stepStreamCard）的离线预览与视觉迭代：动画帧、usage footer、面板折叠默认态。当用户要改过程卡片样式、迭代卡片动画/底部信息条、问卡片语法、或要快速预览卡片效果而不发真实消息时使用。
---

# dsh-im 飞书过程卡离线预览与迭代

适用对象：`plugins/dsh-im` 的飞书**实时过程卡**（设置里"任务过程展示 = 实时过程卡 / streaming_card"，聊天里那张蓝头 `⚙️ 任务过程` 卡）。钉钉 AI 卡是钉钉官方模板（标题/状态由钉钉渲染，插件只控内容区），QQ 是 stream 消息，都不在本 skill 范围。

## 卡片架构速查

| 文件 | 职责 |
|------|------|
| `src/channels/feishu/feishu-cards.mjs` | `stepStreamCard(blocks, { status, stepCardPanels })` → 卡片 JSON 字符串（schema 2.0；元素只有 `markdown` / `collapsible_panel` / `hr`）；`STEP_STREAM_CARD_MAX_BYTES`=24k、表数上限 5、超限分片 `splitStepStreamCardBlocks` |
| `src/channels/feishu/bridge.mjs` | 流式生命周期：`#ensureStepCard`/`#appendStepCardUpdate`/`#streamStepCardAnswer`/`#finishStepCard`；每卡状态在 `#stepCards` Map；patch 节流 `STEP_STREAM_PATCH_MIN_INTERVAL_MS` = **1000ms**（bridge.mjs:217）；`#syncStepCardChunks` 对内容不变的消息跳过 patch（去重） |
| `src/channels/feishu/step-push-mode.mjs` | 面板默认态 `DEFAULT_FEISHU_STEP_CARD_PANELS`：`thinkingExpanded: false, toolsExpanded: true`（运行中工具摘要默认展开；完成态永远并入收起的"过程详情"） |
| `plugin-src/client/bot-general-settings.js` | 设置页"展开思考过程/展开工具摘要"开关（per-bot 覆盖默认值） |

"流式"没有特殊协议：卡片是一条 `msg_type=interactive` 消息，反复 `im.v1.message.patch` 同一条消息的 JSON（≤1 帧/秒），内容没变会被去重跳过——所以任何"动画"都必须逐帧改变 JSON。

## 离线预览（不发真实消息）

```sh
cd plugins/dsh-im
node scripts/step-card-preview.mjs     # 生成 .preview/step-card-preview.html（已 gitignore）
```

双击生成的 HTML 直接打开即可（自动化验证时 `file:` 不可导航，用任意静态服务器走 `http://127.0.0.1`）。页面四区：

1. **基线**：当前 `stepStreamCard()` 原样输出（运行中/已完成/已停止）——直接 import 生产代码，生产改了预览自动跟
2. **动画变体对比**：提案层（脚本内 `SPINNERS`，PROPOSAL 后处理），带帧轮播播放器；帧间隔选 1000ms 才是真机能做到的节奏（500ms 仅脑补）
3. **usage footer 变体对比**：提案层（`FOOTERS`，F1 并状态行 / F2 独立代码行 / F3 代码行+缓存桶）
4. **折叠默认态对比**：当前默认 vs 提议默认（两个都用真函数渲染，只换 `stepCardPanels` 参数）

每张卡都有"复制 JSON"按钮——粘进飞书开放平台的**卡片搭建工具**（card builder）可核对官方真实渲染。

## 迭代工作流

1. **视觉探索**：直接改 `scripts/step-card-preview.mjs` 里的提案层（`SPINNERS`/`FOOTERS`/demo 数据），重跑脚本、刷新浏览器。零 API 消耗。
2. **定稿**：把选中的变体**实现进 `stepStreamCard` 本体**（动画 = 卡片状态加帧号 + bridge 侧空闲重绘驱动；footer = `#finishStepCard` 传入 usage 渲染）。实现后提案层可保留做前后对比。
3. **回归**：`npm run check`（build + node --test + verify-package）。卡片已有单测 `test/channels/feishu/feishu-cards.test.mjs`，改 `stepStreamCard` 输出形状时同步补断言。
4. **真机验收**：预览是近似渲染（字体/间距/折叠交互/patch 频控只有飞书客户端说了算），往测试群发真实消息收尾。

改动落地链：`src/` 或 `plugin-src/` 都是源码，**必须 `npm run build` 重建 `lib/`（client.js + index.js）并与源码同提交**；link 安装进桌面端后重启生效（装法见 skill dsh-plugin-install）。

## usage 数据链路（实现 footer 时走这条）

dsh 本体不用改：session 事件流的 `assistant/message` 事件自带 `usage`（inputTokens/outputTokens/totalTokens/cacheRead…）和 `message.source.model/provider`（dsh `packages/core/session/src/types.ts` ≈341-356）。`turn/end` 事件**不带** usage。断点在插件侧 `src/channels/shared/harness-client.mjs` 的 `HarnessReplyTracker.consumeAll`（≈:791-816）——它消费 `assistant/message` 只取文本。最小实现：tracker 对本 turn 的 `assistant/message` 累加 usage、记下最后的 `source.model`，`#ask` 结果带出 → `workspace-session.mjs` 的 `{ answer, artifacts }` 加 `usage` → 飞书 ask 路径传给 `#finishStepCard` → `stepStreamCard` 渲染。多步 turn 逐条累加；子任务内部（若有）不经主 session 事件流，不在统计内。

## 已知约束与待裁决项（2026-11-25）

- 动画 = 空闲期定时 patch（1 帧/秒），长任务持续消耗 patch 配额（10 分钟 ≈ 600 次/turn）；并发多任务按应用级 QPS 累计，可降为 2s/帧。
- 卡片目前**首个 update 才创建**——用户发消息到首个事件前没有卡，也就没有动画可看。要覆盖空窗期需改为 turn 开始即开卡（eager open），代价是每 turn 必产出一条卡片消息；是否做未裁决。
- usage footer 只在封存态出现（运行中拿不到）；"已停止"也可带已消耗部分。
- 2026-11-25 已用预览页核对过 A（状态行点数渐增）/B（尾行亮点轮播）/C（尾行进度条）× F1/F2/F3 全部变体渲染正常，待用户拍板选型。
