import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  readAutomaticTimezone,
  setAutomaticTimezone,
  readLocationTimezone,
  automaticTimezoneCheck,
} from '../server/timezone-automation'
import { SetupWorkflows } from '../server/workflows'
import { SnapshotEngine } from '../server/snapshots'
import { RepairEngine } from '../server/repairs'
import { defaultPreferences } from '../shared/types'
import { fixture } from './fixtures'
vi.mock('node:timers/promises', () => ({ setTimeout: async () => {} }))
let data: Awaited<ReturnType<typeof fixture>>
beforeEach(async () => {
  data = await fixture()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await data.cleanup()
})
async function setup(system = true, terminal = true) {
  const snapshots = new SnapshotEngine(data.ctx, data.storage)
  const workflows = new SetupWorkflows(
    data.ctx,
    data.storage,
    new RepairEngine(data.ctx, data.storage),
    snapshots,
  )
  await workflows.init()
  const preview = await workflows.preview({
    preferences: defaultPreferences,
    fixIds: [],
    timezone: { system, terminal },
  })
  const job = await workflows.create(preview.id)
  await workflows.execute(job)
  return { job, snapshots }
}
test.each([
  ['1', true, 'warn'],
  ['true', true, 'warn'],
  ['0', false, 'pass'],
  ['false', false, 'pass'],
  ['garbage', undefined, 'manual'],
])(
  'interprets only a recognized independent automatic-timezone value: %s',
  async (stdout, value, status) => {
    const run = vi.fn().mockResolvedValue({ ok: true, stdout, stderr: '' })
    const actual = await readAutomaticTimezone({ platform: 'darwin', run })
    expect(actual).toBe(value)
    expect(automaticTimezoneCheck(actual).status).toBe(status)
    expect(run).toHaveBeenCalledExactlyOnceWith('/usr/bin/defaults', [
      'read',
      '/Library/Preferences/com.apple.timezone.auto',
      'Active',
    ])
  },
)
test('does not infer a location permission from TimeZone.bundle presence or run macOS commands on Windows', async () => {
  const run = vi.fn().mockResolvedValue({
    ok: true,
    stdout: JSON.stringify({ '/System/Library/LocationBundles/TimeZone.bundle': {} }),
    stderr: '',
  })
  expect(await readLocationTimezone({ ...data.ctx, demo: false, run })).toContain('不能证明')
  run.mockClear()
  expect(await readAutomaticTimezone({ platform: 'win32', run })).toBeUndefined()
  expect(run).not.toHaveBeenCalled()
})
test('administrator writes use the system authorization dialog and contain no password input', async () => {
  const run = vi.fn().mockResolvedValue({ ok: true, stdout: '', stderr: '' })
  await setAutomaticTimezone({ platform: 'darwin', run }, false)
  expect(run.mock.calls[0]?.[0]).toBe('/usr/bin/osascript')
  expect(run.mock.calls[0]?.[1][1]).toContain('with administrator privileges')
  expect(run.mock.calls[0]?.[1][1]).toContain('Active -bool false')
  expect(JSON.stringify(run.mock.calls)).not.toContain('password')
})
test('one-click disables known automatic timezone and snapshot restores its original state independently', async () => {
  await data.ctx.setAutomaticTimezone(true)
  await data.ctx.setSystemTimezone('Asia/Shanghai')
  const { job, snapshots } = await setup()
  expect(job.nodes.find((node) => node.id === 'system-timezone')?.status).toBe('succeeded')
  expect(await data.ctx.readAutomaticTimezone()).toBe(false)
  expect((await data.ctx.readSystemTimezone()).timezone).toBe('Asia/Taipei')
  const report = (await data.storage.reports())[0]!
  expect(report.checks.find((check) => check.id === 'automatic-timezone')?.status).toBe('pass')
  expect(report.checks.find((check) => check.id === 'location-timezone')?.status).toBe('manual')
  expect(report.checks.find((check) => check.id === 'timezone-followup')?.status).toBe('manual')
  expect(
    (await snapshots.list()).find((snapshot) => snapshot.id === job.snapshotId)?.timezone
      ?.automatic,
  ).toBe(true)
  const preview = await snapshots.preview(job.snapshotId!)
  expect(preview.timezoneChanges?.map((change) => change.key)).toContain('自动设定时区')
  await snapshots.restore(preview.id)
  expect(await data.ctx.readAutomaticTimezone()).toBe(true)
  expect((await data.ctx.readSystemTimezone()).timezone).toBe('Asia/Shanghai')
})
test('denied automatic-timezone authorization retries three times, leaves it unresolved, then continues with terminal configuration', async () => {
  await data.ctx.setAutomaticTimezone(true)
  const denied = vi
    .spyOn(data.ctx, 'setAutomaticTimezone')
    .mockRejectedValue(new Error('cancelled'))
  const { job } = await setup()
  expect(denied).toHaveBeenCalledTimes(4)
  expect(job.nodes.find((node) => node.id === 'system-timezone')).toMatchObject({
    status: 'skipped',
    retries: 3,
    attempts: 4,
  })
  expect(job.nodes.find((node) => node.id === 'terminal-timezone')?.status).toBe('succeeded')
  expect(
    (await data.storage.reports())[0]?.checks.find((check) => check.id === 'automatic-timezone')
      ?.status,
  ).toBe('warn')
})
test('accepted automatic-timezone writes wait for delayed or transient readbacks without reopening authorization', async () => {
  await data.ctx.setAutomaticTimezone(true)
  const read = data.ctx.readAutomaticTimezone.bind(data.ctx)
  const set = data.ctx.setAutomaticTimezone.bind(data.ctx)
  let remaining = 0
  const write = vi.spyOn(data.ctx, 'setAutomaticTimezone').mockImplementation(async (value) => {
    await set(value)
    remaining = 10
  })
  vi.spyOn(data.ctx, 'readAutomaticTimezone').mockImplementation(async () => {
    if (remaining === 9) {
      remaining--
      throw new Error('transient read')
    }
    return remaining-- > 0 ? true : read()
  })
  const { job } = await setup()
  expect(write).toHaveBeenCalledTimes(1)
  expect(job.nodes.find((node) => node.id === 'system-timezone')?.status).toBe('succeeded')
  expect(job.nodes.find((node) => node.id === 'terminal-timezone')?.status).toBe('succeeded')
})
test('a command failing after actually changing the automatic-timezone setting is verified as success', async () => {
  await data.ctx.setAutomaticTimezone(true)
  const set = data.ctx.setAutomaticTimezone.bind(data.ctx)
  const write = vi.spyOn(data.ctx, 'setAutomaticTimezone').mockImplementation(async (value) => {
    await set(value)
    throw new Error('after write')
  })
  const { job } = await setup()
  expect(write).toHaveBeenCalledTimes(1)
  expect(job.nodes.find((node) => node.id === 'system-timezone')?.status).toBe('succeeded')
})
test('does not modify automatic timezone when the OS baseline is unreadable or system setup is unselected', async () => {
  await data.ctx.setAutomaticTimezone(true)
  const write = vi.spyOn(data.ctx, 'setAutomaticTimezone')
  await setup(false, true)
  expect(write).not.toHaveBeenCalled()
  vi.spyOn(data.ctx, 'readSystemTimezone').mockResolvedValue({
    source: 'unreadable',
    error: 'not readable',
  })
  const { job } = await setup(true, false)
  expect(write).not.toHaveBeenCalled()
  expect(job.nodes.find((node) => node.id === 'system-timezone')?.status).toBe('skipped')
})
