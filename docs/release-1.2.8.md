# 1.2.8 交付记录

## 本次更新

- 新增独立英文 README（`README.en.md`），中文 README 增加语言切换入口。
- 首次启动的界面语言改为按系统语言环境自动选择：`zh*` locale 使用简体中文，其余环境回退英文；已保存的语言设置仍然优先。
- 补齐英文界面的帮助页、人工复核说明、配置文件和文献分类、设置页隐私提示及一键配置校验文案。
- 生产构建的 CSP 允许 `data:` 字体，修复内嵌字体被浏览器拦截的问题。

## 验证

- 架构检查、Vue / TypeScript 类型检查通过。
- 39 个测试文件、467 项测试通过，1 项平台条件跳过。
- 生产构建与格式检查通过。
- Chrome 中实际检查中文 / 英文界面，英文模式逐页走查 11 个页面，控制台无错误；隔离环境完成 3 遍、31 项环境扫描。

## 发布安装包

当前版本的分发目录为 `release/1.2.8/`，只保留安装包与 `SHA256SUMS.txt`：

- `CG-Claude-1.2.8-macos-arm64.dmg`：Apple Silicon。
- `CG-Claude-1.2.8-macos-x64.dmg`：Intel Mac。
- `CG-Claude-1.2.8-windows-x64-setup.exe`：Windows x64 安装程序。
- `CG-Claude-1.2.8-linux-x86_64.AppImage`：Linux x64 便携应用。
- `CG-Claude-1.2.8-linux-amd64.deb`：Debian / Ubuntu x64 安装包。

校验值以同目录 `SHA256SUMS.txt` 为准，每次重新出包后重新生成。各平台安装包由 `Build installers` 工作流在对应系统和架构上构建；源码推送和 Artifacts 上传均不代表已经发布 GitHub Release。详见 [发布说明](publishing.md)。

## 未覆盖范围

macOS 成品未签名、公证；Windows / Linux 桌面显示未实机验证。外部公网查询、真实翻译模型调用以及实际配置写入未在本轮发布打包中执行；这些路径由单元测试覆盖，仍建议在目标环境复检。
