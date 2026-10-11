import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, vi } from 'vitest'
import { runSystemCommand } from '../server/commands'

const ctx = { home: 'isolated-home', env: { FIXTURE_VALUE: 'test' }, platform: 'win32' as const }
const missing = Object.assign(new Error('private-error-detail'), { code: 'ENOENT' })

test.each([
  ['npm', ['config', 'get', 'proxy'], 'npm.cmd config get proxy'],
  ['npm', ['config', 'get', 'https-proxy'], 'npm.cmd config get https-proxy'],
  ['claude', ['--version'], 'claude.cmd --version'],
] as const)('falls back to a fixed Windows probe for %s %j', async (command, args, script) => {
  const execute = vi
    .fn()
    .mockRejectedValueOnce(missing)
    .mockResolvedValueOnce({ stdout: ' result\n', stderr: '' })
  const result = await runSystemCommand(ctx, command, [...args], 3500, execute)
  expect(result).toEqual({ ok: true, stdout: 'result', stderr: '' })
  expect(execute.mock.calls[1]?.slice(0, 2)).toEqual(['cmd.exe', ['/d', '/s', '/c', script]])
  expect(execute.mock.calls[1]?.[2]).toMatchObject({
    windowsVerbatimArguments: true,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    env: { HOME: ctx.home, USERPROFILE: ctx.home, NoDefaultCurrentDirectoryInExePath: '1' },
  })
})
test('native executables run once without a shell or shim', async () => {
  const execute = vi.fn().mockResolvedValue({ stdout: 'native-version', stderr: '' })
  expect((await runSystemCommand(ctx, 'claude', ['--version'], 3500, execute)).ok).toBe(true)
  expect(execute).toHaveBeenCalledTimes(1)
  expect(execute.mock.calls[0]?.[2]).not.toHaveProperty('shell')
})
test.each([
  ['npm', ['config', 'get', 'proxy & private-command']],
  ['npm', ['install']],
  ['claude', ['--version', 'private-command']],
  ['git', ['-C', 'C:\\private-project & private-command', 'rev-parse', 'HEAD']],
] as const)(
  'never passes arbitrary arguments through the Windows fallback: %s %j',
  async (command, args) => {
    const execute = vi.fn().mockRejectedValue(missing)
    const result = await runSystemCommand(ctx, command, [...args], 3500, execute)
    expect(result.ok).toBe(false)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0]?.[1]).toEqual(args)
    expect(JSON.stringify(result)).not.toContain('private-')
  },
)
test.each(['darwin', 'linux'] as const)('does not use a Windows shell on %s', async (platform) => {
  const execute = vi.fn().mockRejectedValue(missing)
  expect(
    (await runSystemCommand({ ...ctx, platform }, 'npm', ['config', 'get', 'proxy'], 3500, execute))
      .ok,
  ).toBe(false)
  expect(execute).toHaveBeenCalledTimes(1)
})
test.each([1, 'ETIMEDOUT', 'EACCES'])(
  'does not rerun a command after execution failure %s',
  async (code) => {
    const execute = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('private-error-detail'), { code }))
    const result = await runSystemCommand(ctx, 'npm', ['config', 'get', 'proxy'], 3500, execute)
    expect(result.ok).toBe(false)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(result.stderr).not.toContain('private-')
  },
)
test('uses the batch shim when the native launch reports EINVAL', async () => {
  const execute = vi
    .fn()
    .mockRejectedValueOnce(Object.assign(new Error(), { code: 'EINVAL' }))
    .mockResolvedValueOnce({ stdout: 'null', stderr: '' })
  expect((await runSystemCommand(ctx, 'npm', ['config', 'get', 'proxy'], 3500, execute)).ok).toBe(
    true,
  )
})

test.skipIf(process.platform !== 'win32')(
  'runs a real .cmd probe from a PATH directory containing spaces',
  async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cg-command-test-'))
    try {
      const directory = path.join(root, 'probe with spaces')
      await fs.mkdir(directory)
      await fs.writeFile(
        path.join(directory, 'npm.cmd'),
        '@echo off\r\necho fixture-proxy-result\r\n',
      )
      await fs.writeFile(
        path.join(directory, 'claude.cmd'),
        '@echo off\r\necho fixture-version-result\r\n',
      )
      const environment = { ...process.env }
      for (const key of Object.keys(environment))
        if (key.toLowerCase() === 'path') delete environment[key]
      environment.PATH =
        directory + path.delimiter + path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')
      const isolated = { home: root, env: environment, platform: 'win32' as const }
      expect(await runSystemCommand(isolated, 'npm', ['config', 'get', 'proxy'])).toMatchObject({
        ok: true,
        stdout: 'fixture-proxy-result',
      })
      expect(await runSystemCommand(isolated, 'claude', ['--version'])).toMatchObject({
        ok: true,
        stdout: 'fixture-version-result',
      })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  },
)

test.each(['http.proxy', 'https.proxy'])(
  'recognizes absent fixed Git key %s without ignoring actual errors',
  async (key) => {
    const execute = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('key absent'), { code: 1, stdout: '', stderr: '' }),
      )
    expect(
      await runSystemCommand(ctx, 'git', ['config', '--global', '--get', key], 3500, execute),
    ).toEqual({ ok: true, stdout: '', stderr: '' })
    execute.mockRejectedValue(
      Object.assign(new Error('config error'), {
        code: 1,
        stdout: '',
        stderr: 'private config error',
      }),
    )
    const result = await runSystemCommand(
      ctx,
      'git',
      ['config', '--global', '--get', key],
      3500,
      execute,
    )
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('private')
  },
)
