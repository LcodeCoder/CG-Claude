import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cliInstallation } from '../server/cli-diagnostics'
import { fixture } from './fixtures'

let data: Awaited<ReturnType<typeof fixture>>
const missing = { ok: false, stdout: '', stderr: 'private-error-detail' }
beforeEach(async () => {
  data = await fixture()
})
afterEach(async () => {
  await data.cleanup()
})

test('reports the version probe and labels the service runtime accurately', async () => {
  const result = await cliInstallation(
    data.ctx,
    { ok: true, stdout: 'private-warning-detail\n2.1.296 (Claude Code)\n', stderr: '' },
    '22.1.0',
  )
  expect(result.status).toBe('pass')
  expect(result.summary).toBe('2.1.296 (Claude Code)')
  expect(result.evidence).toEqual([{ label: 'CG Claude 服务运行时', value: 'Node.js 22.1.0' }])
  expect(JSON.stringify(result)).not.toContain('private-')
})
test('a successful exit with an unrecognized response remains pending', async () => {
  const result = await cliInstallation(
    data.ctx,
    { ok: true, stdout: 'token=private-secret', stderr: '' },
    '22.1.0',
  )
  expect(result.status).toBe('manual')
  expect(JSON.stringify(result)).not.toContain('private-secret')
})
test.each(['darwin', 'linux', 'win32'] as const)(
  'checks only the fixed native candidate metadata on %s',
  async (platform) => {
    const filename = platform === 'win32' ? 'claude.exe' : 'claude'
    await data.write('.local/bin/' + filename, 'private-file-content-never-executed')
    const run = vi.fn()
    const result = await cliInstallation({ ...data.ctx, platform, run }, missing, '22.1.0')
    expect(result.status).toBe('manual')
    expect(result.summary).toContain('发现原生安装候选')
    expect(result.evidence.some((item) => item.value === '~/.local/bin/' + filename)).toBe(true)
    expect(run).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('private-')
    expect(JSON.stringify(result)).not.toContain(data.home)
  },
)
test('a missing native path does not imply other install methods are absent', async () => {
  const result = await cliInstallation(data.ctx, missing, '22.1.0')
  expect(result.status).toBe('manual')
  expect(result.evidence.some((item) => item.value.includes('其他安装方式或位置仍需核对'))).toBe(
    true,
  )
})
test('a directory at the native candidate path is reported without being read', async () => {
  await fs.mkdir(path.join(data.home, '.local/bin/claude'), { recursive: true })
  const result = await cliInstallation(data.ctx, missing, '22.1.0')
  expect(result.summary).toContain('不是普通文件')
})
test('an empty candidate is distinct from a runnable version', async () => {
  await data.write('.local/bin/claude', '')
  const result = await cliInstallation(data.ctx, missing, '22.1.0')
  expect(result.summary).toContain('文件为空')
  expect(result.status).toBe('manual')
})
test.skipIf(process.platform === 'win32')(
  'accepts the official symlink launcher as metadata without exposing its target',
  async () => {
    await data.write('.local/share/claude/versions/private-version', 'private-file-content')
    await fs.mkdir(path.join(data.home, '.local/bin'), { recursive: true })
    await fs.symlink(
      path.join(data.home, '.local/share/claude/versions/private-version'),
      path.join(data.home, '.local/bin/claude'),
    )
    const result = await cliInstallation(data.ctx, missing, '22.1.0')
    expect(result.summary).toContain('发现原生安装候选')
    expect(result.evidence.some((item) => item.value.includes('符号链接指向普通文件'))).toBe(true)
    expect(JSON.stringify(result)).not.toContain('private-')
  },
)
test('does not infer a version from the output of a failed command', async () => {
  const result = await cliInstallation(
    data.ctx,
    { ok: false, stdout: '2.1.296 (Claude Code)', stderr: 'private-issue' },
    '22.1.0',
  )
  expect(result.status).toBe('manual')
  expect(result.summary).not.toContain('2.1.296')
})
