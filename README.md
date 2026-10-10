# CG Claude

本地中文环境工作台，支持 Electron 桌面版和本机浏览器版。根据 AYi 参考文章逐项整理可检测的环境配置，并核对 Claude Code 官方配置说明。提供 27 项环境检查、连续三遍复检、配置向导、项目配置扫描、字段修复、本地连接设置编辑与完整快照还原。

实际验证与截图见 [验证记录](docs/validation.md)，原文逐项映射见 [来源与实现](docs/reference.md)。

## 启动桌面版

macOS arm64 成品位于 `release/mac-arm64/CG Claude.app`，直接打开，无需另外安装 Node.js。构建产物尚未签名或公证。其他平台配置了打包目标，本次没有在真实 Windows/Linux 桌面实测。

从源码启动需要 Node.js **22.12 或更新版本**：

```sh
npm ci
npm run desktop
```

macOS 可双击 `启动工具.command`，Windows 可双击 `启动工具.cmd`，两者均启动 Electron。Linux 从项目目录运行 `npm run desktop`。准备脚本会按锁定版本下载 Electron；已安装的二进制直接复用，下载使用已有 HTTP/HTTPS 代理环境，不改写用户代理配置。

桌面窗口内置本机服务、项目目录选择器、报告保存对话框。关闭最后窗口后 Windows/Linux 退出；macOS 使用菜单中的「退出 CG Claude」。退出时等待正在进行的配置事务。为避免并发写入，浏览器服务和桌面版不能同时使用同一份记录目录，启动桌面版前请退出另一个运行实例。

## 推荐流程

1. 选择实际网络模式、服务方式和隐私偏好，或点击「一键配置完成」逐项填写。自定义 API 地址清理默认不勾选。
2. 点击「开始检测」，默认连续检查 3 遍，只读取本机配置；公网出口与 WebRTC 需另外勾选。
3. 点击顶部「检查通过」「需要关注」「待确认 / 未检测」统计入口，自动筛选对应结果、清除旧搜索与分类、展开并定位到第一项。只有一项需关注时直接看到该项证据。
4. 查看修改预览后执行配置。11 个流程节点由上到下执行，每项首次失败后最多重试 3 次，仍失败就跳过，继续后续节点。每次写入前备份；第一节点保存完整配置快照。
5. 配置后连续三遍复检；刷新界面可继续查看服务端任务进度。服务重启后未完成任务标为中断，不自动重新写入。
6. 在「备份恢复」保存或选择完整快照，点击「一键还原之前的配置快照」，预览后恢复文件内容、原权限、文件不存在状态与检测偏好。还原前另外保存当前状态，预览后变化会阻止还原。
7. 在「本机配置」编辑代理、网关、NO_PROXY 或额外 CA 路径。逐项保持、设置或移除，预览后保存，工具自动记录修改前的完整快照和原文件备份。
8. 在「项目扫描」选择本地目录，检查项目配置覆盖、MCP、TLS、凭据字段、依赖锁文件及本地 Git 提交。

已打开的终端不会因文件修改而更新环境变量；重新打开终端和客户端后再核对实际生效配置。历史报告、偏好或配置基线已变化时，需要重新检测再预览修复。旧报告仍可阅读。

## 检测与写入范围

27 项环境检查覆盖系统/浏览器时区、TZ、系统代理、虚拟接口、DNS、IPv6、进程与启动文件代理、npm/Git 用户和生效代理、API 地址、Claude 配置目录、隐私、CLI、TLS、代理兼容性、认证来源、自定义 CA/mTLS、公网出口与浏览器一致性。网络开启时对比历史 IP、国家、城市和网络组织。

可修改的 7 类字段：shell/npm/Git 用户代理、shell/Claude 自定义 API 地址、Claude 隐私变量、npm TLS 校验。支持 `.zshrc`、`.zprofile`、`.zshenv`、`.bashrc`、`.bash_profile`、`.profile`、`.npmrc`、`.gitconfig`、`.config/git/config`、`.claude/settings.json` 这 10 个配置位置。

连接编辑仅写入 `~/.claude/settings.json` 中的 `HTTPS_PROXY`、`HTTP_PROXY`、`NO_PROXY`、`ANTHROPIC_BASE_URL` 和 `NODE_EXTRA_CA_CERTS`。其他字段、Hooks、权限与凭据原值保留，JSON 排版统一为两格缩进。同名小写代理项的规范化也会列在预览中。CA 路径必须是可读、非空的本机绝对路径；不读取证书内容、不执行连通性请求。自定义 `CLAUDE_CONFIG_DIR` 时此编辑入口停用，避免写入错误位置。

项目扫描只检查固定的配置与元数据文件，不执行项目脚本、Hooks、MCP 或依赖安装。只检查 dotenv/锁文件是否存在，不读取 dotenv 内容。凭据字段提示不展示值。项目源码漏洞、依赖漏洞和构建正确性仍需对应工具另外检查；本项目的工程验证见验证记录。

结果分为通过、需关注、需处理、待确认、未检测。账号会话、服务地区、浏览器资料、DNS 实际出口、完整 TUN 接管、ASN 分类、网页隐私、额度与支付需要人工复核，有原文章节映射与官方入口。环境结果不推算账号状态。

系统/HTTP 代理、自定义网关、Bedrock、Vertex 可以是正常配置，按实际偏好保留。启动文件仅静态解析直接赋值，不执行脚本；复杂函数、条件块、多行表达式与 heredoc 不自动编辑。系统时区、网络客户端、Git include、托管策略、项目配置和 PowerShell 持久环境不自动改写。不清理钥匙串、Claude 会话、Skills 或 Hooks。

使用说明内提供连接、认证、权限、额度、账单、服务异常和证书七类错误的排查步骤，可直接打开相关检查项或原文。常见术语随应用离线可读。没有检测报告时，入口会引导先检测。

资料采用方式和适用边界见 [资料核对记录](docs/research.md)。

## 本地数据与访问

默认记录目录 `~/.claude-guard/`：

| 文件                  | 内容                                   |
| --------------------- | -------------------------------------- |
| `preferences.json`    | 检测偏好                               |
| `reports.json`        | 最近 30 次报告，配置密钥不进入报告     |
| `backups.json`        | 字段修复前原文、校验值和修复/恢复记录  |
| `snapshots.json`      | 完整配置原文、权限、缺失状态与检测偏好 |
| `manual-reviews.json` | 人工复核勾选、确认时间和备注           |
| `workflows.json`      | 最近配置流程状态、尝试次数和节点结果   |

备份/快照原文可能包含凭据，保存在本机；POSIX 目录 0700、记录文件 0600，Windows 继承用户目录 ACL。界面/预览不返回这些原文。原配置权限保留，新建配置为 0600（POSIX）。

本机 API 检查 Host、Origin 和临时操作凭证；路径固定、命令参数固定。服务间使用带心跳的目录租约与 PID 标记互斥。Electron 启用 sandbox、contextIsolation，关闭 Node integration，限制页面导航、外链与 IPC。

公网检测访问 `https://ipinfo.io/json`、`https://api.ipify.org?format=json` 和 `stun:stun.l.google.com:19302`，对应服务会看到连接 IP，不接收配置/密钥。浏览器/WebRTC 数据按当前界面一次采样，服务端连续重复本机检查与终端网络查询；未采样的数据明确标为未检测/待确认。报告导出默认进一步隐藏 IP 与主机名。

## 浏览器、隔离演示与 CLI

```sh
npm run build
npm start
```

浏览器访问 `http://127.0.0.1:4318`。Linux 的 `./scripts/start.sh` 也启动浏览器服务。服务只监听回环地址，Ctrl+C 退出。

```sh
npm run demo
npm run desktop:demo
npm run doctor -- --json
```

`demo` 创建专门的临时配置目录，浏览器端口 4319；`desktop:demo` 使用独立 Electron 资料目录。所有演示写入只作用于测试目录，仍读取真实系统信息和客户端版本。CLI 默认只检测，`--network` 开启终端公网查询，不修改配置。

| 运行变量      | 用途                                                 |
| ------------- | ---------------------------------------------------- |
| `CG_PORT`     | 浏览器服务端口，默认 4318；Electron 使用随机回环端口 |
| `CG_HOME`     | 用户配置根目录，默认当前用户主目录，用于隔离验证     |
| `CG_DATA_DIR` | 记录目录，默认配置根目录下 `.claude-guard`           |
| `CG_DEMO=1`   | 标记隔离模式，应同时指定独立配置根目录               |

## 工程与打包

代码入口、扩展检查与样式结构见 [项目结构](docs/architecture.md)，参与开发见 [CONTRIBUTING](CONTRIBUTING.md)。

Vue 3 Composition API、TypeScript、Vite、Electron 与 Node 原生 HTTP，Zod 校验输入，前后端共享类型。配置使用同目录临时文件、权限恢复与原子替换，预览校验变化，异常时回退已写入文件。

```sh
npm run check
npm run format:check
npm run pack
npm run dist
```

`pack` 生成应用目录；`dist` 按当前平台生成 macOS dmg/zip、Windows NSIS/portable 或 Linux AppImage/deb。GitHub Actions 配置三个系统的格式、类型、测试、构建与应用目录打包；远程 CI 是否通过以实际运行记录为准。

开发模式 `npm run dev`：前端端口 5173、后端 4318。依赖版本固定，使用项目 `.npm-cache`，字体本地打包。采用 frontend-design、Vue、find-skills 与项目内 Vitest skills，设计记录见 `docs/design.md`。
