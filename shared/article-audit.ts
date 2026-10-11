import type { DiagnosticCheckId } from './diagnostic-checks.js'
import type { FixId, ManualReviewId, Preferences } from './types.js'
import { ARTICLE_TIMEZONE, normalizeTimezone } from './timezones.js'

export const ARTICLE_AUDIT_DATE = '2026-10-11'
export const articleCoverageLabels = {
  automatic: '自动检查',
  partial: '部分自动检查',
  manual: '人工复核',
  excluded: '不自动执行',
} as const
export type ArticleCoverage = keyof typeof articleCoverageLabels
export type ArticleAuditGroup = 'environment' | 'configuration' | 'account' | 'boundary'
export const articleAuditGroups: Record<ArticleAuditGroup, string> = {
  environment: '系统与网络',
  configuration: '终端与本机配置',
  account: '账号与使用',
  boundary: '可选项与执行边界',
}
export interface ArticleAuditEntry {
  id: string
  section: string
  title: string
  group: ArticleAuditGroup
  coverage: ArticleCoverage
  implementation: string
  repair: string
  code: string
  checkIds?: DiagnosticCheckId[]
  projectCheckIds?: string[]
  manualIds?: ManualReviewId[]
  fixIds?: FixId[]
}
/** Coverage describes the code's capabilities, never proof that an account is safe. */
export const articleAuditEntries: ArticleAuditEntry[] = [
  {
    id: 'route',
    section: '0 / 1',
    title: '服务路线与支持地区',
    group: 'account',
    coverage: 'manual',
    implementation: '支持官方 API、自定义服务和各云平台偏好；实际所在地与服务条件由本人核对。',
    repair: '选择偏好后复检；没有把 IP 或时区当作地区合规证明。',
    code: 'shared/usage-modes.ts',
    manualIds: ['regions', 'client'],
  },
  {
    id: 'system-timezone',
    section: '2.2 / 6.1 / 9',
    title: '电脑系统时区为台北',
    group: 'environment',
    coverage: 'automatic',
    implementation:
      '独立读取操作系统时区，默认以 Asia/Taipei 比较；上海即使同为 UTC+8 也不符合原文目标。',
    repair:
      '一键配置按所选目标实际设置系统时区，必要时由系统请求管理员授权；先保存原时区快照，写入后独立复核。',
    code: 'server/system-timezone.ts',
    checkIds: ['timezone'],
  },
  {
    id: 'node-timezone',
    section: '2.2',
    title: 'Node 进程时区与系统一致',
    group: 'environment',
    coverage: 'partial',
    implementation: '读取本工具 Node 进程并静态检查 TZ；不能代表所有旧终端或 Claude Code 会话。',
    repair:
      '一键配置写入可安全解析的 shell TZ 与 Claude env.TZ，并同步本工具进程；已有终端和 Claude Code 会话重开后复核。',
    code: 'server/timezone-diagnostics.ts',
    checkIds: ['timezone-env'],
  },
  {
    id: 'automatic-timezone',
    section: '2.2 / 6.1 / 9',
    title: '关闭电脑自动设定时区',
    group: 'environment',
    coverage: 'manual',
    implementation: '始终待确认；当前读数正确不能证明自动设置已关闭。',
    repair: '在系统日期与时间中修改并记录人工复核。',
    code: 'server/timezone-diagnostics.ts',
    checkIds: ['timezone-followup'],
    manualIds: ['timezone-auto'],
  },
  {
    id: 'location-timezone',
    section: '2.2',
    title: '关闭定位服务中的设定时区',
    group: 'environment',
    coverage: 'manual',
    implementation: '未读取系统定位权限；人工复核单独说明该设置。',
    repair: '提供 macOS 与 iPhone 的系统服务路径。',
    code: 'shared/types.ts',
    manualIds: ['timezone-auto'],
  },
  {
    id: 'phone-timezone',
    section: '2.2 / 6.1 / 9',
    title: '手机时区与自动设置',
    group: 'environment',
    coverage: 'manual',
    implementation: '本机无法读取另一台设备；不由电脑时区推断手机已经符合。',
    repair: '在手机日期与时间和定位服务中逐项复核。',
    code: 'server/timezone-diagnostics.ts',
    checkIds: ['timezone-followup'],
    manualIds: ['timezone-auto'],
  },
  {
    id: 'exit-observation',
    section: '2.3 / 2.5①',
    title: '出口 country、city、org',
    group: 'environment',
    coverage: 'partial',
    implementation:
      '按需通过 curl 查询 ipinfo.io，并显示公开出口信息；这是采样，不是 Claude 请求路由证明。',
    repair: '没有自动购买或切换出口。',
    code: 'server/diagnostics.ts',
    checkIds: ['public-ip'],
  },
  {
    id: 'exit-stability',
    section: '2.3 / 2.5① / 9',
    title: '固定 IP、国家、城市和网络组织',
    group: 'environment',
    coverage: 'partial',
    implementation:
      '与已有网络报告比较四个字段，重复检测记录波动；首次采样或采样间未观察到的变化仍未知。',
    repair: '发现变化后在代理软件核对固定路由。',
    code: 'server/diagnostics.ts',
    checkIds: ['public-ip'],
    manualIds: ['fixed-route'],
  },
  {
    id: 'asn-type',
    section: '2.3 / 6.2 / 9',
    title: 'ASN 类型为 ISP / Residential',
    group: 'environment',
    coverage: 'manual',
    implementation: '免费查询的 org 不用于推断住宅或机房属性，保留专门复核项。',
    repair: '在查询工具核对实际 ASN 类型。',
    code: 'shared/types.ts',
    manualIds: ['asn'],
  },
  {
    id: 'exit-exclusive',
    section: '2.3 / 6.2',
    title: '出口是否独享',
    group: 'environment',
    coverage: 'manual',
    implementation: 'IP 和组织名称不能证明独享、共享人数或节点合同条件。',
    repair: '由本人核对节点服务与出口记录。',
    code: 'shared/types.ts',
    manualIds: ['asn'],
  },
  {
    id: 'fixed-node',
    section: '2.3 / 6.2',
    title: '固定节点并关闭自动切换',
    group: 'environment',
    coverage: 'manual',
    implementation: '没有读取代理客户端的选择器或延迟策略。',
    repair: '在代理客户端固定节点；出口历史仅用于补充观察。',
    code: 'shared/types.ts',
    manualIds: ['fixed-route'],
  },
  {
    id: 'proxy-client',
    section: '2.4',
    title: '代理客户端来源与服务模式',
    group: 'environment',
    coverage: 'manual',
    implementation: '不以 TUN 接口存在证明客户端来自官方、服务已安装或具备权限。',
    repair: '由本人在客户端确认下载来源、服务模式和权限。',
    code: 'shared/types.ts',
    manualIds: ['fixed-route'],
  },
  {
    id: 'tun-route',
    section: '2.4 / 6.3 / 9',
    title: 'TUN 或增强模式覆盖路由',
    group: 'environment',
    coverage: 'partial',
    implementation: '观察虚拟接口、比较浏览器与 curl 出口；TUN 检查保持待确认，未读取客户端路由。',
    repair: '在客户端开启并验证覆盖；不安装驱动或修改客户端。',
    code: 'server/diagnostics.ts',
    checkIds: ['tun', 'route-consistency'],
    manualIds: ['fixed-route'],
  },
  {
    id: 'global-mode',
    section: '2.4 / 6.3',
    title: '全局模式与固定出站',
    group: 'environment',
    coverage: 'manual',
    implementation: '未通过客户端控制 API 检测规则、全局或直连模式。',
    repair: '由本人在代理页面确认模式和节点。',
    code: 'shared/types.ts',
    manualIds: ['fixed-route'],
  },
  {
    id: 'system-proxy',
    section: '2.4 / 2.5④ / 6.5 / 9',
    title: '关闭系统代理',
    group: 'environment',
    coverage: 'automatic',
    implementation:
      '读取系统 HTTP、HTTPS、SOCKS、PAC 等配置；仅在所选 TUN 模式要求关闭，其他模式按其偏好判断。',
    repair: '引导在系统或代理客户端关闭；不自动修改系统。',
    code: 'server/diagnostics.ts',
    checkIds: ['system-proxy'],
  },
  {
    id: 'webrtc',
    section: '2.5② / 6.4 / 9',
    title: 'WebRTC 公网候选与浏览器出口',
    group: 'environment',
    coverage: 'partial',
    implementation:
      '只接受完成的可比较采样；与浏览器出口不同的公网候选提示关注，超时或缺失证据待确认。',
    repair: '提供 BrowserLeaks 入口；不安装扩展或修改浏览器策略。',
    code: 'server/diagnostics.ts',
    checkIds: ['webrtc'],
    manualIds: ['webrtc'],
  },
  {
    id: 'dns',
    section: '2.5③ / 6.4 / 9',
    title: 'DNS 实际出口与 dns-hijack',
    group: 'environment',
    coverage: 'manual',
    implementation: '读取本机解析器仅作证据，不能证明实际解析出口；DNS 检查始终待确认。',
    repair: '提供外部测试入口，由本人在客户端核对 DNS 接管。',
    code: 'server/diagnostics.ts',
    checkIds: ['dns'],
    manualIds: ['dns', 'fixed-route'],
  },
  {
    id: 'runtime-proxy',
    section: '2.5⑤ / 6.5 / 9',
    title: '终端中的代理变量',
    group: 'configuration',
    coverage: 'partial',
    implementation: '读取本工具继承的环境，不等于用户所有终端；TUN 模式下提示残留。',
    repair: '文件修复不能清空旧进程变量；需新建终端并复检。',
    code: 'server/diagnostics.ts',
    checkIds: ['runtime-proxy'],
  },
  {
    id: 'shell-proxy',
    section: '2.5⑤ / 6.5',
    title: 'Shell 启动配置中的代理',
    group: 'configuration',
    coverage: 'partial',
    implementation:
      '检查六个常见用户启动文件的直接赋值；不会执行 source、函数、动态表达式或额外文件。',
    repair: '预览后仅移除无条件完整字面赋值，复杂表达式保留。',
    code: 'server/configs.ts',
    checkIds: ['shell-proxy'],
    fixIds: ['shell-proxy'],
  },
  {
    id: 'npm-proxy',
    section: '2.5⑤ / 6.5',
    title: 'npm proxy 与 https-proxy',
    group: 'configuration',
    coverage: 'partial',
    implementation: '读取 ~/.npmrc 与两项只读查询；一项查询失败不能通过，项目层另行扫描。',
    repair: '预览移除用户文件的两类代理字段，保留 registry 和认证项。',
    code: 'server/diagnostics.ts',
    checkIds: ['npm-proxy', 'npm-effective-proxy'],
    projectCheckIds: ['project-tool-proxy'],
    fixIds: ['npm-proxy'],
  },
  {
    id: 'git-proxy',
    section: '2.5⑤ / 6.5',
    title: 'Git 全局 HTTP(S) 代理',
    group: 'configuration',
    coverage: 'partial',
    implementation: '读取两个全局文件并通过 --global 查询；include、URL 子节与项目层需按证据复核。',
    repair: '预览移除能安全定位的用户文件代理字段，保留其他 Git 设置。',
    code: 'server/configs.ts',
    checkIds: ['git-proxy', 'git-effective-proxy'],
    projectCheckIds: ['project-tool-proxy'],
    fixIds: ['git-proxy'],
  },
  {
    id: 'settings',
    section: '2.5⑤ / 5',
    title: 'Claude settings.json 可读取',
    group: 'configuration',
    coverage: 'automatic',
    implementation:
      '验证默认用户 JSON 和 env 对象；不是完整官方 schema 验证。自定义目录、项目和组织覆盖另行复核。',
    repair: '格式错误和非安全路径保持原文件，由本人先处理。',
    code: 'server/configs.ts',
    checkIds: ['claude-settings', 'config-directory'],
  },
  {
    id: 'endpoint',
    section: '2.5⑤ / 5 / 6.5 / 9',
    title: 'ANTHROPIC_BASE_URL 地址覆盖',
    group: 'configuration',
    coverage: 'partial',
    implementation:
      '读取进程、直接 shell 赋值、默认用户和指定项目设置；只在官方默认 API 模式提示移除。',
    repair: '预览移除 shell 或默认用户地址字段，保留密钥、权限、Hooks 和模型。',
    code: 'server/repairs.ts',
    checkIds: ['runtime-endpoint', 'shell-endpoint', 'claude-endpoint'],
    projectCheckIds: ['project-endpoint'],
    fixIds: ['shell-endpoint', 'claude-endpoint'],
  },
  {
    id: 'new-terminal',
    section: '2.4 / 2.5⑤',
    title: '修改后在新终端复验',
    group: 'configuration',
    coverage: 'manual',
    implementation: '应用反复检测本机观察，但无法证明另一个已打开终端已经重启。',
    repair: '修复与向导明确提示重新启动相关会话。',
    code: 'server/repairs.ts',
    manualIds: ['auth-method'],
  },
  {
    id: 'browser-profile',
    section: '2.6 / 6.6 / 9',
    title: '独立浏览器资料与授权环境',
    group: 'account',
    coverage: 'manual',
    implementation:
      '本应用浏览器采样不代表 Claude 登录资料；列出 BROWSER=false claude 的本人复核步骤。',
    repair: '由本人创建资料并打开授权链接。',
    code: 'shared/types.ts',
    manualIds: ['browser-profile'],
  },
  {
    id: 'account-ownership',
    section: '1 / 2.6 / 4 / 6.9 / 9',
    title: '本人使用账号、设备与凭据',
    group: 'account',
    coverage: 'manual',
    implementation: '本机配置无法证明账号没有共享、借用或第三方授权。',
    repair: '提供本人账号与凭据复核记录，不访问登录秘密。',
    code: 'shared/types.ts',
    manualIds: ['account-ownership', 'client'],
  },
  {
    id: 'sessions',
    section: '2.6 / 6.9 / 9',
    title: 'Active sessions 无陌生登录',
    group: 'account',
    coverage: 'manual',
    implementation: '提供官方入口；不读取或终止远程登录会话。',
    repair: '由本人在账号页面检查并处理。',
    code: 'shared/types.ts',
    manualIds: ['sessions'],
  },
  {
    id: 'contact',
    section: '3.1 / 6.6',
    title: '本人控制邮箱、手机号及验证链接',
    group: 'account',
    coverage: 'manual',
    implementation: '独立复核项记录检查结果；不读取邮箱、号码或验证码。',
    repair: '由本人确认所有权和登录环境。',
    code: 'shared/types.ts',
    manualIds: ['contact', 'browser-profile'],
  },
  {
    id: 'subscription',
    section: '3.2 / 6.7',
    title: 'Free、Pro、Max 的订阅节奏',
    group: 'account',
    coverage: 'manual',
    implementation: '社区按周节奏作为待复核建议，不转换为账户风险权重或升级任务。',
    repair: '订阅由本人按实际需求选择。',
    code: 'shared/types.ts',
    manualIds: ['usage', 'billing'],
  },
  {
    id: 'usage',
    section: '3.2 / 4 / 6.7 / 9',
    title: '使用额度、重置时间与内容政策',
    group: 'account',
    coverage: 'manual',
    implementation: '提供 Usage 和官方说明入口；不从超时、语言或环境推断账号额度及封禁。',
    repair: '在实际账号核对提示与额度，不自动换号或运行请求。',
    code: 'src/content/troubleshooting.ts',
    manualIds: ['usage', 'account-notice'],
  },
  {
    id: 'billing',
    section: '3.3 / 6.8 / 7',
    title: '支付、账单、退款与取消续费',
    group: 'account',
    coverage: 'manual',
    implementation: '提供官方渠道复核；支付国、账单、付款主体与退款资格无法从本机证明。',
    repair: '由本人分别申请退款和取消续费。',
    code: 'shared/types.ts',
    manualIds: ['billing'],
  },
  {
    id: 'cloud-privacy',
    section: '3.4',
    title: '账号的模型改进选择',
    group: 'account',
    coverage: 'manual',
    implementation: '与本机遥测区分；本机开关不替代账号数据隐私设置。',
    repair: '提供账号隐私页面入口，由本人选择。',
    code: 'shared/types.ts',
    manualIds: ['cloud-privacy'],
  },
  {
    id: 'official-client',
    section: '4 / 5 / 6.10 / 9',
    title: '官方客户端与订阅授权',
    group: 'configuration',
    coverage: 'partial',
    implementation:
      '探测 claude --version 和安装候选元数据；版本字符串不证明二进制未修改或授权有效。',
    repair: '官方安装、认证和第三方订阅授权由本人复核，不自动升级。',
    code: 'server/cli-diagnostics.ts',
    checkIds: ['claude-cli', 'auth-sources'],
    manualIds: ['client', 'auth-method'],
  },
  {
    id: 'privacy',
    section: '5 / 6.10',
    title: '遥测、错误报告与全部非必要流量',
    group: 'configuration',
    coverage: 'partial',
    implementation:
      '区分非空值开关与布尔开关；原文示例为最少流量模式，默认均衡模式只对应较小范围。项目与组织覆盖需另查。',
    repair: '按所选偏好预览合并 env，保留其他设置；说明 Remote Control 的版本影响。',
    code: 'server/privacy-diagnostics.ts',
    checkIds: ['claude-privacy'],
    projectCheckIds: ['project-privacy'],
    fixIds: ['claude-privacy'],
  },
  {
    id: 'git-backup',
    section: '6.11 / 9',
    title: '代码有本人控制的本地 Git 备份',
    group: 'configuration',
    coverage: 'partial',
    implementation:
      '指定项目中确认有效 HEAD；已有提交不证明未提交代码或异地备份完整。配置快照仅覆盖白名单设置。',
    repair: '不替用户提交目标项目代码；配置快照支持预览恢复。',
    code: 'server/projects.ts',
    projectCheckIds: ['project-git'],
    manualIds: ['backup'],
  },
  {
    id: 'error-routing',
    section: '7',
    title: '区分限额、服务故障、账号限制',
    group: 'account',
    coverage: 'manual',
    implementation: '排查帮助按实际错误类型分流，提供状态页与官方复核入口。',
    repair: '不从单次网络错误判定封禁，不自动提交申诉。',
    code: 'src/content/troubleshooting.ts',
    manualIds: ['service-status', 'account-notice'],
  },
  {
    id: 'account-export',
    section: '7',
    title: '导出、申诉和身份验证',
    group: 'account',
    coverage: 'manual',
    implementation: '提示先导出、记录事实与带时区的时间；证件和申诉只在官方流程提交。',
    repair: '不删除账号，不收集证件或代过验证。',
    code: 'shared/types.ts',
    manualIds: ['account-export', 'account-notice'],
  },
  {
    id: 'ipv6',
    section: '2.5 可选',
    title: 'IPv6 代理覆盖',
    group: 'boundary',
    coverage: 'partial',
    implementation: '存在非回环 IPv6 时待确认；接口无法证明 IPv6 请求是否受代理覆盖。',
    repair: '由本人按网络需求选择；不把关闭 IPv6 当作必选。',
    code: 'server/diagnostics.ts',
    checkIds: ['ipv6'],
    manualIds: ['fixed-route'],
  },
  {
    id: 'cleanup',
    section: '2.6',
    title: '凭据、历史会话与完整清理',
    group: 'boundary',
    coverage: 'excluded',
    implementation:
      '快照覆盖十一个用户配置位置、偏好、可读取的系统时区与 TZ，不是 ~/.claude、Keychain 或会话历史的完整备份。',
    repair: '不运行清理脚本、不删除登录凭据；需要时由本人单独完整备份。',
    code: 'server/snapshots.ts',
    manualIds: ['backup'],
  },
  {
    id: 'fingerprint',
    section: '5 / 8',
    title: '二进制修改与设备指纹伪装',
    group: 'boundary',
    coverage: 'excluded',
    implementation: '没有实现修改客户端、伪造设备指纹、批量注册或绕过身份验证。',
    repair: '保留官方客户端复核入口。',
    code: 'src/content/troubleshooting.ts',
    manualIds: ['client'],
  },
  {
    id: 'instruction-location',
    section: '4 / 8',
    title: '提示词与 CLAUDE.md 中的位置描述',
    group: 'boundary',
    coverage: 'manual',
    implementation:
      '项目扫描只提示指令文件的存在和人工审阅；没有读取对话、搜索地名或判定账号风险。原文的位置建议保留为社区观点。',
    repair: '由本人审阅将发送给模型的非必要个人信息；不自动删除、改写或编造所在地。',
    code: 'server/projects.ts',
    projectCheckIds: ['project-instructions'],
  },
  {
    id: 'speculation',
    section: '1 / 3.2 / 4 / 7 / 8',
    title: '社区风控归因与账号安全保证',
    group: 'boundary',
    coverage: 'excluded',
    implementation:
      '不将中文、输入法、回复长度、订阅金额或统计数字转成封禁概率、因果判定或安全通过。',
    repair: '按可观测证据排查；账号问题使用官方复核。',
    code: 'src/content/troubleshooting.ts',
    manualIds: ['account-notice'],
  },
  {
    id: 'promotions',
    section: '2.3 / 3.3 / 10',
    title: '住宅节点、主机和银行卡推广',
    group: 'boundary',
    coverage: 'excluded',
    implementation: '未采纳推广价格、推荐码或商家宣传作为检测规则。',
    repair: '没有自动购买、开卡、注册或提交支付信息。',
    code: 'shared/references.ts',
  },
]
export interface ArticleModeDifference {
  id: string
  message: string
}
export function articleModeDifferences(preferences?: Preferences): ArticleModeDifference[] {
  if (!preferences) return []
  const differences: ArticleModeDifference[] = []
  if (preferences.timezoneMode === 'exit')
    differences.push({
      id: 'timezone',
      message: '时区按 IP 出口判断；原文固定要求台北，两者可能不同。',
    })
  else if (
    preferences.timezoneMode === 'manual' &&
    normalizeTimezone(preferences.expectedTimezone) !== ARTICLE_TIMEZONE
  )
    differences.push({
      id: 'timezone',
      message: `手动时区为 ${preferences.expectedTimezone || '未选择'}；原文目标为 ${ARTICLE_TIMEZONE}。`,
    })
  if (preferences.routeMode !== 'tun')
    differences.push({
      id: 'route',
      message: '代理检查当前按系统代理或自定义模式判断；原文默认 B 路线采用 TUN 并清理代理残留。',
    })
  if (preferences.usageMode !== 'official')
    differences.push({
      id: 'endpoint',
      message:
        '当前服务模式保留自定义或云平台配置；原文默认 B 路线要求官方 Claude Code 的默认地址。',
    })
  if (preferences.privacy !== 'minimal')
    differences.push({
      id: 'privacy',
      message: '当前均衡隐私模式检查遥测与错误报告；原文第 5 节示例还关闭全部非必要流量。',
    })
  return differences
}
