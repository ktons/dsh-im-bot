---
name: dsh-plugin-install
description: 把 dsh 插件安装/升级进桌面端（本地 link 目录、npm、GitHub、tgz 四种方式），及插件激活失败排障（ERR_MODULE_NOT_FOUND、缺 deep-view、缺 @deepseek-ai/dsh-llm）。当用户要装插件、插件启用失败、或问插件怎么装时使用。
---

# dsh 插件安装与排障

桌面端 GUI：设置 → 插件 → 添加插件（接受插件包名 / GitHub 地址 / 本地目录路径）；CLI 等价：`dsh plugin --profile desktop add <name>`。桌面端的插件 profile 在标准 Harness home 的 `profiles/desktop`（dev:desktop 开发模式则在 `apps/desktop/.desktop-build/development/home`，两者隔离）。

## 关键准则：填"插件包目录"，不是仓库根

插件包 = 含 `package.json`（有 `name`/`main`）+ `cordis.patch.yml` 的目录。DS-Bot 仓库的对应关系：

| 插件 | 本地路径 | 说明 |
|------|----------|------|
| `ds-bot` v0.3.8 | `D:\Agent\deepseek\plugins\DS-Bot\ds-bot` | 主插件，Bot 团队/群聊 |
| `ds-bot-link` v0.1.0 | `D:\Agent\deepseek\plugins\DS-Bot\link` | Link 功能，可选 |

## 本地 link 安装的固定流程（以 ds-bot 为例）

1. **先备齐运行时依赖**（clone 下来的仓库不带 node_modules，跳过这步激活必报 `ERR_MODULE_NOT_FOUND`，首个缺的通常是 `deep-view`）：

   ```sh
   cd /d/Agent/deepseek/plugins/DS-Bot/ds-bot
   npm ci --no-audit --no-fund --registry=https://registry.npmmirror.com
   ```

2. GUI 里填上面的插件包目录路径 → 安装。
3. **重启桌面端**生效（插件在启动时激活；托盘右键 Quit 后再 `start-dsh`）。

本地 link 安装不会弹更新提示——这正是钉 release tag 自主迭代想要的；升级走 skill `dsh-release-bump` 后重装。

## 排障对照

| 激活报错 | 判定 | 处理 |
|----------|------|------|
| `Cannot find package 'deep-view'`（或 ws/mailparser 等普通依赖） | checkout 没装依赖 | 做上面第 1 步，重启 |
| `Cannot find package '@deepseek-ai/dsh-llm'`（及其他 `@deepseek-ai/*`） | **不是依赖问题**：peer 依赖由 dsh 宿主运行时注入（裸 node 验证必报缺，属正常）；宿主没注入说明 dsh 版本过旧 | 把 dsh stable 升到插件 README 标注的测试基线（ds-bot 0.3.8 → dsh 0.2.2-rc.1），按 `dsh-release-bump` + `dsh-desktop-release` 重建部署 |
| "该路径不存在或不是有效的插件包" | 填了仓库根而非插件包目录 | 填到 `...\DS-Bot\ds-bot` 这一层 |

## 其他安装源（等价，按需）

- **npm 包名**：`ds-bot`（官方发布版，非本地检出；装完随 DSH 更新机制提供更新）
- **GitHub**：`github:ktons/DS-Bot#main&path:/ds-bot`（`&path:` 指定子目录；fork 无 tag，按分支取）
- **tgz**：`pnpm pack` 产物路径
- 安装源下拉可切"中国大陆镜像源"加速

## 遗留陷阱

`ds-bot` 前身叫 `dsh-bot`，两者用同一个插件 id `bot`——profile 里还留着 `dsh-bot` 时先移除再装 `ds-bot`；用户数据（团队/聊天/密钥）保留并自动迁移。
