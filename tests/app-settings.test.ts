import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createAppServer } from '../server/index'
import { defaultAppSettings } from '../shared/app-settings'
import { fixture } from './fixtures'

let data: Awaited<ReturnType<typeof fixture>>
beforeEach(async () => {
  data = await fixture()
})
afterEach(async () => {
  await data.cleanup()
})

test('appearance defaults and persistent settings do not alter diagnostic preferences', async () => {
  const preferences = await data.storage.preferences()
  expect(await data.storage.appSettings()).toEqual(defaultAppSettings)
  const settings = { language: 'en' as const, theme: 'eye-care' as const, reduceMotion: true }
  await data.storage.saveAppSettings(settings)
  expect(await data.storage.appSettings()).toEqual(settings)
  expect(await data.storage.preferences()).toEqual(preferences)
  const info = await fs.stat(path.join(data.ctx.dataDir, 'app-settings.json'))
  // POSIX permission bits do not describe Windows ACLs. Persistence is checked on every OS.
  if (process.platform !== 'win32') expect(info.mode & 0o777).toBe(0o600)
})
test('rejects damaged settings instead of silently overwriting them', async () => {
  await fs.writeFile(path.join(data.ctx.dataDir, 'app-settings.json'), '{ invalid')
  await expect(data.storage.appSettings()).rejects.toThrow()
})
test('settings API validates values and requires a local mutation token', async () => {
  const app = await createAppServer({ ctx: data.ctx, port: 0, dev: false })
  try {
    const base = `http://127.0.0.1:${await app.listen()}`
    const { token } = await (await fetch(base + '/api/bootstrap')).json()
    const write = (body: unknown, auth = token) =>
      fetch(base + '/api/app-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-CG-Token': auth },
        body: JSON.stringify(body),
      })
    expect((await write({ language: 'en' }, '')).status).toBe(403)
    expect((await write({ language: 'unknown' })).status).toBe(400)
    expect((await write({ language: 'en', command: 'arbitrary' })).status).toBe(400)
    const updated = { language: 'en', theme: 'eye-care', reduceMotion: true }
    expect(await (await write(updated)).json()).toEqual(updated)
    expect(await (await fetch(base + '/api/app-settings')).json()).toEqual(updated)
    const unauthenticatedVersion = await fetch(base + '/api/version-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(unauthenticatedVersion.status).toBe(403)
  } finally {
    await app.close()
  }
})
