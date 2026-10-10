import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
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
