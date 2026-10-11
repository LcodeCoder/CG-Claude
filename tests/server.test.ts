import { get as httpGet } from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createAppServer } from '../server/index'
import { defaultPreferences } from '../shared/types'
import { fixture } from './fixtures'
let data: Awaited<ReturnType<typeof fixture>>
let app: Awaited<ReturnType<typeof createAppServer>>
let base: string
let token: string
beforeEach(async () => {
  data = await fixture()
  app = await createAppServer({ ctx: data.ctx, port: 0, dev: false })
  base = `http://127.0.0.1:${await app.listen()}`
  token = (await (await fetch(base + '/api/bootstrap')).json()).token
})
afterEach(async () => {
  await app.close()
  await data.cleanup()
})
function post(url: string, value: unknown, auth = token) {
  return fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CG-Token': auth },
    body: JSON.stringify(value),
  })
}
test('rejects mutation without the local token', async () => {
  expect((await post('/api/repairs/preview', { fixIds: ['claude-privacy'] }, '')).status).toBe(403)
})
test('rejects hostile origins and DNS rebinding hosts', async () => {
  expect(
    (await fetch(base + '/api/bootstrap', { headers: { Origin: 'https://evil.example' } })).status,
  ).toBe(403)
  const status = await new Promise<number>((resolve) => {
    httpGet(base + '/api/bootstrap', { headers: { Host: 'evil.example' } }, (response) => {
      response.resume()
      resolve(response.statusCode ?? 0)
    })
  })
  expect(status).toBe(403)
})
test('validates fix ids and never accepts arbitrary file paths', async () => {
  expect(
    (await post('/api/repairs/preview', { fixIds: ['execute-command'], path: '/etc/passwd' }))
      .status,
  ).toBe(400)
})
test('validates IANA timezones before saving preferences', async () => {
  const response = await fetch(base + '/api/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-CG-Token': token },
    body: JSON.stringify({ ...defaultPreferences, expectedTimezone: 'invalid/timezone' }),
  })
  expect(response.status).toBe(400)
})
test('completes a scan and serves only redacted report exports by default', async () => {
  const start = await post('/api/scans', { network: true })
  expect(start.status).toBe(202)
  const job = await start.json()
  let status = await (await fetch(base + '/api/scans/' + job.id)).json()
  while (status.status === 'running') {
    await new Promise((resolve) => setTimeout(resolve, 10))
    status = await (await fetch(base + '/api/scans/' + job.id)).json()
  }
  expect(status.status).toBe('complete')
  const exported = await (
    await fetch(base + `/api/reports/${status.report.id}/export?format=json`)
  ).text()
  expect(exported).not.toContain('8.8.8.8')
  expect(exported).not.toContain('Guard-Test-Mac')
})
test('API previews, writes real configuration, and restores it without exposing originals', async () => {
  const preview = await post('/api/repairs/preview', { fixIds: ['claude-privacy'] })
  expect(preview.status).toBe(200)
  const plan = await preview.json()
  const apply = await post(`/api/repairs/${plan.id}/apply`, {})
  expect(apply.status).toBe(200)
  const backup = await apply.json()
  expect(backup.entries).toBeUndefined()
  expect(JSON.parse(await data.read('.claude/settings.json')).env.DISABLE_TELEMETRY).toBe('1')
  const restore = await post(`/api/backups/${backup.id}/restore`, {})
  expect(restore.status).toBe(200)
})

test('serializes concurrent scan starts', async () => {
  const original = data.ctx.run
  data.ctx.run = async (command, args) => {
    await new Promise((resolve) => setTimeout(resolve, 25))
    return original(command, args)
  }
  const results = await Promise.all([
    post('/api/scans', { network: false }),
    post('/api/scans', { network: false }),
  ])
  expect(results.map((result) => result.status).sort()).toEqual([202, 409])
  const first = results.find((result) => result.status === 202)!
  const job = await first.json()
  while ((await (await fetch(base + '/api/scans/' + job.id)).json()).status === 'running')
    await new Promise((resolve) => setTimeout(resolve, 10))
})

test('runs a setup server-side, rejects concurrent writes and returns the same job on duplicate starts', async () => {
  const preview = await (
    await post('/api/setup/preview', {
      preferences: defaultPreferences,
      fixIds: ['claude-privacy'],
    })
  ).json()
  const started = await post(`/api/setup/${preview.id}/start`, {})
  expect(started.status).toBe(202)
  const state = await started.json()
  expect((await (await post(`/api/setup/${preview.id}/start`, {})).json()).id).toBe(state.id)
  expect((await post('/api/scans', { network: false })).status).toBe(409)
  let final = state
  while (final.status === 'running') {
    await new Promise((resolve) => setTimeout(resolve, 10))
    final = await (await fetch(base + '/api/setup/' + state.id)).json()
  }
  expect(final.snapshotId).toBeTruthy()
  expect(final.reportId).toBeTruthy()
  const bootstrap = await (await fetch(base + '/api/bootstrap')).json()
  expect(bootstrap.snapshots[0].purpose).toBe('setup')
  expect(JSON.stringify(bootstrap)).not.toContain('"original"')
})
test('refuses a second service sharing the same data directory, then releases the lock on close', async () => {
  await expect(createAppServer({ ctx: data.ctx, port: 0 })).rejects.toThrow('另一个 CG Claude')
  await Promise.all([app.close(), app.close()])
  const next = await createAppServer({ ctx: data.ctx, port: 0 })
  await next.listen()
  await next.close()
})
test('protects snapshot and project mutations with the same operation token', async () => {
  expect((await post('/api/snapshots', {}, '')).status).toBe(403)
  expect((await post('/api/projects/scan', { path: data.home }, '')).status).toBe(403)
  expect((await post('/api/scans', { passes: 4 })).status).toBe(400)
})

function reviewRequest(value: unknown, auth = token) {
  return fetch(base + '/api/manual-reviews', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-CG-Token': auth },
    body: JSON.stringify(value),
  })
}

test('manual reviews persist across service restart and a new localhost port', async () => {
  const response = await reviewRequest({ id: 'dns', checked: true, note: '已人工核对解析出口' })
  expect(response.status).toBe(200)
  const saved = (await response.json())[0]
  expect(saved.checkedAt).toBeTruthy()
  await app.close()
  app = await createAppServer({ ctx: data.ctx, port: 0 })
  base = `http://127.0.0.1:${await app.listen()}`
  const boot = await (await fetch(base + '/api/bootstrap')).json()
  token = boot.token
  expect(boot.manualReviews).toEqual([saved])
  expect(boot.manualReviews[0].note).toBe('已人工核对解析出口')
})

test('note edits preserve confirmation time and unchecking clears it', async () => {
  const first = await (
    await reviewRequest({ id: 'auth-method', checked: true, note: '初次确认' })
  ).json()
  const second = await (
    await reviewRequest({ id: 'auth-method', checked: true, note: ' 更新备注 ' })
  ).json()
  expect(second[0].checkedAt).toBe(first[0].checkedAt)
  expect(second[0].note).toBe('更新备注')
  const third = await (
    await reviewRequest({ id: 'auth-method', checked: false, note: '准备重新检查' })
  ).json()
  expect(third[0].checkedAt).toBeUndefined()
  expect(third[0].checked).toBe(false)
})

test('legacy imports are idempotent and preserve current explicit review choices', async () => {
  await reviewRequest({ id: 'dns', checked: false, note: '需要重新核对' })
  const imported = await post('/api/manual-reviews/import', { ids: ['dns', 'webrtc', 'webrtc'] })
  const value = await imported.json()
  expect(value).toHaveLength(2)
  expect(value.find((review: { id: string }) => review.id === 'dns')).toMatchObject({
    checked: false,
    note: '需要重新核对',
    origin: 'manual',
  })
  expect(value.find((review: { id: string }) => review.id === 'webrtc')).toMatchObject({
    checked: true,
    origin: 'legacy',
  })
  expect(value.find((review: { id: string }) => review.id === 'webrtc').checkedAt).toBeUndefined()
  const repeated = await (
    await post('/api/manual-reviews/import', { ids: ['dns', 'webrtc'] })
  ).json()
  expect(repeated).toEqual(value)
})

test('manual review endpoints validate IDs notes and the local token', async () => {
  expect((await reviewRequest({ id: 'unknown-review', checked: true })).status).toBe(400)
  expect((await reviewRequest({ id: 'dns', checked: true, note: 'x'.repeat(601) })).status).toBe(
    400,
  )
  expect((await reviewRequest({ id: 'dns', checked: 'yes' })).status).toBe(400)
  expect((await reviewRequest({ id: 'dns', checked: true }, '')).status).toBe(403)
  expect((await post('/api/manual-reviews/import', { ids: ['unknown-review'] })).status).toBe(400)
  expect((await post('/api/manual-reviews/reset', {}, '')).status).toBe(403)
  expect(await data.storage.manualReviews()).toEqual([])
})

test('manual review reset clears only that record file', async () => {
  await reviewRequest({ id: 'dns', checked: true, note: '测试备注' })
  await data.storage.savePreferences({ ...defaultPreferences, routeMode: 'tun' })
  expect((await post('/api/manual-reviews/reset', {})).status).toBe(200)
  expect(await data.storage.manualReviews()).toEqual([])
  expect((await data.storage.preferences()).routeMode).toBe('tun')
})

test('connection API saves with a full snapshot and restores while keeping secrets out of responses', async () => {
  const original =
    JSON.stringify(
      {
        env: {
          ANTHROPIC_API_KEY: 'fake-private-api-key',
          HTTPS_PROXY: 'http://old-user:old-password@localhost:8080',
        },
        hooks: { Stop: [] },
      },
      null,
      4,
    ) + '\n'
  await data.write('.claude/settings.json', original)
  const request = { changes: [{ key: 'HTTPS_PROXY', value: 'http://127.0.0.1:7890' }] }
  expect((await post('/api/connections/preview', request, '')).status).toBe(403)
  expect(
    (
      await post('/api/connections/preview', {
        changes: [{ key: 'NODE_OPTIONS', value: 'anything' }],
      })
    ).status,
  ).toBe(400)
  const preview = await post('/api/connections/preview', request)
  expect(preview.status).toBe(200)
  const plan = await preview.json()
  expect(JSON.stringify(plan)).not.toContain('old-password')
  expect((await post(`/api/repairs/${plan.id}/apply`, {})).status).toBe(400)
  const apply = await post(`/api/connections/${plan.id}/apply`, {})
  expect(apply.status).toBe(200)
  const backup = await apply.json()
  expect(backup.snapshotId).toBeTruthy()
  const bootstrap = await (await fetch(base + '/api/bootstrap')).json()
  expect(bootstrap.connection.editable).toBe(true)
  expect(bootstrap.snapshots[0].purpose).toBe('connection')
  const visible = JSON.stringify([plan, backup, bootstrap])
  for (const secret of ['fake-private-api-key', 'old-password', 'old-user', '"original"'])
    expect(visible).not.toContain(secret)
  expect((await post(`/api/backups/${backup.id}/restore`, {})).status).toBe(200)
  expect(await data.read('.claude/settings.json')).toBe(original)
})

test('compares report file baselines across reloads and excludes the fingerprint from redacted exports', async () => {
  await data.write('.claude/settings.json', '{}')
  const started = await (await post('/api/scans', { network: false })).json()
  let completed = started
  while (completed.status === 'running') {
    await new Promise((resolve) => setTimeout(resolve, 10))
    completed = await (await fetch(base + '/api/scans/' + started.id)).json()
  }
  const report = completed.report
  const before = await (await fetch(base + '/api/bootstrap')).json()
  expect(before.configurationFingerprint).toBe(report.configurationFingerprint)
  await data.write('.claude/settings.json', '{"model":"external-change"}')
  const after = await (await fetch(base + '/api/bootstrap')).json()
  expect(after.configurationFingerprint).not.toBe(report.configurationFingerprint)
  expect(after.reports[0].configurationFingerprint).toBe(report.configurationFingerprint)
  const exported = await (await fetch(base + `/api/reports/${report.id}/export?format=json`)).json()
  expect(exported.configurationFingerprint).toBeUndefined()
})

test('custom-directory bootstrap describes the blocked scope instead of claiming missing fields or editable defaults', async () => {
  const original = '{"env":{"ANTHROPIC_BASE_URL":"https://gateway.example"},"model":"keep"}'
  await data.write('.claude/settings.json', original)
  data.ctx.env.CLAUDE_CONFIG_DIR = data.root + '/other-configuration'
  const bootstrap = await (await fetch(base + '/api/bootstrap')).json()
  expect(bootstrap.connection.editable).toBe(false)
  expect(bootstrap.connection.reason).toContain('CLAUDE_CONFIG_DIR')
  expect(
    bootstrap.connection.fields.every((field: { current: string }) =>
      field.current.includes('未纳入编辑范围'),
    ),
  ).toBe(true)
  expect(
    bootstrap.files.find((file: { id: string }) => file.id === 'claude-settings'),
  ).toMatchObject({ editable: false, summary: '默认文件保持原样；实际自定义目录需复核' })
  expect(bootstrap.files.find((file: { id: string }) => file.id === 'zshrc').editable).toBe(true)
  const denied = await post('/api/repairs/preview', { fixIds: ['claude-privacy'] })
  expect(denied.status).toBe(400)
  expect(await data.read('.claude/settings.json')).toBe(original)
})

test('public brand assets revalidate when the application is updated', async () => {
  await app.close()
  const distDir = path.join(data.home, 'ui-fixture')
  await fs.mkdir(path.join(distDir, 'assets'), { recursive: true })
  await fs.writeFile(path.join(distDir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  await fs.writeFile(path.join(distDir, 'assets', 'index-abcd1234.js'), 'export {}')
  app = await createAppServer({ ctx: data.ctx, port: 0, dev: false, distDir })
  base = `http://127.0.0.1:${await app.listen()}`
  const logo = await fetch(base + '/logo.svg?v=1.2.1')
  expect(logo.status).toBe(200)
  expect(logo.headers.get('cache-control')).toBe('no-cache')
  expect((await fetch(base + '/assets/index-abcd1234.js')).headers.get('cache-control')).toBe(
    'public, max-age=86400',
  )
})
