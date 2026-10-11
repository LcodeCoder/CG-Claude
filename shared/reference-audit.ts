/** Only the adopted paragraphs were compared; this is not certification of a whole upstream document. */
export const referenceAuditDate = '2026-10-11'
export interface ReferenceAudit {
  section: string
  code: string
  finding: string
}
export const referenceAudits: Record<string, ReferenceAudit> = {
  'apple-system-timezone': {
    section: '-settimezone / -setusingnetworktime',
    code: 'server/timezone-settings.ts',
    finding: '已区分时区与网络校时；没有通过关闭 NTP 代替自动时区设置。',
  },
  'apple-admin-authorization': {
    section: 'Administrator privileges / Quoting',
    code: 'server/timezone-settings.ts',
    finding: '使用系统授权窗口；没有构建 root 密码表单或把密码写入参数、日志、快照。',
  },
  'node-timezone': {
    section: 'Environment variables / TZ',
    code: 'server/context.ts',
    finding: 'ctx.env 与生产 process.env 同步；隔离模式只修改模拟状态。',
  },
  'systemd-timezone': {
    section: 'timedatectl set-timezone / org.freedesktop.timedate1 SetTimezone',
    code: 'server/timezone-settings.ts',
    finding: '核对官方 man 源码：仅设置时区，没有关闭网络校时；Linux 图形授权尚未实机验证。',
  },
  'windows-system-timezone': {
    section: 'Id / Get-TimeZone -ListAvailable',
    code: 'server/system-timezone.ts',
    finding: '按区域身份映射台北与上海，不能因为同为 UTC+8 而互相替代。',
  },
  'windows-admin-authorization': {
    section: 'Example 5 / Wait / PassThru',
    code: 'server/timezone-settings.ts',
    finding: '仅提升固定的 Set-TimeZone 操作；带失败退出码并独立复核，未提升整个应用。',
  },
  'windows-user-environment': {
    section: 'Long description / Saving environment variables',
    code: 'server/timezone-settings.ts',
    finding: '读取、保存、复核与还原用户 TZ；任意旧字符串通过编码作为数据传输。',
  },
  'ipinfo-legacy': {
    section: 'Key API Response Differences / Legacy response example',
    code: 'server/timezone-diagnostics.ts',
    finding:
      '已对照 /json 的顶层 country、city、org、timezone；缺少有效时区不按国家或 UTC 偏移猜测，Lite / Core 并未作为已支持接口。',
  },
  'claude-user-faq': {
    section: '登录后 organization disabled / 403 排查',
    code: 'src/content/troubleshooting.ts',
    finding: '按错误与认证来源提供复核，不由 400 / 403 判断个人账号被封。',
  },
  'vds-route-verification': {
    section: 'Verification / Limitations',
    code: 'src/content/troubleshooting.ts',
    finding: '只采用出口与连接日志复核思路；未执行部署、hosts 修改或伪密钥请求。',
  },
  'claude-foundry': {
    section: 'Authentication / Configure Claude Code',
    code: 'server/configuration-diagnostics.ts',
    finding: '已核对 Bearer Token 的版本门槛和资源名称；不推算 Entra 默认凭据是否可用。',
  },
  'claude-platform-aws': {
    section: 'Authentication / Workspace configuration',
    code: 'shared/authentication.ts',
    finding: '与 Bedrock 分开识别，隐藏工作区与密钥；实际 AWS 认证仍为人工。',
  },
  'claude-setup': {
    section: 'Verify installation / Native installer',
    code: 'server/cli-diagnostics.ts',
    finding: '版本探测与候选路径检查采用安装说明；路径存在不当作签名、登录或完整性证明。',
  },
  'node-windows-commands': {
    section: 'Spawning .bat and .cmd files on Windows',
    code: 'server/commands.ts',
    finding: '仅对固定只读探测使用 .cmd 回退；任意参数保留 execFile，非零退出不重跑。',
  },
  'windows-command-search': {
    section: 'NeedCurrentDirectoryForExePathW / Remarks',
    code: 'server/commands.ts',
    finding: '仅控制探测子进程的隐式当前目录搜索；不承诺覆盖显式 PATH 条目。',
  },
  'claude-sandbox': {
    section: 'Fallback / Configuration / Isolation boundaries',
    code: 'server/sandbox-diagnostics.ts',
    finding: '只比较已声明字段和回退选项，实际沙箱、依赖和组织覆盖不由静态扫描证明。',
  },
  'anthropic-policy-2026': {
    section: '公告日期与生效日',
    code: 'shared/references.ts',
    finding: '核对为 2026-10-08 公布、2026-11-12 生效；截至核对日不当作已生效的新条款。',
  },
  'claude-remote-control': {
    section: 'Requirements / Remote Control disabled',
    code: 'shared/privacy.ts',
    finding: '采用 2.1.283、付费订阅与 Trusted Devices 条件，修正原文对遥测开关的版本泛化。',
  },
  'claude-identity': {
    section: '身份与企业验证流程',
    code: 'src/content/troubleshooting.ts',
    finding: '只提供官方流程依据；不收集身份资料或判断验证结果。',
  },
  'claude-sessions': {
    section: 'What you will see / View active sessions',
    code: 'shared/types.ts',
    finding: '由本人核对设备与基于 IP 的近似位置；工具不读取或终止会话。',
  },
  'claude-model-improvement': {
    section: '消费计划与 Claude Code / Safety classifiers',
    code: 'shared/types.ts',
    finding: '账号训练选择独立于本地遥测；关闭设置不等于停止安全与政策处理。',
  },
  'anthropic-system-trust': {
    section: 'Account bans / Appeals / Appeal overturns',
    code: 'shared/references.ts',
    finding: '公开统计不转换为账号风控权重、封禁概率或本机配置因果关系。',
  },
  'claude-permissions': {
    section: 'Rule evaluation / Permission modes',
    code: 'server/projects.ts',
    finding: '项目声明、宽泛 allow 和绕过模式仅静态提示；不是实际批准结果。',
  },
  'claude-hooks': {
    section: 'Hook types / Configuration',
    code: 'server/projects.ts',
    finding: '只检查对象结构与事件类别，保留人工复核；不执行命令或 HTTP Hooks。',
  },
  'claude-mcp': {
    section: 'Project scope / Variable expansion / Authentication',
    code: 'server/mcp-diagnostics.ts',
    finding:
      '区分变量引用、非空默认值与字面凭据；不展开变量或执行 headersHelper，非完整 MCP schema 验证。',
  },
  'bun-lockfile': {
    section: 'bun.lock / Before Bun v1.2',
    code: 'server/projects.ts',
    finding: '识别 bun.lock 与 bun.lockb 的元数据；文件存在不证明内容有效或无依赖漏洞。',
  },
  'claude-managed-settings': {
    section: 'Settings precedence / Verify policy sources',
    code: 'server/configuration-scope.ts',
    finding: '明确组织配置可覆盖用户层；没有读取或推算远程策略，/status 和 doctor 由本人复核。',
  },
  'claude-key-choice': {
    section: 'Authentication / Conflict warnings',
    code: 'server/configuration-diagnostics.ts',
    finding: '列出 API Key 来源并引导 /status；交互批准条件结合当前 env-vars 说明。',
  },
  'claude-error-help': {
    section: 'Usage limits / Login / Service errors',
    code: 'src/content/troubleshooting.ts',
    finding: '错误分流不输出账号安全分数或单次错误的封禁结论。',
  },
  'environment-check-project': {
    section: '本地端与网页版检测范围',
    code: 'server/diagnostics.ts',
    finding: '只采用采样范围和分层展示，不采用社区账号风险评分与未证实权重。',
  },
  'claude-network': {
    section: 'Proxy configuration / CA store / mTLS',
    code: 'server/configuration-diagnostics.ts',
    finding: '核对小写代理优先顺序、HTTP(S)、NO_PROXY 与证书路径；没有推断最终请求路由。',
  },
  'claude-settings': {
    section: 'Configuration files / Settings precedence',
    code: 'server/configs.ts',
    finding: '全局修复与项目扫描分开；只做 JSON/env 结构核验，非全部官方 schema 或完整生效合并。',
  },
  'claude-env': {
    section: 'Set variables / Boolean and presence switches',
    code: 'shared/environment-values.ts',
    finding: 'DISABLE_* 的非空规则和普通布尔开关分开处理；自定义目录、宿主和未知值保留复核。',
  },
  'claude-auth': {
    section: 'Authentication precedence / Profiles',
    code: 'server/configuration-diagnostics.ts',
    finding: '只枚举来源和多来源线索，不读取登录秘密或执行 apiKeyHelper，不冒充实际认证选择。',
  },
  'claude-privacy': {
    section: 'Operational telemetry / Feedback',
    code: 'server/privacy-diagnostics.ts',
    finding: '均衡与最少流量分别检测和预览；实际项目、组织与宿主覆盖另行确认。',
  },
  'claude-access': {
    section: '国家与地区名单',
    code: 'shared/types.ts',
    finding: '为本人实际所在地提供名单入口，不把出口或时区当作地理资格证明。',
  },
  'api-regions': {
    section: 'Supported regions',
    code: 'shared/types.ts',
    finding: 'API 名单与消费产品、云平台条件分别呈现，不硬编码当前支持名单。',
  },
  'claude-appeals': {
    section: 'Appeals / Export / Organization on hold',
    code: 'src/content/troubleshooting.ts',
    finding: '申诉、导出和组织复核均由本人登录执行；工具不提交资料或删除账号。',
  },
  'claude-troubleshooting': {
    section: 'PATH / Certificates / Authentication',
    code: 'src/content/troubleshooting.ts',
    finding: '提供官方终端复核步骤，不自动登录、安装或发送付费请求。',
  },
  'api-errors': {
    section: 'HTTP status / Error types',
    code: 'src/content/troubleshooting.ts',
    finding: '401、403、429 与服务错误需结合完整类型和服务模式；不以状态码推断封禁。',
  },
  'node-tls': {
    section: 'NODE_TLS_REJECT_UNAUTHORIZED',
    code: 'server/diagnostics.ts',
    finding: '值为 0 按关闭验证处理；对 npm 可预览恢复，Node 和 Git 的来源提示手动处理。',
  },
  'npm-config': {
    section: 'proxy / https-proxy / strict-ssl / Sources',
    code: 'server/diagnostics.ts',
    finding: '补齐两项查询完整性与来源标签；用户文件修复不清空进程或项目配置。',
  },
  'git-config': {
    section: 'http.proxy / http.sslVerify / Boolean / Includes',
    code: 'server/git-tls.ts',
    finding: '本轮补齐 Git TLS 的用户与项目声明；全局查询不再描述为所有请求的最终生效值。',
  },
  'mihomo-tun': {
    section: 'auto-route / strict-route / dns-hijack',
    code: 'server/diagnostics.ts',
    finding: '网卡存在不能证明路由和 DNS 覆盖；平台及客户端配置保持人工复核。',
  },
  'browserleaks-dns': {
    section: 'DNS leak test 页面说明',
    code: 'shared/types.ts',
    finding: '这里只核对外部测试用途，未在来源审计中执行用户浏览器的泄漏测试或采信个人测试结果。',
  },
  'browserleaks-webrtc': {
    section: 'WebRTC leak test 页面说明',
    code: 'server/diagnostics.ts',
    finding: '本轮修复未完成采样及终端出口替代浏览器基准的误判；仍只证明本次可见候选。',
  },
  'ayi-guide': {
    section: '全文 0–10 与参考来源',
    code: 'shared/article-audit.ts',
    finding: '完整正文逐项映射；原文默认 B 路线与用户选定模式分开，人工和不执行项不自动通过。',
  },
  'proxy-regression': {
    section: 'Issue #39862 / Maintainer comment',
    code: 'src/content/troubleshooting.ts',
    finding: '已读取 issue 与维护者评论，回复称 2.1.117 修复；不按当前普遍故障套用。',
  },
  claudedoctor: {
    section: 'What it checks / Check-fix-verify / Privacy',
    code: 'server/repairs.ts',
    finding: '采用分层证据、预览备份和复验思路，独立实现；未采用账号权重或执行上游代码。',
  },
  'electron-security': {
    section: 'Isolation / Sandbox / Navigation / IPC validation',
    code: 'electron/main.ts',
    finding: '对照渲染隔离、权限限制、外链白名单和 IPC 来源校验；工程措施不等于不存在其他缺陷。',
  },
  'claude-status': {
    section: '按产品的状态与事件时间',
    code: 'src/content/troubleshooting.ts',
    finding: '提供用户按需打开的状态入口，未把获取时的状态固定为应用当前结论。',
  },
  'claude-changelog': {
    section: '2.1.117 / 2.1.283 与相关版本条目',
    code: 'shared/references.ts',
    finding: '用于版本条件核对，未自动升级客户端或把历史 bug 当作当前故障。',
  },
  'clash-verge-modes': {
    section: '系统代理 / TUN / 规则、全局、直连',
    code: 'shared/types.ts',
    finding: '补充服务模式、全局路由和关闭自动切换的人工核对；不直接修改代理客户端。',
  },
}
