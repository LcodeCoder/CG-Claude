# 参考来源逐项审计

核对日期：2026-10-11。文献库共 46 条，包含主原文和扩展依据。以下仅核对项目实际采用的段落，不表示上游全文都被执行、上游代码被运行或服务条件已经满足。

官方配置名称、取值和版本条件优先以当前官方说明为准；社区项目只采用注明的方法与限制。外部泄漏页面只核对用途，本轮未替用户进行公网泄漏检测。完整正文不进入源代码仓库，读取渠道和正文哈希见 [来源读取记录](source-audit-manifest.json)。

## IPinfo · Legacy Free API 与 Lite 的响应差异

官方文档 · IPinfo · [原文](https://support.ipinfo.io/hc/en-us/articles/34121895556242-Legacy-Free-API-vs-IPinfo-Lite) · ID：`ipinfo-legacy`。

采用段落：Key API Response Differences / Legacy response example。

项目应用：公网检测仅解析现有 /json 的顶层字段；按出口匹配时区只采用有效 timezone，缺失时保持待确认。

核对结论：已对照 /json 的顶层 country、city、org、timezone；缺少有效时区不按国家或 UTC 偏移猜测，Lite / Core 并未作为已支持接口。

判断边界：地理数据是服务商对出口的估计，不证明本人所在地或地区资格。未接入 Lite、付费 Core 的嵌套结构或 ASN 类型查询，也不按国家猜时区。

对应实现：[server/timezone-diagnostics.ts](../server/timezone-diagnostics.ts)。

关联：环境 `public-ip`；环境 `timezone`；环境 `route-consistency`；人工 `asn`；人工 `fixed-route`。

## Claude Code · 用户常见问题与登录后错误

官方文档 · Anthropic · Claude Help Center · [原文](https://support.claude.com/en/articles/14554922-claude-code-user-faq) · ID：`claude-user-faq`。

采用段落：登录后 organization disabled / 403 排查。

项目应用：认证错误帮助补充登录与 API 路径复核；先看 /status 和配置来源，再决定是否需要调整。

核对结论：按错误与认证来源提供复核，不由 400 / 403 判断个人账号被封。

判断边界：这里只采用安装与登录排查部分。错误提示需结合实际服务方式，云平台与网关可有不同语义；不自动删除凭据，也不从状态码判断封禁。

对应实现：[src/content/troubleshooting.ts](../src/content/troubleshooting.ts)。

关联：环境 `auth-sources`；环境 `claude-cli`；环境 `proxy-compatibility`；人工 `client`；人工 `auth-method`。

## Claude Code VDS Proxy · 路由验证方法

社区记录 · by-sonic · 社区项目 · [原文](https://github.com/by-sonic/claude-code-vds-proxy) · ID：`vds-route-verification`。

采用段落：Verification / Limitations。

项目应用：在连接排查中提示结合出错时间查看本人代理日志，解释出口一致性检查的局限。

核对结论：只采用出口与连接日志复核思路；未执行部署、hosts 修改或伪密钥请求。

判断边界：只采用排查方法，不运行项目脚本、不部署服务器或改写 hosts。浏览器、MCP 与云平台端点需各自核对，路由证据不能证明账号状态。

对应实现：[src/content/troubleshooting.ts](../src/content/troubleshooting.ts)。

关联：环境 `runtime-proxy`；环境 `proxy-compatibility`；环境 `route-consistency`；人工 `fixed-route`。

## Claude Code · Microsoft Foundry 配置与认证

官方文档 · Anthropic · [原文](https://code.claude.com/docs/en/microsoft-foundry) · ID：`claude-foundry`。

采用段落：Authentication / Configure Claude Code。

项目应用：新增服务偏好，识别并隐藏认证字段，提示误把 URL 或主机名写入资源名称的声明。

核对结论：已核对 Bearer Token 的版本门槛和资源名称；不推算 Entra 默认凭据是否可用。

判断边界：Token 优先于 API Key；未设置密钥不代表无法认证。不读取 Azure 凭据，不登录或发起付费请求，实际提供商用 /status 核对。

对应实现：[server/configuration-diagnostics.ts](../server/configuration-diagnostics.ts)。

关联：环境 `auth-sources`；环境 `runtime-endpoint`；环境 `claude-endpoint`；人工 `auth-method`；人工 `client`。

## Claude Code · Claude Platform on AWS

官方文档 · Anthropic · [原文](https://code.claude.com/docs/en/claude-platform-on-aws) · ID：`claude-platform-aws`。

采用段落：Authentication / Workspace configuration。

项目应用：提供独立服务偏好与配置来源复核，隐藏工作区和认证值，非官方默认 API 模式保留现有地址。

核对结论：与 Bedrock 分开识别，隐藏工作区与密钥；实际 AWS 认证仍为人工。

判断边界：本工具不验证 AWS 登录、区域或工作区权限，也不读取 AWS 凭据文件；实际提供商和地址用 /status 核对。

对应实现：[shared/authentication.ts](../shared/authentication.ts)。

关联：环境 `auth-sources`；环境 `runtime-endpoint`；环境 `claude-endpoint`；人工 `auth-method`；人工 `client`。

## Claude Code · 安装方式、PATH 与版本验证

官方文档 · Anthropic · [原文](https://code.claude.com/docs/en/setup) · ID：`claude-setup`。

采用段落：Verify installation / Native installer。

项目应用：版本探测失败时，只核对用户原生安装候选文件元数据，并提供终端与桌面环境的复核步骤。

核对结论：版本探测与候选路径检查采用安装说明；路径存在不当作签名、登录或完整性证明。

判断边界：文件存在不代表可运行或已登录；不执行候选文件、不读取其内容。以实际终端的 claude --version 与 claude doctor 为准。

对应实现：[server/cli-diagnostics.ts](../server/cli-diagnostics.ts)。

关联：环境 `claude-cli`。

## Node.js · Windows 批处理程序的启动方式

官方文档 · Node.js · [原文](https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows) · ID：`node-windows-commands`。

采用段落：Spawning .bat and .cmd files on Windows。

项目应用：npm 代理和 Claude 版本探测在原生启动失败时尝试固定 .cmd 指令；用户参数不拼入 shell。

核对结论：仅对固定只读探测使用 .cmd 回退；任意参数保留 execFile，非零退出不重跑。

判断边界：仅处理三个固定只读指令的启动失败；已执行后失败或超时不重跑，不能据此确认账号状态。

对应实现：[server/commands.ts](../server/commands.ts)。

关联：环境 `claude-cli`；环境 `npm-effective-proxy`。

## Microsoft · 命令搜索中的当前目录

官方文档 · Microsoft · [原文](https://learn.microsoft.com/en-us/windows/win32/api/processenv/nf-processenv-needcurrentdirectoryforexepathw) · ID：`windows-command-search`。

采用段落：NeedCurrentDirectoryForExePathW / Remarks。

项目应用：Windows 只读探测子进程设置该选项，避免批处理回退隐式优先寻找当前项目的同名脚本。

核对结论：仅控制探测子进程的隐式当前目录搜索；不承诺覆盖显式 PATH 条目。

判断边界：这是本工具的进程启动策略；显式写入 PATH 的当前目录仍可能被搜索，不修改用户 PATH。

对应实现：[server/commands.ts](../server/commands.ts)。

关联：环境 `claude-cli`；环境 `npm-effective-proxy`。

## Claude Code · 命令沙箱与隔离边界

官方文档 · Anthropic · [原文](https://code.claude.com/docs/en/sandboxing) · ID：`claude-sandbox`。

采用段落：Fallback / Configuration / Isolation boundaries。

项目应用：项目扫描核对显式开关、回退声明和命令例外数量，只展示字段含义，不执行命令。

核对结论：只比较已声明字段和回退选项，实际沙箱、依赖和组织覆盖不由静态扫描证明。

判断边界：仅静态核对项目声明。用户、组织、命令行、版本、平台与依赖决定实际生效；未声明不等于关闭，也不据此推算账号状态。

对应实现：[server/sandbox-diagnostics.ts](../server/sandbox-diagnostics.ts)。

关联：项目 `.claude/settings.json-sandbox`；项目 `.claude/settings.local.json-sandbox`。

## Anthropic · 2026 使用政策更新（11 月 12 日生效）

官方文档 · Anthropic · [原文](https://www.anthropic.com/news/2026-usage-policy-update) · ID：`anthropic-policy-2026`。

采用段落：公告日期与生效日。

项目应用：在账号复核的参考资料中准确区分公布日与生效日，提示查看适用政策原文。

核对结论：核对为 2026-10-08 公布、2026-11-12 生效；截至核对日不当作已生效的新条款。

判断边界：截至本次 2026 年 10 月 11 日核对，公告中的新版本尚未生效。本机配置不能判定政策合规或账号处理原因。

对应实现：[shared/references.ts](../shared/references.ts)。

关联：人工 `account-notice`；人工 `regions`。

## Claude Code · Remote Control 的条件与排查

官方文档 · Anthropic · [原文](https://code.claude.com/docs/en/remote-control) · ID：`claude-remote-control`。

采用段落：Requirements / Remote Control disabled。

项目应用：帮助用户核对版本、认证、网关、隐私开关与组织策略，不自动改变这些选择。

核对结论：采用 2.1.283、付费订阅与 Trusted Devices 条件，修正原文对遥测开关的版本泛化。

判断边界：2.1.283 起仅 DISABLE_TELEMETRY / DO_NOT_TRACK 通常允许付费订阅使用；最少流量、DISABLE_GROWTHBOOK、可信设备要求等可能阻止。以实际会话为准。

对应实现：[shared/privacy.ts](../shared/privacy.ts)。

关联：环境 `claude-cli`；环境 `claude-privacy`；环境 `claude-endpoint`；环境 `runtime-endpoint`；环境 `auth-sources`；人工 `auth-method`。

## Claude · 身份与企业验证说明

官方文档 · Anthropic · [原文](https://support.claude.com/en/articles/14328960-identity-verification-on-claude) · ID：`claude-identity`。

采用段落：身份与企业验证流程。

项目应用：在账号提示排查中提供官方依据；资料仅由用户在官方流程中提交。

核对结论：只提供官方流程依据；不收集身份资料或判断验证结果。

判断边界：本机工具无法确认是否需要验证、结果或账号处理原因；不收集证件、照片或企业身份资料。

对应实现：[src/content/troubleshooting.ts](../src/content/troubleshooting.ts)。

关联：人工 `account-notice`。

## Claude · 管理活跃登录会话

官方文档 · Anthropic · [原文](https://support.claude.com/en/articles/13124001-managing-your-active-sessions) · ID：`claude-sessions`。

采用段落：What you will see / View active sessions。

项目应用：把登录设备和浏览器资料检查关联到官方说明，保持人工复核。

核对结论：由本人核对设备与基于 IP 的近似位置；工具不读取或终止会话。

判断边界：近似位置来自 IP；本工具不读取、终止或修改任何账号会话。

对应实现：[shared/types.ts](../shared/types.ts)。

关联：人工 `sessions`；人工 `browser-profile`。

## Claude · 模型改进隐私选择

官方文档 · Anthropic · [原文](https://privacy.claude.com/en/articles/12109829-how-do-i-change-my-model-improvement-privacy-settings) · ID：`claude-model-improvement`。

采用段落：消费计划与 Claude Code / Safety classifiers。

项目应用：说明网页账号选择与本机可选遥测不同，提供账号页面人工确认入口。

核对结论：账号训练选择独立于本地遥测；关闭设置不等于停止安全与政策处理。

判断边界：此设置不等于关闭全部服务数据处理。官方说明保留安全与政策处理情形，本工具不读取或修改账号选择。

对应实现：[shared/types.ts](../shared/types.ts)。

关联：环境 `claude-privacy`；人工 `cloud-privacy`。

## Anthropic · 平台检测、处理与申诉的公开说明

官方文档 · Anthropic · [原文](https://www.anthropic.com/transparency/system-trust-reporting) · ID：`anthropic-system-trust`。

采用段落：Account bans / Appeals / Appeal overturns。

项目应用：说明环境检查的判断范围，账号警告或停用由官方渠道复核。

核对结论：公开统计不转换为账号风控权重、封禁概率或本机配置因果关系。

判断边界：不能据此推算账号安全分数或保证任何配置不会触发账号处理。

对应实现：[shared/references.ts](../shared/references.ts)。

关联：环境 `public-ip`；环境 `auth-sources`；人工 `account-notice`。

## Claude Code · 权限模式与规则

官方文档 · Anthropic · [原文](https://code.claude.com/docs/en/permissions) · ID：`claude-permissions`。

采用段落：Rule evaluation / Permission modes。

项目应用：检查项目权限结构、默认模式和覆盖整个命令工具的 allow 声明，提供 /permissions 复核路径。

核对结论：项目声明、宽泛 allow 和绕过模式仅静态提示；不是实际批准结果。

判断边界：本地声明不能证明实际批准结果，工作区信任、客户端版本和组织策略还会影响生效。

对应实现：[server/projects.ts](../server/projects.ts)。

关联：项目 `.claude/settings.json-permissions`；项目 `.claude/settings.local.json-permissions`。

## Claude Code · Hooks 事件与配置

官方文档 · Anthropic · [原文](https://code.claude.com/docs/en/hooks) · ID：`claude-hooks`。

采用段落：Hook types / Configuration。

项目应用：标出项目 Hooks 来源和事件类别数量，提醒在实际客户端复核。

核对结论：只检查对象结构与事件类别，保留人工复核；不执行命令或 HTTP Hooks。

判断边界：扫描只看对象结构，既不执行 Hook，也不展示可能包含凭据的完整命令。

对应实现：[server/projects.ts](../server/projects.ts)。

关联：项目 `.claude/settings.json-hooks`；项目 `.claude/settings.local.json-hooks`。

## Claude Code · MCP 配置、作用域与信任

官方文档 · Anthropic · [原文](https://code.claude.com/docs/en/mcp) · ID：`claude-mcp`。

采用段落：Project scope / Variable expansion / Authentication。

项目应用：区分字面凭据、变量引用和动态表达式；检查结构和项目自动启用声明，不启动服务。

核对结论：区分变量引用、非空默认值与字面凭据；不展开变量或执行 headersHelper，非完整 MCP schema 验证。

判断边界：不展开变量；引用不代表变量已设置或认证可用。MCP 启用声明受版本与工作区信任影响。

对应实现：[server/mcp-diagnostics.ts](../server/mcp-diagnostics.ts)。

关联：项目 `project-mcp`；项目 `project-secrets`；项目 `.claude/settings.json-mcp-approval`；项目 `.claude/settings.local.json-mcp-approval`。

## Bun · 锁文件格式与版本记录

项目文档 · Bun · [原文](https://bun.sh/docs/pm/lockfile) · ID：`bun-lockfile`。

采用段落：bun.lock / Before Bun v1.2。

项目应用：将两种 Bun 锁文件计入项目依赖检查；只检查文件元数据。

核对结论：识别 bun.lock 与 bun.lockb 的元数据；文件存在不证明内容有效或无依赖漏洞。

判断边界：不读取二进制内容，不转换格式，不运行安装；存在锁文件不代表依赖没有漏洞。

对应实现：[server/projects.ts](../server/projects.ts)。

关联：项目 `project-dependencies`。

## Claude Code · 组织管理配置与生效验证

官方文档 · Anthropic · [原文](https://code.claude.com/docs/en/managed-settings) · ID：`claude-managed-settings`。

采用段落：Settings precedence / Verify policy sources。

项目应用：在检测证据与人工复核中说明组织覆盖的可能性，提醒在实际客户端确认策略来源。

核对结论：明确组织配置可覆盖用户层；没有读取或推算远程策略，/status 和 doctor 由本人复核。

判断边界：本工具不推算远程策略，不自动编辑管理员配置。

对应实现：[server/configuration-scope.ts](../server/configuration-scope.ts)。

关联：环境 `claude-settings`；环境 `claude-privacy`；环境 `auth-sources`。

## Claude 帮助中心 · API Key 与订阅选择

官方文档 · Anthropic · [原文](https://support.claude.com/en/articles/12304248-manage-api-key-environment-variables-in-claude-code) · ID：`claude-key-choice`。

采用段落：Authentication / Conflict warnings。

项目应用：认证来源只展示变量名，提示用户在客户端核对实际登录与计费方式。

核对结论：列出 API Key 来源并引导 /status；交互批准条件结合当前 env-vars 说明。

判断边界：变量存在不证明当前正在使用它；交互模式还受 API Key 授权确认影响，非交互 -p 模式按实际客户端规则选择。本工具不验证密钥、额度或付费请求。

对应实现：[server/configuration-diagnostics.ts](../server/configuration-diagnostics.ts)。

关联：环境 `auth-sources`；人工 `client`；人工 `auth-method`；人工 `usage`。

## Claude 帮助中心 · 常见错误分流

官方文档 · Anthropic · [原文](https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages) · ID：`claude-error-help`。

采用段落：Usage limits / Login / Service errors。

项目应用：人工复核增加服务状态入口，提供无需凭据的排查说明。

核对结论：错误分流不输出账号安全分数或单次错误的封禁结论。

判断边界：本工具不会把连接错误、限额或超时判定为封禁。

对应实现：[src/content/troubleshooting.ts](../src/content/troubleshooting.ts)。

关联：仅来源说明。

## Claude Environment Check · 可观测环境诊断

社区记录 · TZZ520 / GitHub · [原文](https://github.com/TZZ520/claude-environment-check) · ID：`environment-check-project`。

采用段落：本地端与网页版检测范围。

项目应用：参考本机/浏览器分层展示与检测范围说明；优先保留可观测证据。

核对结论：只采用采样范围和分层展示，不采用社区账号风险评分与未证实权重。

判断边界：社区环境评分不能证明平台内部风控规则，本工具不采用账号安全分数。

对应实现：[server/diagnostics.ts](../server/diagnostics.ts)。

关联：环境 `route-consistency`；环境 `dns`；环境 `webrtc`。

## Claude Code · 企业网络配置

官方文档 · Anthropic · [原文](https://code.claude.com/docs/en/network-config) · ID：`claude-network`。

采用段落：Proxy configuration / CA store / mTLS。

项目应用：核对代理协议、变量优先顺序与证书配置；修改后提醒重新启动相关会话。

核对结论：核对小写代理优先顺序、HTTP(S)、NO_PROXY 与证书路径；没有推断最终请求路由。

判断边界：本机配置只能说明设置情况，实际连通性和最终路由仍需复核。

对应实现：[server/configuration-diagnostics.ts](../server/configuration-diagnostics.ts)。

关联：环境 `system-proxy`；环境 `runtime-proxy`；环境 `proxy-compatibility`；环境 `ca-configuration`；项目 `project-proxy`；项目 `project-tls`。

## Claude Code · 配置文件与优先级

官方文档 · Anthropic · [原文](https://code.claude.com/docs/en/settings) · ID：`claude-settings`。

采用段落：Configuration files / Settings precedence。

项目应用：检查 JSON 格式、配置目录覆盖和项目 env 覆盖；修复只修改选中的字段。

核对结论：全局修复与项目扫描分开；只做 JSON/env 结构核验，非全部官方 schema 或完整生效合并。

判断边界：项目扫描读取固定范围；组织策略、命令行选项和运行中的会话可能另有覆盖。

对应实现：[server/configs.ts](../server/configs.ts)。

关联：环境 `claude-settings`；环境 `claude-endpoint`；环境 `config-directory`；环境 `shell-endpoint`；环境 `runtime-endpoint`；项目 `.claude/settings.json`；项目 `.claude/settings.local.json`；项目 `project-endpoint`；项目 `project-proxy`；人工 `backup`。

## Claude Code · 环境变量参考

官方文档 · Anthropic · [原文](https://code.claude.com/docs/en/env-vars) · ID：`claude-env`。

采用段落：Set variables / Boolean and presence switches。

项目应用：核对代理、认证、CLAUDE_CONFIG_DIR、隐私与宿主管理路由开关的含义。

核对结论：DISABLE_* 的非空规则和普通布尔开关分开处理；自定义目录、宿主和未知值保留复核。

判断边界：变量的意义随客户端版本变化；未知值保留并提示复核。

对应实现：[shared/environment-values.ts](../shared/environment-values.ts)。

关联：环境 `config-directory`；环境 `claude-privacy`；环境 `auth-sources`；环境 `runtime-endpoint`；环境 `proxy-compatibility`；项目 `project-privacy`；项目 `project-endpoint`。

## Claude Code · 认证与凭据优先级

官方文档 · Anthropic · [原文](https://code.claude.com/docs/en/iam) · ID：`claude-auth`。

采用段落：Authentication precedence / Profiles。

项目应用：只列出认证配置的来源和变量名，提示多来源配置复核；不读取登录凭据文件。

核对结论：只枚举来源和多来源线索，不读取登录秘密或执行 apiKeyHelper，不冒充实际认证选择。

判断边界：存在变量不等于实际生效；交互授权、组织策略和网关会改变选择，应在 /status 确认。

对应实现：[server/configuration-diagnostics.ts](../server/configuration-diagnostics.ts)。

关联：环境 `auth-sources`；环境 `claude-endpoint`；环境 `runtime-endpoint`；人工 `client`；人工 `auth-method`。

## Claude Code · 数据使用与遥测

官方文档 · Anthropic · [原文](https://code.claude.com/docs/en/data-usage) · ID：`claude-privacy`。

采用段落：Operational telemetry / Feedback。

项目应用：提供可预览的隐私开关，按 Remote Control 专项文档解释版本与订阅差异。

核对结论：均衡与最少流量分别检测和预览；实际项目、组织与宿主覆盖另行确认。

判断边界：隐私开关不代表账号状态，也不会代替网页端的数据隐私选择。

对应实现：[server/privacy-diagnostics.ts](../server/privacy-diagnostics.ts)。

关联：环境 `claude-privacy`；项目 `project-privacy`。

## Claude · 可访问的国家与地区

官方文档 · Claude Help Center · [原文](https://support.claude.com/en/articles/8461763-where-can-i-access-claude) · ID：`claude-access`。

采用段落：国家与地区名单。

项目应用：人工复核直接打开当前官方名单，结合实际所在地判断。

核对结论：为本人实际所在地提供名单入口，不把出口或时区当作地理资格证明。

判断边界：IP 定位和系统时区不能证明实际所在地；服务名单可能变化。

对应实现：[shared/types.ts](../shared/types.ts)。

关联：环境 `public-ip`；环境 `timezone`；人工 `regions`。

## Claude API · 支持地区

官方文档 · Claude Platform Docs · [原文](https://platform.claude.com/docs/en/api/supported-regions) · ID：`api-regions`。

采用段落：Supported regions。

项目应用：将 API 地区说明与 Claude 网页产品的访问说明分别提供。

核对结论：API 名单与消费产品、云平台条件分别呈现，不硬编码当前支持名单。

判断边界：API、订阅和云平台的条件应按各自服务核对，不能相互替代。

对应实现：[shared/types.ts](../shared/types.ts)。

关联：环境 `public-ip`；人工 `regions`。

## Claude · 警告、限制与申诉

官方文档 · Claude Help Center · [原文](https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals) · ID：`claude-appeals`。

采用段落：Appeals / Export / Organization on hold。

项目应用：账号或组织提示帮助区分个人与组织处理，并提供本人登录后使用的官方复核路径。

核对结论：申诉、导出和组织复核均由本人登录执行；工具不提交资料或删除账号。

判断边界：本工具的环境检测无法判断平台内部的限制原因。

对应实现：[src/content/troubleshooting.ts](../src/content/troubleshooting.ts)。

关联：人工 `account-notice`；人工 `account-export`；人工 `account-ownership`。

## Claude Code · 安装与认证故障排查

官方文档 · Claude Help Center · [原文](https://support.claude.com/en/articles/14552646-troubleshoot-claude-code-installation-and-authentication) · ID：`claude-troubleshooting`。

采用段落：PATH / Certificates / Authentication。

项目应用：为未找到客户端、证书配置和认证冲突提供具体的下一步。

核对结论：提供官方终端复核步骤，不自动登录、安装或发送付费请求。

判断边界：检查安装不需要发送提示词；CG Claude 不自动执行登录或付费 API 请求。

对应实现：[src/content/troubleshooting.ts](../src/content/troubleshooting.ts)。

关联：环境 `claude-cli`；环境 `ca-configuration`；环境 `auth-sources`。

## Claude API · 错误代码

官方文档 · Claude Platform Docs · [原文](https://platform.claude.com/docs/en/api/errors) · ID：`api-errors`。

采用段落：HTTP status / Error types。

项目应用：帮助用户按错误类型排查，避免把单次连接失败当成账户结论。

核对结论：401、403、429 与服务错误需结合完整类型和服务模式；不以状态码推断封禁。

判断边界：应结合完整错误类型与官方账号页面；本工具不上传错误中的密钥或日志。

对应实现：[src/content/troubleshooting.ts](../src/content/troubleshooting.ts)。

关联：环境 `auth-sources`；环境 `claude-cli`；人工 `usage`；人工 `billing`；人工 `account-notice`。

## Node.js · TLS 环境变量

项目文档 · Node.js · [原文](https://nodejs.org/api/cli.html#node_tls_reject_unauthorizedvalue) · ID：`node-tls`。

采用段落：NODE_TLS_REJECT_UNAUTHORIZED。

项目应用：检测环境和配置中的 TLS 校验关闭项，并提供选择性恢复。

核对结论：值为 0 按关闭验证处理；对 npm 可预览恢复，Node 和 Git 的来源提示手动处理。

判断边界：企业自定义 CA 应按证书配置处理，关闭校验不是证书问题的修复方式。

对应实现：[server/diagnostics.ts](../server/diagnostics.ts)。

关联：环境 `tls-verification`；环境 `ca-configuration`；项目 `project-tls`。

## npm · 用户配置参考

项目文档 · npm · [原文](https://docs.npmjs.com/cli/v11/using-npm/config/) · ID：`npm-config`。

采用段落：proxy / https-proxy / strict-ssl / Sources。

项目应用：区分文件中的代理与本工具环境下的命令查询结果；保留 registry 和认证设置。

核对结论：补齐两项查询完整性与来源标签；用户文件修复不清空进程或项目配置。

判断边界：npm 的网络配置不等于 Claude Code 或浏览器的实际出口。

对应实现：[server/diagnostics.ts](../server/diagnostics.ts)。

关联：环境 `npm-proxy`；环境 `npm-effective-proxy`；环境 `tls-verification`；项目 `project-tool-proxy`。

## Git · 配置来源与网络设置

项目文档 · Git · [原文](https://git-scm.com/docs/git-config) · ID：`git-config`。

采用段落：http.proxy / http.sslVerify / Boolean / Includes。

项目应用：检查 Git 的用户代理、全局查询结果、http.sslVerify 与 GIT_SSL_NO_VERIFY；项目层另行扫描。Git TLS 项仅检测并引导手动复核。

核对结论：本轮补齐 Git TLS 的用户与项目声明；全局查询不再描述为所有请求的最终生效值。

判断边界：工具不会执行项目脚本，也不会替用户创建或上传项目提交。

对应实现：[server/git-tls.ts](../server/git-tls.ts)。

关联：环境 `git-proxy`；环境 `git-effective-proxy`；环境 `tls-verification`；项目 `project-tool-proxy`；项目 `project-tls`；项目 `project-git`。

## Mihomo · TUN 与 DNS 接管

项目文档 · MetaCubeX · [原文](https://wiki.metacubex.one/config/inbound/tun/) · ID：`mihomo-tun`。

采用段落：auto-route / strict-route / dns-hijack。

项目应用：解释 TUN 网卡检测的范围，引导核对代理客户端的路由与 DNS。

核对结论：网卡存在不能证明路由和 DNS 覆盖；平台及客户端配置保持人工复核。

判断边界：存在 TUN 网卡不能证明所有流量已接管，平台与代理版本影响行为。

对应实现：[server/diagnostics.ts](../server/diagnostics.ts)。

关联：环境 `tun`；环境 `dns`；环境 `ipv6`；环境 `route-consistency`；人工 `dns`；人工 `fixed-route`。

## BrowserLeaks · DNS 出口检测

外部检测 · BrowserLeaks · [原文](https://browserleaks.com/dns) · ID：`browserleaks-dns`。

采用段落：DNS leak test 页面说明。

项目应用：为无法仅从本机 DNS 设置确认的项目提供外部复核入口。

核对结论：这里只核对外部测试用途，未在来源审计中执行用户浏览器的泄漏测试或采信个人测试结果。

判断边界：属于第三方服务，会看到测试连接的出口；不会自动打开或后台查询。

对应实现：[shared/types.ts](../shared/types.ts)。

关联：环境 `dns`；人工 `dns`；人工 `fixed-route`。

## BrowserLeaks · WebRTC 出口检测

外部检测 · BrowserLeaks · [原文](https://browserleaks.com/webrtc) · ID：`browserleaks-webrtc`。

采用段落：WebRTC leak test 页面说明。

项目应用：和本次按需采样的 WebRTC 结果对照。

核对结论：本轮修复未完成采样及终端出口替代浏览器基准的误判；仍只证明本次可见候选。

判断边界：只说明当前浏览器的采样；不能推断其他客户端或账号状态。

对应实现：[server/diagnostics.ts](../server/diagnostics.ts)。

关联：环境 `webrtc`；环境 `public-ip`；人工 `webrtc`。

## AYi · 2026 年 10 月 Claude 使用环境指南

社区记录 · AYi_AInotes · [原文](https://x.com/AYi_AInotes/status/2106639522586829094) · ID：`ayi-guide`。

采用段落：全文 0–10 与参考来源。

项目应用：默认以 Asia/Taipei 对照系统、Node 进程和浏览器；也可明确选择按当前出口或手动目标。自动时区、定位和手机端列为待确认。

核对结论：完整正文逐项映射；原文默认 B 路线与用户选定模式分开，人工和不执行项不自动通过。

判断边界：社区归因、养号节奏和风控权重缺乏公开可复验依据，不转换为自动结论。

对应实现：[shared/article-audit.ts](../shared/article-audit.ts)。

关联：环境 `timezone`；环境 `browser-timezone`；环境 `timezone-env`；环境 `timezone-followup`；环境 `system-proxy`；环境 `tun`；环境 `dns`；环境 `shell-proxy`；环境 `claude-endpoint`；人工 `dns`；人工 `webrtc`；人工 `regions`；人工 `client`；人工 `backup`；人工 `timezone-auto`；人工 `fixed-route`；人工 `asn`；人工 `browser-profile`；人工 `cloud-privacy`；人工 `usage`；人工 `billing`；人工 `contact`；人工 `account-ownership`；人工 `account-export`；人工 `sessions`；人工 `account-notice`。

## Claude Code #39862 · NO_PROXY 历史回归

社区记录 · anthropics/claude-code · issue 与维护者回复 · [原文](https://github.com/anthropics/claude-code/issues/39862) · ID：`proxy-regression`。

采用段落：Issue #39862 / Maintainer comment。

项目应用：排障时要求结合客户端版本核对，避免照搬旧版问题。

核对结论：已读取 issue 与维护者评论，回复称 2.1.117 修复；不按当前普遍故障套用。

判断边界：历史 issue 不是当前所有版本的通用故障，也不能解释账号限制。

对应实现：[src/content/troubleshooting.ts](../src/content/troubleshooting.ts)。

关联：环境 `proxy-compatibility`；环境 `claude-cli`。

## Claude Doctor · 可复核的本地诊断设计

社区记录 · diguike/claudedoctor · [原文](https://github.com/diguike/claudedoctor) · ID：`claudedoctor`。

采用段落：What it checks / Check-fix-verify / Privacy。

项目应用：参考“检测—预览—修复—复验”流程与证据分级，独立实现本项目逻辑。

核对结论：采用分层证据、预览备份和复验思路，独立实现；未采用账号权重或执行上游代码。

判断边界：属于工程设计参考，其检测结果与社区假设不是 Anthropic 官方政策。

对应实现：[server/repairs.ts](../server/repairs.ts)。

关联：仅来源说明。

## Electron · 桌面应用安全

项目文档 · Electron · [原文](https://www.electronjs.org/docs/latest/tutorial/security) · ID：`electron-security`。

采用段落：Isolation / Sandbox / Navigation / IPC validation。

项目应用：渲染页面通过限定接口访问本机服务；外部链接交由默认浏览器。

核对结论：对照渲染隔离、权限限制、外链白名单和 IPC 来源校验；工程措施不等于不存在其他缺陷。

判断边界：工程措施需要持续维护依赖与验证，不能保证所有缺陷都不存在。

对应实现：[electron/main.ts](../electron/main.ts)。

关联：仅来源说明。

## Claude · 官方服务状态

官方文档 · Anthropic · [原文](https://status.claude.com/) · ID：`claude-status`。

采用段落：按产品的状态与事件时间。

项目应用：在连接失败或服务繁忙时提供人工复核入口。

核对结论：提供用户按需打开的状态入口，未把获取时的状态固定为应用当前结论。

判断边界：以打开原文时的状态为准；历史事件不能解释当前单个账号的状态。

对应实现：[src/content/troubleshooting.ts](../src/content/troubleshooting.ts)。

关联：环境 `public-ip`；环境 `route-consistency`；环境 `claude-cli`；人工 `service-status`。

## Claude Code · 官方版本变更记录

官方文档 · anthropics/claude-code · [原文](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) · ID：`claude-changelog`。

采用段落：2.1.117 / 2.1.283 与相关版本条目。

项目应用：对照本机读取到的版本与相关 issue，提示核对修复是否适用。

核对结论：用于版本条件核对，未自动升级客户端或把历史 bug 当作当前故障。

判断边界：不会因为存在新版本就自动升级，也不把历史回归当作当前故障。

对应实现：[shared/references.ts](../shared/references.ts)。

关联：环境 `claude-cli`；环境 `proxy-compatibility`；环境 `ca-configuration`。

## Clash Verge Rev · 系统代理、TUN 与路由模式

项目文档 · Clash Verge Rev Docs · [原文](https://www.clashverge.dev/guide/term.html) · ID：`clash-verge-modes`。

采用段落：系统代理 / TUN / 规则、全局、直连。

项目应用：说明虚拟接口、系统代理与实际出口检查分别能确认什么。

核对结论：补充服务模式、全局路由和关闭自动切换的人工核对；不直接修改代理客户端。

判断边界：权限、路由排除和 DNS 配置会影响接管范围；工具不会修改代理客户端或安装服务。

对应实现：[shared/types.ts](../shared/types.ts)。

关联：环境 `system-proxy`；环境 `tun`；环境 `dns`；环境 `route-consistency`。

本文由 `npm run docs:audit` 从 `shared/references.ts` 和 `shared/reference-audit.ts` 生成。新增扩展时补齐原文、采用段落、代码位置和适用边界；审计测试检查关联是否存在。
