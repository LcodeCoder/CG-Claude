import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { connectionRequestSchema } from '../shared/connections'
import { defaultPreferences } from '../shared/types'
import { describeConnectionConfiguration, prepareConnectionEdit } from '../server/connections'
import { RepairEngine } from '../server/repairs'
import { SnapshotEngine } from '../server/snapshots'
import { readConfig } from '../server/safety'
import { fixture } from './fixtures'
let data: Awaited<ReturnType<typeof fixture>>
let repairs: RepairEngine
let snapshots: SnapshotEngine
const edit = { changes: [{ key: 'HTTPS_PROXY' as const, value: 'http://127.0.0.1:7890' }] }
beforeEach(async () => {
  data = await fixture()
  repairs = new RepairEngine(data.ctx, data.storage)
  snapshots = new SnapshotEngine(data.ctx, data.storage)
})
afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await data.cleanup()
})

describe('connection configuration transactions', () => {
  test('writes selected fields, snapshots the full baseline and restores exact originals', async () => {
    const original =
      JSON.stringify(
        {
          env: {
            ANTHROPIC_API_KEY: 'test-secret-api-key',
            https_proxy: 'http://old-proxy:8080',
            OTHER_SETTING: 'keep-me',
          },
          model: 'sonnet',
          hooks: { Stop: [] },
          permissions: { allow: ['Read'] },
        },
        null,
        4,
      ) + '\n'
    await data.write('.claude/settings.json', original)
    await fs.chmod(path.join(data.home, '.claude/settings.json'), 0o640)
    await data.write('.zshrc', '# keep complete shell baseline\n')
    const plan = await repairs.previewConnection(edit, defaultPreferences)
    expect(plan.files[0]?.changes.map((change) => change.key)).toEqual([
      'HTTPS_PROXY',
      'https_proxy',
    ])
    expect(JSON.stringify(plan)).not.toContain('test-secret-api-key')
    await expect(repairs.apply(plan.id, defaultPreferences)).rejects.toThrow('连接预览')
    const backup = await repairs.applyConnection(plan.id, defaultPreferences, snapshots)
    expect(backup.label).toContain('连接设置')
    expect(backup.snapshotId).toBeTruthy()
    const snap = (await data.storage.snapshots())[0]!
    expect(snap.purpose).toBe('connection')
    expect(snap.entries.find((file) => file.relative === '.zshrc')?.original).toContain(
      'shell baseline',
    )
    const saved = JSON.parse(await data.read('.claude/settings.json'))
    expect(saved.env).toEqual({
      ANTHROPIC_API_KEY: 'test-secret-api-key',
      OTHER_SETTING: 'keep-me',
      HTTPS_PROXY: 'http://127.0.0.1:7890',
    })
    expect(saved.permissions).toEqual({ allow: ['Read'] })
    expect(saved.hooks).toEqual({ Stop: [] })
    if (process.platform !== 'win32')
      expect((await fs.stat(path.join(data.home, '.claude/settings.json'))).mode & 0o777).toBe(
        0o640,
      )
    await repairs.restore(backup.id)
    expect(await data.read('.claude/settings.json')).toBe(original)
  })
  test('creates an absent file and restores its original absence', async () => {
    const plan = await repairs.previewConnection(edit, defaultPreferences)
    expect(plan.files[0]?.exists).toBe(false)
    const backup = await repairs.applyConnection(plan.id, defaultPreferences, snapshots)
    expect(JSON.parse(await data.read('.claude/settings.json')).env.HTTPS_PROXY).toContain(
      '127.0.0.1',
    )
    await repairs.restore(backup.id)
    await expect(data.read('.claude/settings.json')).rejects.toMatchObject({ code: 'ENOENT' })
  })
  test('masks prior and new proxy credentials and API URL queries from previews and bootstrap summaries', async () => {
    await data.write(
      '.claude/settings.json',
      JSON.stringify({
        env: {
          HTTPS_PROXY: 'http://private-user:old-password@localhost:8080',
          ANTHROPIC_BASE_URL: 'https://gateway.example/api?token=secret-query',
        },
      }),
    )
    const plan = await repairs.previewConnection(
      { changes: [{ key: 'HTTPS_PROXY', value: 'http://new-user:new-password@127.0.0.1:7890' }] },
      defaultPreferences,
    )
    const info = describeConnectionConfiguration(
      data.ctx,
      await readConfig(data.ctx, '.claude/settings.json'),
    )
    const visible = JSON.stringify([plan, info])
    for (const secret of [
      'private-user',
      'old-password',
      'new-user',
      'new-password',
      'secret-query',
    ])
      expect(visible).not.toContain(secret)
    expect(info.fields.find((field) => field.key === 'ANTHROPIC_BASE_URL')?.current).toContain(
      'gateway.example',
    )
  })
  test.skipIf(process.platform === 'win32')(
    'rejects permissions changed after preview before creating a snapshot or writing',
    async () => {
      await data.write('.claude/settings.json', '{}')
      const plan = await repairs.previewConnection(edit, defaultPreferences)
      await fs.chmod(path.join(data.home, '.claude/settings.json'), 0o640)
      await expect(repairs.applyConnection(plan.id, defaultPreferences, snapshots)).rejects.toThrow(
        '发生变化',
      )
      expect(await data.read('.claude/settings.json')).toBe('{}')
      expect(await snapshots.list()).toHaveLength(0)
      expect(await data.storage.backups()).toHaveLength(0)
    },
  )
  test('a failed full snapshot prevents the setting write', async () => {
    const plan = await repairs.previewConnection(edit, defaultPreferences)
    vi.spyOn(snapshots, 'capture').mockRejectedValueOnce(new Error('snapshot storage unavailable'))
    await expect(repairs.applyConnection(plan.id, defaultPreferences, snapshots)).rejects.toThrow(
      'storage unavailable',
    )
    await expect(data.read('.claude/settings.json')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await data.storage.backups()).toHaveLength(0)
  })
  test('previews expire and equivalent values do not create a write plan', async () => {
    await data.write(
      '.claude/settings.json',
      JSON.stringify({ env: { HTTPS_PROXY: edit.changes[0].value } }),
    )
    await expect(repairs.previewConnection(edit, defaultPreferences)).rejects.toThrow('无需修改')
    const plan = await repairs.previewConnection(
      { changes: [{ key: 'HTTPS_PROXY', value: null }] },
      defaultPreferences,
    )
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 600001)
    await expect(repairs.applyConnection(plan.id, defaultPreferences, snapshots)).rejects.toThrow(
      '过期',
    )
  })
  test('removes both selected casing variants and preserves higher-priority unrelated fields', async () => {
    await data.write(
      '.claude/settings.json',
      JSON.stringify({
        env: {
          HTTPS_PROXY: 'http://primary:8080',
          HTTP_PROXY: 'http://old:8080',
          http_proxy: 'http://lower:8080',
          no_proxy: 'localhost',
        },
      }),
    )
    const prepared = await prepareConnectionEdit(data.ctx, {
      changes: [
        { key: 'HTTP_PROXY', value: 'http://backup:8080' },
        { key: 'NO_PROXY', value: null },
      ],
    })
    expect(JSON.parse(prepared.after).env).toEqual({
      HTTPS_PROXY: 'http://primary:8080',
      HTTP_PROXY: 'http://backup:8080',
    })
    expect(prepared.notes.some((note) => note.includes('会优先'))).toBe(true)
    expect(prepared.changes.map((change) => change.key)).toContain('no_proxy')
  })
  test('rejects invalid JSON, unsupported custom configuration directories and symlinks', async () => {
    await data.write('.claude/settings.json', '')
    await expect(repairs.previewConnection(edit, defaultPreferences)).rejects.toThrow(
      'JSON 格式错误',
    )
    await data.write('.claude/settings.json', '{}')
    data.ctx.env.CLAUDE_CONFIG_DIR = path.join(data.root, 'different-config')
    await expect(repairs.previewConnection(edit, defaultPreferences)).rejects.toThrow(
      'CLAUDE_CONFIG_DIR',
    )
    delete data.ctx.env.CLAUDE_CONFIG_DIR
    if (process.platform !== 'win32') {
      const target = path.join(data.home, '.claude/settings.json')
      await fs.rename(target, target + '.original')
      await fs.symlink(target + '.original', target)
      await expect(repairs.previewConnection(edit, defaultPreferences)).rejects.toThrow('符号链接')
    }
  })
  test('checks CA metadata without opening its contents, and rechecks before apply', async () => {
    const cert = path.join(data.root, 'corporate-ca.pem')
    await fs.writeFile(cert, 'not-a-real-certificate: metadata only')
    const open = vi.spyOn(fs, 'open')
    const plan = await repairs.previewConnection(
      { changes: [{ key: 'NODE_EXTRA_CA_CERTS', value: cert }] },
      defaultPreferences,
    )
    expect(open.mock.calls.some((call) => call[0] === cert)).toBe(false)
    await fs.unlink(cert)
    await expect(repairs.applyConnection(plan.id, defaultPreferences, snapshots)).rejects.toThrow(
      'CA 证书文件',
    )
    expect(await snapshots.list()).toHaveLength(0)
    for (const value of ['~/ca.pem', '${CA_PATH}', data.root, '']) {
      await expect(
        repairs.previewConnection(
          { changes: [{ key: 'NODE_EXTRA_CA_CERTS', value }] },
          defaultPreferences,
        ),
      ).rejects.toThrow()
    }
  })
  test.skipIf(process.platform === 'win32')(
    'refuses a restore after permissions change without overwriting later choices',
    async () => {
      const plan = await repairs.previewConnection(edit, defaultPreferences)
      const backup = await repairs.applyConnection(plan.id, defaultPreferences, snapshots)
      await fs.chmod(path.join(data.home, '.claude/settings.json'), 0o640)
      await expect(repairs.restore(backup.id)).rejects.toThrow('覆盖新内容')
      expect(JSON.parse(await data.read('.claude/settings.json')).env.HTTPS_PROXY).toBe(
        edit.changes[0].value,
      )
    },
  )
  test('requires a connection plan on the connection apply path', async () => {
    const plan = await repairs.preview(['claude-privacy'], defaultPreferences)
    await expect(repairs.applyConnection(plan.id, defaultPreferences, snapshots)).rejects.toThrow(
      '连接设置预览不存在',
    )
  })
})

test('connection schema rejects arbitrary fields, duplicate keys and malformed values', () => {
  for (const changes of [
    [{ key: 'NODE_OPTIONS', value: '--require ./malicious.js' }],
    [{ key: 'HTTPS_PROXY', value: 'socks5://localhost:1080' }],
    [{ key: 'HTTPS_PROXY', value: 'http://localhost:7890/path' }],
    [{ key: 'ANTHROPIC_BASE_URL', value: 'https://user:password@gateway.example' }],
    [{ key: 'ANTHROPIC_BASE_URL', value: 'https://gateway.example/?token=private' }],
    [{ key: 'NO_PROXY', value: 'localhost\n*' }],
    [{ key: 'NO_PROXY', value: '  ' }],
    [
      { key: 'HTTPS_PROXY', value: 'http://localhost:7890' },
      { key: 'HTTPS_PROXY', value: null },
    ],
  ])
    expect(connectionRequestSchema.safeParse({ changes }).success).toBe(false)
  expect(connectionRequestSchema.safeParse(edit).success).toBe(true)
  expect(
    connectionRequestSchema.safeParse({
      changes: [{ key: 'HTTPS_PROXY', value: null }],
      path: '/etc/passwd',
    }).success,
  ).toBe(false)
})
