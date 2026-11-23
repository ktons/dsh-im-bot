# AGENTS.md — D:\Agent\deepseek 工作区

本目录是一个私有 git 仓库（远程 `git@github.com:ktons/dsh-im-bot.git`，本地台账 + 私有备份），围绕 DeepSeek Harness（dsh）做本地构建、插件集成与迭代：`dsh/` 为 git submodule 钉在上游 release tag；`plugins/` 下两个插件已收编为**源码快照**（无 `.git`，不再跟进上游，大改直接在本仓提交）。
本文件记录工作区现状与约定；进入子项目工作时遵循其自带的 AGENTS.md（如 `dsh/`、`plugins/DS-Bot/` 内各自的 AGENTS.md）。

## 目录布局与仓库状态（2026-11-23 快照）

| 路径 | 内容 | 仓库 / 远程 | 当前检出 |
|------|------|-------------|----------|
| `dsh/`（submodule） | DeepSeek Harness 主仓（pnpm monorepo） | 上游 `https://github.com/deepseek-ai/deepseek-harness.git`（只读，不 fork） | 分支 `stable` ← tag `dsh-v0.2.2-rc.5`（`9c2670d3`） |
| `plugins/dsh-im/` | IM 接入插件（微信/飞书/TG 等→DSH） | 源码快照，无 git | 上游 xmanrui/dsh-im `v5.10.0`（`c826bfa`），2026-11-23 收编 |
| `plugins/DS-Bot/` | DS-Bot 插件集（`ds-bot` + `link`） | 源码快照，无 git | 上游 Fei2411/DS-Bot `v0.3.10`（`d104d9c`），2026-11-23 收编 |
| `bin/` | 已部署的桌面端产物（绿色版，1.1GB） | 不入库，可由 `deploy-dsh-bin.ps1` 重建 | dsh v0.2.2-rc.5，win-x64，未签名 unpacked（2026-11-23 部署验证） |

插件上游出处与"不再跟上游"的一次性声明见根 `README.md`。

### plugins/DS-Bot 内部

- `ds-bot/` → 插件 `ds-bot` v0.3.10（Bot 团队/群聊/记忆）：`client.js` 为随 tag 提交的预构建产物，只有改源码才需构建。安装/升级插件的流程与排障见 skill：**dsh-plugin-install**。
- `link/` → 插件 `ds-bot-link` v0.1.0（版本独立，落后于主插件）。

### 遗留物

- `dsh` 仓库 `stash@{0}`：2559 个已暂存改动（0.2.2-rc.1 时代的 `.agents/notes` 归档整理）。stable 现钉 0.2.2-rc.5（与 stash 同代），如需恢复先评估内容再 `git stash pop`。
- `.downloads/DS-Bot-local-backup-20261123.bundle`：收编重置前旧 DS-Bot 仓的全历史备份（含 `feat/standard-template` @ `ab6b2689`——standard 模板/退役 ask_user 那次提交）。确认不再需要可删。

## 版本兼容注意

- `ds-bot` 0.3.10 README 声明测试基线为 **dsh 0.2.2-rc.1**；工作区 dsh 钉在 **0.2.2-rc.5**（同线更新），满足基线。2026-11-23 桌面端已实测可用（启动、工作区加载、插件页正常）。
- 插件迭代规划见 `docs/ds-bot-roadmap.md`（已裁决：ask_user 全局拆、lane 跟随 agentPreset；"不重定基线"一条已随 0.2.2-rc.5 升级自然消化）。
- `dsh` 本地分支 `dsh-v0.2.1-rc.5` **名不副实**：它指向 master tip（`fcc0ad46`），与同名 tag（`b830ec95`）相差 3434 提交。引用该版本时务必用 `refs/tags/dsh-v0.2.1-rc.5` 消歧。

## 桌面端构建与部署（准则）

- 桌面端为 release 级**未签名 unpacked** 构建；产物经 `deploy-dsh-bin.ps1` 同步进 `bin/`，启动用 `start-dsh.cmd` / `start-dsh.ps1` 或直接双击 `bin\DeepSeek Harness.exe`（应用自包含、不依赖 CWD、单实例锁）。
- 打包、部署、验证、排障的完整操作见 skill：**dsh-desktop-release**；**升级/换版本后重建前必先清过期编译缓存**（该 skill 第 0 节），否则 tsc 门读旧 `lib` 产物报假错。
- 温启动实测基线：窗口 ~2.1s，工作区可用 ~2.7s。

## 环境事实（排障时先核对这些）

- Node v22.23.3、pnpm 11.28.5（corepack 启用）；VS 18 Community 含 VC++ 工具链（打包预检需要）
- Git Bash 的 GNU tar 对 `D:\` 路径有远程主机误判 bug（System32 的 bsdtar 无此问题）
- 本机代理 `127.0.0.1:7897`（HTTP）；GitHub 直连超时（HTTPS 需代理，SSH 直连可用），npmmirror 可用作 npm 源与 electron-builder 二进制源
- 内存 30.6GB；Host bundle 打包需大量 commit 内存，与大内存程序并存时会 OOM（exit 0xC0000409）
- `dsh/apps/desktop/.env.windows`：本地未签名打包配置（git 忽略），勿提交勿删除

## 迭代约定

1. dsh 以 **release tag 为基线**：`stable` 从 tag 创建；升级 = fetch 新 tag → `git switch -C stable refs/tags/<新tag>` → 超仓 `git add dsh` 更新 gitlink → 超仓提交推送。**gitlink 只能指向上游可达的提交**——确需本地修补 dsh 时（如打包门禁修复），在 `stable` 上本地提交并在此记录 hash，gitlink 仍钉在上游 tag 提交。插件为源码快照，没有"跟上游升级"概念，大改直接在本仓提交。
2. dsh 升级流程见 skill：**dsh-release-bump**；桌面端构建/部署/排障见 skill：**dsh-desktop-release**；插件安装见 skill：**dsh-plugin-install**（均位于工作区 `.agents/skills/`，跨 agent 通用）。
3. 完成一次状态变更（换版本、重打包、迁移目录）后，**更新本文件的快照表**，保持记录新鲜。
4. **Git 纪律**：每产生一段稳定内容（文档、脚本、skill、可用的新流程）就 `git commit` 并 `git push` 到 `ktons/dsh-im-bot`（私有仓）；`bin/`、`.downloads/` 已 ignore 不入库。
5. 各插件安装进桌面端走 GUI（设置 → 插件）或 `dsh plugin --profile desktop add`；桌面端 profile 位于标准 Harness home 的 `profiles/desktop`（开发模式 dev:desktop 则在 `apps/desktop/.desktop-build/development/home`，两者隔离）。
