# ds-bot 迭代 Roadmap：IM 换血（飞书+lark） · standard 模板 · lane 协议 · 工作区面板 · 原生卡片

> 状态：**R1 本期完成**（2026-11-23 用户拍板开工：渠道收窄为**飞书+lark**，P0~P3 本期执行；2026-11-25 T1~T8 全部收口，后续线 R2~R5 待开工）
> 详细设计稿：[ds-bot-dsh-im-qq-feishu.md](./ds-bot-dsh-im-qq-feishu.md)（2026-11-15）。QQ 部分已裁剪；**dsh-im 未变（v5.10.0）其侧 file:line 仍有效**；ds-bot 侧以 v0.3.10 快照复核为准（2026-11-23 已复核，见 R1 各表）。
> 基线（2026-11-23 实测）：dsh submodule `dsh-v0.2.2-rc.5`（桌面端 bin 已重建同版，exe FileVersion 0.2.2-rc.5）；DS-Bot **v0.3.10 源码快照**；dsh-im **v5.10.0 源码快照**。
> 迭代约定变化（2026-11-23）：两插件已收编为源码快照（**无 .git**），上游 fork 的 dev 分支 PR 规范不再适用；改动直接进**工作区仓**，稳定即 commit 并 push 至 `ktons/dsh-im-bot`；快照删除/大改前先在工作区仓提交基线。
> 本文件维护当前迭代的任务状态、决策点与执行记录；状态枚举：pending / in-progress / done / 无法验证（依赖用户飞书/lark 租户侧操作的标注"用户验证"）。
> 执行约定（2026-11-23 用户要求）：**关键路径打 log**——桥接/绑定/滚动跟随/问题同步/补发登记与投递等关键点留日志，供用户体验后反馈排障。

---

## 一、任务总表（当前迭代：R1 IM 换血 · 飞书+lark）

| ID | 任务一句话 | 依赖 | 状态 | 备注 |
|---|---|---|---|---|
| T1 | P0a：dsh-im 装进桌面端 profile，在 dsh 0.2.2-rc.5 上验证激活（GUI 设置页可开、14 渠道挂载无误） | — | done | CLI 拒管 desktop profile，改手工接线（package.json deps+bundles+pnpm junction，patch 随 bundle 层自动组合）；激活待用户重启确认 |
| T2 | P0b：飞书 bot + lark bot 配置（扫码或 AppID+Secret+domain）、清空 ds-bot 侧飞书连接、私聊 bindDsBot、开 `deliverModelAnswers`、按验收清单走查 | T1, T3 | done | 2026-11-25 用户确认验证通过；操作清单已随 T1 交付（见会话） |
| T3 | P1：ds-bot 去提问化（重做）——删 `ask_user` 注册、拒 `show_view` 交互视图、改写 prompt.js 三处 + 关键点 log | — | done | commit `49fb944`；源码 10 处 + 测试退役/注入改造 + 冒烟脚本适配，见执行记录 |
| T4 | P2 前置：工作区仓提交**删除前基线**（含 ds-bot client.js 重建后的 P1 产物） | T3 | done | 基线 = `49fb944`（P1 全量提交，快照可回滚） |
| T5 | P2：废除 ds-bot IM 层——`src/host/im/` 全目录、channel.js IM 端点、client im-page/IM 设置 UI、16+1 个 im 测试；保留 rooms/connectors/resume/delivery/mobile/phone/remote | T2 | done | 2026-11-25 执行：删 36 文件 −20811 行；冒烟 55/55 全过（优于基线）；独立终审全绿；commit `0b44045` |
| T6 | P3：dsh-im 补发修复——`bound()` 跟随 ds-bot part 滚动（R1）、断线失败也登记补发（R3）+ 桥路径关键 log | T1 | done | 五文件改动+重建 lib；相关测试全绿，cancelled 类挂点 stash 对照确认为既有环境问题，见执行记录 |
| T7 | 桌面端刷新：ds-bot（link 安装，重建 client.js 即生效）+ dsh-im（T6 后重建/重装） | T3, T5, T6 | done | 2026-11-25：空闲判定（sessions 零活动）→ 重启；激活证据 bot/state.lock + integrations/dsh-im sqlite 打开 + web 端点 401 |
| T8 | 收口：AGENTS.md 快照表刷新、roadmap 执行记录与状态更新、工作区仓提交 | T1~T7 | done | AGENTS.md 已刷新（client.js 产物陈述 + ds-bot 分歧标注，终审 P2）；P1 欠账测试退役 `351b62a` |

**后续线（本期不动）**：R2 standard 模板（重建，见 §三）、R3 lane 协议、R4 工作区面板、R5 原生卡片回归——内容见下文，依赖链 R1a→R2→R3→R4、R5 并行分步不变。

---

## 二、R1 IM 换血：实现面（2026-11-23 复核，v0.3.10 快照实证）

架构（不变，唯一干净路径）：**dsh-im 当门面**（连接/渲染/送达），ds-bot Bot 会话作绑定目标（`bindDsBot`），ds-bot 自带 IM 平台层废除。两插件不能同连一个飞书应用（WS 事件互抢）。

桥的现成件（dsh-im v5.10.0，全部已核对存在）：
- 绑定：仅私聊、一对一（`plugin-src/host/delivery-adapter.mjs` `bindDsBot`），滚动跟随三件套（预解析轮询/回合中 `waitForTransferredReply`/`describeViaDsBot` 兜底）；
- 入站：`src/channels/shared/workspace-session.mjs` `resolveDsBotSession` → 注入 Bot 当前 part；
- 出站：IM 轮次走飞书流式卡管线；web/定时/后台轮次走 `plugin-src/host/session-sync-coordinator.mjs`（`deliverModelAnswers`/`mirrorUserInput` 开关，默认关）；
- 问题卡：`plugin-src/host/ds-bot-question-sync.mjs`（ask_user 卡→飞书交互卡→回答回注）；P3/T3 落地后此路径自然消退。

lark = 同通道 `domain:'feishu'|'lark'` 维度（`plugin-config-store.mjs:58`、`feishu-app.mjs:1-4`、扫码按 `tenant_brand` 自识别 `multi-bot-controller.mjs:1355`），**零代码差异**；"飞书+lark"= 一通道两 bot。

### 能力对照（换血理由，v0.3.10 vs dsh-im 飞书）

| 能力 | ds-bot 飞书（现状） | dsh-im 飞书 |
|---|---|---|
| 过程展示 | 无流式，整段后发（text 4000 分片） | CardKit 流式卡 28000 + 原生实时直播 CoT + 过程卡 |
| 附件 | 出站仅图片 | 图片+文件 30MB+语音 TTS；入站+引用回读/富文本图/转发卡/语音转写 |
| 交互 | 4 类交互卡 | 全套管理卡+原生斜杠命令面板 |
| 送达 | origin 仅内存重启即失 | deferred 补发、状态持久化、断线 resume |

断链根因（在线才发/origin 不跨重启/卡片记账不补发）全在被废除的 ds-bot IM 层。

### P0 验收清单（QQ 项已裁剪；2026-11-25 用户走查通过）

- [x] 飞书私聊 → ds-bot Bot 按人设/记忆回答，流式卡/过程卡按所选模式
- [x] lark 私聊 → 同上（国际版租户）
- [x] 图片/文件双向：私聊发图/文件进会话；Bot 产出图片/文件回传 IM（≤30MB）
- [x] `/new` 报 `ds-bot-bound`；模型变更 bot 级生效；ds-bot 桌面端 chat 与 IM 私聊同会话并行、历史一致
- [x] 后台/定时任务结果经 `deliverModelAnswers` 送达 IM（P3 前先验证现状，作为 T6 对照）
- [x] 群聊 @bot / 话题内 → dsh-im 本地会话（无 ds-bot 能力，预期行为）

### 硬边界（非 bug）

1. 仅私聊绑定；群聊/话题是独立会话键，走本地会话。
2. 一对一：飞书 bot、lark bot 各绑一个 ds-bot Bot；同 Bot 跨两渠道可并行，问题卡多候选降级文本（P1 后该路径基本消失）。
3. 绑定后 `/new`、会话/工作区切换被拒；`/clear` 真清会话上下文。
4. `deliverModelAnswers` 开启后 web 端同会话最终回复全镜像 IM。

---

## 三、后续线（基线备注：dsh 侧 file:line 为 0.2.1-rc.5 时代实证，现基线 0.2.2-rc.5，实施时复核）

### R2 standard 模板 Bot（**重建**）

v0.3.10 快照已核实 `ask_user`/`show_view`/prompt 三处俱全（旧 fork 分支 `feat/standard-template` `ab6b2689` 未进快照）。其中 **ask_user 全局拆由 T3（P1）先行重做**（决策不变：team/standard 一律拆）；模板机制本体（`template` 字段、promptFor 分支、TEAM_TOOLS scope、创建表单、i18n）**待重建**，改动点清单仍按原调研：`roster.js:211-226` buildBot、`prompt.js:49-55`、`tools.js:956-966`+`constants.js` TEAM_TOOLS、`client/bot-draft.js`/`create-bot.js`、文案五处（`tools.js:39`、`memory.js:417`、`memory-copy.js:19,28`、`roster.js:233-243`）。

### R3 lane 协议 / R4 工作区面板 / R5 原生卡片

方案不变，仍按原文（lane=普通 dsh 会话+信封协议+`turn/end` 回投；右栏 tab+`workspaceController.follow`；`groupsFor` 返回 `conversation:false` 撤替身、standard 先行）。实施时复核 dsh 0.2.2-rc.5 的 API 锚点。

---

## 四、决策点记录

| ID | 问题 | 结论 |
|---|---|---|
| D1（2026-11-18） | dsh 基线是否重定至 0.2.2-rc.1 | ~~不重定~~ **已被超越**：2026-11-23 工作区重构，dsh submodule 升至 `dsh-v0.2.2-rc.5`、桌面端 bin 同版重建，兼容顾虑消失 |
| D2（2026-11-18） | ask_user 去留 | 全局拆（team/standard 一律）；桥上问题卡同步随之消失 |
| D3（2026-11-18） | lane 权限 | 跟随 agentPreset，危险操作走 approvals |
| D4（2026-11-23） | R1 渠道范围 | **只接飞书+lark**（用户拍板）；QQ/TG/微信等 7 平台随 P2 删除，不可逆面按此收口 |
| D5（2026-11-23） | P3 是否本期执行 | **并入本期**（用户指示开工 P0~P3），不再等一周观察 |
| D6（2026-11-23） | 排障方式 | 关键路径打 log（绑定/滚动跟随/问题同步/补发），用户体验后按日志反馈修复 |

---

## 五、风险

1. **P2 删除回滚**：插件无 .git，删除前必须 T4 基线提交；回滚=还原工作区仓提交。
2. **dsh-im × dsh 0.2.2-rc.5 首跑**：T1 即首次实测；有 `modern-harness-api.mjs` 适配层，若 API 断裂按报错定位，必要时评估 dsh 侧对应面。
3. **`deliverModelAnswers` 噪音**：web 端同会话最终回复全镜像 IM，按需开关。
4. **R5 撤替身**：@提及/身份徽标等需以原生方式重建，逐替身盘点（后续线）。

---

## 六、执行记录

> 每轮登记一行，最新在上；测试列填可直接复制的命令。

| 日期 | 任务 | 轮次 | 结果 | 测试 | 备注 |
|---|---|---|---|---|---|
| 2026-11-25 | 测试噪声清理（收口后用户指示） | 1 | done | `npm test` 两轮稳定 3494/3485 pass / **0 fail** / 9 skipped；lint 0 errors | 删环境性失败测试：link-bundle/phone 整文件 + mobile markdown-image EPERM 块 + malformed-response 2 个 flake 块（−478 行，数字对账 3499−5=3494 吻合）；commit `e8f4065` |
| 2026-11-25 | T7 桌面端重启验证 | 1 | done | 激活三证据：`bot/state.lock` 心跳 + `integrations/dsh-im` sqlite 打开 + web 端点 56566 HTTP 401 | 用户授权空闲即重启；sessions 近 15min 零改动判定空闲；taskkill 温和→强制→start-dsh；窗口截图确认工作区加载正常；控制台 third_party ERROR 判良性启动噪音 |
| 2026-11-25 | 终审（独立只读 reviewer） | 1 | 全绿可收口 | `npm test` 两轮复跑稳定 3485/3499（5 挂全在白名单）；lint 0 errors；`--check` OK | 7 项检查全过：残留扫查 0 命中、保留面端点在位、桥方向无跨包 import、文档 IM 段清零、仓库卫生（仅 roadmap 一处 M）；P2 一条（AGENTS.md client.js 陈述过时）随 T8 修正 |
| 2026-11-25 | P1 欠账：ask_user 遗留测试退役 | 1 | done | 全量 3499/3485 pass（8−3 确定性 TypeError 清零，余 5 挂均已知环境/flake） | questions/mobile 改 state 直注入 + `cardShown` 造数（测的是仍存活的 closeCard/notices 管线）；commit `351b62a` |
| 2026-11-25 | T5 P2 废除 ds-bot IM 层 | 1 | done | client.js 重建 `--check` 过；lint 0 errors；全量 3482/3499；冒烟 55/55 全过（优于基线 ~6 挂） | 用户确认 T2 通过解除门控；删 36 文件 −20811 行（im/ 17 文件 + im-platforms + im-page + 16 测试 + fake-ws + i18n 5 语言对称 77 行 + ws 依赖）；锚点外摘除均验证零消费；commit `0b44045` |
| 2026-11-24 | T1 桌面端安装 dsh-im | 1 | done（激活待重启确认） | 手工接线后 junction 解析正确 | CLI 拒管 desktop（"managed exclusively by the Electron application"）；npm ci + pnpm install |
| 2026-11-24 | ds-bot 异常修复 | 1 | done | node_modules 70 项在位 | v0.3.10 快照缺依赖，npm ci 即愈 |
| 2026-11-24 | T3 P1 去提问化 | 3 | done | `npm test` 3795 过/8 挂（3 环境性+5 既有负载 flake）；`--check`/lint 绿；冒烟 49/55 | 测试退役改造：im.test.js 删交互 E2E 两块（-1157 行）、legacy 用例改 state 直注入、view-reply/rounds/im-telegram 同法；冒烟 6 挂为本工作区 v0.3.10×rc.5 既有分段校准问题（原版 prompt.js 对照复现，非 P1 回归）；bench 坏链按 skill 修 junction |
| 2026-11-24 | T6 P3 dsh-im 补发修复+桥 log | 1 | done | 补发三件套+ds-bot-handoff 42 过/0 挂；harness-client 三通道单跑 feishu 37/dingtalk 19 全过；`verify-package.mjs` 过 | 五文件：coordinator `bound()` 改异步跟随 ds-bot part 滚动（`resolveDsBotParts` 只读）、unconfirmed 补发 30min TTL、`trackTimeout` 收 `unconfirmed` 参数；harness-client 断线类失败（AbortError/connect-failed/timeout）在 `promptAccepted` 且未 stop 时补 `promptRpcId` 身份；workspace-session 宽化 `acceptedTurn` 判定并登记 `unconfirmed`；bot-workspace-store 新增只读 `resolveDsBotParts`；delivery-adapter 绑定/解绑 log。weixin/discord/device-auth 的 cancelled 挂点 stash 对照基线复现一致（"event loop drained" 环境问题，非 P3 回归）；`lib/client.js` 的 diff 为 CRLF 噪音，重建后与 HEAD 一致 |
