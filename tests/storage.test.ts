import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { fixture } from './fixtures'
import { RepairEngine } from '../server/repairs'
import { SnapshotEngine } from '../server/snapshots'
import { defaultPreferences } from '../shared/types'

let data: Awaited<ReturnType<typeof fixture>>
beforeEach(async () => {
  data = await fixture()
})
afterEach(async () => {
  await data.cleanup()
})

test.each(['reports.json', 'workflows.json', 'backups.json', 'snapshots.json'])(
  'rejects a valid JSON object where %s requires a collection, without rewriting it',
  async (name) => {
    const target = path.join(data.ctx.dataDir, name)
    const content = '{"private-note":"fixture-secret"}'
    await fs.writeFile(target, content)
    const operation =
      name === 'reports.json'
        ? () => data.storage.reports()
        : name === 'workflows.json'
          ? () => data.storage.workflows()
          : name === 'backups.json'
            ? () => data.storage.manifests()
            : () => data.storage.snapshots()
    await expect(operation()).rejects.toThrow(name)
    expect(await fs.readFile(target, 'utf8')).toBe(content)
  },
)

test('bounds actual record reads and rejects invalid encoding, links and special files', async () => {
  const target = path.join(data.ctx.dataDir, 'reports.json')
  await fs.writeFile(target, '[]')
  await fs.truncate(target, 64 * 1024 * 1024 + 1)
  await expect(data.storage.reports()).rejects.toThrow('原记录已保留')
  await fs.writeFile(target, Buffer.from([0xff, 0xfe, 0x00]))
  await expect(data.storage.reports()).rejects.toThrow('reports.json')
  await fs.unlink(target)
  await data.write('outside-record', '[]')
  await fs.symlink(path.join(data.home, 'outside-record'), target)
  await expect(data.storage.reports()).rejects.toThrow('reports.json')
  await fs.unlink(target)
  await fs.mkdir(target)
  await expect(data.storage.reports()).rejects.toThrow('reports.json')
})

test('rejects a data directory replaced with a symlink after initialization', async () => {
  const moved = path.join(data.root, 'moved-data')
  await fs.rename(data.ctx.dataDir, moved)
  await fs.symlink(moved, data.ctx.dataDir, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(data.storage.reports()).rejects.toThrow('数据目录已变化')
  await expect(data.storage.savePreferences(defaultPreferences)).rejects.toThrow('数据目录已变化')
  expect(await fs.readdir(moved)).toEqual([])
})

test('validates legacy backup paths and modes before exposing a restore action', async () => {
  const repairs = new RepairEngine(data.ctx, data.storage)
  const backup = await repairs.apply(
    (await repairs.preview(['claude-privacy'], defaultPreferences)).id,
    defaultPreferences,
  )
  const records = await data.storage.manifests()
  const record = records[0]!
  delete record.integrityHash
  record.entries[0]!.relative = '../outside'
  await data.storage.saveManifest(record)
  await expect(repairs.restore(backup.id)).rejects.toThrow('数据结构无效')
})

test('rejects duplicate snapshot destinations before a legacy restore preview', async () => {
  const snapshots = new SnapshotEngine(data.ctx, data.storage)
  const summary = await snapshots.capture()
  const record = (await data.storage.snapshots())[0]!
  delete record.integrityHash
  record.entries[1] = { ...record.entries[0]! }
  await data.storage.saveSnapshot(record)
  await expect(snapshots.preview(summary.id)).rejects.toThrow('数据结构无效')
})

test('keeps old snapshot preferences readable and restores their original intent', async () => {
  const snapshots = new SnapshotEngine(data.ctx, data.storage)
  const summary = await snapshots.capture()
  const target = path.join(data.ctx.dataDir, 'snapshots.json')
  const records = JSON.parse(await fs.readFile(target, 'utf8'))
  delete records[0].integrityHash
  delete records[0].timezoneState
  delete records[0].preferences.timezoneMode
  records[0].preferences.expectedTimezone = 'Europe/Paris'
  await fs.writeFile(target, JSON.stringify(records))
  const plan = await snapshots.preview(summary.id)
  expect(plan.preferences.timezoneMode).toBe('manual')
  await snapshots.restore(plan.id)
  expect((await data.storage.preferences()).expectedTimezone).toBe('Europe/Paris')
})

test('authenticated snapshots of legacy preferences remain readable after normalization and restore', async () => {
  const legacy = { ...defaultPreferences } as Partial<typeof defaultPreferences>
  delete legacy.timezoneMode
  await fs.writeFile(path.join(data.ctx.dataDir, 'preferences.json'), JSON.stringify(legacy))
  const snapshots = new SnapshotEngine(data.ctx, data.storage)
  const original = await snapshots.capture()
  const first = await snapshots.preview(original.id)
  expect(first.preferencesChanged).toBe(false)
  await snapshots.restore(first.id)
  expect((await snapshots.list()).find((record) => record.id === original.id)?.status).toBe(
    'restored',
  )
  const another = await snapshots.capture()
  expect((await snapshots.list()).find((record) => record.id === another.id)).toBeDefined()
})
