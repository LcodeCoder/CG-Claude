import { z } from 'zod'
import { usageModeIds } from './usage-modes.js'
import type { ConnectionConfiguration } from './connections.js'
import type { ServiceStatus } from './service-status.js'
import { normalizeTimezone, timezoneModes } from './timezones.js'

export { DIAGNOSTIC_CHECK_COUNT } from './diagnostic-checks.js'

export const preferencesSchema = z
  .object({
    timezoneMode: z.enum(timezoneModes).optional(),
    expectedTimezone: z.string().max(80).default(''),
    expectedCountry: z
      .string()
      .regex(/^$|^[A-Z]{2}$/)
      .default(''),
    routeMode: z.enum(['system', 'tun', 'custom']).default('system'),
    usageMode: z.enum(usageModeIds).default('official'),
    privacy: z.enum(['balanced', 'minimal']).default('balanced'),
  })
  .transform((value) => ({
    ...value,
    // Preserve explicit targets from old records; an old blank target now uses the article baseline.
    timezoneMode: value.timezoneMode ?? (value.expectedTimezone ? 'manual' : 'article'),
  }))
  .superRefine((value, context) => {
    if (
      value.timezoneMode === 'manual' &&
      value.expectedTimezone &&
      !normalizeTimezone(value.expectedTimezone)
    )
      context.addIssue({
        code: 'custom',
        path: ['expectedTimezone'],
        message: '期望时区不是有效的 IANA 时区',
      })
    if (value.timezoneMode === 'manual' && !value.expectedTimezone.trim())
      context.addIssue({
        code: 'custom',
        path: ['expectedTimezone'],
        message: '手动模式需要选择一个时区',
      })
  })
export type Preferences = z.infer<typeof preferencesSchema>
export const defaultPreferences: Preferences = preferencesSchema.parse({})

/** Preference equality follows values, independent of JSON field order or legacy migrations. */
export function samePreferences(left?: Preferences, right?: Preferences): boolean {
  if (!left || !right) return left === right
  return (Object.keys(defaultPreferences) as (keyof Preferences)[]).every(
    (key) => left[key] === right[key],
  )
}

export const categoryLabels = {
  network: '网络出口',
  browser: '浏览器',
  system: '系统配置',
  terminal: '终端环境',
  claude: 'Claude Code',
} as const
export type Category = keyof typeof categoryLabels
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'manual' | 'skipped'
export const statusLabels: Record<CheckStatus, string> = {
  pass: '通过',
  warn: '需关注',
  fail: '需处理',
  manual: '待确认',
  skipped: '未检测',
}
export interface Evidence {
  label: string
  value: string
}
export interface CheckResult {
  id: string
  category: Category
  title: string
  description: string
  status: CheckStatus
  summary: string
  evidence: Evidence[]
  recommendation: string
  fixIds: FixId[]
  source: 'official' | 'system' | 'community'
  sourceUrl?: string
}
export const fixIds = [
  'shell-proxy',
  'shell-endpoint',
  'npm-proxy',
  'git-proxy',
  'claude-endpoint',
  'claude-privacy',
  'npm-tls',
] as const
export type FixId = (typeof fixIds)[number]
export const fixLabels: Record<FixId, string> = {
  'shell-proxy': '移除 shell 代理配置',
  'shell-endpoint': '移除 shell 自定义 API 地址',
  'npm-proxy': '移除 npm 代理配置',
  'git-proxy': '移除 git 代理配置',
  'claude-endpoint': '恢复 Claude 官方 API 地址',
  'claude-privacy': '调整 Claude 隐私设置',
  'npm-tls': '启用 npm TLS 证书校验',
}
export const browserSchema = z.object({
  timezone: z.string().max(80),
  language: z.string().max(80),
  platform: z.string().max(200),
  publicIp: z.string().max(100).optional(),
  publicIpError: z.string().max(200).optional(),
  webrtc: z
    .object({
      available: z.boolean(),
      tested: z.boolean(),
      timedOut: z.boolean(),
      candidates: z
        .array(z.object({ address: z.string().max(150), type: z.string().max(30) }))
        .max(30),
      error: z.string().max(200).optional(),
    })
    .optional(),
})
export type BrowserSnapshot = z.infer<typeof browserSchema>
export const scanRequestSchema = z.object({
  network: z.boolean().default(false),
  passes: z.number().int().min(1).max(3).default(1),
  browser: browserSchema.optional(),
})
export type ScanRequest = Omit<z.infer<typeof scanRequestSchema>, 'passes'> & { passes?: number }
export interface Machine {
  platform: string
  platformName: string
  hostname: string
  arch: string
  osVersion: string
  timezone: string
  /** A process may inherit TZ; this value is not evidence of the operating system's timezone. */
  runtimeTimezone?: string
  nodeVersion: string
}
export interface NetworkInfo {
  ip: string
  country?: string
  city?: string
  org?: string
  timezone?: string
  browserIp?: string
}
export interface ScanReport {
  configurationFingerprint?: string
  ruleset?: string
  id: string
  createdAt: string
  completedAt: string
  machine: Machine
  preferences: Preferences
  checks: CheckResult[]
  network?: NetworkInfo
  networkEnabled: boolean
  counts: Record<CheckStatus, number>
  verification?: { passes: number; unstableCheckIds: string[] }
}
export interface ConfigFileInfo {
  id: string
  label: string
  path: string
  exists: boolean
  editable: boolean
  summary: string
}
export interface ChangePreview {
  key: string
  before: string
  after: string
}
export interface FilePreview {
  path: string
  changes: ChangePreview[]
  exists: boolean
}
export interface RepairPlan {
  kind?: 'connection' | 'timezone'
  label?: string
  id: string
  createdAt: string
  expiresAt: string
  fixIds: FixId[]
  files: FilePreview[]
  notes: string[]
}
export interface BackupSummary {
  label?: string
  snapshotId?: string
  id: string
  createdAt: string
  fixIds: FixId[]
  files: string[]
  status: 'applied' | 'restored' | 'failed'
  restoredAt?: string
}
export interface Bootstrap {
  service?: ServiceStatus
  machine: Machine
  preferences: Preferences
  files: ConfigFileInfo[]
  reports: ScanReport[]
  backups: BackupSummary[]
  demo: boolean
  token: string
  runtime: 'browser' | 'electron'
  workflows: SetupJob[]
  snapshots: SnapshotSummary[]
  projectRoot: string
  manualReviews: ManualReview[]
  connection?: ConnectionConfiguration
  configurationFingerprint?: string
}
export const repairRequestSchema = z.object({ fixIds: z.array(z.enum(fixIds)).min(1).max(7) })
export const manualItems = [
  {
    id: 'dns',
    title: '检查 DNS 实际出口',
    description: '本机 DNS 设置无法证明解析请求的实际出口，运行外部测试后核对。',
    url: 'https://browserleaks.com/dns',
    category: '网络',
  },
  {
    id: 'webrtc',
    title: '复核 WebRTC 出口',
    description: '对照公网 IP，确认浏览器没有额外的公网出口。',
    url: 'https://browserleaks.com/webrtc',
    category: '浏览器',
  },
  {
    id: 'regions',
    title: '核对服务支持地区',
    description: '依据官方名单核对你的实际所在地与服务使用条件。',
    url: 'https://www.anthropic.com/supported-countries',
    category: '账号',
  },
  {
    id: 'sessions',
    title: '检查已登录设备',
    description: '在 Claude 账号设置里核对活跃会话，处理不认识的登录。',
    url: 'https://claude.ai/settings',
    category: '账号',
  },
  {
    id: 'client',
    title: '确认客户端与计费方式',
    description: '核对官方客户端、API 或云平台的授权方式，凭据只由本人保管。',
    url: 'https://code.claude.com/docs/en/authentication',
    category: '账号',
  },
  {
    id: 'backup',
    title: '备份本地项目',
    description: '确认代码进入自己的 Git 仓库，重要会话另行导出。',
    url: 'https://code.claude.com/docs/en/settings',
    category: '项目',
  },
  {
    id: 'timezone-auto',
    title: '复核自动时区和其他设备',
    description:
      '原文 2.2 / 6.1 / 9 要求电脑和手机设为台北、关闭自动设定时区及定位服务中的设定时区。若选择按出口或手动目标，逐项核对该目标；本机读数不能证明这三项已完成。',
    url: 'https://x.com/AYi_AInotes/status/2106639522586829094',
    category: '系统',
  },
  {
    id: 'fixed-route',
    title: '确认固定路由与 DNS 接管',
    description:
      '原文 2.3–2.5 / 6.2–4：核对固定节点并关闭自动切换、服务模式、TUN（或增强模式）、关闭系统代理、全局路由、DNS 和 dns-hijack；接口存在不能证明全部接管。',
    url: 'https://browserleaks.com/dns',
    category: '网络',
  },
  {
    id: 'asn',
    title: '人工核对 ASN 类型',
    description:
      '原文 2.3 / 9：查询实际 ASN 类型和出口历史，组织名称与免费接口不足以证明住宅或机房属性。',
    url: 'https://ipinfo.io',
    category: '网络',
  },
  {
    id: 'browser-profile',
    title: '核对浏览器资料与登录环境',
    description:
      '原文 2.6 / 6.6：使用独立浏览器资料。需要时在实际终端运行 BROWSER=false claude，将授权链接复制到该资料；验证邮件也在同一环境打开。本应用浏览器检测不代表该资料。',
    url: 'https://support.claude.com/en/articles/13124001-managing-your-active-sessions',
    category: '浏览器',
  },
  {
    id: 'cloud-privacy',
    title: '核对网页端隐私选择',
    description: '原文 3.4：网页端帮助改进 Claude 的设置独立于本地遥测，需要在账号页面自行选择。',
    url: 'https://claude.ai/settings/data-privacy-controls',
    category: '账号',
  },
  {
    id: 'usage',
    title: '核对额度和使用方式',
    description:
      '原文 3.2 / 4 / 6.7 / 9：检查实际额度、重置时间、授权和客户端使用方式。Free → Pro → Max 的按周节奏是社区经验，不能证明账号状态，也不会自动操作订阅。',
    url: 'https://claude.ai/settings/usage',
    category: '账号',
  },
  {
    id: 'contact',
    title: '核对本人邮箱与手机号',
    description:
      '原文 3.1：核对邮箱、手机号是否由本人长期控制，验证邮件是否在预期的浏览器和网络中打开；不读取邮件、手机号或验证链接。',
    url: 'https://x.com/AYi_AInotes/status/2106639522586829094',
    category: '账号',
  },
  {
    id: 'account-ownership',
    title: '核对账号与凭据使用人',
    description:
      '原文 1 / 2.6 / 4 / 9：账号和凭据由本人使用与保管，核对设备、共享和第三方授权情况；本机扫描无法证明账号未共享。',
    url: 'https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals',
    category: '账号',
  },
  {
    id: 'account-export',
    title: '受限后先核对数据导出与申诉',
    description:
      '原文 7：需要时由本人在官网登录后导出数据，再决定是否删除；申诉记录事实、时间和时区。退款与取消续费分别处理，本工具不提交申诉或删除账号。',
    url: 'https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals',
    category: '账号',
  },
  {
    id: 'billing',
    title: '核对订阅与退款渠道',
    description: '原文 3 / 7：核对本人订阅、账单和官方退款渠道；工具不会读取或修改支付信息。',
    url: 'https://support.claude.com/en/articles/12386328-request-a-refund-for-a-paid-claude-plan',
    category: '账号',
  },
  {
    id: 'service-status',
    title: '遇到连接问题时先核对服务状态',
    description: '查看官方状态页中与你使用的产品对应的事件和时间，区分服务故障与本机配置问题。',
    url: 'https://status.claude.com/',
    category: '服务',
  },
  {
    id: 'account-notice',
    title: '核对账号提示与官方复核入口',
    description:
      '出现验证、警告或组织复核提示时，核对官网登录页的完整说明。身份验证只按官方流程完成；本机配置不能确定处理原因。',
    url: 'https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals',
    category: '账号',
  },
  {
    id: 'auth-method',
    title: '确认客户端实际采用的认证方式',
    description:
      '在 Claude Code 的 /status 查看 Login method、Login 或 Profile，核对是否采用了预期的订阅、API 或云平台来源。',
    url: 'https://code.claude.com/docs/en/authentication',
    category: '客户端',
  },
] as const

export type ManualReviewId = (typeof manualItems)[number]['id']

export const manualReviewRequestSchema = z.object({
  id: z.enum(manualItems.map((item) => item.id)),
  checked: z.boolean(),
  note: z.string().max(600).default(''),
})
export type ManualReviewRequest = z.infer<typeof manualReviewRequestSchema>
export const manualReviewSchema = z.object({
  id: z.string().min(1).max(80),
  checked: z.boolean(),
  checkedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  note: z.string().max(600),
  origin: z.enum(['manual', 'legacy']).default('manual'),
})
export type ManualReview = z.infer<typeof manualReviewSchema>
export const manualReviewImportSchema = z.object({
  ids: z.array(z.enum(manualItems.map((item) => item.id))).max(manualItems.length),
})

export const setupRequestSchema = z.object({
  preferences: preferencesSchema,
  fixIds: z.array(z.enum(fixIds)).max(7),
  timezone: z.object({ system: z.boolean(), terminal: z.boolean() }).optional(),
  browser: browserSchema.optional(),
})
export type SetupRequest = z.infer<typeof setupRequestSchema>
export type SetupNodeId =
  | 'snapshot'
  | 'preferences'
  | 'inspect'
  | 'system-timezone'
  | 'terminal-timezone'
  | FixId
  | 'verify'
export type SetupNodeStatus = 'pending' | 'running' | 'retrying' | 'succeeded' | 'skipped'
export interface SetupNodePreview {
  id: SetupNodeId
  title: string
  description: string
  enabled: boolean
  files: FilePreview[]
  blocked?: boolean
  note?: string
}
export const setupBrowserRequestSchema = z.object({
  probeId: z.string().uuid(),
  browser: browserSchema,
})
export interface SetupPreview {
  id: string
  createdAt: string
  expiresAt: string
  preferences: Preferences
  timezoneTarget?: string
  nodes: SetupNodePreview[]
  notes: string[]
}
export interface SetupAttempt {
  at: string
  attempt: number
  result: 'succeeded' | 'failed'
  message: string
}
export interface SetupNode extends SetupNodePreview {
  status: SetupNodeStatus
  attempts: number
  retries: number
  message: string
  history: SetupAttempt[]
  backupId?: string
  startedAt?: string
  completedAt?: string
}
export interface SetupJob {
  id: string
  previewId: string
  createdAt: string
  completedAt?: string
  status: 'running' | 'complete' | 'interrupted'
  preferences: Preferences
  nodes: SetupNode[]
  reportId?: string
  snapshotId?: string
  browserProbeId?: string
  error?: string
}
export const SETUP_MAX_RETRIES = 3
export const setupNodeLabels: Record<SetupNodeStatus, string> = {
  pending: '等待执行',
  running: '正在执行',
  retrying: '等待重试',
  succeeded: '已完成',
  skipped: '已跳过',
}

export interface SnapshotSummary {
  id: string
  createdAt: string
  label: string
  purpose: 'manual' | 'setup' | 'connection' | 'before-restore'
  status: 'ready' | 'restored'
  files: string[]
  excludedFiles: string[]
  timezone?: { system?: string; terminal: boolean; user: boolean }
  restoredAt?: string
}
export interface SnapshotPreview {
  id: string
  snapshotId: string
  createdAt: string
  expiresAt: string
  files: FilePreview[]
  preferences: Preferences
  preferencesChanged: boolean
  timezoneChanges?: ChangePreview[]
  notes: string[]
}
export interface ProjectFinding {
  id: string
  title: string
  status: CheckStatus
  summary: string
  evidence: Evidence[]
  recommendation: string
}
export interface ProjectReport {
  id: string
  root: string
  createdAt: string
  findings: ProjectFinding[]
  counts: Record<CheckStatus, number>
  filesChecked: string[]
}
export const projectRequestSchema = z.object({ path: z.string().min(1).max(2048) })
