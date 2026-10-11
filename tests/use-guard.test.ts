import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { defaultPreferences, preferencesSchema } from '../shared/types'
import type { Bootstrap, ScanReport } from '../shared/types'

vi.mock('vue', async (original) => ({
  ...(await original<typeof import('vue')>()),
  onUnmounted: vi.fn(),
}))
vi.mock('../src/composables/browser', () => ({
  browserSnapshot: vi.fn(async () => ({
    timezone: 'Asia/Taipei',
    language: 'zh-CN',
    platform: 'fixture',
  })),
}))
import { useGuard } from '../src/composables/useGuard'

const report: ScanReport = {
  id: 'fixture-report',
  createdAt: '2026-10-11T00:00:00.000Z',
  completedAt: '2026-10-11T00:00:01.000Z',
  configurationFingerprint: 'a'.repeat(64),
  preferences: defaultPreferences,
  machine: {
    platform: 'darwin',
    platformName: 'macOS',
    hostname: 'fixture',
    arch: 'arm64',
    osVersion: 'fixture',
    timezone: 'Asia/Taipei',
    nodeVersion: '22',
  },
  networkEnabled: false,
  counts: { pass: 0, warn: 0, fail: 0, manual: 0, skipped: 0 },
  checks: [],
}
function bootstrap(): Bootstrap {
  return {
    machine: report.machine,
    preferences: defaultPreferences,
    reports: [report],
    backups: [],
    snapshots: [],
    workflows: [],
    files: [],
    manualReviews: [],
    projectRoot: '/fixture',
    token: 'fixture-token',
    demo: true,
    runtime: 'electron',
    configurationFingerprint: report.configurationFingerprint,
    service: { closing: false },
  }
}
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.clearAllMocks()
})

test('a confirmed saved preference remains successful when the next bootstrap request fails', async () => {
  const transport = vi
    .fn()
    .mockResolvedValueOnce(Response.json(bootstrap()))
    .mockResolvedValueOnce(Response.json({ ...defaultPreferences, expectedCountry: 'US' }))
    .mockRejectedValueOnce(new TypeError('fixture-disconnected'))
  vi.stubGlobal('fetch', transport)
  const guard = useGuard()
  await guard.initialize()
  expect(await guard.savePreferences({ ...defaultPreferences, expectedCountry: 'US' })).toBe(true)
  expect(guard.toast.value?.message).toMatch(/偏好已保存.*刷新未完成/)
  expect(guard.working.value).toBe(false)
  expect(guard.connected.value).toBe(false)
  expect(guard.canRepair.value).toBe(false)
})

test('a confirmed restore invalidates the old report even when refreshed metadata is rejected', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(bootstrap()))
      .mockResolvedValueOnce(Response.json({ restored: true }))
      .mockResolvedValueOnce(
        Response.json({ error: 'fixture-corrupt-report-record' }, { status: 400 }),
      ),
  )
  const guard = useGuard()
  await guard.initialize()
  expect(guard.canRepair.value).toBe(true)
  expect(await guard.restore('fixture-backup')).toBe(true)
  expect(guard.toast.value?.message).toMatch(/已恢复原始配置.*刷新未完成/)
  expect(guard.reportConfigurationChanged.value).toBe(true)
  expect(guard.canRepair.value).toBe(false)
})

test('reload resumes an active scan, updates its result, and clears the write lock on completion', async () => {
  const initial = bootstrap()
  initial.service = {
    closing: false,
    activity: { kind: 'scan', label: '正在检测', id: 'scan-fixture' },
    scan: { id: 'scan-fixture', status: 'running', completed: 3, total: 28, current: '正在检测' },
  }
  const completed = { ...report, id: 'completed-scan' }
  const final = bootstrap()
  final.reports = [completed]
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(initial))
      .mockResolvedValueOnce(
        Response.json({
          ...initial.service.scan,
          status: 'complete',
          completed: 28,
          report: completed,
        }),
      )
      .mockResolvedValueOnce(Response.json(final)),
  )
  const guard = useGuard()
  await guard.initialize()
  expect(guard.scanning.value).toBe(true)
  expect(guard.busy.value).toBe(true)
  expect(guard.progress.value.completed).toBe(3)
  await vi.advanceTimersByTimeAsync(300)
  expect(guard.report.value?.id).toBe('completed-scan')
  expect(guard.scanning.value).toBe(false)
  expect(guard.busy.value).toBe(false)
})

test('reload keeps another local mutation locked until the service reports idle', async () => {
  const initial = bootstrap()
  initial.service = { closing: false, activity: { kind: 'mutation', label: '正在还原' } }
  const transport = vi
    .fn()
    .mockResolvedValueOnce(Response.json(initial))
    .mockResolvedValueOnce(Response.json(initial.service))
    .mockResolvedValueOnce(Response.json({ closing: false }))
    .mockResolvedValueOnce(Response.json(bootstrap()))
  vi.stubGlobal('fetch', transport)
  const guard = useGuard()
  await guard.initialize()
  expect(guard.busy.value).toBe(true)
  expect(await guard.restore('fixture-backup')).toBe(false)
  await vi.advanceTimersByTimeAsync(700)
  expect(guard.busy.value).toBe(false)
  expect(transport.mock.calls.map(([url]) => url)).toEqual([
    '/api/bootstrap',
    '/api/status',
    '/api/status',
    '/api/bootstrap',
  ])
})

test('legacy preference field ordering does not invalidate a current repair report after reload', async () => {
  const initial = bootstrap()
  initial.preferences = preferencesSchema.parse({ routeMode: 'tun', privacy: 'minimal' })
  initial.reports = [{ ...report, preferences: preferencesSchema.parse(initial.preferences) }]
  expect(Object.keys(initial.preferences)).not.toEqual(Object.keys(initial.reports[0]!.preferences))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(initial)))
  const guard = useGuard()
  await guard.initialize()
  expect(guard.canRepair.value).toBe(true)
  expect(guard.reportConfigurationChanged.value).toBe(false)
})
