import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { openLocalAction } from '../server/local-actions'
import { createAppServer } from '../server/index'
import { fixture } from './fixtures'
let data: Awaited<ReturnType<typeof fixture>>
beforeEach(async () => {
  data = await fixture()
})
afterEach(async () => {
  await data.cleanup()
})
test.each([
  ['date-time', ['x-apple.systempreferences:com.apple.preference.datetime']],
  [
    'location-services',
    ['x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices'],
  ],
  ['network-settings', ['x-apple.systempreferences:com.apple.preference.network']],
  ['terminal', ['-b', 'com.apple.Terminal']],
])('opens only the fixed macOS target for %s', async (action, args) => {
  const run = vi.fn().mockResolvedValue({ ok: true, stdout: '', stderr: '' })
  expect((await openLocalAction({ ...data.ctx, demo: false, run }, { action })).opened).toBe(true)
  expect(run).toHaveBeenCalledExactlyOnceWith('/usr/bin/open', args)
})
test('never executes a diagnostic command, accepts arbitrary URLs, or claims opening succeeded after failure', async () => {
  const run = vi.fn().mockResolvedValue({ ok: false, stdout: '', stderr: '' })
  for (const input of [
    { action: 'terminal', command: 'danger' },
    { action: 'date-time', url: 'https://evil.example' },
    { action: 'arbitrary' },
  ])
    await expect(openLocalAction({ ...data.ctx, demo: false, run }, input)).rejects.toThrow()
  expect(run).not.toHaveBeenCalled()
  await expect(
    openLocalAction({ ...data.ctx, demo: false, run }, { action: 'terminal' }),
  ).rejects.toThrow('终端未能打开')
})
test('demo requests stay isolated and the local API requires a token and strict action schema', async () => {
  const app = await createAppServer({ ctx: data.ctx, port: 0, dev: false })
  try {
    const base = `http://127.0.0.1:${await app.listen()}`
    const token = (await (await fetch(base + '/api/bootstrap')).json()).token
    const run = vi.spyOn(data.ctx, 'run')
    const post = (input: unknown, auth = token) =>
      fetch(base + '/api/local-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CG-Token': auth },
        body: JSON.stringify(input),
      })
    expect((await post({ action: 'terminal' }, '')).status).toBe(403)
    expect((await post({ action: 'terminal', command: 'do-anything' })).status).toBe(400)
    const result = await post({ action: 'location-services' })
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ opened: false })
    expect(run).not.toHaveBeenCalled()
  } finally {
    await app.close()
  }
})
test('Windows actions encode only a fixed settings target and unsupported desktop actions fail closed', async () => {
  const run = vi.fn().mockResolvedValue({ ok: true, stdout: '', stderr: '' })
  await openLocalAction(
    { ...data.ctx, demo: false, platform: 'win32', run },
    { action: 'date-time' },
  )
  const args = run.mock.calls[0]?.[1] as string[]
  expect(run.mock.calls[0]?.[0]).toBe('powershell.exe')
  expect(Buffer.from(args.at(-1)!, 'base64').toString('utf16le')).toContain(
    "Start-Process 'ms-settings:dateandtime'",
  )
  run.mockClear()
  await expect(
    openLocalAction(
      { ...data.ctx, demo: false, platform: 'linux', run },
      { action: 'location-services' },
    ),
  ).rejects.toThrow('手动打开')
  expect(run).not.toHaveBeenCalled()
})
