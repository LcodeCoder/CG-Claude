# 1.2.7 交付记录

## 图标与界面

- macOS 图标增加透明留白，橘色主体从 1024px 画布中的约 960px 收至 825px；运行时 Dock、窗口和应用包使用一致比例。
- 重建 ICNS 小尺寸 RGB 与透明度表示，并同步 10 个 iconset 资源。Finder 图标视图和路径栏实际查看正常；用户自行确认图标显示。
- 首页新增「浏览器环境配置插件」按钮，打开 LC-time GitHub 仓库，初次检测前即可使用。
- 一键配置首步将标签、帮助和控件统一对齐，修复出口地区的箭头换行；窄窗口上下排列。
- 中英文帮助文字减少重复说明，补齐三个时区选项的英文，保留配置范围提示和读屏关联。

## 验证

架构与类型检查通过，37 个测试文件，462 项通过、1 项平台条件跳过。新增 ICNS 数据、分辨率与留白回归。最终英文补齐后，相关 5 项测试与生产构建再次通过。

隔离界面核对中文深色、英文浅色、护眼配色、390px 窗口、键盘操作和插件真实链接。macOS arm64 成品已隔离启动并正常退出；最终安装包的 119 个代码和资源文件与构建一致，包内版本均为 1.2.7，DMG 与 ZIP 完整性通过。详情见 [验证记录](validation.md)。

## 发布安装包

当前版本的分发目录为 `release/1.2.7/`，只保留安装包与 `SHA256SUMS.txt`：

- `CG-Claude-1.2.7-macos-arm64.dmg`：Apple Silicon。
- `CG-Claude-1.2.7-macos-x64.dmg`：Intel Mac。
- `CG-Claude-1.2.7-windows-x64-setup.exe`：Windows x64 安装程序。
- `CG-Claude-1.2.7-linux-x86_64.AppImage`：Linux x64 便携应用。
- `CG-Claude-1.2.7-linux-amd64.deb`：Debian / Ubuntu x64 安装包。

旧版本、重复 ZIP、解包应用和构建调试文件不作为发布附件。校验值以同目录 `SHA256SUMS.txt` 为准，每次重新出包后重新生成。各平台安装包由 `Build installers` 工作流在对应系统和架构上构建；源码推送和 Artifacts 上传均不代表已经发布 GitHub Release。详见 [发布说明](publishing.md)。

## 未覆盖范围

macOS 成品未签名、公证；Windows / Linux 桌面显示未实机验证。Dock 整体尺寸比较未保存自动化截图。真实配置写入不属于本轮界面验证范围；翻译仍未接入 Claude Code 原生会话。
