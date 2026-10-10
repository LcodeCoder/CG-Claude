import { afterEach, beforeEach, expect, test } from 'vitest'
import { defaultPreferences } from '../shared/types'
import {
  runDiagnostics,
  parseSystemProxy,
  webrtcResult,
  isPublicAddress,
  TOTAL_CHECKS,
} from '../server/diagnostics'
import { endpointValue, safeValue } from '../server/safety'
import { redactReport, markdownReport, reportExportName } from '../server/report'
import { fixture } from './fixtures'
let data: Awaited<ReturnType<typeof fixture>>
beforeEach(async () => {
  data = await fixture()
})
afterEach(async () => {
  await data.cleanup()
})
test('local checks do not make outbound requests and mark unobserved network paths honestly', async () => {
  const commands: string[] = []
  const original = data.ctx.run
  data.ctx.run = async (command, args) => {
    commands.push(command)
    return original(command, args)
  }
  const report = await runDiagnostics(data.ctx, defaultPreferences, {
    network: false,
    browser: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: 'zh-CN',
      platform: 'test',
    },
  })
  expect(commands).not.toContain('curl')
  expect(report.checks).toHaveLength(TOTAL_CHECKS)
  expect(report.checks.find((check) => check.id === 'public-ip')?.status).toBe('skipped')
  expect(report.checks.find((check) => check.id === 'dns')?.status).toBe('manual')
  expect(report.checks.find((check) => check.id === 'webrtc')?.status).toBe('skipped')
  expect(report.checks.find((check) => check.id === 'browser-timezone')?.status).toBe('pass')
  expect(Object.values(report.counts).reduce((sum, count) => sum + count, 0)).toBe(TOTAL_CHECKS)
})
test('proxy configurations remain valid in system proxy mode', async () => {
  await data.write('.zshrc', 'export HTTPS_PROXY=http://localhost:7890\n')
  data.ctx.env.HTTPS_PROXY = 'http://localhost:7890'
  const report = await runDiagnostics(data.ctx, defaultPreferences, { network: false })
  expect(report.checks.find((check) => check.id === 'shell-proxy')?.status).toBe('pass')
  expect(report.checks.find((check) => check.id === 'runtime-proxy')?.status).toBe('pass')
  expect(report.checks.find((check) => check.id === 'shell-proxy')?.fixIds).toHaveLength(0)
})
test('reports inherited process variables separately from persistent file repairs', async () => {
  data.ctx.env.HTTPS_PROXY = 'http://user:private-token@localhost:7890'
  const report = await runDiagnostics(
    data.ctx,
    { ...defaultPreferences, routeMode: 'tun' },
    { network: false },
  )
  expect(report.checks.find((check) => check.id === 'runtime-proxy')?.status).toBe('warn')
  expect(report.checks.find((check) => check.id === 'shell-proxy')?.status).toBe('pass')
  expect(JSON.stringify(report)).not.toContain('private-token')
})
test('custom providers and keys are retained and do not receive an official-endpoint repair recommendation', async () => {
  await data.write(
    '.claude/settings.json',
    JSON.stringify({
      env: {
        ANTHROPIC_BASE_URL: 'https://gateway.example/my/private/key?token=super-secret',
        ANTHROPIC_API_KEY: 'sk-ant-my-secret',
      },
    }),
  )
  const report = await runDiagnostics(
    data.ctx,
    { ...defaultPreferences, usageMode: 'custom' },
    { network: false },
  )
  const endpoint = report.checks.find((check) => check.id === 'claude-endpoint')
  expect(endpoint?.status).toBe('pass')
  expect(endpoint?.fixIds).toHaveLength(0)
  const visible = JSON.stringify(report)
  expect(visible).not.toContain('super-secret')
  expect(visible).not.toContain('sk-ant-my-secret')
  expect(visible).not.toContain('/my/private/key')
})
test('disabled macOS proxies may omit enable flags', () => {
  const value = parseSystemProxy(data.ctx, { ok: true, stdout: '<dictionary> {\n}', stderr: '' })
  expect(value.known).toBe(true)
  expect(value.enabled).toBe(false)
})
test('detects active PAC and Windows proxy configuration', () => {
  expect(
    parseSystemProxy(data.ctx, { ok: true, stdout: 'ProxyAutoConfigEnable : 1', stderr: '' })
      .enabled,
  ).toBe(true)
  expect(
    parseSystemProxy(
      { ...data.ctx, platform: 'win32' },
      { ok: true, stdout: '{"ProxyEnable":1,"ProxyServer":"secret"}', stderr: '' },
    ).enabled,
  ).toBe(true)
})
test('does not call hidden WebRTC candidates safe', () => {
  const result = webrtcResult(
    {
      timezone: 'UTC',
      language: 'en',
      platform: 'test',
      publicIp: '8.8.8.8',
      webrtc: {
        available: true,
        tested: true,
        timedOut: true,
        candidates: [{ address: 'host.local', type: 'host' }],
      },
    },
    { ip: '8.8.8.8' },
    true,
  )
  expect(result.status).toBe('manual')
})
test('flags a distinct public WebRTC candidate', () => {
  const result = webrtcResult(
    {
      timezone: 'UTC',
      language: 'en',
      platform: 'test',
      publicIp: '8.8.8.8',
      webrtc: {
        available: true,
        tested: true,
        timedOut: false,
        candidates: [{ address: '1.1.1.1', type: 'srflx' }],
      },
    },
    { ip: '8.8.8.8' },
    true,
  )
  expect(result.status).toBe('warn')
})
test('correctly classifies private and IPv4-mapped loopback addresses', () => {
  for (const address of [
    '192.168.1.10',
    '172.20.0.1',
    '::1',
    'fe80::1',
    'fc00::1',
    '::ffff:127.0.0.1',
    'name.local',
  ])
    expect(isPublicAddress(address)).toBe(false)
  expect(isPublicAddress('8.8.8.8')).toBe(true)
})
test('masks URL credentials, query keys, path details and token signatures', () => {
  expect(endpointValue('https://user:pass@host.test/private-key?token=another-secret')).not.toMatch(
    /pass|private-key|another-secret/,
  )
  expect(safeValue('sk-ant-secret-value')).toBe('[密钥已隐藏]')
})
test('public network failures stay manual rather than passing', async () => {
  const original = data.ctx.run
  data.ctx.run = async (command, args) =>
    command === 'curl' ? { ok: false, stdout: '', stderr: 'test error' } : original(command, args)
  const report = await runDiagnostics(data.ctx, defaultPreferences, { network: true })
  expect(report.checks.find((check) => check.id === 'public-ip')?.status).toBe('manual')
})
test('report export masks host identity and IPv4 addresses', async () => {
  const report = await runDiagnostics(data.ctx, defaultPreferences, {
    network: true,
    browser: { timezone: 'UTC', language: 'en', platform: 'test', publicIp: '8.8.8.8' },
  })
  const redacted = redactReport(report)
  const json = JSON.stringify(redacted)
  expect(json).not.toContain('8.8.8.8')
  expect(json).not.toContain('Guard-Test-Mac')
  expect(markdownReport(redacted)).toContain('CG Claude 环境检测报告')
  expect(report.network?.ip).toBe('8.8.8.8')
})

test('performs three independent passes and flags changed network evidence', async () => {
  const { runRepeatedDiagnostics } = await import('../server/diagnostics')
  let probes = 0
  const original = data.ctx.run
  data.ctx.run = async (command, args) =>
    command === 'curl'
      ? {
          ok: true,
          stderr: '',
          stdout: JSON.stringify({
            ip: ++probes === 2 ? '1.1.1.1' : '8.8.8.8',
            country: 'US',
            city: 'Fixture',
            org: 'Fixture',
          }),
        }
      : original(command, args)
  const report = await runRepeatedDiagnostics(data.ctx, defaultPreferences, {
    network: true,
    passes: 3,
  })
  expect(probes).toBe(3)
  expect(report.verification?.passes).toBe(3)
  expect(report.verification?.unstableCheckIds).toContain('public-ip')
})

test('flags country, city and organization changes even when the public IP is unchanged', async () => {
  const previous = await runDiagnostics(data.ctx, defaultPreferences, { network: true })
  previous.network!.city = 'Previous city'
  const current = await runDiagnostics(
    data.ctx,
    defaultPreferences,
    { network: true },
    undefined,
    previous,
  )
  const check = current.checks.find((item) => item.id === 'public-ip')!
  expect(check.status).toBe('warn')
  expect(check.evidence.find((item) => item.label === '上次地区')?.value).toContain('Previous city')
})
test('detects an inline-commented npm TLS override and offers a repair', async () => {
  await data.write('.npmrc', 'strict-ssl=false # temporary workaround\n')
  const report = await runDiagnostics(data.ctx, defaultPreferences, { network: false })
  const check = report.checks.find((item) => item.id === 'tls-verification')!
  expect(check.status).toBe('fail')
  expect(check.fixIds).toEqual(['npm-tls'])
})

test('export hides embedded IPv6, scoped and mapped addresses and IPv4 endpoint ports without mutating evidence', async () => {
  const report = await runDiagnostics(data.ctx, defaultPreferences, { network: false })
  const original =
    'proxy=http://192.0.2.9:7890; DNS=[2001:db8::1]:853; link=fe80::1%en0; mapped=::ffff:198.51.100.7; exit=203.0.113.9.'
  report.checks[0]!.evidence.push({ label: '网络路径', value: original })
  report.checks[0]!.evidence.push({
    label: '程序版本',
    value: 'Claude Code 2.1.200; runtime 22.12.0; invalid 999.999.1.1',
  })
  const redacted = redactReport(report)
  const visible = JSON.stringify(redacted)
  expect(visible).not.toMatch(/192\.0\.2\.9|2001:db8|fe80::1|198\.51\.100\.7|203\.0\.113\.9/)
  expect(visible).toContain('[IPv6 已隐藏]')
  expect(visible).toContain('[IP 已隐藏]:7890')
  expect(visible).toContain('Claude Code 2.1.200; runtime 22.12.0; invalid 999.999.1.1')
  expect(report.checks[0]!.evidence.at(-2)?.value).toBe(original)
})

test('Markdown export makes recorded scope and preferences clear and lists issues before evidence', async () => {
  const report = await runDiagnostics(
    data.ctx,
    { ...defaultPreferences, usageMode: 'foundry', routeMode: 'tun', privacy: 'minimal' },
    { network: false },
  )
  report.ruleset = 'RECORDED_RULESET'
  report.checks[0]!.status = 'warn'
  report.checks[0]!.summary = 'REVIEW_THIS_RESULT'
  const text = markdownReport(redactReport(report))
  expect(text).toContain('检测范围：本机配置（未开启公网检测）')
  expect(text).toContain('检测规则：RECORDED_RULESET')
  expect(text).toContain('服务方式：Microsoft Foundry')
  expect(text).toContain('网络模式：TUN 全流量接管')
  expect(text).toContain('隐私偏好：关闭全部非必要流量')
  expect(text.indexOf('## 优先关注')).toBeLessThan(text.indexOf('## 检测证据与建议'))
  expect(text).toContain('REVIEW_THIS_RESULT')
})

test('legacy Markdown exports keep an absent ruleset absent instead of using current rules', async () => {
  const report = await runDiagnostics(data.ctx, defaultPreferences, { network: false })
  delete report.ruleset
  expect(markdownReport(redactReport(report))).toContain('检测规则：旧记录未保存规则版本')
})

test('export dates use the recorded timezone across midnight and keep the raw timestamp available', async () => {
  const report = await runDiagnostics(data.ctx, defaultPreferences, { network: false })
  report.completedAt = '2026-10-10T19:04:50.456Z'
  report.machine.timezone = 'Asia/Shanghai'
  expect(reportExportName(report, 'md')).toBe('cg-claude-2026-10-11-030450.md')
  expect(markdownReport(report)).toContain('2026-10-11 03:04:50（Asia/Shanghai）')
  expect(markdownReport(report)).toContain('原始时间：2026-10-10T19:04:50.456Z')
  report.machine.timezone = 'America/Los_Angeles'
  expect(reportExportName(report, 'json')).toBe('cg-claude-2026-10-10-120450.json')
})

test('legacy invalid report clocks fall back safely without constructing untrusted response headers', async () => {
  const report = await runDiagnostics(data.ctx, defaultPreferences, { network: false })
  report.completedAt = '2026-10-10T19:04:50.456Z'
  report.machine.timezone = 'unknown/zone'
  expect(reportExportName(report, 'md')).toBe('cg-claude-2026-10-10-190450.md')
  expect(markdownReport(report)).toContain('2026-10-10 19:04:50（UTC）')
  report.completedAt = 'invalid\r\nheader'
  expect(reportExportName(report, 'json')).toBe('cg-claude-report.json')
  expect(markdownReport(report)).toContain('时间记录不可用')
})

test('custom scope cannot treat inactive default-file declarations as actual authentication or privacy', async () => {
  data.ctx.env.CLAUDE_CONFIG_DIR = data.root + '/private-config'
  await data.write(
    '.claude/settings.json',
    JSON.stringify({
      env: {
        ANTHROPIC_BASE_URL: 'https://gateway.example',
        ANTHROPIC_API_KEY: 'secret-default-key',
        DO_NOT_TRACK: '1',
        DISABLE_ERROR_REPORTING: '1',
      },
    }),
  )
  const report = await runDiagnostics(data.ctx, defaultPreferences, { network: false })
  for (const id of [
    'config-directory',
    'claude-settings',
    'claude-endpoint',
    'claude-privacy',
    'auth-sources',
  ])
    expect(report.checks.find((check) => check.id === id)?.status).toBe('manual')
  expect(report.checks.find((check) => check.id === 'claude-endpoint')?.fixIds).toEqual([])
  expect(report.checks.find((check) => check.id === 'claude-privacy')?.fixIds).toEqual([])
  expect(JSON.stringify(report)).not.toContain('secret-default-key')
  expect(JSON.stringify(report.checks.find((check) => check.id === 'auth-sources'))).not.toContain(
    'ANTHROPIC_API_KEY',
  )
})

test('default-equivalent configuration directory remains in the detected scope', async () => {
  data.ctx.env.CLAUDE_CONFIG_DIR = data.home + '/.claude/./'
  await data.write(
    '.claude/settings.json',
    JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://gateway.example' } }),
  )
  const report = await runDiagnostics(data.ctx, defaultPreferences, { network: false })
  expect(report.checks.find((check) => check.id === 'config-directory')?.status).toBe('pass')
  expect(report.checks.find((check) => check.id === 'claude-endpoint')?.fixIds).toEqual([
    'claude-endpoint',
  ])
})
