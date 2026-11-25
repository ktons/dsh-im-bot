---
name: ds-bot-dev
description: DS-Bot 源码快照（plugins/DS-Bot）的架构地图与迭代指南：ds-bot 插件的提示词/会话分段/记忆机制在哪个文件、改代码怎么构建测试、版本兼容基线。当用户要改 ds-bot 代码、排查 Bot 行为（提示词/记忆/压缩/交接）、问"这个机制在哪实现"、或要为 ds-bot 做迭代时使用。
---

# DS-Bot 迭代与架构指南

目录 `plugins/DS-Bot` 是**源码快照**（上游 Fei2411/DS-Bot `v0.3.10` `d104d9c`，2026-11-23 收编；无 `.git`、不再跟上游，出处见根 `README.md`，改动直接在工作区超仓 `ktons/dsh-im-bot` 提交）。两部分：`ds-bot/` 是 DSH 插件（Bot 功能本体），`app/` 是桌面 App（自带钉版 DSH + 本插件，独立 DSH_HOME）。改动前可读目录自带的 `AGENTS.md`（硬规则、命令参考；其分支/PR 规范已随收编失效）。

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

- 改了 `src/client/` **必须** `npm run build` 并把 `client.js` 与源码一起提交；**绝不手改 `client.js`**（生成物）。`npm run build` 里的 build-link 步骤在本工作区会失败（`link/` 未 npm ci 装依赖），build-client 成功即够用。
- **Git Bash 跑 `dev/bench.sh` 的坑**：pnpm 对 MSYS 风格 `link:/d/...` 路径会生成坏符号链接（指向 `/d/d/...`），dsh 报 `cannot resolve profile bundle "ds-bot"`、冒烟表现为 `state.json ENOENT`。修法：删掉 `.dsh-test-<name>/profiles/web/node_modules/ds-bot` 坏链，`cmd //c "mklink /J ds-bot <ds-bot 的 Windows 绝对路径>"` 重建 junction，再 reset（ensure_profile 见 package.json 已含 link: 串会跳过重装）。冒烟需 `DSH_HARNESS` 指向 DSH checkout，本工作区用 `/d/Agent/deepseek/dsh`。
- 曾有的环境性失败测试（link-bundle、phone 缺 `ws`、mobile markdown-image EPERM、malformed-response flake ×2）已于 2026-11-25 应用户决定删除（超仓 `e8f4065`）——根因均为环境限制（`../link` 未 npm ci、T5 后 `ws` 不可达、Windows symlink 权限），非插件代码问题。现在 `npm test` 本地**全绿**（3494 tests / 3485 pass / 0 fail / 9 skipped，skipped 均为既有环境跳过）。
- 完成标准：`npm test` + `--check` + `npm run lint` 全过；动了 `index.js` 或 `src/host/` 还要跑冒烟。测试用 mock 模型（`dev/mock-llm.mjs`），不需要 API key。
- 测试台数据在 `.dsh-test-<name>/`；**严禁**指向 `~/.dsh`、桌面 App 数据或用户正在跑的 DSH。

## 提交（工作区超仓规范）

- DS-Bot 没有自己的 git：改动在超仓 `ktons/dsh-im-bot` 提交并推送，提交信息沿用超仓现有风格（`feat:`/`fix:`/`chore:`/`docs:` + 中文摘要）。
- 改了 `src/client/` 后重建的 `client.js` 必须与源码同一提交入库（超仓直接跟踪该文件）。
- 沿用的代码库级约定：用户可见文案用英文；改 README 时保持 README.zh.md 同步；行为变更先查 `docs/plans/` 的设计文档。
- 上游贡献规范（dev 分支、PR 流程、`scripts/merge-dev.sh` 同步、issue 认领）已随收编作废，仅当将来重新跟上游时再启用。

## 版本兼容与工作区现状

- `ds-bot` 0.3.10 声明测试基线 **dsh 0.2.2-rc.1**；工作区 dsh 钉在 **0.2.2-rc.5**，满足（2026-11-23 桌面端实测可用）。插件迭代规划见工作区 `docs/ds-bot-roadmap.md`。
- `link/`（ds-bot-link 0.1.0）版本独立、落后主插件；`ds-bot/client.js` 随 v0.3.10 快照就位、装进桌面端无需构建。
- dsh 升级 → skill **dsh-release-bump**（插件快照不跟上游）；装进桌面端 → skill **dsh-plugin-install**；重建桌面端 → skill **dsh-desktop-release**。换版本/重打包后更新工作区 `AGENTS.md` 快照表。
