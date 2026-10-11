import { afterEach, beforeEach, expect, test } from 'vitest'
import {
  setupFollowups,
  manualGuidance,
  checkGuidance,
  guidanceTimezone,
  setupFollowupReport,
} from '../shared/manual-guidance'
import { defaultPreferences, manualItems } from '../shared/types'
import type { SetupJob, ManualReview, ScanReport } from '../shared/types'
import { runDiagnostics, ipv6Result } from '../server/diagnostics'
import { fixture } from './fixtures'
let data: Awaited<ReturnType<typeof fixture>>
let report: ScanReport
const job: SetupJob = {
  id: 'job',
  previewId: 'preview',
  status: 'complete',
  createdAt: '2026-10-10T12:00:00Z',
  preferences: { ...defaultPreferences, routeMode: 'tun' },
  nodes: [],
}
beforeEach(async () => {
  data = await fixture()
  report = await runDiagnostics(data.ctx, job.preferences, { network: false })
})
afterEach(async () => {
  await data.cleanup()
})
const review = (id: ManualReview['id'], checkedAt: string): ManualReview => ({
  id,
  checked: true,
  checkedAt,
  updatedAt: checkedAt,
  note: '',
})
test('provides steps for every manual item and keeps computer, location and phone timezone guidance independent', () => {
  for (const item of manualItems)
    for (const platform of ['darwin', 'win32', 'linux'])
      expect(manualGuidance(item.id, platform).steps.length).toBeGreaterThan(0)
  const auto = manualGuidance('timezone-auto', 'darwin', 'America/Los_Angeles')
  const location = manualGuidance('location-timezone', 'darwin')
  const phone = manualGuidance('phone-timezone', 'darwin')
  expect(auto.action).toBe('date-time')
  expect(auto.steps.join(' ')).toContain('America/Los_Angeles')
  expect(location.action).toBe('location-services')
  expect(location.steps.join(' ')).toContain('详细信息')
  expect(phone.action).toBeUndefined()
  expect(phone.steps.join(' ')).toContain('iPhone')
})
test('shows remaining work in the result even with legacy or stale checkbox confirmations', () => {
  const items = setupFollowups(
    job,
    report,
    [
      review('location-timezone', '2026-10-09T12:00:00Z'),
      review('timezone-auto', '2026-10-09T12:00:00Z'),
    ],
    'darwin',
  )
  expect(items[0]?.manualId).toBe('location-timezone')
  expect(items.some((item) => item.manualId === 'phone-timezone')).toBe(true)
  expect(items.some((item) => item.manualId === 'terminal-session')).toBe(true)
  expect(items.some((item) => item.manualId === 'timezone-auto')).toBe(false) // Independently read as off.
  for (const id of ['account-export', 'service-status', 'account-notice'])
    expect(items.some((item) => item.manualId === id)).toBe(false)
})
test('a fresh manual confirmation never hides an observed warning or failure', () => {
  for (const id of ['automatic-timezone', 'location-timezone'])
    report.checks.find((check) => check.id === id)!.status = 'warn'
  const items = setupFollowups(
    job,
    report,
    [
      review('timezone-auto', '2026-10-10T13:00:00Z'),
      review('location-timezone', '2026-10-10T13:00:00Z'),
    ],
    'darwin',
  )
  expect(items.some((item) => item.checkId === 'automatic-timezone')).toBe(true)
  expect(items.some((item) => item.checkId === 'location-timezone')).toBe(true)
})
test('multiple checks sharing a manual task keep each observed warning visible', () => {
  for (const id of ['runtime-proxy', 'timezone-env'])
    report.checks.find((check) => check.id === id)!.status = 'warn'
  const items = setupFollowups(job, report, [], 'darwin')
  expect(items.some((item) => item.checkId === 'runtime-proxy')).toBe(true)
  expect(items.some((item) => item.checkId === 'timezone-env')).toBe(true)
})
test('exit mode uses a verified report timezone and never substitutes the article timezone when exit data is absent', () => {
  const exitJob = {
    ...job,
    preferences: {
      ...job.preferences,
      timezoneMode: 'exit' as const,
      expectedTimezone: 'Asia/Taipei',
    },
  }
  report.preferences = exitJob.preferences
  const timezone = report.checks.find((check) => check.id === 'timezone')!
  timezone.evidence = timezone.evidence.map((item) =>
    item.label === '目标时区' ? { ...item, value: 'America/Los_Angeles' } : item,
  )
  expect(
    setupFollowups(exitJob, report, [], 'darwin').find((item) => item.manualId === 'phone-timezone')
      ?.guidance.steps[0],
  ).toContain('America/Los_Angeles')
  const unresolved = setupFollowups(exitJob, undefined, [], 'darwin').find(
    (item) => item.manualId === 'phone-timezone',
  )!
  expect(unresolved.guidance.steps[0]).toContain('尚未解析')
  expect(unresolved.guidance.steps[0]).not.toContain('Asia/Taipei')
})
test('read-only verification commands and optional IPv6 changes have an explicit restore path', () => {
  const proxy = checkGuidance(
    report.checks.find((check) => check.id === 'system-proxy')!,
    'darwin',
    'Asia/Taipei',
    job.preferences,
  )
  expect(proxy.action).toBe('network-settings')
  expect(proxy.commands?.[0]?.text).toContain('scutil --proxy')
  const ipv6 = checkGuidance(
    report.checks.find((check) => check.id === 'ipv6')!,
    'darwin',
    'Asia/Taipei',
    job.preferences,
  )
  expect(ipv6.commands?.map((command) => command.text).join(' ')).toContain('-setv6automatic')
  expect(ipv6.commands?.map((command) => command.text).join(' ')).toContain(
    '-listallnetworkservices',
  )
  expect(ipv6.note).toContain('不包含在 CG 配置快照')
})
test('local IPv6 addresses are not misreported as public candidates or proved leaks', () => {
  const local = { name: 'en0', family: 'IPv6', internal: false, address: 'fe80::1234%en0' }
  expect(ipv6Result([local, { ...local, address: 'fd12::1' }])).toMatchObject({
    status: 'pass',
    summary: '仅观察到本地 IPv6 地址，未发现公网候选',
  })
  const publicResult = ipv6Result([{ ...local, address: '2606:4700::1111' }])
  expect(publicResult.status).toBe('manual')
  expect(publicResult.summary).toContain('公网候选')
  expect(publicResult.summary).not.toContain('泄漏')
})

test('manual instructions reject a stale report from different timezone preferences', () => {
  const exit = { ...job.preferences, timezoneMode: 'exit' as const }
  expect(guidanceTimezone(exit, report)).toContain('尚未解析')
  expect(
    guidanceTimezone(
      { ...exit, timezoneMode: 'manual', expectedTimezone: 'America/New_York' },
      report,
    ),
  ).toBe('America/New_York')
})
test('post-setup instructions select the newest matching recheck and never a report from another mode', () => {
  const initial = { ...report, id: 'initial', createdAt: '2026-10-10T12:01:00Z' }
  const next = { ...report, id: 'next', createdAt: '2026-10-10T12:02:00Z' }
  const other = {
    ...report,
    id: 'other',
    createdAt: '2026-10-10T12:03:00Z',
    preferences: { ...job.preferences, timezoneMode: 'exit' as const },
  }
  const before = { ...report, id: 'before', createdAt: '2026-10-10T11:59:00Z' }
  expect(
    setupFollowupReport({ ...job, reportId: initial.id }, [other, before, initial, next])?.id,
  ).toBe('next')
  expect(setupFollowupReport(job, [before, other])).toBeUndefined()
  expect(setupFollowupReport({ ...job, reportId: before.id }, [before, other])?.id).toBe('before')
})
