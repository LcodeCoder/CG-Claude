import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { BrowserLanguageEngine } from '../server/browser-configuration'
import { fixture } from './fixtures'
import { createAppServer } from '../server/index'
const file = 'Library/Application Support/Google/Chrome/Default/Preferences'
const original = {
  intl: { selected_languages: 'zh-CN,zh,en-US', accept_languages: 'zh-CN,zh,en-US' },
  profile: { name: 'private-profile' },
  credential: { token: 'fixture-private-token' },
  unrelated: { keep: true },
}
let data: Awaited<ReturnType<typeof fixture>>
let engine: BrowserLanguageEngine
beforeEach(async () => {
  data = await fixture()
  engine = new BrowserLanguageEngine(data.ctx, data.storage)
  await data.write(file, JSON.stringify(original))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await data.cleanup()
})
async function preview(appLanguage = false) {
  const profile = (await engine.configuration()).profiles[0]!
  return engine.preview({ profileId: profile.id, language: 'en-US', appLanguage })
}
test('changes the chosen external browser profile, preserves other values and saves only language metadata', async () => {
  const plan = await preview(true)
  expect(JSON.stringify(plan)).not.toMatch(/private-profile|fixture-private-token/)
  const applied = await engine.apply(plan.id)
  expect(applied.message).toContain('重开')
  expect(JSON.parse(await data.read(file))).toEqual({
    ...original,
    intl: { ...original.intl, selected_languages: 'en-US,en' },
  })
  const stat = await fs.stat(path.join(data.home, file))
  if (process.platform !== 'win32') expect(stat.mode & 0o777).toBe(0o600)
  const record = (await data.storage.browserLanguageBackups())[0]!
  expect(record.status).toBe('applied')
  expect(record.beforeAppLanguages).toBeNull()
  expect(record.afterAppLanguages).toEqual(['en-US', 'en'])
  const persisted = await fs.readFile(
    path.join(data.ctx.dataDir, 'browser-language-backups.json'),
    'utf8',
  )
  expect(persisted).not.toMatch(/private-profile|fixture-private-token|credential|unrelated/)
  const updated = JSON.parse(await data.read(file))
  updated.unrelated.keep = 'new-user-edit'
  updated.credential.token = 'new-fixture-token'
  await data.write(file, JSON.stringify(updated))
  await engine.restore(record.id)
  expect(JSON.parse(await data.read(file))).toEqual({
    ...original,
    unrelated: { keep: 'new-user-edit' },
    credential: { token: 'new-fixture-token' },
  })
  expect((await data.storage.browserLanguageBackups())[0]?.status).toBe('restored')
  await expect(engine.restore(record.id)).rejects.toThrow('不可还原')
})
test('restoring an absent language preference removes the field without inventing a default', async () => {
  await data.write(file, JSON.stringify({ profile: { keep: true } }))
  const plan = await preview()
  const { backupId } = await engine.apply(plan.id)
  await engine.restore(backupId)
  expect(JSON.parse(await data.read(file))).toEqual({ profile: { keep: true } })
})
test('restores legacy accept_languages after a simulated Chromium restart with absent selected_languages', async () => {
  const legacy = { intl: { accept_languages: 'zh-CN,zh' }, profile: { keep: true } }
  await data.write(file, JSON.stringify(legacy))
  const plan = await preview()
  const { backupId } = await engine.apply(plan.id)
  // Chromium derives this field from the new selection at startup.
  const restarted = JSON.parse(await data.read(file))
  restarted.intl.accept_languages = 'en-US,en'
  await data.write(file, JSON.stringify(restarted))
  await engine.restore(backupId)
  expect(JSON.parse(await data.read(file))).toEqual(legacy)
})
test('refuses changed files or modes after preview and leaves no language backup or partial change', async () => {
  const plan = await preview()
  await data.write(file, JSON.stringify({ ...original, newer: true }))
  await expect(engine.apply(plan.id)).rejects.toThrow('预览后发生变化')
  expect(await data.storage.browserLanguageBackups()).toHaveLength(0)
  if (process.platform === 'win32') return // POSIX mode drift has no equivalent on Windows.
  const next = await preview()
  await fs.chmod(path.join(data.home, file), 0o644)
  await expect(engine.apply(next.id)).rejects.toThrow('预览后发生变化')
  expect(JSON.parse(await data.read(file)).intl.selected_languages).toBe(
    original.intl.selected_languages,
  )
})
test('requires a fully closed browser and refuses to overwrite user edits during restoration', async () => {
  const run = vi.fn().mockResolvedValue({
    ok: true,
    stdout: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    stderr: '',
  })
  engine = new BrowserLanguageEngine({ ...data.ctx, demo: false, run }, data.storage)
  const plan = await preview()
  await expect(engine.apply(plan.id)).rejects.toThrow('完全退出')
  expect(await data.storage.browserLanguageBackups()).toHaveLength(0)
  run.mockResolvedValue({ ok: true, stdout: '', stderr: '' })
  const { backupId } = await engine.apply(plan.id)
  const changed = JSON.parse(await data.read(file))
  changed.intl.selected_languages = 'fr,en'
  await data.write(file, JSON.stringify(changed))
  await expect(engine.restore(backupId)).rejects.toThrow('其他设置修改')
  expect(JSON.parse(await data.read(file)).intl.selected_languages).toBe('fr,en')
})
test('a failure after the profile write retains a prepared backup that can restore that partial change', async () => {
  await data.write('Library/Preferences/com.google.Chrome.plist', 'fixture-plist')
  const run = vi.fn(async (command: string) => ({
    ok: command !== '/usr/bin/defaults',
    stdout: command === '/usr/bin/plutil' ? '["zh-Hans"]' : '',
    stderr: '',
  }))
  engine = new BrowserLanguageEngine({ ...data.ctx, demo: false, run }, data.storage)
  const plan = await preview(true)
  await expect(engine.apply(plan.id)).rejects.toThrow('修改前的语言备份已保留')
  expect(JSON.parse(await data.read(file)).intl.selected_languages).toBe('en-US,en')
  const record = (await data.storage.browserLanguageBackups())[0]!
  expect(record.status).toBe('prepared')
  await engine.restore(record.id)
  expect(JSON.parse(await data.read(file))).toEqual(original)
  expect((await data.storage.browserLanguageBackups())[0]?.status).toBe('restored')
})
test.each(['symlink', 'hardlink'] as const)(
  'rejects %s preferences and never writes the linked target',
  async (kind) => {
    const filename = path.join(data.home, file)
    const linked = path.join(data.root, 'linked-preferences')
    await fs.writeFile(linked, JSON.stringify(original))
    await fs.unlink(filename)
    if (kind === 'symlink') await fs.symlink(linked, filename)
    else await fs.link(linked, filename)
    const configuration = await engine.configuration()
    expect(configuration.profiles[0]?.problem).toContain('无法安全读取')
    await expect(
      engine.preview({
        profileId: configuration.profiles[0]!.id,
        language: 'en-US',
        appLanguage: false,
      }),
    ).rejects.toThrow('链接')
    expect(JSON.parse(await fs.readFile(linked, 'utf8'))).toEqual(original)
  },
)
test.each([{ intl: { selected_languages: [] } }, { intl: { forced_languages: ['zh-CN'] } }])(
  'refuses malformed or organization-forced language preferences',
  async (value) => {
    await data.write(file, JSON.stringify(value))
    await expect(preview()).rejects.toThrow()
    expect(await data.storage.browserLanguageBackups()).toHaveLength(0)
  },
)
test('opaque IDs cannot select arbitrary files and a tampered backup is rejected before restore', async () => {
  await expect(
    engine.preview({ profileId: '../../anything', language: 'en-US', appLanguage: false }),
  ).rejects.toThrow()
  const plan = await preview()
  await engine.apply(plan.id)
  const filename = path.join(data.ctx.dataDir, 'browser-language-backups.json')
  const records = JSON.parse(await fs.readFile(filename, 'utf8'))
  records[0].beforeSelected = 'fr'
  await fs.writeFile(filename, JSON.stringify(records), { mode: 0o600 })
  await expect(engine.restore(records[0].id)).rejects.toThrow('完整性校验')
  expect(JSON.parse(await data.read(file)).intl.selected_languages).toBe('en-US,en')
})

test('browser language API checks authentication and strict inputs and exposes only language backups', async () => {
  const app = await createAppServer({ ctx: data.ctx, port: 0, dev: false })
  try {
    const base = `http://127.0.0.1:${await app.listen()}`
    const boot = await (await fetch(base + '/api/bootstrap')).json()
    const profile = boot.browserLanguages.profiles[0]
    const post = (route: string, input: unknown, token = boot.token) =>
      fetch(base + route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CG-Token': token },
        body: JSON.stringify(input),
      })
    const request = { profileId: profile.id, language: 'en-US', appLanguage: true }
    expect((await post('/api/browser-language/preview', request, '')).status).toBe(403)
    expect(
      (await post('/api/browser-language/preview', { ...request, filename: '/arbitrary' })).status,
    ).toBe(400)
    expect(
      (await post('/api/browser-language/preview', { ...request, profileId: '../../arbitrary' }))
        .status,
    ).toBe(400)
    const previewResponse = await post('/api/browser-language/preview', request)
    expect(previewResponse.status).toBe(200)
    const plan = await previewResponse.json()
    const applied = await post(`/api/browser-language/${plan.id}/apply`, {})
    expect(applied.status).toBe(200)
    const result = await applied.json()
    const updated = await (await fetch(base + '/api/bootstrap')).json()
    expect(updated.browserLanguages.backups[0].status).toBe('applied')
    expect(JSON.stringify(updated.browserLanguages)).not.toMatch(
      /private-profile|fixture-private-token|beforeSelected|beforeAppLanguages/,
    )
    expect(
      (await post(`/api/browser-language/backups/${result.backupId}/restore`, {})).status,
    ).toBe(200)
    expect(JSON.parse(await data.read(file))).toEqual(original)
  } finally {
    await app.close()
  }
})
