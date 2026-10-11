import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fixture } from './fixtures'
import { defaultPreferences } from '../shared/types'
import { createContext } from '../server/context'
import { RepairEngine } from '../server/repairs'
import { SnapshotEngine } from '../server/snapshots'
import { SetupWorkflows } from '../server/workflows'
import { readUserTimezone, setSystemTimezone, setUserTimezone } from '../server/timezone-settings'
vi.mock('node:timers/promises', () => ({ setTimeout: async () => {} }))
let data: Awaited<ReturnType<typeof fixture>>
let repairs: RepairEngine
let snapshots: SnapshotEngine
let workflows: SetupWorkflows
beforeEach(async () => {
  data = await fixture()
  await data.ctx.setSystemTimezone('Asia/Shanghai')
  repairs = new RepairEngine(data.ctx, data.storage)
  snapshots = new SnapshotEngine(data.ctx, data.storage)
  workflows = new SetupWorkflows(data.ctx, data.storage, repairs, snapshots, {
    browserTimeoutMs: 1000,
  })
  await workflows.init()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await data.cleanup()
})
async function prepare(timezone = { system: true, terminal: true }) {
  return workflows.preview({ preferences: defaultPreferences, fixIds: [], timezone })
}
async function execute(timezone = { system: true, terminal: true }) {
  const preview = await prepare(timezone)
  const job = await workflows.create(preview.id)
  await workflows.execute(job)
  return job
}
test('one-click configures independent OS and persistent TZ, preserves the gateway, and fully restores its snapshot', async () => {
  const shell =
    '# keep\r\nexport TZ=\'Asia/Shanghai\' # my zone\r\nexport ANTHROPIC_BASE_URL=http://127.0.0.1:15721\r\nexport PATH="$HOME/bin:$PATH"\r\n'
  const config = {
    env: {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:15721',
      ANTHROPIC_API_KEY: 'fixture-secret',
      TZ: 'Asia/Shanghai',
    },
    hooks: { Stop: [] },
    permissions: { allow: ['Read'] },
    model: 'keep',
  }
  await data.write('.zshrc', shell)
  await data.write('.claude/settings.json', JSON.stringify(config))
  data.ctx.env.TZ = 'Asia/Shanghai'
  const job = await execute()
  expect(job.nodes).toHaveLength(13)
  expect(job.nodes.filter((node) => node.enabled && node.status === 'skipped')).toHaveLength(0)
  expect((await data.ctx.readSystemTimezone()).timezone).toBe('Asia/Taipei')
  expect(data.ctx.env.TZ).toBe('Asia/Taipei')
  expect(await data.read('.zshrc')).toBe(shell.replace("'Asia/Shanghai'", "'Asia/Taipei'"))
  for (const name of ['.zshenv', '.bashrc', '.profile'])
    expect(await data.read(name)).toContain("export TZ='Asia/Taipei'")
  await expect(data.read('.bash_profile')).rejects.toMatchObject({ code: 'ENOENT' })
  const result = JSON.parse(await data.read('.claude/settings.json'))
  expect(result).toEqual({ ...config, env: { ...config.env, TZ: 'Asia/Taipei' } })
  const report = (await data.storage.reports())[0]!
  expect(report.checks.find((check) => check.id === 'timezone')?.status).toBe('pass')
  expect(report.checks.find((check) => check.id === 'timezone-env')?.status).toBe('pass')
  expect(report.verification?.passes).toBe(3)
  const preview = await snapshots.preview(job.snapshotId!)
  expect(preview.timezoneChanges?.map((change) => change.key)).toEqual([
    '系统时区',
    '本工具进程 TZ',
  ])
  expect(JSON.stringify(preview)).not.toContain('fixture-secret')
  await snapshots.restore(preview.id)
  expect((await data.ctx.readSystemTimezone()).timezone).toBe('Asia/Shanghai')
  expect(data.ctx.env.TZ).toBe('Asia/Shanghai')
  expect(await data.read('.zshrc')).toBe(shell)
  expect(JSON.parse(await data.read('.claude/settings.json'))).toEqual(config)
  for (const name of ['.zshenv', '.bashrc', '.profile'])
    await expect(data.read(name)).rejects.toMatchObject({ code: 'ENOENT' })
  const undo = (await snapshots.list()).find((snapshot) => snapshot.purpose === 'before-restore')!
  await snapshots.restore((await snapshots.preview(undo.id)).id)
  expect((await data.ctx.readSystemTimezone()).timezone).toBe('Asia/Taipei')
  expect(data.ctx.env.TZ).toBe('Asia/Taipei')
})
test('denied administrator authorization retries three times then continues configuring TZ', async () => {
  const denied = vi
    .spyOn(data.ctx, 'setSystemTimezone')
    .mockRejectedValue(new Error('管理员授权被取消'))
  const job = await execute()
  expect(denied).toHaveBeenCalledTimes(4)
  expect(job.nodes.find((node) => node.id === 'system-timezone')).toMatchObject({
    status: 'skipped',
    attempts: 4,
    retries: 3,
  })
  expect(job.nodes.find((node) => node.id === 'terminal-timezone')?.status).toBe('succeeded')
  expect((await data.ctx.readSystemTimezone()).timezone).toBe('Asia/Shanghai')
  expect(data.ctx.readRuntimeTimezone()).toBe('Asia/Taipei')
  expect(
    (await data.storage.reports())[0]?.checks.find((check) => check.id === 'timezone')?.status,
  ).toBe('warn')
})
test('never treats a successful command without an OS readback change as a successful configuration', async () => {
  const unchanged = vi.spyOn(data.ctx, 'setSystemTimezone').mockResolvedValue()
  const job = await execute({ system: true, terminal: false })
  expect(unchanged).toHaveBeenCalledTimes(4)
  expect(job.nodes.find((node) => node.id === 'system-timezone')?.status).toBe('skipped')
  expect(data.ctx.env.TZ).toBeUndefined()
})
test('cancelled timezone scope and legacy requests leave both timezone layers untouched', async () => {
  const set = vi.spyOn(data.ctx, 'setSystemTimezone')
  const preview = await workflows.preview({ preferences: defaultPreferences, fixIds: [] })
  const job = await workflows.create(preview.id)
  await workflows.execute(job)
  expect(set).not.toHaveBeenCalled()
  expect(data.ctx.env.TZ).toBeUndefined()
  await expect(data.read('.zshenv')).rejects.toMatchObject({ code: 'ENOENT' })
})
test.each([
  'if true; then\n export TZ=Asia/Shanghai\nfi\n',
  'readonly TZ=Asia/Shanghai\n',
  'export TZ=$(cat /tmp/zone)\n',
  'unset TZ\n',
])('does not partially write unsafe shell TZ declarations: %s', async (original) => {
  await data.write('.zshrc', original)
  const job = await execute({ system: false, terminal: true })
  expect(job.nodes.find((node) => node.id === 'terminal-timezone')?.status).toBe('skipped')
  expect(await data.read('.zshrc')).toBe(original)
  expect(data.ctx.env.TZ).toBeUndefined()
  await expect(data.read('.claude/settings.json')).rejects.toMatchObject({ code: 'ENOENT' })
})
test('updates existing Bash login files without creating a higher-precedence login file', async () => {
  await data.write('.bash_login', "export TZ='Asia/Shanghai'\n# keep\n")
  await execute({ system: false, terminal: true })
  expect(await data.read('.bash_login')).toBe("export TZ='Asia/Taipei'\n# keep\n")
  await expect(data.read('.bash_profile')).rejects.toMatchObject({ code: 'ENOENT' })
})
test.each(['ZDOTDIR', 'CLAUDE_CONFIG_DIR'])(
  'blocks writes for unrecognized %s scope',
  async (key) => {
    data.ctx.env[key] = '/tmp/custom-scope'
    const preview = await prepare({ system: false, terminal: true })
    expect(preview.nodes.find((node) => node.id === 'terminal-timezone')?.blocked).toBe(true)
    expect(JSON.stringify(preview)).not.toContain('/tmp/custom-scope')
    const job = await workflows.create(preview.id)
    await workflows.execute(job)
    await expect(data.read('.zshenv')).rejects.toMatchObject({ code: 'ENOENT' })
  },
)
test('requires a valid exit timezone and freezes the reviewed target', async () => {
  const request = {
    preferences: { ...defaultPreferences, timezoneMode: 'exit' as const },
    fixIds: [],
    timezone: { system: true, terminal: true },
  }
  await expect(workflows.preview(request)).rejects.toThrow('有效时区')
  data.ctx.run = async () => ({
    ok: true,
    stdout: JSON.stringify({ ip: '8.8.8.8', timezone: 'Asia/Tokyo' }),
    stderr: '',
  })
  const preview = await workflows.preview(request)
  expect(preview.timezoneTarget).toBe('Asia/Tokyo')
  data.ctx.run = async () => ({
    ok: true,
    stdout: JSON.stringify({ ip: '8.8.8.8', timezone: 'Europe/London' }),
    stderr: '',
  })
  const job = await workflows.create(preview.id)
  await workflows.execute(job)
  expect((await data.ctx.readSystemTimezone()).timezone).toBe('Asia/Tokyo')
  expect(data.ctx.env.TZ).toBe('Asia/Tokyo')
  expect(
    (await data.storage.reports())[0]?.checks.find((check) => check.id === 'timezone')?.status,
  ).toBe('warn')
})
test('rejects different browser and terminal exit IPs before any change', async () => {
  data.ctx.run = async () => ({
    ok: true,
    stdout: JSON.stringify({ ip: '8.8.8.8', timezone: 'Asia/Tokyo' }),
    stderr: '',
  })
  await expect(
    workflows.preview({
      preferences: { ...defaultPreferences, timezoneMode: 'exit' },
      fixIds: [],
      timezone: { system: true, terminal: true },
      browser: { timezone: 'Asia/Shanghai', language: 'zh', platform: 'test', publicIp: '1.1.1.1' },
    }),
  ).rejects.toThrow('出口不同')
})
test('rejects OS or process TZ drift after preview', async () => {
  const preview = await prepare()
  await data.ctx.setSystemTimezone('Asia/Tokyo')
  await expect(workflows.create(preview.id)).rejects.toThrow('时区在预览后发生变化')
  const next = await prepare()
  data.ctx.env.TZ = 'Europe/London'
  await expect(workflows.create(next.id)).rejects.toThrow('时区在预览后发生变化')
})
test('verification requests fresh browser data and rejects stale or replayed callbacks', async () => {
  const preview = await workflows.preview({
    preferences: defaultPreferences,
    fixIds: [],
    timezone: { system: true, terminal: true },
    browser: { timezone: 'Asia/Shanghai', language: 'zh', platform: 'test' },
  })
  const job = await workflows.create(preview.id)
  const running = workflows.execute(job)
  await vi.waitFor(() => expect(job.browserProbeId).toBeTruthy())
  expect(() =>
    workflows.submitBrowser(job.id, 'old-probe', {
      timezone: 'Asia/Shanghai',
      language: 'zh',
      platform: 'test',
    }),
  ).toThrow('已失效')
  const id = job.browserProbeId!
  workflows.submitBrowser(job.id, id, { timezone: 'Asia/Taipei', language: 'zh', platform: 'test' })
  await running
  expect(
    (await data.storage.reports())[0]?.checks.find((check) => check.id === 'browser-timezone')
      ?.status,
  ).toBe('pass')
  expect(() =>
    workflows.submitBrowser(job.id, id, {
      timezone: 'Asia/Taipei',
      language: 'zh',
      platform: 'test',
    }),
  ).toThrow('已失效')
})
test('missing fresh browser data never reuses the pre-configuration sample', async () => {
  const preview = await workflows.preview({
    preferences: defaultPreferences,
    fixIds: [],
    timezone: { system: true, terminal: false },
    browser: { timezone: 'Asia/Taipei', language: 'zh', platform: 'test' },
  })
  const job = await workflows.create(preview.id)
  await workflows.execute(job)
  expect(
    (await data.storage.reports())[0]?.checks.find((check) => check.id === 'browser-timezone')
      ?.status,
  ).toBe('skipped')
})
test('snapshots detect timezone drift, hide raw old TZ, and verify timezone record integrity', async () => {
  data.ctx.env.TZ = 'private-original-string'
  const saved = await snapshots.capture()
  expect(JSON.stringify(await snapshots.list())).not.toContain('private-original-string')
  await data.ctx.setSystemTimezone('Asia/Taipei')
  const preview = await snapshots.preview(saved.id)
  await data.ctx.setSystemTimezone('Asia/Tokyo')
  await expect(snapshots.restore(preview.id)).rejects.toThrow('时区在还原预览后发生变化')
  const records = await data.storage.snapshots()
  records.find((record) => record.id === saved.id)!.timezoneState!.state.system = 'Asia/Tokyo'
  await data.storage.saveSnapshot(records.find((record) => record.id === saved.id)!)
  await expect(snapshots.preview(saved.id)).rejects.toThrow('完整性校验')
})
test('legacy snapshots restore files without resetting newer timezone settings', async () => {
  await data.write('.npmrc', 'registry=https://original.example\n')
  const saved = await snapshots.capture()
  const record = (await data.storage.snapshots())[0]!
  delete record.timezoneState
  delete record.timezone
  await data.storage.saveSnapshot(record)
  await data.ctx.setSystemTimezone('Asia/Tokyo')
  data.ctx.setRuntimeTimezone('Asia/Tokyo')
  await data.write('.npmrc', 'registry=https://changed.example\n')
  const preview = await snapshots.preview(saved.id)
  expect(preview.timezoneChanges).toBeUndefined()
  await snapshots.restore(preview.id)
  expect((await data.ctx.readSystemTimezone()).timezone).toBe('Asia/Tokyo')
  expect(data.ctx.env.TZ).toBe('Asia/Tokyo')
  expect(await data.read('.npmrc')).toContain('original.example')
})
test('failed file restore rolls OS timezone and TZ back to the state before restore', async () => {
  await data.write('.npmrc', 'registry=https://original.example\n')
  const saved = await snapshots.capture()
  await data.ctx.setSystemTimezone('Asia/Taipei')
  data.ctx.setRuntimeTimezone('Asia/Taipei')
  await data.write('.npmrc', 'registry=https://changed.example\n')
  const preview = await snapshots.preview(saved.id)
  const original = data.storage.savePreferences.bind(data.storage)
  vi.spyOn(data.storage, 'savePreferences')
    .mockRejectedValueOnce(new Error('disk full'))
    .mockImplementation(original)
  await expect(snapshots.restore(preview.id)).rejects.toThrow('已撤销本次还原')
  expect((await data.ctx.readSystemTimezone()).timezone).toBe('Asia/Taipei')
  expect(data.ctx.env.TZ).toBe('Asia/Taipei')
  expect(await data.read('.npmrc')).toContain('changed.example')
})
test('Windows user TZ is saved, verified, and restored without touching POSIX startup files', async () => {
  data.ctx.platform = 'win32'
  await data.ctx.setUserTimezone('Asia/Shanghai')
  const job = await execute()
  expect(await data.ctx.readUserTimezone()).toBe('Asia/Taipei')
  await expect(data.read('.zshenv')).rejects.toMatchObject({ code: 'ENOENT' })
  expect(JSON.parse(await data.read('.claude/settings.json')).env.TZ).toBe('Asia/Taipei')
  await snapshots.restore((await snapshots.preview(job.snapshotId!)).id)
  expect(await data.ctx.readUserTimezone()).toBe('Asia/Shanghai')
})
test('runtime TZ failure rolls back file writes and leaves an original backup', async () => {
  await data.write('.zshrc', "export TZ='Asia/Shanghai'\n")
  const original = data.ctx.setRuntimeTimezone
  vi.spyOn(data.ctx, 'setRuntimeTimezone').mockImplementation((zone) => {
    if (zone === 'Asia/Taipei') throw new Error('runtime failed')
    original(zone)
  })
  const job = await execute({ system: false, terminal: true })
  expect(job.nodes.find((node) => node.id === 'terminal-timezone')?.status).toBe('skipped')
  expect(await data.read('.zshrc')).toBe("export TZ='Asia/Shanghai'\n")
  await expect(data.read('.zshenv')).rejects.toMatchObject({ code: 'ENOENT' })
  expect(data.ctx.env.TZ).toBeUndefined()
})
test('macOS setter requests system administrator authorization for the validated timezone only', async () => {
  const run = vi.fn(async () => ({ ok: true, stdout: '', stderr: '' }))
  await setSystemTimezone({ platform: 'darwin', run }, 'Asia/Taipei')
  expect(run).toHaveBeenCalledWith(
    '/usr/bin/osascript',
    [
      '-e',
      'do shell script "/usr/sbin/systemsetup -settimezone \'Asia/Taipei\'" with administrator privileges',
    ],
    120000,
  )
  await expect(
    setSystemTimezone({ platform: 'darwin', run }, "Asia/Taipei'; rm -rf /"),
  ).rejects.toThrow('有效')
  expect(run).toHaveBeenCalledTimes(1)
})
test('Linux setter uses timedatectl authentication and does not change NTP or the clock', async () => {
  const run = vi.fn(async () => ({ ok: true, stdout: '', stderr: '' }))
  await setSystemTimezone({ platform: 'linux', run }, 'Asia/Taipei')
  expect(run).toHaveBeenCalledWith('timedatectl', ['set-timezone', 'Asia/Taipei'], 120000)
})
test('Windows setter requests UAC with a mapped region ID and propagates cancellation', async () => {
  const run = vi.fn(async () => ({ ok: false, stdout: '', stderr: 'denied' }))
  await expect(setSystemTimezone({ platform: 'win32', run }, 'Asia/Taipei')).rejects.toThrow('授权')
  const script = Buffer.from(run.mock.calls[0]![1][3], 'base64').toString('utf16le')
  expect(script).toContain('-Verb RunAs -Wait -PassThru')
  const payload = script.match(/-EncodedCommand ([A-Za-z0-9+/=]+)/)![1]!
  expect(Buffer.from(payload, 'base64').toString('utf16le')).toContain(
    "Set-TimeZone -Id 'Taipei Standard Time'",
  )
  await expect(setSystemTimezone({ platform: 'win32', run }, 'Europe/Paris')).rejects.toThrow(
    '映射',
  )
})
test('Windows user TZ adapter restores arbitrary old strings as data and fails closed on unreadable values', async () => {
  const run = vi.fn(async () => ({ ok: true, stdout: JSON.stringify('Asia/Shanghai'), stderr: '' }))
  const ctx = { platform: 'win32' as const, run }
  expect(await readUserTimezone(ctx)).toBe('Asia/Shanghai')
  await setUserTimezone(ctx, "'; malicious-command #")
  const script = Buffer.from(run.mock.calls[1]![1][3], 'base64').toString('utf16le')
  expect(script).not.toContain('malicious-command')
  expect(script).toContain("'User'")
  run.mockResolvedValueOnce({ ok: false, stdout: '', stderr: 'failed' })
  await expect(readUserTimezone(ctx)).rejects.toThrow('无法读取')
})
test('demo adapters never invoke host commands or change the host process TZ', async () => {
  const before = process.env.TZ
  const run = vi.fn(async () => ({ ok: true, stdout: '', stderr: '' }))
  const ctx = createContext({ demo: true, home: data.home, env: {}, run })
  await ctx.setSystemTimezone('Asia/Taipei')
  await ctx.setUserTimezone('Asia/Taipei')
  ctx.setRuntimeTimezone('Asia/Taipei')
  expect((await ctx.readSystemTimezone()).timezone).toBe('Asia/Taipei')
  expect(ctx.readRuntimeTimezone()).toBe('Asia/Taipei')
  expect(process.env.TZ).toBe(before)
  expect(run).not.toHaveBeenCalled()
  expect(await fs.readdir(path.join(data.home))).toHaveLength(0)
})

test.each(['if true; then\n# incomplete\n', 'cat <<EOF\nnot-closed\n', 'export OTHER=value \\\n'])(
  'refuses adding TZ inside an incomplete shell structure: %s',
  async (original) => {
    await data.write('.zshenv', original)
    await expect(repairs.previewTimezone('Asia/Taipei', defaultPreferences)).rejects.toThrow(
      '无法安全添加',
    )
    expect(await data.read('.zshenv')).toBe(original)
  },
)
test('snapshot rollback leaves a concurrent third-party timezone edit untouched', async () => {
  const saved = await snapshots.capture()
  await data.ctx.setSystemTimezone('Asia/Taipei')
  const preview = await snapshots.preview(saved.id)
  const save = data.storage.savePreferences.bind(data.storage)
  vi.spyOn(data.storage, 'savePreferences')
    .mockImplementationOnce(async () => {
      await data.ctx.setSystemTimezone('Asia/Tokyo')
      throw new Error('storage failed')
    })
    .mockImplementation(save)
  await expect(snapshots.restore(preview.id)).rejects.toThrow('需手动处理')
  expect((await data.ctx.readSystemTimezone()).timezone).toBe('Asia/Tokyo')
  expect((await snapshots.list()).some((record) => record.purpose === 'before-restore')).toBe(true)
})
