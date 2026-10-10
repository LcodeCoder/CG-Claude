import { constants, promises as fs } from 'node:fs'
import path from 'node:path'
import type { CheckResult, Evidence, Preferences } from '../shared/types.js'
import type { Context } from './context.js'
import type { EnvironmentSources } from './environment-sources.js'
import { endpointValue } from './safety.js'

const networkSource = 'https://code.claude.com/docs/en/network-config'
const proxyOrder = ['https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY'] as const
const proxyNames = /^(?:https?_proxy|all_proxy|no_proxy)$/i
const authNames =
  /^(?:ANTHROPIC_(?:AUTH_TOKEN|API_KEY|AWS_API_KEY|PROFILE|FEDERATION_RULE_ID|ORGANIZATION_ID)|CLAUDE_CODE_OAUTH_(?:TOKEN|REFRESH_TOKEN|SCOPES)|CLAUDE_CODE_USE_(?:BEDROCK|VERTEX|FOUNDRY|ANTHROPIC_AWS))$/
const credentialKeys = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AWS_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_REFRESH_TOKEN',
  'ANTHROPIC_PROFILE',
]
const cloudKeys = [
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_USE_ANTHROPIC_AWS',
]
const certificateKeys = [
  'NODE_EXTRA_CA_CERTS',
  'CLAUDE_CODE_CLIENT_CERT',
  'CLAUDE_CODE_CLIENT_KEY',
] as const
const certificateNames =
  /^(?:NODE_EXTRA_CA_CERTS|CLAUDE_CODE_CLIENT_(?:CERT|KEY|KEY_PASSPHRASE)|CLAUDE_CODE_CERT_STORE)$/

function checkBase(id: string, title: string, description: string): CheckResult {
  return {
    id,
    title,
    description,
    category: 'claude',
    status: 'pass',
    summary: '',
    evidence: [],
    recommendation: '',
    fixIds: [],
    source: 'official',
    sourceUrl: networkSource,
  }
}
function missingEvidence(input: EnvironmentSources, names: RegExp): Evidence[] {
  return [
    ...input.unavailable.map((label) => ({ label, value: '文件未能读取，检查范围不完整' })),
    ...input.sources.flatMap((source) =>
      source.unresolved
        .filter((key) => names.test(key))
        .map((key) => ({
          label: `${source.label} · ${key}`,
          value: '条件、动态表达式或非字符串值，需在实际会话复核',
        })),
    ),
  ]
}

export function proxyCompatibility(input: EnvironmentSources): CheckResult {
  const check = checkBase(
    'proxy-compatibility',
    'Claude Code 代理兼容性',
    '核对 HTTP(S) 协议、代理变量选择顺序与绕过规则；文件中的设置不代表当前会话已经采用。',
  )
  const issues: Evidence[] = []
  const review: Evidence[] = []
  for (const source of input.sources) {
    const configured = proxyOrder.filter((key) => source.values[key]?.trim())
    const chosen = configured[0]
    if (chosen)
      check.evidence.push({
        label: `${source.label} · 优先变量`,
        value: `${chosen} · ${endpointValue(source.values[chosen]!)}`,
      })
    for (const key of configured) {
      try {
        const url = new URL(source.values[key]!.trim())
        if (!['http:', 'https:'].includes(url.protocol))
          issues.push({
            label: `${source.label} · ${key}`,
            value: '当前官方文档支持 HTTP(S) 代理；此协议需调整或复核',
          })
        else if (url.search || url.hash || (url.pathname && url.pathname !== '/'))
          review.push({
            label: `${source.label} · ${key}`,
            value: '代理地址包含路径或查询参数，需确认代理客户端的地址格式',
          })
      } catch {
        issues.push({
          label: `${source.label} · ${key}`,
          value: '代理 URL 格式无法解析，请核对 http:// 或 https:// 前缀',
        })
      }
    }
    for (const [lower, upper] of [
      ['https_proxy', 'HTTPS_PROXY'],
      ['http_proxy', 'HTTP_PROXY'],
      ['no_proxy', 'NO_PROXY'],
    ] as const) {
      if (
        source.values[lower]?.trim() &&
        source.values[upper]?.trim() &&
        source.values[lower]!.trim() !== source.values[upper]!.trim()
      ) {
        issues.push({
          label: `${source.label} · ${lower} / ${upper}`,
          value:
            lower === 'no_proxy'
              ? '大小写变量内容不同，需在 /status 与实际请求中复核'
              : `大小写变量内容不同；按当前文档 ${lower} 的优先级更高`,
        })
      }
    }
    if (!chosen && (source.values.ALL_PROXY?.trim() || source.values.all_proxy?.trim()))
      issues.push({
        label: `${source.label} · ALL_PROXY`,
        value: '只配置 ALL_PROXY 无法依据官方 HTTP(S) 代理说明确认 Claude Code 的路由',
      })
    const bypass = source.values.no_proxy || source.values.NO_PROXY
    if (
      chosen &&
      bypass &&
      bypass
        .split(/[\s,]+/)
        .some(
          (rule) =>
            rule === '*' ||
            /^(?:\.)?(?:api\.)?anthropic\.com(?::\d+)?$/i.test(rule) ||
            /^(?:\.)?(?:platform\.)?claude\.(?:ai|com)(?::\d+)?$/i.test(rule),
        )
    ) {
      review.push({
        label: `${source.label} · NO_PROXY`,
        value: '规则可能绕过代理访问 Claude 服务；确认这是预期的直连方式',
      })
    }
  }
  const incomplete = missingEvidence(input, proxyNames)
  check.evidence.push(...issues, ...review, ...incomplete, {
    label: '检查范围',
    value: '当前进程与已读取的用户配置；不合并推算其他终端或组织策略',
  })
  check.status = issues.length ? 'warn' : review.length || incomplete.length ? 'manual' : 'pass'
  check.summary = issues.length
    ? `发现 ${issues.length} 项代理兼容性线索`
    : review.length
      ? '代理绕过规则或地址格式需要复核'
      : incomplete.length
        ? '部分代理配置需在实际会话确认'
        : '已读取配置中未发现代理兼容性问题'
  check.recommendation =
    '当前文档的选择顺序为 https_proxy → HTTPS_PROXY → http_proxy → HTTP_PROXY，且不支持 SOCKS 代理。在 Claude Code 内运行 /status 确认 Proxy 行；修改启动环境后新建会话。系统代理或 TUN 的实际路由需结合连接结果。'
  return check
}

export function authenticationSources(
  input: EnvironmentSources,
  preferences: Preferences,
): CheckResult {
  const check = checkBase(
    'auth-sources',
    '认证配置来源',
    '只检查认证变量和 apiKeyHelper 是否配置；不读取凭据文件、不执行辅助脚本，也不验证账号状态。',
  )
  check.sourceUrl = 'https://code.claude.com/docs/en/authentication'
  const methods = new Set<string>()
  const providers = new Set<string>()
  for (const source of input.sources) {
    for (const key of credentialKeys)
      if (source.values[key]?.trim()) {
        methods.add(key)
        check.evidence.push({ label: `${source.label} · ${key}`, value: '已配置，值已隐藏' })
      }
    for (const key of cloudKeys)
      if (source.values[key] === '1') {
        providers.add(key)
        check.evidence.push({ label: `${source.label} · ${key}`, value: '启用标志为 1' })
      }
    if (source.hasApiKeyHelper) {
      methods.add('apiKeyHelper')
      check.evidence.push({
        label: `${source.label} · apiKeyHelper`,
        value: '已配置，脚本内容已隐藏且未执行',
      })
    }
    if (source.values.ANTHROPIC_FEDERATION_RULE_ID && source.values.ANTHROPIC_ORGANIZATION_ID) {
      methods.add('Workload Identity Federation')
      check.evidence.push({
        label: `${source.label} · 联合身份变量`,
        value: '规则和组织标识已配置，值已隐藏',
      })
    }
  }
  const incomplete = missingEvidence(input, authNames)
  check.evidence.push(...incomplete)
  const refreshMissing =
    input.sources.some(
      (source) =>
        source.values.CLAUDE_CODE_OAUTH_REFRESH_TOKEN && !source.values.CLAUDE_CODE_OAUTH_SCOPES,
    ) && !input.sources.some((source) => source.values.CLAUDE_CODE_OAUTH_SCOPES)
  const conflict =
    providers.size > 1 ||
    methods.size > 1 ||
    (providers.size > 0 && preferences.usageMode === 'official')
  check.status =
    conflict || refreshMissing
      ? 'warn'
      : incomplete.length || (!methods.size && !providers.size)
        ? 'manual'
        : 'pass'
  check.summary = refreshMissing
    ? '配置了 OAuth 刷新变量，未发现对应 scopes'
    : conflict
      ? '存在多种认证配置或提供商选择，需核对实际选择'
      : !methods.size && !providers.size
        ? '未发现显式认证变量；登录方式需在客户端确认'
        : incomplete.length
          ? '部分认证配置无法静态确认'
          : '已列出显式认证来源，实际选择以客户端为准'
  if (!check.evidence.length)
    check.evidence.push({
      label: '读取边界',
      value: '未读取 Keychain、.credentials.json 或登录会话',
    })
  check.recommendation =
    '在 Claude Code 的 /status 查看 Login method、Login 或 Profile。API Key、Bearer Token、云平台与订阅登录有不同选择规则；组织策略、交互授权及应用托管会话会影响结果。按你的使用方式保留需要的配置。'
  return check
}

async function certificateMetadata(
  ctx: Context,
  value: string,
): Promise<{ value: string; state: 'ok' | 'review' | 'issue' }> {
  if (!value.trim() || /[$`\x00-\x1f]/.test(value))
    return { value: '路径为空或包含待展开表达式，需在实际终端确认', state: 'review' }
  const expanded = value.startsWith('~/') ? path.join(ctx.home, value.slice(2)) : value
  if (!path.isAbsolute(expanded))
    return { value: '相对路径的含义取决于客户端工作目录，需在该目录确认', state: 'review' }
  try {
    const stat = await fs.stat(expanded)
    if (!stat.isFile()) return { value: '路径未指向普通文件', state: 'issue' }
    if (!stat.size) return { value: '文件为空，无法提供证书或密钥', state: 'issue' }
    await fs.access(expanded, constants.R_OK)
    return { value: '文件存在且可读；未读取或解析内容', state: 'ok' }
  } catch {
    return { value: '文件缺失或当前进程无读取权限', state: 'issue' }
  }
}

export async function certificateConfiguration(
  ctx: Context,
  input: EnvironmentSources,
): Promise<CheckResult> {
  const check = checkBase(
    'ca-configuration',
    '自定义 CA 与客户端证书',
    '核对 CA 路径、证书存储选项与 mTLS 成对字段。只读取文件元数据，不读取证书或私钥内容。',
  )
  let issues = 0
  let review = 0
  let configured = 0
  const hasCert = input.sources.some((source) => source.values.CLAUDE_CODE_CLIENT_CERT)
  const hasKey = input.sources.some((source) => source.values.CLAUDE_CODE_CLIENT_KEY)
  if (hasCert !== hasKey) {
    issues++
    check.evidence.push({
      label: 'mTLS 成对配置',
      value: '只发现客户端证书或私钥其中一项；确认另一项的配置来源',
    })
  }
  const results = await Promise.all(
    input.sources.flatMap((source) =>
      certificateKeys
        .filter((key) => source.values[key])
        .map(async (key) => ({
          label: `${source.label} · ${key}`,
          result: await certificateMetadata(ctx, source.values[key]!),
        })),
    ),
  )
  for (const { label, result } of results) {
    configured++
    if (result.state === 'issue') issues++
    if (result.state === 'review') review++
    check.evidence.push({ label, value: result.value })
  }
  for (const source of input.sources) {
    const store = source.values.CLAUDE_CODE_CERT_STORE
    if (store !== undefined) {
      configured++
      const parts = store.split(',').map((part) => part.trim())
      const valid = parts.length > 0 && parts.every((part) => ['bundled', 'system'].includes(part))
      if (!valid) issues++
      check.evidence.push({
        label: `${source.label} · CLAUDE_CODE_CERT_STORE`,
        value: valid
          ? '已配置受支持的证书来源'
          : '包含空项或未知来源；当前文档支持 bundled / system',
      })
    }
    if (source.values.CLAUDE_CODE_CLIENT_KEY_PASSPHRASE)
      check.evidence.push({ label: `${source.label} · 私钥口令`, value: '已配置，值已隐藏' })
  }
  const incomplete = missingEvidence(input, certificateNames)
  check.evidence.push(...incomplete)
  check.status = issues ? 'warn' : review || incomplete.length ? 'manual' : 'pass'
  check.summary = issues
    ? `发现 ${issues} 项证书配置线索`
    : review
      ? '部分证书路径需要在实际会话复核'
      : incomplete.length
        ? '部分证书设置无法读取'
        : configured
          ? '已配置文件可读；证书有效性仍需客户端验证'
          : '未发现自定义证书配置，使用客户端默认信任设置'
  check.recommendation =
    '企业代理应使用可信 CA 和正确的客户端证书。文件可读不代表 PEM 格式、有效期或证书与私钥匹配；在 Claude Code 的 /status 和本机 debug 日志确认加载情况。操作系统信任存储的支持还取决于 Claude Code 的安装方式和运行时版本。'
  return check
}
