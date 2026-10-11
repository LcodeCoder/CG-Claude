import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { prepareCommandEnvironment, parseLoginPath } from '../server/command-environment'
import { runSystemCommand } from '../server/commands'
import { fixture } from './fixtures'
let data: Awaited<ReturnType<typeof fixture>>
beforeEach(async () => {
  data = await fixture()
})
afterEach(async () => {
  await data.cleanup()
})
test('imports only a single marked absolute PATH and rejects shell noise and ambiguous markers', () => {
  expect(
    parseLoginPath(
      'private-key=hidden\nCG_CLAUDE_PATH_V1=/opt/bin:relative:/usr/bin::/bad\tpath\n',
    ),
  ).toEqual(['/opt/bin', '/usr/bin'])
  expect(parseLoginPath('CG_CLAUDE_PATH_V1=/one\nCG_CLAUDE_PATH_V1=/two')).toEqual([])
  expect(parseLoginPath('echo CG_CLAUDE_PATH_V1=/one')).toEqual([])
})
test.skipIf(process.platform === 'win32')(
  'finds desktop CLI installations outside a minimal inherited PATH without importing shell secrets',
  async () => {
    for (const version of ['v22.9.0', 'v22.20.0', 'v9.99.0', 'not-a-version'])
      await fs.mkdir(path.join(data.home, '.nvm/versions/node', version, 'bin'), {
        recursive: true,
      })
    await data.write('.nvm/versions/node/v22.20.0/bin/claude', '#!/bin/sh\nexit 0\n')
    await fs.chmod(path.join(data.home, '.nvm/versions/node/v22.20.0/bin/claude'), 0o700)
    const ctx = {
      ...data.ctx,
      demo: false,
      env: { PATH: '/usr/bin', SHELL: '/bin/zsh', KEEP: 'original' },
    }
    const shell = vi.fn().mockResolvedValue({
      stdout: 'PRIVATE_KEY=do-not-import\nCG_CLAUDE_PATH_V1=/chosen/bin:/usr/bin\n',
      stderr: 'private-shell-startup',
    })
    await prepareCommandEnvironment(ctx, shell)
    expect(ctx.env).toMatchObject({ KEEP: 'original' })
    expect(ctx.env).not.toHaveProperty('PRIVATE_KEY')
    const entries = ctx.env.PATH.split(':')
    expect(entries[0]).toBe('/chosen/bin')
    expect(entries.indexOf(path.join(data.home, '.nvm/versions/node/v22.20.0/bin'))).toBeLessThan(
      entries.indexOf(path.join(data.home, '.nvm/versions/node/v22.9.0/bin')),
    )
    expect(entries.some((entry) => entry.includes('not-a-version'))).toBe(false)
    expect(shell.mock.calls[0]?.[2]).toMatchObject({
      cwd: data.home,
      timeout: 3500,
      env: { HISTFILE: '/dev/null', SHELL_SESSIONS_DISABLE: '1' },
    })
    const execute = vi.fn().mockResolvedValue({ stdout: 'version', stderr: '' })
    const result = await runSystemCommand(ctx, 'claude', ['--version'], 1000, execute)
    expect(result.executable).toBe(path.join(data.home, '.nvm/versions/node/v22.20.0/bin/claude'))
    expect(execute.mock.calls[0]?.[0]).toBe(result.executable)
    expect(execute.mock.calls[0]?.[2]).not.toHaveProperty('shell')
  },
)
test('a broken login shell cannot prevent startup and demo never executes it', async () => {
  const execute = vi.fn().mockRejectedValue(new Error('broken startup'))
  const ctx = { ...data.ctx, demo: false, env: { PATH: '/usr/bin', SHELL: 'unsafe-shell' } }
  await prepareCommandEnvironment(ctx, execute)
  expect(execute.mock.calls[0]?.[0]).toBe('/bin/zsh')
  expect(ctx.env.PATH).toContain(path.join(data.home, '.local/bin'))
  execute.mockClear()
  await prepareCommandEnvironment(data.ctx, execute)
  expect(execute).not.toHaveBeenCalled()
})
