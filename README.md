# deepseek 工作区

围绕 DeepSeek Harness（dsh）的工作区：桌面端本地构建部署、插件集成与迭代。整个工作区是一个私有 git 仓库——`dsh/` 为 submodule 钉在上游 release tag，`plugins/` 下两个插件为源码快照。
工作区结构与迭代约定见 [AGENTS.md](AGENTS.md)。

**本 README 是一次性来源说明，写明两个插件的上游出处与快照版本，后续不再随代码演进更新。**

## 目录构成

| 路径 | 内容 | 状态 |
|------|------|------|
| `dsh/` | DeepSeek Harness 主仓 | git submodule → `deepseek-ai/deepseek-harness`，pin 在上游 release tag（快照时为 `dsh-v0.2.2-rc.5`），随上游更新 |
| `plugins/dsh-im/` | IM 接入插件（微信/飞书/TG 等 → DSH） | 源码快照，来源见下表 |
| `plugins/DS-Bot/` | DS-Bot 插件集（`ds-bot` 团队/群聊/记忆 + `link` 子插件） | 源码快照，来源见下表 |
| `bin/` | 已部署桌面端（绿色版，未签名 unpacked） | 构建产物，不入库，可由 `deploy-dsh-bin.ps1` 重建 |

## 插件来源（2026-11-23 快照）

两个插件均为对应上游 release tag 的原样拷贝，收编时剥离了嵌套 git 历史（无 `.git`）。
**自此不再跟进上游更新**，后续将在本仓内大幅改造，与上游的对应关系仅以本表为准：

| 插件 | 上游仓库 | 上游版本 | 快照 commit |
|------|----------|----------|-------------|
| `plugins/dsh-im/` | https://github.com/xmanrui/dsh-im | v5.10.0 | `c826bfa` |
| `plugins/DS-Bot/` | https://github.com/Fei2411/DS-Bot | v0.3.10 | `d104d9c` |

上游的许可与第三方声明文件（`LICENSE`、`NOTICE`、`THIRD_PARTY_NOTICES.md` 等）随快照原样保留在各自目录内。
