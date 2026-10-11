import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { defaultPreferences } from '../shared/types'
import { SnapshotEngine } from '../server/snapshots'
import { fixture } from './fixtures'
let data: Awaited<ReturnType<typeof fixture>>
let snapshots: SnapshotEngine
beforeEach(async () => {
  data = await fixture()
  snapshots = new SnapshotEngine(data.ctx, data.storage)
})
afterEach(async () => {
  await data.cleanup()
})
test('restores complete file contents, missing files, permissions and preferences, and retains the pre-restore state', async () => {
  const original =
    'registry=https://registry.example/\n//registry.example/:_authToken=fixture-secret\n'
  await data.write('.npmrc', original)
  await fs.chmod(path.join(data.home, '.npmrc'), 0o764)
  const originalMode = (await fs.stat(path.join(data.home, '.npmrc'))).mode & 0o777
  const snapshot = await snapshots.capture()
  await data.write('.npmrc', 'registry=https://changed.example/\n')
  await data.write('.claude/settings.json', '{"env":{"DISABLE_TELEMETRY":"1"}}')
  await data.storage.savePreferences({
    ...defaultPreferences,
    routeMode: 'tun',
    privacy: 'minimal',
  })
  const preview = await snapshots.preview(snapshot.id)
  expect(JSON.stringify(preview)).not.toContain('fixture-secret')
  await snapshots.restore(preview.id)
  expect(await data.read('.npmrc')).toBe(original)
  expect((await fs.stat(path.join(data.home, '.npmrc'))).mode & 0o777).toBe(originalMode)
  await expect(data.read('.claude/settings.json')).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await data.storage.preferences()).toEqual(defaultPreferences)
  const retained = (await snapshots.list()).find((item) => item.purpose === 'before-restore')!
  await snapshots.restore((await snapshots.preview(retained.id)).id)
  expect(await data.read('.npmrc')).toContain('changed.example')
  expect(JSON.parse(await data.read('.claude/settings.json')).env.DISABLE_TELEMETRY).toBe('1')
})
test('rejects files changed after a restore preview', async () => {
  await data.write('.npmrc', 'registry=https://original.example/\n')
  const snapshot = await snapshots.capture()
  await data.write('.npmrc', 'registry=https://second.example/\n')
  const preview = await snapshots.preview(snapshot.id)
  await data.write('.npmrc', 'registry=https://latest.example/\n')
  await expect(snapshots.restore(preview.id)).rejects.toThrow('预览后发生变化')
  expect(await data.read('.npmrc')).toContain('latest.example')
})
test('excludes unreadable symlink targets from snapshots and never exposes their contents', async () => {
  await data.write('outside', 'secret-outside')
  await fs.symlink(path.join(data.home, 'outside'), path.join(data.home, '.npmrc'))
  const snapshot = await snapshots.capture()
  expect(snapshot.excludedFiles).toContain('~/.npmrc')
  expect(JSON.stringify(await snapshots.list())).not.toContain('secret-outside')
  expect(await fs.readFile(path.join(data.home, 'outside'), 'utf8')).toBe('secret-outside')
})
test('verifies snapshot integrity before creating a restore plan', async () => {
  await data.write('.npmrc', 'proxy=http://original.example\n')
  const snapshot = await snapshots.capture()
  const records = await data.storage.snapshots()
  records[0]!.entries[0]!.original = 'tampered'
  await data.storage.saveSnapshot(records[0]!)
  await expect(snapshots.preview(snapshot.id)).rejects.toThrow('完整性校验')
})

test.skipIf(process.platform === 'win32')(
  'restores permission-only changes and refuses permissions changed after preview',
  async () => {
    await data.write('.npmrc', 'registry=https://original.example/\n')
    await fs.chmod(path.join(data.home, '.npmrc'), 0o640)
    const snapshot = await snapshots.capture()
    await fs.chmod(path.join(data.home, '.npmrc'), 0o600)
    const preview = await snapshots.preview(snapshot.id)
    expect(preview.files.map((file) => file.path)).toContain('~/.npmrc')
    await fs.chmod(path.join(data.home, '.npmrc'), 0o644)
    await expect(snapshots.restore(preview.id)).rejects.toThrow('预览后发生变化')
    await snapshots.restore((await snapshots.preview(snapshot.id)).id)
    expect((await fs.stat(path.join(data.home, '.npmrc'))).mode & 0o777).toBe(0o640)
  },
)

test('excludes invalid encoding from snapshots and leaves those bytes untouched during restore', async () => {
  const target = path.join(data.home, '.npmrc')
  const original = Buffer.from([0xff, 0xfe, 0x61, 0x00])
  await fs.writeFile(target, original)
  await data.write('.gitconfig', '[user]\n  name = Original\n')
  const snapshot = await snapshots.capture()
  expect(snapshot.excludedFiles).toContain('~/.npmrc')
  expect(
    (await data.storage.snapshots())[0]?.entries.some((entry) => entry.relative === '.npmrc'),
  ).toBe(false)
  await data.write('.gitconfig', '[user]\n  name = Changed\n')
  await snapshots.restore((await snapshots.preview(snapshot.id)).id)
  expect(await fs.readFile(target)).toEqual(original)
  expect(await data.read('.gitconfig')).toContain('Original')
})

test('restores UTF-8 BOM, Chinese comments and CRLF as exact original bytes', async () => {
  const target = path.join(data.home, '.npmrc')
  const original = Buffer.from('\ufeff# 中文配置\r\nregistry=https://registry.example/\r\n')
  await fs.writeFile(target, original)
  const snapshot = await snapshots.capture()
  await data.write('.npmrc', 'registry=https://changed.example/\n')
  await snapshots.restore((await snapshots.preview(snapshot.id)).id)
  expect(await fs.readFile(target)).toEqual(original)
})

test('restoring an old snapshot keeps newer captures first in the visible timeline', async () => {
  await data.write('.npmrc', 'registry=https://original.example/\n')
  const before = await snapshots.capture()
  const beforeRecord = (await data.storage.snapshots()).find((item) => item.id === before.id)!
  beforeRecord.createdAt = '2026-10-09T00:00:00Z'
  await data.storage.saveSnapshot(beforeRecord)
  await data.write('.npmrc', 'registry=https://later.example/\n')
  const later = await snapshots.capture()
  const laterRecord = (await data.storage.snapshots()).find((item) => item.id === later.id)!
  laterRecord.createdAt = '2026-10-10T00:00:00Z'
  await data.storage.saveSnapshot(laterRecord)
  await snapshots.restore((await snapshots.preview(before.id)).id)
  const list = await snapshots.list()
  expect(list[0]?.purpose).toBe('before-restore')
  expect(list[1]?.id).toBe(later.id)
  expect(list[2]?.id).toBe(before.id)
  expect(list[2]?.restoredAt).toBeTruthy()
})

test('restores the selected timezone basis and target together with the pre-restore preference snapshot', async () => {
  const original = {
    ...defaultPreferences,
    timezoneMode: 'manual' as const,
    expectedTimezone: 'Europe/Paris',
  }
  await data.storage.savePreferences(original)
  const snapshot = await snapshots.capture()
  const changed = { ...defaultPreferences, timezoneMode: 'exit' as const }
  await data.storage.savePreferences(changed)
  const preview = await snapshots.preview(snapshot.id)
  expect(preview.preferencesChanged).toBe(true)
  expect(preview.preferences).toEqual(original)
  await snapshots.restore(preview.id)
  expect(await data.storage.preferences()).toEqual(original)
  const retained = (await snapshots.list()).find((item) => item.purpose === 'before-restore')!
  await snapshots.restore((await snapshots.preview(retained.id)).id)
  expect(await data.storage.preferences()).toEqual(changed)
})

test.each(['mode', 'preferences'] as const)(
  'detects changed snapshot %s before any restore write',
  async (field) => {
    await data.write('.npmrc', 'registry=https://original.example/\n')
    const summary = await snapshots.capture()
    const record = (await data.storage.snapshots())[0]!
    if (field === 'mode') record.entries.find((entry) => entry.relative === '.npmrc')!.mode = 0o777
    else record.preferences.privacy = 'minimal'
    await data.storage.saveSnapshot(record)
    await data.write('.npmrc', 'registry=https://current.example/\n')
    await expect(snapshots.preview(summary.id)).rejects.toThrow('完整性校验')
    expect(await data.read('.npmrc')).toBe('registry=https://current.example/\n')
    expect((await data.storage.preferences()).privacy).toBe('balanced')
  },
)

test.skipIf(process.platform === 'win32')(
  'failed restore preserves a permission change made by another program',
  async () => {
    await data.write('.npmrc', 'registry=https://original.example/\n')
    const summary = await snapshots.capture()
    await data.write('.npmrc', 'registry=https://current.example/\n')
    const preview = await snapshots.preview(summary.id)
    const save = data.storage.savePreferences.bind(data.storage)
    const spy = vi
      .spyOn(data.storage, 'savePreferences')
      .mockImplementationOnce(async () => {
        await fs.chmod(path.join(data.home, '.npmrc'), 0o644)
        throw new Error('fixture-storage-full')
      })
      .mockImplementation(save)
    try {
      await expect(snapshots.restore(preview.id)).rejects.toThrow('需手动处理')
      expect((await fs.stat(path.join(data.home, '.npmrc'))).mode & 0o777).toBe(0o644)
      expect((await snapshots.list()).some((record) => record.purpose === 'before-restore')).toBe(
        true,
      )
    } finally {
      spy.mockRestore()
    }
  },
)

test('failed restore never rolls preferences back over a newer external change', async () => {
  const summary = await snapshots.capture()
  await data.storage.savePreferences({ ...defaultPreferences, routeMode: 'tun' })
  const plan = await snapshots.preview(summary.id)
  const save = data.storage.savePreferences.bind(data.storage)
  const spy = vi
    .spyOn(data.storage, 'savePreferences')
    .mockImplementationOnce(async () => {
      await save({ ...defaultPreferences, usageMode: 'custom' })
      throw new Error('fixture-third-party-preference-change')
    })
    .mockImplementation(save)
  try {
    await expect(snapshots.restore(plan.id)).rejects.toThrow('检测偏好')
    expect((await data.storage.preferences()).usageMode).toBe('custom')
    expect((await snapshots.list()).some((record) => record.purpose === 'before-restore')).toBe(
      true,
    )
  } finally {
    spy.mockRestore()
  }
})
