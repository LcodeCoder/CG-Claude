import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { defaultPreferences } from '../shared/types'
import type { SetupJob, SetupNode } from '../shared/types'
import { runSequence, SetupWorkflows } from '../server/workflows'
import { RepairEngine } from '../server/repairs'
import { SnapshotEngine } from '../server/snapshots'
import { fixture } from './fixtures'
let data: Awaited<ReturnType<typeof fixture>>
let workflows: SetupWorkflows
beforeEach(async () => {
  data = await fixture()
  workflows = new SetupWorkflows(
    data.ctx,
    data.storage,
    new RepairEngine(data.ctx, data.storage),
    new SnapshotEngine(data.ctx, data.storage),
  )
  await workflows.init()
})
afterEach(async () => {
  await data.cleanup()
})
function node(id: SetupNode['id']): SetupNode {
  return {
    id,
    title: id,
    description: '',
    enabled: true,
    files: [],
    status: 'pending',
    attempts: 0,
    retries: 0,
    message: '',
    history: [],
  }
}
function job(): SetupJob {
  return {
    id: 'test',
    previewId: 'preview',
    status: 'running',
    createdAt: new Date().toISOString(),
    preferences: defaultPreferences,
    nodes: [node('preferences'), node('verify')],
  }
}
test('retries three times after the first failure, skips, and runs the next node', async () => {
  const state = job()
  const fail = vi.fn(async () => {
    throw new Error('not writable')
  })
  const next = vi.fn(async () => 'verified')
  const wait = vi.fn(async () => {})
  await runSequence(state, { preferences: fail, verify: next }, { publish: async () => {}, wait })
  expect(fail).toHaveBeenCalledTimes(4)
  expect(wait).toHaveBeenCalledTimes(3)
  expect(next).toHaveBeenCalledTimes(1)
  expect(state.nodes[0]).toMatchObject({ status: 'skipped', attempts: 4, retries: 3 })
  expect(state.nodes[1]?.status).toBe('succeeded')
  expect(state.status).toBe('complete')
})
test('stops retrying immediately after a successful second retry', async () => {
  const state = job()
  const attempt = vi
    .fn()
    .mockRejectedValueOnce(new Error('first'))
    .mockRejectedValueOnce(new Error('second'))
    .mockResolvedValue('saved')
  await runSequence(
    state,
    { preferences: attempt, verify: async () => 'verified' },
    { publish: async () => {}, wait: async () => {} },
  )
  expect(attempt).toHaveBeenCalledTimes(3)
  expect(state.nodes[0]).toMatchObject({ status: 'succeeded', attempts: 3, retries: 2 })
})
test('never repeats an already successful write if publishing its state fails', async () => {
  const state = job()
  let publications = 0
  const write = vi.fn(async () => 'written')
  await expect(
    runSequence(
      state,
      { preferences: write },
      {
        publish: async () => {
          if (++publications === 2) throw new Error('disk full')
        },
      },
    ),
  ).rejects.toThrow('disk full')
  expect(write).toHaveBeenCalledTimes(1)
  expect(state.nodes[0]?.status).toBe('succeeded')
})
test('writes overlapping shell and Claude nodes, preserves unrelated fields, and snapshots the original', async () => {
  const original =
    'export HTTPS_PROXY=http://127.0.0.1:7890\nexport ANTHROPIC_BASE_URL=https://gateway.example\nexport PATH="$HOME/bin:$PATH"\n'
  await data.write('.zshrc', original)
  await data.write(
    '.claude/settings.json',
    JSON.stringify({
      env: { ANTHROPIC_BASE_URL: 'https://gateway.example', ANTHROPIC_API_KEY: 'fixture-key' },
      hooks: { Stop: [] },
      model: 'keep-model',
    }),
  )
  const prefs = { ...defaultPreferences, routeMode: 'tun' as const, privacy: 'minimal' as const }
  const preview = await workflows.preview({
    preferences: prefs,
    fixIds: ['shell-proxy', 'shell-endpoint', 'claude-endpoint', 'claude-privacy'],
  })
  const state = await workflows.create(preview.id)
  await workflows.execute(state)
  expect(state.status).toBe('complete')
  expect(state.nodes.filter((n) => n.enabled && n.status === 'skipped')).toHaveLength(0)
  expect(await data.read('.zshrc')).toBe('export PATH="$HOME/bin:$PATH"\n')
  const config = JSON.parse(await data.read('.claude/settings.json'))
  expect(config.env.ANTHROPIC_API_KEY).toBe('fixture-key')
  expect(config.hooks).toEqual({ Stop: [] })
  expect(config.model).toBe('keep-model')
  expect(state.snapshotId).toBeTruthy()
  expect((await data.storage.reports())[0]?.verification?.passes).toBe(3)
  const snapshots = new SnapshotEngine(data.ctx, data.storage)
  await snapshots.restore((await snapshots.preview(state.snapshotId!)).id)
  expect(await data.read('.zshrc')).toBe(original)
  expect(await data.storage.preferences()).toEqual(defaultPreferences)
})
test('is idempotent when starting the same preview twice', async () => {
  const preview = await workflows.preview({
    preferences: defaultPreferences,
    fixIds: ['claude-privacy'],
  })
  const first = await workflows.create(preview.id)
  expect((await workflows.create(preview.id)).id).toBe(first.id)
  await workflows.execute(first)
  expect((await data.storage.backups()).filter((item) => item.status === 'applied')).toHaveLength(1)
})
test('refuses a configuration changed after the user reviewed it', async () => {
  const preview = await workflows.preview({
    preferences: defaultPreferences,
    fixIds: ['claude-privacy'],
  })
  await data.write('.claude/settings.json', '{"model":"new-user-choice"}')
  await expect(workflows.create(preview.id)).rejects.toThrow('预览后发生变化')
  expect(await data.storage.backups()).toHaveLength(0)
})
test('recovers an interrupted persisted workflow without resuming writes', async () => {
  await data.storage.saveWorkflows([job()])
  await workflows.init()
  expect(workflows.list()[0]?.status).toBe('interrupted')
  expect(workflows.list()[0]?.nodes.every((n) => n.status === 'skipped')).toBe(true)
  expect(await data.storage.backups()).toHaveLength(0)
})
