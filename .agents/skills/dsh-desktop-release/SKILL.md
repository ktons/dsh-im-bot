---
name: dsh-desktop-release
description: 构建/打包/部署 DeepSeek Harness（dsh）桌面端到本工作区 bin 目录，或排查打包失败（GNU tar 盘符、GitHub 超时、rolldown OOM）。当用户要求构建桌面端、重新打包、更新 bin 里的 exe、或报出 tar "Cannot connect to D:"、electron-builder ETIMEDOUT、Host bundle 内存分配失败时使用。
---

# dsh 桌面端：构建 → 打包 → 部署 → 验证

适用范围：工作区 `D:\Agent\deepseek`（dsh 检出于 `dsh/`，部署目标为 `bin/`）。环境与状态细节见工作区 `AGENTS.md`。

## 0. 前置（首次）

```sh
cd /d/Agent/deepseek/dsh
corepack enable pnpm      # 本机已有 shim 可跳过
pnpm install
```

打包配置 `dsh/apps/desktop/.env.windows` 已存在（未签名 test 部署 + npmmirror 源），勿删勿提交。

## 1. 打包（release 级 unpacked，未签名）

在 Git Bash 中执行（三条环境前缀缺一不可）：

```sh
cd /d/Agent/deepseek/dsh/apps/desktop
export PATH="/c/Windows/System32:$PATH" \
       HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 \
       ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
       DSH_GATE_CONCURRENCY=1
pnpm run package -- --dir --unsigned
```

产物：`.desktop-build/targets/win-x64/unsigned-artifacts/win-unpacked/`

### 三个必踩坑（都已固化在上面的命令里）

| 症状 | 原因 | 解法 |
|------|------|------|
| `tar (child): Cannot connect to D: resolve failed`（prepare:packages 阶段） | Git Bash 的 GNU tar 把 `D:\` 当远程主机 | `PATH` 里 System32 优先，用 bsdtar |
| `connect ETIMEDOUT`（electron-builder 阶段，GitHub 直连） | 下载 winCodeSign 等工具走 GitHub | 代理 7897 + `ELECTRON_BUILDER_BINARIES_MIRROR` npmmirror 镜像 |
| `memory allocation of N bytes failed` + exit `3221226505`（Host bundle 阶段） | rolldown 打桌面主包吃 commit 内存；有大程序（游戏等）占内存时必崩 | `DSH_GATE_CONCURRENCY=1` 串行；仍崩则请用户临时关闭大内存程序（commit 余量可用 `\Memory\Commit Limit` - `\Memory\Committed Bytes` 查看） |

### 成功判据

- 末尾出现冒烟检查三连：`CLI offline plugin installation and removal passed`、`dsh web: http://127.0.0.1:…`、`DOCX, XLSX, PPTX to PDF and skill CLI discovery passed`
- 最新 `packaging-runs/<ts>/events.jsonl` 末条 `windows-package` 事件 `"success":true`

## 2. 部署到 bin

```sh
powershell -NoProfile -ExecutionPolicy Bypass -File /d/Agent/deepseek/deploy-dsh-bin.ps1
```

自动停掉运行中的实例 → robocopy 增量同步到 `D:\Agent\deepseek\bin`（只增改不删）。

## 3. 验证

```powershell
# 启动（或直接双击 bin\DeepSeek Harness.exe，二者等价）
powershell -NoProfile -ExecutionPolicy Bypass -File D:\Agent\deepseek\start-dsh.ps1
```

- 进程出现且主窗口标题带 `— DeepSeek Harness` 即工作区加载完成；温启动参考值：窗口 ~2.1s、可用 ~2.7s
- 需要视觉确认时用 window-screenshot skill；匹配窗口用子串 `— DeepSeek Harness`（裸 "DeepSeek Harness" 会误中 Chrome 里的 GitHub 页标题）

## 4. 收尾

更新工作区 `AGENTS.md` 的快照表（版本/日期/路径若变化）。
