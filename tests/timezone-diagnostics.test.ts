import { afterEach, beforeEach, expect, test } from 'vitest'
import { defaultPreferences, preferencesSchema } from '../shared/types'
import { ARTICLE_TIMEZONE, sameTimezone } from '../shared/timezones'
import type { BrowserSnapshot } from '../shared/types'
import {
  resolveTimezoneTarget,
  systemTimezoneCheck,
  browserTimezoneCheck,
  runtimeTimezoneCheck,
  timezoneFollowupCheck,
} from '../server/timezone-diagnostics'
import { readSystemTimezone } from '../server/system-timezone'
import { runDiagnostics } from '../server/diagnostics'
import { fixture } from './fixtures'

let data: Awaited<ReturnType<typeof fixture>>
beforeEach(async () => {
  data = await fixture()
})
afterEach(async () => {
  await data.cleanup()
})
const browser = (timezone: string, publicIp?: string): BrowserSnapshot => ({
  timezone,
  publicIp,
  language: 'zh-CN',
  platform: 'test',
})
const system = (timezone: string) => ({ timezone, source: '隔离测试系统时区' })
const emptyEnvironment = { sources: [], unavailable: [] }
const article = () => resolveTimezoneTarget(defaultPreferences, false)

test('legacy blank preferences adopt the explicit article target while explicit targets are preserved', () => {
  expect(preferencesSchema.parse({ expectedTimezone: '' }).timezoneMode).toBe('article')
  expect(preferencesSchema.parse({ expectedTimezone: 'America/New_York' }).timezoneMode).toBe(
    'manual',
  )
  expect(
    preferencesSchema.safeParse({ timezoneMode: 'manual', expectedTimezone: '' }).success,
  ).toBe(false)
  expect(
    preferencesSchema.safeParse({ timezoneMode: 'manual', expectedTimezone: 'bad/zone' }).success,
  ).toBe(false)
})
test('a stale manual value cannot silently override article mode', () => {
  expect(
    resolveTimezoneTarget({ ...defaultPreferences, expectedTimezone: 'Asia/Shanghai' }, false)
      .timezone,
  ).toBe(ARTICLE_TIMEZONE)
})
test('Shanghai does not pass the article target even when every measured timezone agrees', () => {
  const zone = system('Asia/Shanghai')
  expect(systemTimezoneCheck(zone, article()).status).toBe('warn')
  const check = browserTimezoneCheck(zone, article(), browser('Asia/Shanghai'))
  expect(check.status).toBe('warn')
  expect(check.summary).toContain('两者均为 Asia/Shanghai')
  expect(check.summary).toContain('Asia/Taipei')
  expect(runtimeTimezoneCheck(zone, 'Asia/Shanghai', article(), emptyEnvironment).status).toBe(
    'warn',
  )
  expect(sameTimezone('Asia/Shanghai', 'Asia/Taipei')).toBe(false)
})
test('Taipei readings do not imply that phone automatic settings are confirmed', () => {
  const zone = system('Asia/Taipei')
  expect(systemTimezoneCheck(zone, article()).status).toBe('pass')
  expect(browserTimezoneCheck(zone, article(), browser('Asia/Taipei')).status).toBe('pass')
  expect(runtimeTimezoneCheck(zone, 'Asia/Taipei', article(), emptyEnvironment).status).toBe('pass')
  const followup = timezoneFollowupCheck(article())
  expect(followup.status).toBe('manual')
  expect(followup.evidence.map((entry) => entry.label)).toEqual(
    expect.arrayContaining(['目标时区', '手机时区与自动设置']),
  )
})
test('an explicit manual target is labeled as manual and still records the article baseline', () => {
  const target = resolveTimezoneTarget(
    { ...defaultPreferences, timezoneMode: 'manual', expectedTimezone: 'Asia/Shanghai' },
    false,
  )
  const check = systemTimezoneCheck(system('Asia/Shanghai'), target)
  expect(check.status).toBe('pass')
  expect(check.summary).toContain('手动选择')
  expect(check.evidence).toContainEqual({
    label: '原文基准',
    value: 'Asia/Taipei（台北）；第 2.2 / 6.1 / 9 节',
  })
})
test('IANA aliases compare as identities without reducing zones to their current offset', () => {
  expect(sameTimezone('US/Eastern', 'America/New_York')).toBe(true)
  const target = resolveTimezoneTarget(
    { ...defaultPreferences, timezoneMode: 'manual', expectedTimezone: 'America/New_York' },
    false,
  )
  expect(systemTimezoneCheck(system('US/Eastern'), target).status).toBe('pass')
  expect(sameTimezone('invalid/zone', 'invalid/zone')).toBe(false)
})
test.each([undefined, 'invalid/timezone'])(
  'exit mode remains unconfirmed when the IP response has no usable timezone: %s',
  (timezone) => {
    const target = resolveTimezoneTarget({ ...defaultPreferences, timezoneMode: 'exit' }, true, {
      ip: '203.0.113.1',
      country: 'US',
      timezone,
    })
    expect(target.timezone).toBeUndefined()
    expect(systemTimezoneCheck(system('America/New_York'), target).status).toBe('manual')
    expect(
      browserTimezoneCheck(system('America/New_York'), target, browser('America/New_York')).status,
    ).toBe('manual')
  },
)
test('exit mode requires current network permission and cannot use a stale network reading', () => {
  const target = resolveTimezoneTarget({ ...defaultPreferences, timezoneMode: 'exit' }, false, {
    ip: '203.0.113.1',
    timezone: 'Asia/Taipei',
  })
  expect(target.timezone).toBeUndefined()
  expect(target.error).toContain('开启本次公网检测')
})
test('exit mode uses the response IANA zone rather than guessing from a country', () => {
  const prefs = { ...defaultPreferences, timezoneMode: 'exit' as const }
  const target = resolveTimezoneTarget(prefs, true, {
    ip: '203.0.113.1',
    country: 'US',
    timezone: 'America/Los_Angeles',
  })
  expect(target.timezone).toBe('America/Los_Angeles')
  expect(systemTimezoneCheck(system('America/New_York'), target).status).toBe('warn')
  expect(systemTimezoneCheck(system('America/Los_Angeles'), target).status).toBe('pass')
  expect(
    resolveTimezoneTarget(prefs, true, { ip: '203.0.113.1', country: 'US' }).timezone,
  ).toBeUndefined()
})
test('different browser and local exits require a route decision before accepting an exit timezone', () => {
  const target = resolveTimezoneTarget(
    { ...defaultPreferences, timezoneMode: 'exit' },
    true,
    { ip: '203.0.113.1', timezone: 'Asia/Taipei' },
    browser('Asia/Taipei', '203.0.113.2'),
  )
  expect(target.timezone).toBeUndefined()
  expect(target.error).toContain('出口不同')
})
test('a process TZ override cannot impersonate the actual operating system timezone', async () => {
  data.ctx.readSystemTimezone = async () => system('Asia/Shanghai')
  data.ctx.readRuntimeTimezone = () => 'Asia/Taipei'
  data.ctx.env.TZ = 'Asia/Taipei'
  const report = await runDiagnostics(data.ctx, defaultPreferences, {
    network: false,
    browser: browser('Asia/Taipei'),
  })
  expect(report.machine.timezone).toBe('Asia/Shanghai')
  expect(report.machine.runtimeTimezone).toBe('Asia/Taipei')
  for (const id of ['timezone', 'browser-timezone', 'timezone-env'])
    expect(report.checks.find((check) => check.id === id)?.status).toBe('warn')
  expect(report.checks.find((check) => check.id === 'timezone-followup')?.status).toBe('manual')
})
test('a failed OS probe cannot be replaced by an apparently matching Node timezone', async () => {
  data.ctx.readSystemTimezone = async () => ({ source: 'test', error: '无法读取系统时区' })
  const report = await runDiagnostics(data.ctx, defaultPreferences, {
    network: false,
    browser: browser('Asia/Taipei'),
  })
  expect(report.machine.timezone).toBe('未知')
  for (const id of ['timezone', 'browser-timezone', 'timezone-env'])
    expect(report.checks.find((check) => check.id === id)?.status).toBe('manual')
})
test('startup and Claude TZ declarations cannot quietly disagree with otherwise matching readings', () => {
  const check = runtimeTimezoneCheck(system('Asia/Taipei'), 'Asia/Taipei', article(), {
    sources: [
      {
        label: '~/.zshrc',
        kind: 'shell',
        values: { TZ: 'Asia/Shanghai' },
        unresolved: [],
        hasApiKeyHelper: false,
      },
    ],
    unavailable: [],
  })
  expect(check.status).toBe('warn')
  expect(check.evidence).toContainEqual({ label: '~/.zshrc · TZ', value: 'Asia/Shanghai' })
})
test('complex TZ expressions remain manual and are never executed', () => {
  const check = runtimeTimezoneCheck(system('Asia/Taipei'), 'Asia/Taipei', article(), {
    sources: [
      { label: '~/.zshrc', kind: 'shell', values: {}, unresolved: ['TZ'], hasApiKeyHelper: false },
    ],
    unavailable: [],
  })
  expect(check.status).toBe('manual')
})
test('macOS system evidence comes from the localtime link and does not need a process TZ', async () => {
  const commands: string[] = []
  const result = await readSystemTimezone(
    {
      platform: 'darwin',
      run: async (command) => {
        commands.push(command)
        return { ok: false, stdout: '', stderr: '' }
      },
    },
    async () => '/var/db/timezone/zoneinfo/Asia/Shanghai',
  )
  expect(result.timezone).toBe('Asia/Shanghai')
  expect(result.source).toBe('/etc/localtime')
  expect(commands).toHaveLength(0)
})
test('Linux regular tzfiles can use a read-only timedatectl fallback', async () => {
  const result = await readSystemTimezone(
    {
      platform: 'linux',
      run: async (command, args) => {
        expect(command).toBe('timedatectl')
        expect(args).toEqual(['show', '--property=Timezone', '--value'])
        return { ok: true, stdout: 'Asia/Taipei', stderr: '' }
      },
    },
    async () => {
      throw new Error('not a symlink')
    },
  )
  expect(result.timezone).toBe('Asia/Taipei')
})
test.each([
  ['Taipei Standard Time', 'Asia/Taipei'],
  ['China Standard Time', 'Asia/Shanghai'],
  ['Pacific Standard Time', 'America/Los_Angeles'],
])('Windows region IDs preserve distinct timezone identities: %s', async (id, expected) => {
  const result = await readSystemTimezone(
    {
      platform: 'win32',
      run: async (command, args) => {
        expect(command).toBe('powershell.exe')
        expect(args.at(-1)).toBe('(Get-TimeZone).Id | ConvertTo-Json -Compress')
        return { ok: true, stdout: JSON.stringify(id), stderr: '' }
      },
    },
    async () => {
      throw new Error('Windows must not read a Unix path')
    },
  )
  expect(result.timezone).toBe(expected)
})
test('an unmapped Windows region is unconfirmed rather than inferred from an offset', async () => {
  const result = await readSystemTimezone({
    platform: 'win32',
    run: async () => ({ ok: true, stdout: '"Unknown Standard Time"', stderr: '' }),
  })
  expect(result.timezone).toBeUndefined()
  expect(systemTimezoneCheck(result, article()).status).toBe('manual')
})
test('malformed or failed Windows output stays unconfirmed', async () => {
  for (const output of [
    { ok: true, stdout: 'not-json', stderr: '' },
    { ok: false, stdout: '', stderr: 'failure' },
  ]) {
    const result = await readSystemTimezone({ platform: 'win32', run: async () => output })
    expect(result.timezone).toBeUndefined()
  }
})
test('all failed Unix sources remain unconfirmed', async () => {
  const result = await readSystemTimezone(
    { platform: 'darwin', run: async () => ({ ok: false, stdout: '', stderr: 'not permitted' }) },
    async () => {
      throw new Error('not readable')
    },
  )
  expect(result.timezone).toBeUndefined()
})

test('unused invalid manual draft cannot prevent saving a different timezone basis', () => {
  expect(
    preferencesSchema.safeParse({ timezoneMode: 'article', expectedTimezone: 'invalid/zone' })
      .success,
  ).toBe(true)
  expect(
    preferencesSchema.safeParse({ timezoneMode: 'exit', expectedTimezone: 'invalid/zone' }).success,
  ).toBe(true)
  expect(
    preferencesSchema.safeParse({ timezoneMode: 'manual', expectedTimezone: 'invalid/zone' })
      .success,
  ).toBe(false)
})
