# 发布安装包

源码保留在 Git 仓库，安装包放在 GitHub Release 附件中。`release/` 已被 Git 忽略，不要把安装包加入源码提交。

## 构建

在 GitHub Actions 选择 **Build installers → Run workflow**，选择待发布的分支或标签。推送 `v*` 标签也会触发构建。工作流只构建和上传 Artifacts，不会自动创建或发布 Release。

四个构建任务分别使用原生系统及架构：

| 任务        | 文件                         |
| ----------- | ---------------------------- |
| macOS arm64 | `.dmg`，适用于 Apple Silicon |
| macOS x64   | `.dmg`，适用于 Intel Mac     |
| Windows x64 | NSIS `.exe` 安装程序         |
| Linux x64   | `.AppImage` 和 `.deb`        |

每个任务先完成格式、架构、类型、单元测试与生产构建，再打包和生成 SHA-256。Artifacts 保留 30 天，请在过期前下载。Windows / Linux ARM64 不在本次分发范围内。

## 整理附件

将同一次成功运行的四个 Artifacts 解压，把安装包合并到 `release/1.2.7/`。不要使用构建失败或不同源码提交混合的安装包；删除各自的校验文件后重新生成一份汇总：

```sh
node scripts/release-checksums.mjs release/1.2.7
```

最终目录包含两个 DMG、一个 EXE、一个 AppImage、一个 DEB 和一个 `SHA256SUMS.txt`。不要上传解包应用、缓存、`builder-debug.yml`、`latest*.yml` 或 `*.blockmap`；当前应用没有通过这些文件执行自动更新。

macOS / Linux 可在安装包目录核对：

```sh
shasum -a 256 -c SHA256SUMS.txt
```

Windows PowerShell 可计算单个文件的校验值，与 `SHA256SUMS.txt` 对照：

```powershell
Get-FileHash .\CG-Claude-1.2.7-windows-x64-setup.exe -Algorithm SHA256
```

## 创建 GitHub Release

1. 确认 `package.json` 版本与发布标签一致，1.2.7 对应 `v1.2.7`。
2. 在仓库的 Releases 创建草稿，选择本次成功构建对应的提交或标签。
3. 附上五个安装包和 `SHA256SUMS.txt`，填写发布说明，并注明支持的 CPU 架构。
4. 核对附件后再发布。GitHub 会自动提供该标签的源码 ZIP / tar.gz，无需另外打源码包。

macOS 成品尚未签名、公证，Windows 成品尚未进行发布者代码签名。构建通过和安装包完整性检查不等同于 Windows / Linux 桌面交互实测；发布说明应保留实际验证范围。

## 本机重建

需要 Node.js 22.12 或更新版本，在目标系统和 CPU 架构上执行：

```sh
npm ci
npm run check
npm run format:check
npm run dist
node scripts/release-checksums.mjs release
```

清理时可删除 `node_modules/`、`.npm-cache/`、`dist/`、`dist-server/` 和旧 `release/` 产物。保留 `build/`、`public/`、`tests/`、锁文件及工程配置，这些都是可重建源码的一部分。用户的本机配置、密钥和快照存放在项目外，不属于发布清理范围。
