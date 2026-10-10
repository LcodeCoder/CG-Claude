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
import { redactReport, markdownReport } from '../server/report'
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
