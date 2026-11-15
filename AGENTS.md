# AGENTS.md — D:\Agent\deepseek 工作区

本目录**不是** git 仓库，而是一个多仓库工作区：围绕 DeepSeek Harness（dsh）做本地构建、插件集成与迭代。
本文件记录工作区现状与约定；各子仓库内部工作时应遵循**该仓库自己的** AGENTS.md（如在 `dsh/` 内工作时加载 `dsh/AGENTS.md`）。

## 目录布局与仓库状态（2026-11-15 快照）

| 路径 | 内容 | 仓库 / 远程 | 当前检出 |
|------|------|-------------|----------|
| `dsh/` | DeepSeek Harness 主仓（pnpm monorepo） | `git@github.com:deepseek-ai/deepseek-harness.git` | 分支 `stable` ← tag `dsh-v0.2.1-rc.5`（`b830ec95`） |
| `plugins/dsh-im/` | IM 接入插件（微信/飞书/TG 等→DSH） | `git@github.com:xmanrui/dsh-im.git` | detached HEAD @ `v5.10.0`（`c826bfa4`） |
| `plugins/DS-Bot/` | DS-Bot 仓库（含两个 dsh 插件） | `git@github.com:Fei2411/DS-Bot.git` | 分支 `stable` ← tag `v0.3.6`（`a66cc737`） |
| `bin/` | 已部署的桌面端产物（绿色版，1.1GB） | — | dsh v0.2.1-rc.5，win-x64，未签名 unpacked |

### plugins/DS-Bot 内部

- `ds-bot/` → 插件 `ds-bot` v0.3.6（Bot 团队/群聊/记忆）：`client.js` 为已提交的预构建产物，只有改源码才需构建。安装/升级插件的流程与排障见 skill：**dsh-plugin-install**。
- `link/` → 插件 `ds-bot-link` v0.1.0（版本独立，落后于主插件）。

### 遗留物

- `dsh` 仓库 `stash@{0}`：2559 个已暂存改动（0.2.2-rc.1 时代的 `.agents/notes` 归档整理），建 `stable` 分支前存入。恢复须先切回 0.2.2-rc.1 基点再 `git stash pop`，勿在 0.2.1-rc.5 上直接弹。

## 版本兼容注意

- `ds-bot` 0.3.6 README 声明测试基线为 **dsh 0.2.2-rc.1**；本工作区 dsh 钉在 **0.2.1-rc.5**（少 3434 个提交）。插件若出 API 不兼容，优先考虑把 dsh stable 重定到 `dsh-v0.2.2-rc.1`（`66491b05`，即 master tip `fcc0ad46` 所在合并点附近，stash 也属于那个时代）。
- `dsh` 本地分支 `dsh-v0.2.1-rc.5` **名不副实**：它指向 master tip（`fcc0ad46`），与同名 tag（`b830ec95`）相差 3434 提交。引用该版本时务必用 `refs/tags/dsh-v0.2.1-rc.5` 消歧。

## 桌面端构建与部署（准则）

- 桌面端为 release 级**未签名 unpacked** 构建；产物经 `deploy-dsh-bin.ps1` 同步进 `bin/`，启动用 `start-dsh.cmd` / `start-dsh.ps1` 或直接双击 `bin\DeepSeek Harness.exe`（应用自包含、不依赖 CWD、单实例锁）。
- 打包、部署、验证、排障的完整操作见 skill：**dsh-desktop-release**。
- 温启动实测基线：窗口 ~2.1s，工作区可用 ~2.7s。

## 环境事实（排障时先核对这些）

- Node v22.23.3、pnpm 11.28.5（corepack 启用）；VS 18 Community 含 VC++ 工具链（打包预检需要）
- Git Bash 的 GNU tar 对 `D:\` 路径有远程主机误判 bug（System32 的 bsdtar 无此问题）
- 本机代理 `127.0.0.1:7897`（HTTP）；GitHub 直连超时，npmmirror 可用作 npm 源与 electron-builder 二进制源
- 内存 30.6GB；Host bundle 打包需大量 commit 内存，与大内存程序并存时会 OOM（exit 0xC0000409）
- `dsh/apps/desktop/.env.windows`：本地未签名打包配置（git 忽略），勿提交勿删除

## 迭代约定

1. 一切以 **release tag 为基线**：`stable` 分支从 tag 创建，用于后续迭代（dsh 与 DS-Bot 已照此办理；dsh-im 仍为 detached，升级时可同法建 stable）。
2. 升级流程见 skill：**dsh-release-bump**；桌面端构建/部署/排障见 skill：**dsh-desktop-release**（均位于工作区 `.agents/skills/`，跨 agent 通用）。
3. 完成一次状态变更（换版本、重打包、迁移目录）后，**更新本文件的快照表**，保持记录新鲜。
4. **Git 纪律**：每产生一段稳定内容（文档、脚本、skill、可用的新流程）就 `git commit` 到本工作区仓库；**禁止 push**——本仓库仅作本地台账，无远程。`dsh/`、`plugins/` 是各自独立的 git 仓库，不受本条约束，改动遵循其自身规范。
4. 各插件安装进桌面端走 GUI（设置 → 插件）或 `dsh plugin --profile desktop add`；桌面端 profile 位于标准 Harness home 的 `profiles/desktop`（开发模式 dev:desktop 则在 `apps/desktop/.desktop-build/development/home`，两者隔离）。
