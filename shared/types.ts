import { z } from 'zod'

export { DIAGNOSTIC_CHECK_COUNT } from './diagnostic-checks.js'

export const preferencesSchema = z.object({
  expectedTimezone: z.string().max(80).default(''),
  expectedCountry: z
    .string()
    .regex(/^$|^[A-Z]{2}$/)
    .default(''),
  routeMode: z.enum(['system', 'tun', 'custom']).default('system'),
  usageMode: z.enum(['official', 'custom', 'bedrock', 'vertex']).default('official'),
  privacy: z.enum(['balanced', 'minimal']).default('balanced'),
})
export type Preferences = z.infer<typeof preferencesSchema>
export const defaultPreferences: Preferences = preferencesSchema.parse({})

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
  id: string
  createdAt: string
  expiresAt: string
  fixIds: FixId[]
  files: FilePreview[]
  notes: string[]
}
export interface BackupSummary {
  id: string
  createdAt: string
  fixIds: FixId[]
  files: string[]
  status: 'applied' | 'restored' | 'failed'
  restoredAt?: string
}
export interface Bootstrap {
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
    description: '原文 2.2 / 6.1：核对系统自动时区、定位服务与手机时区，按实际使用地区设置。',
    url: 'https://x.com/AYi_AInotes/status/2106639522586829094',
    category: '系统',
  },
  {
    id: 'fixed-route',
    title: '确认固定路由与 DNS 接管',
    description:
      '原文 2.4 / 6.2–4：在代理软件核对自动切换、TUN 路由、DNS 和 dns-hijack；接口存在不能证明全部接管。',
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
    description: '原文 2.6 / 6.6：使用本人管理的浏览器资料和邮箱，核对验证链接与日常登录的环境。',
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
      '原文 4 / 6.7 / 9：检查实际额度、授权和客户端使用方式；本机工具无法判断账号限制状态。',
    url: 'https://claude.ai/settings/usage',
    category: '账号',
  },
  {
    id: 'billing',
    title: '核对订阅与退款渠道',
    description: '原文 3 / 7：核对本人订阅、账单和官方退款渠道；工具不会读取或修改支付信息。',
    url: 'https://support.claude.com/en/articles/12386328-request-a-refund-for-a-paid-claude-plan',
    category: '账号',
  },
] as const

export const setupRequestSchema = z.object({
  preferences: preferencesSchema,
  fixIds: z.array(z.enum(fixIds)).max(7),
  browser: browserSchema.optional(),
})
export type SetupRequest = z.infer<typeof setupRequestSchema>
export type SetupNodeId = 'snapshot' | 'preferences' | 'inspect' | FixId | 'verify'
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
export interface SetupPreview {
  id: string
  createdAt: string
  expiresAt: string
  preferences: Preferences
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
  purpose: 'manual' | 'setup' | 'before-restore'
  status: 'ready' | 'restored'
  files: string[]
  excludedFiles: string[]
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
