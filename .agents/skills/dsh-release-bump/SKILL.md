---
name: dsh-release-bump
description: 把工作区的 dsh（git submodule）升级到新的上游 release 并刷新桌面端部署。当用户要求升级 dsh、拉新版本、跟进上游 release、或问"有没有新版本"时使用。dsh-im / DS-Bot 已收编为源码快照、不再跟上游，不在本流程范围。
---

# dsh 升级流程：跟进上游 release

工作区只有一个需要跟进上游的仓库：`dsh/`（git submodule，`stable` 分支从 release tag 创建）。`plugins/` 下两个插件是源码快照（无 `.git`、不跟上游，出处见根 `README.md`）。当前状态见工作区 `AGENTS.md` 快照表。

## 1. 探明新版本

```sh
# dsh（tag 形如 dsh-vX.Y.Z[-rc.N]；注意 pre-release 要区分 stable 与 rc）
git -C /d/Agent/deepseek/dsh ls-remote --tags --refs origin | tail -10

# 官方"latest release"以 GitHub API 为准（dsh 仓库可能只打 tag 不发 Release，此时取最新 stable/rc 线 tag）
curl -s https://api.github.com/repos/deepseek-ai/deepseek-harness/releases/latest | grep tag_name
```

## 2. 升级 dsh

在干净工作区上执行（有本地改动先问用户如何处置）：

```sh
git -C /d/Agent/deepseek/dsh fetch origin --tags
git -C /d/Agent/deepseek/dsh switch -C stable refs/tags/<新tag>
```

注意：

- 引用 tag **必须写全 `refs/tags/...`**——本地存在与 tag 同名且指向不同的分支（历史遗留）。
- 升级前核对 `ds-bot` 快照的测试基线（`plugins/DS-Bot/ds-bot/README.md` 的 "Tested with dsh …"），新 dsh 不得低于该基线。
- 换版本后 `pnpm install`（lockfile 可能变化）。
- 若曾对 dsh 做过本地修补（见 `AGENTS.md` 迭代约定 #1），升级后评估补丁是否仍需要，重放于新 `stable`；gitlink 始终只钉上游可达提交。

## 3. 更新超仓 gitlink 并推送

```sh
git -C /d/Agent/deepseek add dsh          # 记录 submodule 新 pin
git -C /d/Agent/deepseek commit -m "chore: dsh 升级至 <新tag>"
git -C /d/Agent/deepseek push
```

## 4. 重建并刷新桌面端

换版本后重建**必须先清过期编译缓存**——跨版本旧 `lib/`/`dist/` 产物会让 tsc 门按旧 `.d.ts` 报假错（症状与清法见 skill **dsh-desktop-release** 第 0 节与坑表第四条）。然后按其流程：打包 → `deploy-dsh-bin.ps1` → 验证窗口。

## 5. 记录

更新工作区 `AGENTS.md` 快照表（新 tag、新 commit、日期），必要时补一行变更说明。这是本工作区的迭代台账。
