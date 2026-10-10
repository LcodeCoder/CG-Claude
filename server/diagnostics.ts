import { promises as fs } from 'node:fs'
import os from 'node:os'
import { isIP } from 'node:net'
import { randomUUID } from 'node:crypto'
import type {
  BrowserSnapshot,
  CheckResult,
  CheckStatus,
  NetworkInfo,
  Preferences,
  ScanReport,
  ScanRequest,
} from '../shared/types.js'
import { DIAGNOSTIC_CHECK_COUNT } from '../shared/types.js'
import { DIAGNOSTIC_RULESET } from '../shared/diagnostic-checks.js'
import type { DiagnosticCheckId } from '../shared/diagnostic-checks.js'
import { collectEnvironmentSources } from './environment-sources.js'
import { privacyConfiguration } from './privacy-diagnostics.js'
import { isEnabledEnvironmentFlag } from '../shared/environment-values.js'
import {
  proxyCompatibility,
  authenticationSources,
  certificateConfiguration,
} from './configuration-diagnostics.js'
import type { Context, CommandResult } from './context.js'
import { machineInfo } from './context.js'
import {
  readAllConfigs,
  configurationFingerprint,
  maskedAssignment,
  safeValue,
  endpointValue,
} from './safety.js'
import type { ConfigContent } from './safety.js'
import {
  shellAssignments,
  npmAssignments,
  gitAssignments,
  proxyKeys,
  parseClaude,
  claudeEnv,
  relevantEnvKeys,
} from './configs.js'

const officialSettings = 'https://code.claude.com/docs/en/settings'
const officialNetwork = 'https://code.claude.com/docs/en/network-config'
interface SystemSnapshot {
  proxy: CommandResult
  dns: CommandResult
  timezoneLink?: string
  interfaces: { name: string; family: string; address: string; internal: boolean }[]
}
async function systemSnapshot(ctx: Context): Promise<SystemSnapshot> {
  const unsupported: CommandResult = { ok: false, stdout: '', stderr: '此平台需手动核对' }
  let proxyTask: Promise<CommandResult> = Promise.resolve(unsupported)
  let dnsTask: Promise<CommandResult> = Promise.resolve(unsupported)
  if (ctx.platform === 'darwin') {
    proxyTask = ctx.run('scutil', ['--proxy'])
    dnsTask = ctx.run('scutil', ['--dns'])
  } else if (ctx.platform === 'win32') {
    proxyTask = ctx.run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" | Select-Object ProxyEnable,ProxyServer,AutoConfigURL | ConvertTo-Json -Compress',
    ])
    dnsTask = ctx.run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-DnsClientServerAddress | Select-Object -ExpandProperty ServerAddresses',
    ])
  } else if (ctx.platform === 'linux') {
    proxyTask = ctx.run('gsettings', ['get', 'org.gnome.system.proxy', 'mode'])
    dnsTask = fs.readFile('/etc/resolv.conf', 'utf8').then(
      (stdout) => ({ ok: true, stdout, stderr: '' }),
      () => unsupported,
    )
  }
  const results = await Promise.allSettled([proxyTask, dnsTask, fs.readlink('/etc/localtime')])
  const interfaces = Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? []).map((address) => ({
      name,
      family: address.family,
      address: address.address,
      internal: address.internal,
    })),
  )
  return {
    proxy: results[0]?.status === 'fulfilled' ? (results[0].value as CommandResult) : unsupported,
    dns: results[1]?.status === 'fulfilled' ? (results[1].value as CommandResult) : unsupported,
    timezoneLink: results[2]?.status === 'fulfilled' ? (results[2].value as string) : undefined,
    interfaces,
  }
}
export function parseSystemProxy(ctx: Context, result: CommandResult) {
  if (!result.ok)
    return { known: false, enabled: false, values: [] as { label: string; value: string }[] }
  if (ctx.platform === 'darwin') {
    const matches = [
      ...result.stdout.matchAll(
        /\b(HTTPEnable|HTTPSEnable|SOCKSEnable|ProxyAutoConfigEnable|ProxyAutoDiscoveryEnable)\s*:\s*(\d+)/g,
      ),
    ]
    return {
      known: matches.length > 0 || /<dictionary>/.test(result.stdout),
      enabled: matches.some((match) => match[2] === '1'),
      values: matches.map((match) => ({
        label: match[1]!,
        value: match[2] === '1' ? '已开启' : '已关闭',
      })),
    }
  }
  if (ctx.platform === 'win32') {
    try {
      const value = JSON.parse(result.stdout) as {
        ProxyEnable?: number
        ProxyServer?: string
        AutoConfigURL?: string
      }
      return {
        known: true,
        enabled: value.ProxyEnable === 1 || Boolean(value.AutoConfigURL),
        values: [
          { label: '系统代理', value: value.ProxyEnable === 1 ? '已开启' : '已关闭' },
          { label: '自动代理脚本', value: value.AutoConfigURL ? '已配置（地址已隐藏）' : '未配置' },
        ],
      }
    } catch {
      return { known: false, enabled: false, values: [] }
    }
  }
  return {
    known: /'?(none|manual|auto)'?/.test(result.stdout),
    enabled: !/none/.test(result.stdout),
    values: [{ label: 'GNOME 代理模式', value: safeValue(result.stdout) }],
  }
}
async function probeNetwork(ctx: Context): Promise<{ info?: NetworkInfo; error?: string }> {
  const result = await ctx.run(
    'curl',
    ['--silent', '--show-error', '--fail', '--max-time', '8', 'https://ipinfo.io/json'],
    9500,
  )
  if (!result.ok) return { error: '公网查询未完成，检查网络或 curl 是否可用。' }
  try {
    const value = JSON.parse(result.stdout) as Record<string, unknown>
    const ip = typeof value.ip === 'string' ? value.ip : ''
    if (!isIP(ip)) return { error: 'IP 查询服务没有返回有效地址。' }
    const pick = (key: string) =>
      typeof value[key] === 'string' ? safeValue(value[key], 150) : undefined
    return {
      info: {
        ip,
        country: pick('country'),
        city: pick('city'),
        org: pick('org'),
        timezone: pick('timezone'),
      },
    }
  } catch {
    return { error: '公网查询服务返回了无法解析的结果。' }
  }
}
function evidenceAssignments(files: ConfigContent[], matcher: (key: string) => boolean) {
  return files.flatMap((file) =>
    shellAssignments(file.content ?? '')
      .filter((item) => matcher(item.key))
      .map((item) => ({
        label: `${file.display}:${item.line + 1}`,
        value: `${item.key} = ${maskedAssignment(item.key, item.value)}${item.safe ? '' : '（复杂表达式；需手动处理）'}`,
      })),
  )
}
export function isPublicAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4)
    return !/^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(address)
  if (version === 6) {
    if (/^::ffff:/i.test(address)) return isPublicAddress(address.slice(7))
    return !/^(?:fc|fd|fe8|fe9|fea|feb|::1$|::$)/i.test(address)
  }
  return false
}
export function webrtcResult(
  browser: BrowserSnapshot | undefined,
  network: NetworkInfo | undefined,
  enabled: boolean,
): CheckResult {
  const base: CheckResult = {
    id: 'webrtc',
    category: 'browser',
    title: 'WebRTC 出口',
    description: '检查浏览器 ICE 候选地址，比较公网出口；隐藏候选不等于已证明无泄漏。',
    status: 'skipped',
    summary: '开启网络检测后检查',
    evidence: [],
    recommendation: '完整复核可打开 BrowserLeaks，浏览器扩展及网络策略会影响结果。',
    fixIds: [],
    source: 'system',
    sourceUrl: 'https://browserleaks.com/webrtc',
  }
  if (!enabled) return base
  if (!browser?.webrtc?.available)
    return { ...base, status: 'manual', summary: '浏览器未提供 WebRTC 检测能力' }
  const rtc = browser.webrtc
  const candidates = rtc.candidates.filter(
    (candidate) => isIP(candidate.address) || candidate.address.endsWith('.local'),
  )
  const publicCandidates = candidates.filter((candidate) => isPublicAddress(candidate.address))
  const expected = [browser.publicIp, network?.ip].filter(Boolean)
  const differs = publicCandidates.some((candidate) => !expected.includes(candidate.address))
  return {
    ...base,
    status: differs ? 'warn' : publicCandidates.length && expected.length ? 'pass' : 'manual',
    summary: differs
      ? '发现与 HTTP 出口不同的公网地址'
      : publicCandidates.length && expected.length
        ? '可见的公网候选与 HTTP 出口一致'
        : '未获取可比较的公网候选，需外部复核',
    evidence: candidates.map((candidate) => ({
      label: candidate.type === 'srflx' ? 'STUN 公网候选' : '本机候选',
      value: safeValue(candidate.address),
    })),
  }
}
export const TOTAL_CHECKS = DIAGNOSTIC_CHECK_COUNT
export async function runDiagnostics(
  ctx: Context,
  preferences: Preferences,
  request: ScanRequest,
  onProgress: (completed: number, total: number, current: string) => void = () => {},
  previous?: ScanReport,
): Promise<ScanReport> {
  const createdAt = new Date().toISOString()
  onProgress(0, TOTAL_CHECKS, '正在读取系统与配置文件')
  const results = await Promise.allSettled([
    readAllConfigs(ctx),
    systemSnapshot(ctx),
    ctx.run('claude', ['--version'], 3500),
    request.network ? probeNetwork(ctx) : Promise.resolve({}),
    ctx.run('npm', ['config', 'get', 'proxy']),
    ctx.run('npm', ['config', 'get', 'https-proxy']),
    ctx.run('git', ['config', '--global', '--get', 'http.proxy']),
    ctx.run('git', ['config', '--global', '--get', 'https.proxy']),
  ])
  if (results[0]?.status !== 'fulfilled') throw new Error('本机配置无法读取')
  const files = results[0].value as ConfigContent[]
  const environment = collectEnvironmentSources(ctx, files)
  if (results[1]?.status !== 'fulfilled') throw new Error('系统信息无法读取')
  const system = results[1].value as SystemSnapshot
  const cli =
    results[2]?.status === 'fulfilled'
      ? (results[2].value as CommandResult)
      : { ok: false, stdout: '', stderr: '' }
  const probe =
    results[3]?.status === 'fulfilled'
      ? (results[3].value as { info?: NetworkInfo; error?: string })
      : { error: '网络检测未完成' }
  const machine = machineInfo(ctx)
  const browser = request.browser
  const checks: CheckResult[] = []
  function add(value: CheckResult) {
    checks.push(value)
    onProgress(checks.length, TOTAL_CHECKS, value.title)
  }
  const base = (
    id: DiagnosticCheckId,
    category: CheckResult['category'],
    title: string,
    description: string,
  ): CheckResult => ({
    id,
    category,
    title,
    description,
    status: 'pass',
    summary: '',
    evidence: [],
    recommendation: '无需修改。',
    fixIds: [],
    source: 'system',
  })
  const shellFiles = files.filter((file) =>
    /^(?:\.zsh|\.zprofile|\.bash|\.profile)/.test(file.relative),
  )
  const shellUnreadable = shellFiles.filter((file) => !file.editable)
  const runtimeProxy = Object.entries(ctx.env).filter(
    ([key, value]) => proxyKeys.test(key) && value,
  )
  const runtimeEndpoint = ctx.env.ANTHROPIC_BASE_URL
  const proxy = parseSystemProxy(ctx, system.proxy)
  const expectedTimezone = preferences.expectedTimezone
  let zoneMatches = true
  if (expectedTimezone) {
    try {
      zoneMatches =
        new Intl.DateTimeFormat('en', { timeZone: expectedTimezone }).resolvedOptions().timeZone ===
        machine.timezone
    } catch {
      zoneMatches = false
    }
  }
  add({
    ...base('timezone', 'system', '系统时区', '读取实际时区并与自定义期望值核对。'),
    status: zoneMatches ? 'pass' : 'warn',
    summary: zoneMatches ? machine.timezone : '系统时区与期望值不同',
    evidence: [
      { label: '系统时区', value: machine.timezone },
      ...(system.timezoneLink
        ? [{ label: '时区文件', value: safeValue(system.timezoneLink) }]
        : []),
      { label: '期望时区', value: expectedTimezone || '未指定，按实际环境检查' },
    ],
    recommendation: zoneMatches
      ? '无需修改。时区本身不代表服务可用地区。'
      : '在系统日期与时间设置中核对实际时区，或调整工具的期望值。',
  })
  add({
    ...base(
      'system-proxy',
      'system',
      '系统代理',
      '根据所选网络模式核对 HTTP、SOCKS 与自动代理设置。',
    ),
    status: !proxy.known
      ? 'manual'
      : proxy.enabled && preferences.routeMode === 'tun'
        ? 'warn'
        : 'pass',
    summary: !proxy.known
      ? '此系统需手动确认代理设置'
      : proxy.enabled
        ? preferences.routeMode === 'tun'
          ? 'TUN 预期下系统代理仍开启'
          : '已启用系统代理'
        : '系统代理已关闭',
    evidence: proxy.values,
    recommendation:
      preferences.routeMode === 'tun' && proxy.enabled
        ? '确认 TUN 能正常连接后，在代理客户端关闭系统代理，避免两套配置叠加。'
        : '系统代理是合法的网络方式；按当前模式保留或调整。',
    sourceUrl: officialNetwork,
  })
  const virtualInterfaces = [
    ...new Set(
      system.interfaces
        .filter((item) => /(?:utun|tun|tap|wintun|wireguard|wg\d)/i.test(item.name))
        .map((item) => item.name),
    ),
  ]
  add({
    ...base('tun', 'system', '虚拟网络接口', '观察 TUN 类接口；接口存在无法证明流量已全部接管。'),
    status: preferences.routeMode === 'tun' ? 'manual' : 'pass',
    summary: virtualInterfaces.length
      ? `发现 ${virtualInterfaces.length} 个虚拟接口`
      : preferences.routeMode === 'tun'
        ? '尚未观察到 TUN 类接口'
        : '当前模式不要求 TUN',
    evidence: virtualInterfaces.map((value) => ({ label: '接口', value })),
    recommendation:
      preferences.routeMode === 'tun'
        ? '在代理客户端确认 TUN、服务模式和路由配置，再通过公网出口检测验证。'
        : '按你实际使用的网络方式配置。',
  })
  const resolverAddresses = [
    ...new Set(
      [...system.dns.stdout.matchAll(/(?:nameserver(?:\[\d+\])?\s*:?\s*)([\da-f:.]+)/gi)].map(
        (match) => match[1]!,
      ),
    ),
  ]
  if (ctx.platform === 'win32' && system.dns.ok)
    resolverAddresses.push(
      ...system.dns.stdout.split(/\r?\n/).filter((value) => isIP(value.trim())),
    )
  add({
    ...base(
      'dns',
      'network',
      'DNS 解析设置',
      '读取本机解析器配置；实际 DNS 出口需要外部泄漏测试。',
    ),
    status: 'manual',
    summary: resolverAddresses.length
      ? '已读取解析器，实际出口待确认'
      : '请通过外部测试核对实际 DNS 出口',
    evidence: resolverAddresses.slice(0, 8).map((value) => ({ label: '本机解析器', value })),
    recommendation:
      '打开 DNS 泄漏测试，核对实际解析器及代理 DNS 接管情况；本机地址不足以判断地理泄漏。',
    sourceUrl: 'https://browserleaks.com/dns',
  })
  const ipv6 = system.interfaces.filter((item) => item.family === 'IPv6' && !item.internal)
  add({
    ...base('ipv6', 'network', 'IPv6 路由覆盖', '检查非回环 IPv6 地址；网络接口不能证明代理覆盖。'),
    status: ipv6.length ? 'manual' : 'pass',
    summary: ipv6.length ? '存在 IPv6 接口，需确认代理覆盖' : '未发现非回环 IPv6 地址',
    evidence: ipv6
      .slice(0, 5)
      .map((item) => ({ label: item.name, value: safeValue(item.address) })),
    recommendation: '若代理仅覆盖 IPv4，核对 IPv6 路由。关闭 IPv6 应由你根据网络需要决定。',
  })
  add({
    ...base(
      'runtime-proxy',
      'terminal',
      '当前进程代理变量',
      '检测此工具启动时继承的环境；修改文件不会改变已打开的终端。',
    ),
    status: runtimeProxy.length ? (preferences.routeMode === 'tun' ? 'warn' : 'pass') : 'pass',
    summary: runtimeProxy.length
      ? `读取到 ${runtimeProxy.length} 个代理变量`
      : '未发现进程代理变量',
    evidence: runtimeProxy.map(([key, value]) => ({
      label: key,
      value: maskedAssignment(key, value!),
    })),
    recommendation: runtimeProxy.length
      ? '核对变量是否符合当前网络模式。配置修改后，关闭并重新启动终端和本工具使其生效。'
      : '无需修改。',
    source: 'official',
    sourceUrl: officialNetwork,
  })
  const shellProxy = evidenceAssignments(shellFiles, (key) => proxyKeys.test(key))
  const shellHasSafeProxy = shellFiles.some((file) =>
    shellAssignments(file.content ?? '').some((item) => proxyKeys.test(item.key) && item.safe),
  )
  add({
    ...base(
      'shell-proxy',
      'terminal',
      'Shell 持久代理配置',
      '检查 Zsh、Bash 和通用启动配置中的直接变量赋值。',
    ),
    status: shellUnreadable.length
      ? 'manual'
      : shellProxy.length && preferences.routeMode === 'tun'
        ? 'warn'
        : 'pass',
    summary: shellUnreadable.length
      ? '部分配置需手动读取'
      : shellProxy.length
        ? `发现 ${shellProxy.length} 项持久代理配置`
        : '未发现直接的代理赋值',
    evidence: [
      ...shellProxy,
      ...shellUnreadable.map((file) => ({ label: file.display, value: file.error! })),
    ],
    fixIds: shellHasSafeProxy && preferences.routeMode === 'tun' ? ['shell-proxy'] : [],
    recommendation:
      'TUN 模式可按需移除这些配置；系统代理或自定义模式下可保留。动态加载、函数与复杂表达式需手动检查。',
  })
  const npmFile = files.find((file) => file.relative === '.npmrc')!
  const npmProxy = npmAssignments(npmFile.content ?? '')
  add({
    ...base('npm-proxy', 'terminal', 'npm 用户代理', '检查 ~/.npmrc 的 proxy 与 https-proxy。'),
    status: !npmFile.editable
      ? 'manual'
      : npmProxy.length && preferences.routeMode === 'tun'
        ? 'warn'
        : 'pass',
    summary: !npmFile.editable
      ? npmFile.error!
      : npmProxy.length
        ? `发现 ${npmProxy.length} 项 npm 代理`
        : '未发现 npm 用户代理',
    evidence: npmProxy.map((item) => ({ label: item.key, value: endpointValue(item.value) })),
    fixIds:
      npmFile.editable && npmProxy.length && preferences.routeMode === 'tun' ? ['npm-proxy'] : [],
    recommendation: '仅检查用户级文件；项目或全局 npm 配置可在对应项目另行核对。',
  })
  const gitFiles = files.filter(
    (file) => file.relative === '.gitconfig' || file.relative === '.config/git/config',
  )
  const gitProxy = gitFiles.flatMap((file) =>
    gitAssignments(file.content ?? '').map((item) => ({ ...item, file })),
  )
  const gitIncludes = gitFiles.some((file) =>
    /^\s*\[include(?:If)?(?:\s|\])/im.test(file.content ?? ''),
  )
  add({
    ...base(
      'git-proxy',
      'terminal',
      'Git 用户代理',
      '检查全局 Git 文件中的 HTTP(S) 代理，保留其他 Git 设置。',
    ),
    status:
      gitFiles.some((file) => !file.editable) || gitIncludes
        ? 'manual'
        : gitProxy.length && preferences.routeMode === 'tun'
          ? 'warn'
          : 'pass',
    summary: gitProxy.length
      ? `发现 ${gitProxy.length} 项 Git 代理${gitIncludes ? '，另有 include 配置' : ''}`
      : gitIncludes
        ? '存在 include 配置，需另行检查'
        : '未发现直接的 Git 用户代理',
    evidence: gitProxy.map((item) => ({
      label: `${item.file.display} · ${item.key}`,
      value: endpointValue(item.value),
    })),
    fixIds:
      gitProxy.some((item) => item.safe && item.file.editable) && preferences.routeMode === 'tun'
        ? ['git-proxy']
        : [],
    recommendation:
      '项目配置和 include 文件不在自动修改范围，使用 git config --show-origin --get-regexp proxy 在相关项目核对。',
  })
  const providers = Object.entries(ctx.env).filter(
    ([key, value]) =>
      /^CLAUDE_CODE_USE_(?:BEDROCK|VERTEX|FOUNDRY|ANTHROPIC_AWS)$/.test(key) &&
      isEnabledEnvironmentFlag(value),
  )
  add({
    ...base(
      'runtime-endpoint',
      'terminal',
      '当前进程 API 地址',
      '读取 ANTHROPIC_BASE_URL 与官方云平台选择变量，隐藏凭据。',
    ),
    status:
      runtimeEndpoint && preferences.usageMode === 'official'
        ? 'warn'
        : providers.length && preferences.usageMode === 'official'
          ? 'warn'
          : 'pass',
    summary: runtimeEndpoint
      ? '当前进程使用自定义 API 地址'
      : providers.length
        ? '当前进程启用了云平台提供商'
        : '未发现 API 地址覆盖',
    evidence: [
      ...(runtimeEndpoint
        ? [{ label: 'ANTHROPIC_BASE_URL', value: endpointValue(runtimeEndpoint) }]
        : []),
      ...providers.map(([key]) => ({ label: key, value: '已启用' })),
    ],
    recommendation:
      '自定义 API、Bedrock、Vertex 都可能是有意配置。选择正确的使用方式；清理文件后要重新启动终端。',
    source: 'official',
    sourceUrl: officialSettings,
  })
  const shellEndpoint = evidenceAssignments(shellFiles, (key) => key === 'ANTHROPIC_BASE_URL')
  const shellHasSafeEndpoint = shellFiles.some((file) =>
    shellAssignments(file.content ?? '').some(
      (item) => item.key === 'ANTHROPIC_BASE_URL' && item.safe,
    ),
  )
  add({
    ...base(
      'shell-endpoint',
      'terminal',
      'Shell API 地址覆盖',
      '检查启动文件里的 ANTHROPIC_BASE_URL，凭据与查询参数不展示。',
    ),
    status: shellUnreadable.length
      ? 'manual'
      : shellEndpoint.length && preferences.usageMode === 'official'
        ? 'warn'
        : 'pass',
    summary: shellEndpoint.length
      ? `发现 ${shellEndpoint.length} 项自定义 API 地址`
      : '未发现直接的 API 地址赋值',
    evidence: shellEndpoint,
    fixIds: shellHasSafeEndpoint && preferences.usageMode === 'official' ? ['shell-endpoint'] : [],
    recommendation: '若准备使用官方默认 API，可移除地址覆盖；自定义服务用户应保留。',
    source: 'official',
    sourceUrl: officialSettings,
  })
  const claudeFile = files.find((file) => file.relative === '.claude/settings.json')!
  let config: Record<string, unknown> = {}
  let configError = claudeFile.error
  try {
    if (!configError) config = parseClaude(claudeFile.content)
  } catch {
    configError = 'JSON 格式或 env 类型错误，请先手动修正'
  }
  const env = claudeEnv(config)
  const filteredEnv = Object.entries(env).filter(([key]) => relevantEnvKeys.test(key))
  add({
    ...base(
      'claude-settings',
      'claude',
      'Claude Code 配置文件',
      '验证 ~/.claude/settings.json 的 JSON 结构。',
    ),
    status: configError ? 'fail' : 'pass',
    summary:
      configError || (claudeFile.exists ? '配置结构可读取' : '尚无全局设置，客户端使用默认值'),
    evidence: [
      { label: '配置位置', value: claudeFile.display },
      ...filteredEnv
        .filter(([key]) => /TOKEN|API_KEY/.test(key))
        .map(([key]) => ({ label: key, value: '[已配置；密钥已隐藏]' })),
    ],
    recommendation: configError
      ? '先修复 JSON 格式或文件权限，工具会保留原文件。'
      : '项目级、托管与启动参数可能覆盖全局设置，可在 Claude Code /config 中复核。',
    source: 'official',
    sourceUrl: officialSettings,
  })
  const configuredEndpoint = env.ANTHROPIC_BASE_URL
  add({
    ...base(
      'claude-endpoint',
      'claude',
      'Claude Code API 地址',
      '检查 settings.json 的地址覆盖，按所选提供商判断。',
    ),
    status: configError
      ? 'manual'
      : configuredEndpoint && preferences.usageMode === 'official'
        ? 'warn'
        : 'pass',
    summary: configuredEndpoint
      ? '已设置自定义 API 地址'
      : configError
        ? '配置需修正后检测'
        : '使用客户端默认 API 地址',
    evidence: configuredEndpoint
      ? [{ label: 'env.ANTHROPIC_BASE_URL', value: endpointValue(String(configuredEndpoint)) }]
      : [],
    fixIds:
      !configError && configuredEndpoint && preferences.usageMode === 'official'
        ? ['claude-endpoint']
        : [],
    recommendation: '恢复默认地址只移除这一项，保留 API Key、模型、权限、Hooks 和其他设置。',
    source: 'official',
    sourceUrl: officialSettings,
  })
  add(privacyConfiguration(environment, preferences))
  add({
    ...base(
      'claude-cli',
      'claude',
      'Claude Code 安装',
      '只执行 claude --version，读取已安装客户端版本。',
    ),
    status: cli.ok ? 'pass' : 'manual',
    summary: cli.ok
      ? safeValue(cli.stdout.split(/\r?\n/)[0] || '已安装', 100)
      : '未检测到可执行的 Claude Code',
    evidence: [{ label: 'Node.js', value: machine.nodeVersion }],
    recommendation: cli.ok
      ? '如遇版本问题，使用客户端官方更新方式。'
      : '检查 Claude Code 是否已安装并加入 PATH；浏览器使用者可跳过。',
    source: 'official',
    sourceUrl: 'https://code.claude.com/docs/en/setup',
  })
  add({
    ...base(
      'browser-timezone',
      'browser',
      '浏览器与本机时区',
      '核对当前浏览器 Intl 时区与本机进程时区。',
    ),
    status: !browser ? 'skipped' : browser.timezone === machine.timezone ? 'pass' : 'warn',
    summary: !browser
      ? '从浏览器界面运行后检测'
      : browser.timezone === machine.timezone
        ? '浏览器与本机时区一致'
        : '浏览器与本机时区不同',
    evidence: browser
      ? [
          { label: '浏览器时区', value: safeValue(browser.timezone) },
          { label: '本机时区', value: machine.timezone },
          { label: '浏览器语言', value: safeValue(browser.language) },
        ]
      : [],
    recommendation:
      '时区差异可能来自 TZ 变量、浏览器设置或扩展；按真实环境核对。语言不作为问题判定。',
  })
  const network = probe.info
    ? {
        ...probe.info,
        browserIp: browser?.publicIp && isIP(browser.publicIp) ? browser.publicIp : undefined,
      }
    : undefined
  const countryMismatch =
    network?.country &&
    preferences.expectedCountry &&
    network.country !== preferences.expectedCountry
  const changedFields =
    network && previous?.network
      ? (['ip', 'country', 'city', 'org'] as const).filter(
          (key) =>
            network[key] && previous.network?.[key] && network[key] !== previous.network[key],
        )
      : []
  const changed = changedFields.length > 0
  add({
    ...base(
      'public-ip',
      'network',
      '公网出口与运营商',
      '经终端 curl 查询 ipinfo.io，读取出口地址及公开网络信息。',
    ),
    status: !request.network
      ? 'skipped'
      : !network
        ? 'manual'
        : countryMismatch || changed
          ? 'warn'
          : 'pass',
    summary: !request.network
      ? '按需开启公网检测'
      : !network
        ? probe.error || '公网出口未获取'
        : countryMismatch
          ? '出口地区与期望值不同'
          : changed
            ? '出口 IP、地区或网络组织与上次检测不同'
            : '已读取本机公网出口',
    evidence: network
      ? [
          { label: '公网 IP', value: network.ip },
          {
            label: '地区',
            value: [network.country, network.city].filter(Boolean).join(' · ') || '服务未提供',
          },
          { label: '网络组织', value: network.org || '服务未提供' },
          ...(changed
            ? [
                { label: '上次出口', value: previous!.network!.ip },
                {
                  label: '上次地区',
                  value:
                    [previous!.network!.country, previous!.network!.city]
                      .filter(Boolean)
                      .join(' · ') || '服务未提供',
                },
                { label: '上次网络组织', value: previous!.network!.org || '服务未提供' },
              ]
            : []),
        ]
      : [],
    recommendation:
      '运营商名称不能可靠证明住宅/机房类型；工具不据此推算封号概率。出口变化时核对路由。',
    sourceUrl: 'https://ipinfo.io',
  })
  const validBrowserIp = browser?.publicIp && isIP(browser.publicIp) ? browser.publicIp : undefined
  add({
    ...base(
      'route-consistency',
      'network',
      '浏览器与终端出口',
      '比较浏览器 HTTPS 查询与终端 curl 查询的公网地址。',
    ),
    status: !request.network
      ? 'skipped'
      : !network?.ip || !validBrowserIp
        ? 'manual'
        : network.ip === validBrowserIp
          ? 'pass'
          : 'warn',
    summary: !request.network
      ? '按需开启公网检测'
      : !network?.ip || !validBrowserIp
        ? '有一侧出口未获取，暂时无法比较'
        : network.ip === validBrowserIp
          ? '浏览器与终端出口一致'
          : '浏览器与终端使用不同出口',
    evidence: [
      ...(network ? [{ label: '终端出口', value: network.ip }] : []),
      ...(validBrowserIp ? [{ label: '浏览器出口', value: validBrowserIp }] : []),
      ...(browser?.publicIpError
        ? [{ label: '浏览器查询', value: safeValue(browser.publicIpError) }]
        : []),
    ],
    recommendation: '不同代理、IPv4/IPv6、轮换出口或分流会造成差异。结合实际网络方式核对。',
  })
  add(webrtcResult(browser, network, request.network))
  const commandResults = (start: number) =>
    results
      .slice(start, start + 2)
      .map((result) =>
        result.status === 'fulfilled'
          ? (result.value as CommandResult)
          : { ok: false, stdout: '', stderr: '读取失败' },
      )
  for (const [tool, start] of [
    ['npm', 4],
    ['git', 6],
  ] as const) {
    const values = commandResults(start)
    const active = values.filter(
      (result) => result.ok && result.stdout && !['null', 'undefined'].includes(result.stdout),
    )
    add({
      ...base(
        `${tool}-effective-proxy`,
        'terminal',
        `${tool} 实际生效代理`,
        '调用只读配置命令，补充文件扫描无法覆盖的环境、include 和优先级。',
      ),
      status: active.length
        ? preferences.routeMode === 'tun'
          ? 'warn'
          : 'manual'
        : values.some((result) => result.ok)
          ? 'pass'
          : 'manual',
      summary: active.length
        ? '命令读取到生效的代理配置'
        : values.some((result) => result.ok)
          ? '未读取到生效代理'
          : '命令不可用或未提供配置，需在新终端复核',
      evidence: active.map((result, index) => ({
        label: index === 0 ? 'HTTP / 第一项' : 'HTTPS / 第二项',
        value: endpointValue(result.stdout),
      })),
      recommendation:
        '复核 npm config get proxy / https-proxy 或 git config --global --get http.proxy / https.proxy。环境变量和其他层级不会被本机文件修复清空。',
    })
  }
  add({
    ...base('timezone-env', 'system', '终端时区覆盖', '核对 TZ 环境变量是否覆盖系统时区。'),
    status: ctx.env.TZ ? 'manual' : 'pass',
    summary: ctx.env.TZ ? '存在 TZ 环境覆盖，需与系统时区对照' : '未检测到 TZ 环境覆盖',
    evidence: ctx.env.TZ ? [{ label: 'TZ', value: safeValue(ctx.env.TZ) }] : [],
    recommendation: '原文要求核对系统、终端和浏览器的一致性；在启动文件与系统设置中检查实际时区。',
  })
  add({
    ...base(
      'config-directory',
      'claude',
      'Claude 配置目录覆盖',
      '检测 CLAUDE_CONFIG_DIR 是否指向默认目录之外。',
    ),
    status: ctx.env.CLAUDE_CONFIG_DIR ? 'manual' : 'pass',
    summary: ctx.env.CLAUDE_CONFIG_DIR
      ? '设置了自定义配置目录，默认目录检测可能不完整'
      : '未检测到自定义配置目录覆盖',
    evidence: ctx.env.CLAUDE_CONFIG_DIR
      ? [{ label: 'CLAUDE_CONFIG_DIR', value: '[已设置；请在终端核对路径]' }]
      : [],
    recommendation:
      '本机修复仅修改默认目录；自定义目录请在项目扫描或编辑器中核对，不自动改写外部路径。',
    source: 'official',
    sourceUrl: officialSettings,
  })
  const disabledNodeTls = environment.sources.filter(
    (source) => source.values.NODE_TLS_REJECT_UNAUTHORIZED === '0',
  )
  const disabledNpmTls = /^\s*strict-ssl\s*=\s*(?:false|0)\s*(?:[#;].*)?$/im.test(
    npmFile?.content ?? '',
  )
  const tlsIncomplete =
    environment.unavailable.length > 0 ||
    environment.sources.some((source) =>
      source.unresolved.includes('NODE_TLS_REJECT_UNAUTHORIZED'),
    ) ||
    Boolean(npmFile && !npmFile.editable)
  const tlsDisabled = disabledNodeTls.length > 0 || disabledNpmTls
  add({
    ...base(
      'tls-verification',
      'terminal',
      'TLS 证书验证',
      '检查当前进程、用户配置和 npm 是否关闭证书验证。',
    ),
    status: tlsDisabled ? 'fail' : tlsIncomplete ? 'manual' : 'pass',
    fixIds: npmFile?.editable && disabledNpmTls ? ['npm-tls'] : [],
    summary: tlsDisabled
      ? '检测到关闭 TLS 证书验证的配置'
      : tlsIncomplete
        ? '部分 TLS 配置无法静态确认'
        : '未在已读取配置中发现关闭验证',
    evidence: [
      ...disabledNodeTls.map((source) => ({
        label: `${source.label} · NODE_TLS_REJECT_UNAUTHORIZED`,
        value: '0（关闭验证）',
      })),
      {
        label: '~/.npmrc · strict-ssl',
        value: disabledNpmTls
          ? 'false / 0（关闭验证）'
          : npmFile?.editable
            ? '未发现关闭验证'
            : '无法读取',
      },
      ...(tlsIncomplete
        ? [{ label: '检查范围', value: '部分文件未能读取或存在动态表达式，需在实际会话确认' }]
        : []),
    ],
    recommendation:
      '按证据中的来源恢复证书验证。企业代理需要配置可信 CA，可使用 NODE_EXTRA_CA_CERTS；在“自定义 CA 与客户端证书”检查中复核路径。',
    source: 'official',
    sourceUrl: 'https://nodejs.org/api/cli.html',
  })
  add(proxyCompatibility(environment))
  add(authenticationSources(environment, preferences))
  add(await certificateConfiguration(environment))
  const counts: Record<CheckStatus, number> = { pass: 0, warn: 0, fail: 0, manual: 0, skipped: 0 }
  checks.forEach((check) => {
    counts[check.status]++
  })
  return {
    id: randomUUID(),
    ruleset: DIAGNOSTIC_RULESET,
    createdAt,
    completedAt: new Date().toISOString(),
    machine,
    preferences,
    checks,
    configurationFingerprint: configurationFingerprint(files),
    network,
    networkEnabled: request.network,
    counts,
  }
}

export async function runRepeatedDiagnostics(
  ctx: Context,
  preferences: Preferences,
  request: ScanRequest,
  onProgress: (completed: number, total: number, current: string) => void = () => {},
  previous?: ScanReport,
): Promise<ScanReport> {
  const passes = request.passes ?? 1
  const reports: ScanReport[] = []
  for (let round = 0; round < passes; round++) {
    const report = await runDiagnostics(
      ctx,
      preferences,
      request,
      (completed, total, current) =>
        onProgress(
          round * total + completed,
          passes * total,
          passes > 1 ? `第 ${round + 1} / ${passes} 遍 · ${current}` : current,
        ),
      previous,
    )
    reports.push(report)
  }
  const last = reports[reports.length - 1]!
  const unstableCheckIds = last.checks
    .filter(
      (check) =>
        new Set(
          reports.map((report) => {
            const item = report.checks.find((value) => value.id === check.id)
            return JSON.stringify([item?.status, item?.summary, item?.evidence])
          }),
        ).size > 1,
    )
    .map((check) => check.id)
  last.createdAt = reports[0]!.createdAt
  last.verification = { passes, unstableCheckIds }
  return last
}
