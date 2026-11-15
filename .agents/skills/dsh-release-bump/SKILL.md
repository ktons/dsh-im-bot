---
name: dsh-release-bump
description: 把本工作区的 dsh / dsh-im / DS-Bot 升级到新的上游 release 并刷新桌面端部署。当用户要求升级、拉新版本、跟进上游 release、或问"有没有新版本"时使用。
---

# 工作区升级流程：跟进上游 release

三个仓库的升级基线约定：**从 release tag 创建/更新 `stable` 分支**，再重建部署。当前状态见工作区 `AGENTS.md` 快照表。

## 1. 探明新版本

```sh
# dsh（tag 形如 dsh-vX.Y.Z[-rc.N]；注意 pre-release 要区分 stable 与 rc）
git -C /d/Agent/deepseek/dsh ls-remote --tags --refs origin | tail -10

# DS-Bot（tag 形如 vX.Y.Z）
git -C /d/Agent/deepseek/plugins/DS-Bot ls-remote --tags --refs origin | tail -5

# dsh-im（tag 形如 vX.Y.Z）
git -C /d/Agent/deepseek/plugins/dsh-im ls-remote --tags --refs origin | tail -5

# 官方"latest release"以 GitHub API 为准（DS-Bot 示例）
curl -s https://api.github.com/repos/Fei2411/DS-Bot/releases/latest | grep tag_name
```

## 2. 更新各仓库

对每个要升级的仓库（在干净工作区上执行；有本地改动先问用户如何处置）：

```sh
git -C <repo> fetch origin --tags
git -C <repo> switch -C stable refs/tags/<新tag>   # 已有 stable 时用 git -C <repo> switch stable && git reset --hard refs/tags/<新tag>（重置前须确认）
```

注意：

- `dsh` 引用 tag 时**必须写全 `refs/tags/...`**——本地存在与 tag 同名且指向不同的分支（历史遗留）。
- 升级 dsh 前先核对新版是否与 `ds-bot` 的测试基线兼容（见 `plugins/DS-Bot/ds-bot/README.md` 的 "Tested with dsh …"）。
- dsh 换版本后 `pnpm install`（lockfile 可能变化）；若从 0.2.1-rc.5 时代跨到 0.2.2+，留意 `stash@{0}` 里那份旧改动是否需要恢复。

## 3. 插件处理

- `ds-bot`：`client.js` 已随 tag 提交，**无需构建**；直接被桌面端加载。`link/` 子插件改过源码才需构建。
- 插件装进桌面端：GUI 设置 → 插件，或 `dsh plugin --profile desktop add <name>`；本地 checkout 用 profile 里 `link:D:/Agent/deepseek/plugins/DS-Bot/ds-bot` + bundles 方式（见 ds-bot README）。
- `dsh-im`：升级前查其 README/CHANGELOG 是否声明对应的 dsh 版本要求。

## 4. 重建并刷新桌面端

按 skill **dsh-desktop-release** 的流程：打包 → `deploy-dsh-bin.ps1` → 验证窗口。

## 5. 记录

更新工作区 `AGENTS.md` 快照表（新 tag、新 commit、日期），必要时补一行变更说明。这是本工作区的迭代台账。
