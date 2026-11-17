---
name: ds-bot-dev
description: DS-Bot 仓库（plugins/DS-Bot）的架构地图与迭代指南：ds-bot 插件的提示词/会话分段/记忆机制在哪个文件、改代码怎么构建测试、版本兼容基线、分支与提交规范。当用户要改 ds-bot 代码、排查 Bot 行为（提示词/记忆/压缩/交接）、问"这个机制在哪实现"、或要为 ds-bot 做迭代时使用。
---

# DS-Bot 迭代与架构指南

仓库 `plugins/DS-Bot`（远程 `git@github.com:ktons/DS-Bot.git`，上游 Fei2411/DS-Bot 的 fork、无 tag；工作区检出 `stable` ← `main` 上 release 合并点，2026-11-18 起为 v0.3.8 `5e9b7da8`）。两部分：`ds-bot/` 是 DSH 插件（Bot 功能本体），`app/` 是桌面 App（自带钉版 DSH + 本插件，独立 DSH_HOME）。改动前先读仓库自己的 `AGENTS.md`（硬规则、命令、分支规范）。

## 架构地图（src/host 关键文件）

| 文件 | 职责 |
|------|------|
| `prompt.js` | `bot-identity` section（order **640**）：`# Your identity`（name/role/instructions 数据驱动拼装）+ `MAIN_RULES`（主 Bot）+ `TEAM_RULES`（全员协作规则，大段手写英文）；群聊 relay 会话另有一段（只调 group_relay 然后空回复） |
| `memory.js` | `bot-memory` section（order **645**）+ `remember`/`forget` 工具 + 记忆仓库读写 + 自动审查入口。文件型记忆，布局见下 |
| `steward.js` | 上下文管家：`STEWARD_SYSTEM`（switch/compact 二选一裁判）、`CHECKPOINT_PROMPT`（checkpoint 摘要提示词）。check 线=可用窗口 80%，硬线=95%，模型未声明窗口默认 500k |
| `parts.js` | 会话分段总调度（约 1800 行）：`agent/status`(idle 检查)、`agent/pre-step`(轮中硬线)、`agent/request-error`(溢出/卡死) 三类触发 → `startSwitch`/`moveOn`/`writeNote`/`handoffPackage`；`decide()` 问管家 |
| `computer/index.js` | computer use section，挂在 dsh `TOOL_COMPUTER_USE`(3000) 位 |
| `agents.js` | Bot↔DSH Session 的归属登记；一个 DSH Agent 名下挂所有 Bot 会话 |

dsh 核心 section 顺序表在 `dsh/packages/core/system-prompt/src/index.ts` 的 `SECTION_ORDERS`（640 卡在 TEAM_POLICY 600 与 PTC_ONLY 800 之间）。

## 机制速查（改行为前先核对这里）

- **提示词分层**：底座是 dsh 标准 system prompt（身份/工具说明）；ds-bot 只注入身份+规则+记忆 section。改 Bot 行为规范 → `prompt.js` 的 `TEAM_RULES`/`MAIN_RULES`；改人设 → Bot 记录数据，不是代码。
- **会话分段**：逻辑上一条对话，物理上按 part 切分（每 part 一个 dsh Session，旧 part 整体归档，`read_own_chat` 全文可搜）。压缩**不用** dsh 自动压缩（入口被 `parts.js` 包掉/拒绝），决策归管家、摘要执行借 dsh `compactRegion` 管道但换成 `CHECKPOINT_PROMPT`。
- **switch 触发点**：① 转 idle 且过 80% 线问管家（带 `grown()` 迟滞）；② 轮中每步前过 95% 硬线问一次；③ provider 报溢出/反复卡死直接搬；④ 换工作目录、换模型、手动开新对话复用同一套搬迁。群 relay 会话与 local agent CLI 类 Bot 永不因尺寸搬。交接笔记让 Bot 自己写（同前缀发起→命中 provider 前缀缓存），写不出降级为无模型拼装笔记。
- **记忆**：文件外置（`<home>/memory/` 下 bots/groups/team + journal.jsonl，Agent Memory Repo Markdown 格式）。进账三路：Bot 调 `remember`/`forget`；空闲 2s 后自动审查（`memory-review.js`，游标 `reviewed.json`，群聊由 keeper 模型审查、不出群）；用户经记忆面板。prompt 里是**冻结快照**（首次渲染冻结保前缀缓存，新 part/checkpoint 才刷新）+ 每轮首步 auto-recall ≤5 条。

## 迭代操作（在 `ds-bot/` 内）

```sh
npm ci                                 # 构建工具（esbuild）
npm run harness                        # 一次：从 npm 拉 dev/harness/package.json 指定版的 DSH 包供测试/lint
npm run build                          # src/client → client.js
npm test                               # 单测；client.js 过期会失败
node scripts/build-client.mjs --check  # 校验 client.js 与 src/client 一致
npm run lint                           # oxlint
CONTEXT_WINDOW=100000 CHECK_RATIO=0.45 dev/bench.sh smoke 3096 8796 reset && node dev/smoke.mjs smoke 3096   # 冒烟
dev/bench.sh smoke 3096 8796 stop
```

- 改了 `src/client/` **必须** `npm run build` 并把 `client.js` 与源码一起提交；**绝不手改 `client.js`**（生成物）。
- 完成标准：`npm test` + `--check` + `npm run lint` 全过；动了 `index.js` 或 `src/host/` 还要跑冒烟。测试用 mock 模型（`dev/mock-llm.mjs`），不需要 API key。
- 测试台数据在 `.dsh-test-<name>/`；**严禁**指向 `~/.dsh`、桌面 App 数据或用户正在跑的 DSH。

## 分支与提交（上游仓库规范）

- 从最新 `dev` 拉分支：`fix/<issue>-<名>` / `feat/<issue>-<名>` / `docs/<名>` / `chore/<名>`；**不要** `dev/` 开头。PR 进 `dev` 不进 `main`（仅 release/hotfix 进 main）。
- 同步上游用 `scripts/merge-dev.sh`（冲突的 `client.js` 取 dev 侧再重建）；**不 rebase 已推送分支、不 force-push**。
- 提交信息英文、祈使句、正文写原因；作者是要改动的人，不加 AI Co-authored-by。用户可见文案用英文；改 README 时保持 README.zh.md 同步。行为变更先查 `docs/plans/` 的设计文档。
- 不碰带 `maintainer` 标签的 issue；不接别人已认领的。

## 版本兼容与工作区现状

- `ds-bot` 0.3.8 声明测试基线 **dsh 0.2.2-rc.1**；本工作区 dsh 钉在 **0.2.1-rc.5**（少 3434 提交）。插件 API 不兼容时优先考虑把 dsh stable 重定基线，见 skill **dsh-release-bump**。
- `link/`（ds-bot-link 0.1.0）版本独立、落后主插件；`ds-bot/client.js` 已随 tag 提交、装进桌面端无需构建。
- 升级 tag → skill **dsh-release-bump**；装进桌面端 → skill **dsh-plugin-install**；重建桌面端 → skill **dsh-desktop-release**。换版本/重打包后更新工作区 `AGENTS.md` 快照表。
