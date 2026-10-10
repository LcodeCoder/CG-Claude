import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { defaultPreferences } from '../shared/types'
import type { FixId } from '../shared/types'
import { RepairEngine } from '../server/repairs'
import { shellAssignments } from '../server/configs'
import { readConfig } from '../server/safety'
import { fixture } from './fixtures'
const preferences = { ...defaultPreferences, routeMode: 'tun' as const }
let data: Awaited<ReturnType<typeof fixture>>
let engine: RepairEngine
beforeEach(async () => {
  data = await fixture()
  engine = new RepairEngine(data.ctx, data.storage)
})
afterEach(async () => {
  vi.useRealTimers()
  await data.cleanup()
})

describe('configuration transactions', () => {
  test('changes selected fields, preserves credentials and unrelated configuration, restores exact originals', async () => {
    const shell =
      '# user configuration\nexport HTTPS_PROXY="http://user:private-password@127.0.0.1:7890"\nexport ANTHROPIC_BASE_URL="https://gateway.example/v1?key=secret-abc"\nexport ANTHROPIC_API_KEY="sk-ant-user-secret"\nexport PATH="$HOME/bin:$PATH"\n'
    const npm =
      'registry=https://registry.npmjs.org/\nproxy=http://localhost:7890\nhttps-proxy=http://localhost:7890\n//registry.example/:_authToken=npm-private-secret\n'
    const git =
      '[user]\n  name = Guard Tester\n[http]\n  proxy = http://localhost:7890\n  sslVerify = true\n[core]\n  editor = vim\n'
    const settings =
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://user:password@gateway.example/v1',
            ANTHROPIC_API_KEY: 'sk-ant-user-secret',
          },
          permissions: { allow: ['Read'] },
          hooks: { Stop: [] },
          model: 'sonnet',
        },
        null,
        4,
      ) + '\n'
    await data.write('.zshrc', shell)
    await data.write('.npmrc', npm)
    await data.write('.gitconfig', git)
    await data.write('.claude/settings.json', settings)
    const ids: FixId[] = [
      'shell-proxy',
      'shell-endpoint',
      'npm-proxy',
      'git-proxy',
      'claude-endpoint',
      'claude-privacy',
    ]
    const plan = await engine.preview(ids, preferences)
    expect(plan.files).toHaveLength(4)
    const visible = JSON.stringify(plan)
    for (const secret of [
      'private-password',
      'secret-abc',
      'sk-ant-user-secret',
      'npm-private-secret',
    ])
      expect(visible).not.toContain(secret)
    const backup = await engine.apply(plan.id, preferences)
    expect(backup.status).toBe('applied')
    expect(await data.read('.zshrc')).toBe(
      '# user configuration\nexport ANTHROPIC_API_KEY="sk-ant-user-secret"\nexport PATH="$HOME/bin:$PATH"\n',
    )
    expect(await data.read('.npmrc')).toContain('npm-private-secret')
    expect(await data.read('.npmrc')).not.toContain('proxy=')
    expect(await data.read('.gitconfig')).toContain('sslVerify = true')
    const edited = JSON.parse(await data.read('.claude/settings.json'))
    expect(edited.env.ANTHROPIC_BASE_URL).toBeUndefined()
    expect(edited.env.ANTHROPIC_API_KEY).toBe('sk-ant-user-secret')
    expect(edited.permissions).toEqual({ allow: ['Read'] })
    expect(edited.hooks).toEqual({ Stop: [] })
    expect(edited.model).toBe('sonnet')
    expect(edited.env.DISABLE_TELEMETRY).toBe('1')
    expect(edited.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBeUndefined()
    await engine.restore(backup.id)
    expect(await data.read('.zshrc')).toBe(shell)
    expect(await data.read('.npmrc')).toBe(npm)
    expect(await data.read('.gitconfig')).toBe(git)
    expect(await data.read('.claude/settings.json')).toBe(settings)
  })
  test('rejects files changed after preview without making any edits', async () => {
    await data.write('.zshrc', 'export HTTP_PROXY="http://localhost:7890"\n')
    await data.write('.npmrc', 'proxy=http://localhost:7890\n')
    const plan = await engine.preview(['shell-proxy', 'npm-proxy'], preferences)
    await data.write('.npmrc', 'proxy=http://new-config:1234\n')
    await expect(engine.apply(plan.id, preferences)).rejects.toThrow('发生变化')
    expect(await data.read('.zshrc')).toContain('HTTP_PROXY')
    expect(await data.read('.npmrc')).toContain('new-config')
    expect(await data.storage.backups()).toHaveLength(0)
  })
  test('rejects restoration if subsequent edits would be overwritten', async () => {
    await data.write('.zshrc', 'export HTTPS_PROXY="http://localhost:7890"\n')
    const plan = await engine.preview(['shell-proxy'], preferences)
    const backup = await engine.apply(plan.id, preferences)
    await data.write('.zshrc', 'export PATH="/new/path"\n')
    await expect(engine.restore(backup.id)).rejects.toThrow('覆盖新内容')
    expect(await data.read('.zshrc')).toBe('export PATH="/new/path"\n')
  })
  test('removes a newly created settings file when its backup is restored', async () => {
    const plan = await engine.preview(['claude-privacy'], preferences)
    const backup = await engine.apply(plan.id, preferences)
    expect((await readConfig(data.ctx, '.claude/settings.json')).exists).toBe(true)
    await engine.restore(backup.id)
    expect((await readConfig(data.ctx, '.claude/settings.json')).exists).toBe(false)
  })
  test('preserves CRLF line endings', async () => {
    await data.write(
      '.zshrc',
      '# preserved\r\nexport HTTPS_PROXY="http://localhost:7890"\r\nexport KEEP=yes\r\n',
    )
    const plan = await engine.preview(['shell-proxy'], preferences)
    await engine.apply(plan.id, preferences)
    expect(await data.read('.zshrc')).toBe('# preserved\r\nexport KEEP=yes\r\n')
  })
  test('preserves complex assignments, heredocs, functions, and conditional blocks', async () => {
    const shell =
      'export HTTP_PROXY="http://literal:7890"\nexport HTTPS_PROXY="$(read-proxy)"\nexport ALL_PROXY=http://localhost:7890; echo important\ncat <<END\nexport HTTP_PROXY=http://text-not-config\nEND\nif true; then\n  export HTTP_PROXY=http://conditional\nfi\nsetup() {\n  export HTTPS_PROXY=http://function\n}\n'
    await data.write('.zshrc', shell)
    const safe = shellAssignments(shell).filter((item) => item.safe)
    expect(safe).toHaveLength(1)
    const plan = await engine.preview(['shell-proxy'], preferences)
    await engine.apply(plan.id, preferences)
    const after = await data.read('.zshrc')
    expect(after).toBe(shell.replace('export HTTP_PROXY="http://literal:7890"\n', ''))
  })
  test('never follows configuration file symlinks', async () => {
    const outside = path.join(data.root, 'outside')
    await fs.writeFile(outside, 'proxy=http://sensitive:7890\n')
    await fs.symlink(outside, path.join(data.home, '.npmrc'))
    await expect(engine.preview(['npm-proxy'], preferences)).rejects.toThrow('符号链接')
    expect(await fs.readFile(outside, 'utf8')).toContain('sensitive')
  })
  test('never follows parent directory symlinks', async () => {
    const outside = path.join(data.root, 'outside-folder')
    await fs.mkdir(outside)
    await fs.writeFile(path.join(outside, 'settings.json'), '{}')
    await fs.symlink(outside, path.join(data.home, '.claude'))
    await expect(engine.preview(['claude-privacy'], preferences)).rejects.toThrow('符号链接')
    expect(await fs.readFile(path.join(outside, 'settings.json'), 'utf8')).toBe('{}')
  })
  test('refuses malformed JSON and leaves the file byte-for-byte intact', async () => {
    const invalid = '{"env": { invalid }'
    await data.write('.claude/settings.json', invalid)
    await expect(engine.preview(['claude-privacy'], preferences)).rejects.toThrow()
    expect(await data.read('.claude/settings.json')).toBe(invalid)
  })
  test('requires appropriate user preferences for removing proxy or provider settings', async () => {
    await data.write('.zshrc', 'export HTTP_PROXY=http://localhost:7890\n')
    await expect(engine.preview(['shell-proxy'], defaultPreferences)).rejects.toThrow('TUN')
    await expect(
      engine.preview(['claude-endpoint'], { ...preferences, usageMode: 'custom' }),
    ).rejects.toThrow('官方默认 API')
  })
  test('rejects plans generated with older preferences', async () => {
    const plan = await engine.preview(['claude-privacy'], preferences)
    await expect(engine.apply(plan.id, { ...preferences, privacy: 'minimal' })).rejects.toThrow(
      '偏好已变化',
    )
  })
  test('expires previews after ten minutes', async () => {
    const plan = await engine.preview(['claude-privacy'], preferences)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60 * 1000)
    await expect(engine.apply(plan.id, preferences)).rejects.toThrow('过期')
    vi.restoreAllMocks()
  })
  test('retains the user choice to disable all nonessential traffic in balanced mode', async () => {
    await data.write(
      '.claude/settings.json',
      JSON.stringify({ env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } }),
    )
    await expect(engine.preview(['claude-privacy'], preferences)).rejects.toThrow('没有可自动修改')
    expect(
      JSON.parse(await data.read('.claude/settings.json')).env
        .CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC,
    ).toBe('1')
  })
  test('saves original content with restricted permissions', async () => {
    const plan = await engine.preview(['claude-privacy'], preferences)
    await engine.apply(plan.id, preferences)
    if (process.platform !== 'win32') {
      expect((await fs.stat(data.ctx.dataDir)).mode & 0o777).toBe(0o700)
      expect((await fs.stat(path.join(data.ctx.dataDir, 'backups.json'))).mode & 0o777).toBe(0o600)
    }
    expect((await data.storage.manifests())[0]?.entries[0]?.original).toBeNull()
  })
})

test('rolls back the first file if a later file write fails', async () => {
  const shell = 'export HTTP_PROXY=http://localhost:7890\n'
  const npm = 'proxy=http://localhost:7890\n'
  await data.write('.zshrc', shell)
  await data.write('.npmrc', npm)
  const plan = await engine.preview(['shell-proxy', 'npm-proxy'], preferences)
  const rename = fs.rename
  let failed = false
  const spy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to) === path.join(data.home, '.npmrc') && !failed) {
      failed = true
      throw new Error('simulated disk failure')
    }
    return rename(from, to)
  })
  try {
    await expect(engine.apply(plan.id, preferences)).rejects.toThrow('已回退本次修改')
    expect(await data.read('.zshrc')).toBe(shell)
    expect(await data.read('.npmrc')).toBe(npm)
    expect((await data.storage.backups())[0]?.status).toBe('failed')
  } finally {
    spy.mockRestore()
  }
})

test('restores npm TLS verification while retaining registry, credentials and intentional proxies', async () => {
  const original =
    'registry=https://private.example/\nstrict-ssl=false\nproxy=http://localhost:7890\n//private.example/:_authToken=private-fixture\n'
  await data.write('.npmrc', original)
  const plan = await engine.preview(['npm-tls'], defaultPreferences)
  expect(plan.files[0]?.changes).toEqual([
    { key: 'strict-ssl', before: 'false', after: 'true（启用证书校验）' },
  ])
  const backup = await engine.apply(plan.id, defaultPreferences)
  expect(await data.read('.npmrc')).toBe(original.replace('strict-ssl=false', 'strict-ssl=true'))
  await engine.restore(backup.id)
  expect(await data.read('.npmrc')).toBe(original)
})
