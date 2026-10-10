import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { scanProject } from '../server/projects'
import { fixture } from './fixtures'
let data: Awaited<ReturnType<typeof fixture>>
beforeEach(async () => {
  data = await fixture()
})
afterEach(async () => {
  await data.cleanup()
})
test('finds project overrides, invalid TLS and credentials without leaking secrets', async () => {
  await data.write(
    '.claude/settings.json',
    JSON.stringify({
      env: {
        ANTHROPIC_BASE_URL: 'https://user:secret-password@gateway.example/?token=secret-query',
        ANTHROPIC_API_KEY: 'secret-fixture-key',
        DISABLE_TELEMETRY: '0',
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
      },
      permissions: { defaultMode: 'bypassPermissions' },
      hooks: { Stop: [{ command: 'must-not-run' }] },
    }),
  )
  await data.write(
    '.mcp.json',
    JSON.stringify({
      mcpServers: { example: { command: 'must-not-run', env: { TOKEN: 'secret-fixture-key' } } },
    }),
  )
  const report = await scanProject(data.ctx, data.home)
  expect(report.findings.find((item) => item.id === 'project-tls')?.status).toBe('fail')
  expect(report.findings.find((item) => item.id === 'project-privacy')?.status).toBe('pass')
  expect(report.findings.find((item) => item.id === 'project-secrets')?.status).toBe('warn')
  const text = JSON.stringify(report)
  expect(text).not.toContain('secret-password')
  expect(text).not.toContain('secret-query')
  expect(text).not.toContain('secret-fixture-key')
  expect(text).not.toContain('must-not-run')
})
test('rejects project config symlinks and does not follow their targets', async () => {
  const outside = path.join(data.root, 'outside')
  await fs.writeFile(outside, 'outside-secret')
  await fs.symlink(outside, path.join(data.home, 'package.json'))
  const report = await scanProject(data.ctx, data.home)
  expect(report.findings.find((item) => item.id === 'project-readable')?.status).toBe('warn')
  expect(JSON.stringify(report)).not.toContain('outside-secret')
})
test('rejects relative paths and malformed MCP JSON', async () => {
  await expect(scanProject(data.ctx, '.')).rejects.toThrow('绝对路径')
  await data.write('.mcp.json', '[]')
  expect(
    (await scanProject(data.ctx, data.home)).findings.find((item) => item.id === 'project-mcp')
      ?.status,
  ).toBe('fail')
})

test('does not leak malformed JSON excerpts into scan errors', async () => {
  await data.write('.mcp.json', '{"secret":"fixture-private-value", BAD')
  await data.write('package.json', '{"secret":"fixture-private-value", BAD')
  expect(JSON.stringify(await scanProject(data.ctx, data.home))).not.toContain(
    'fixture-private-value',
  )
})

test('warns about MCP credentials without revealing headers or environment values', async () => {
  await data.write(
    '.mcp.json',
    JSON.stringify({
      mcpServers: {
        demo: { url: 'https://example.com', headers: { Authorization: 'private-bearer-fixture' } },
      },
    }),
  )
  const report = await scanProject(data.ctx, data.home)
  expect(report.findings.find((item) => item.id === 'project-secrets')?.status).toBe('warn')
  expect(JSON.stringify(report)).not.toContain('private-bearer-fixture')
})
test('checks oversized metadata files without reading their contents and catches commented TLS settings', async () => {
  await data.write('package.json', '{}')
  await data.write('package-lock.json', 'x'.repeat(1024 * 1024 + 10))
  await data.write('.env', 'large-private-fixture'.repeat(60000))
  await data.write('.npmrc', 'strict-ssl=false # temporary workaround\n')
  const report = await scanProject(data.ctx, data.home)
  expect(report.findings.find((item) => item.id === 'project-readable')?.status).toBe('pass')
  expect(report.findings.find((item) => item.id === 'project-tls')?.status).toBe('fail')
  expect(JSON.stringify(report)).not.toContain('large-private-fixture')
})

test('incomplete project env cannot make dependent checks look fully clean', async () => {
  await data.write('.claude/settings.json', '{malformed:PRIVATE_VALUE}')
  const report = await scanProject(data.ctx, data.home)
  for (const id of [
    'project-proxy',
    'project-endpoint',
    'project-privacy',
    'project-tls',
    'project-secrets',
  ])
    expect(report.findings.find((item) => item.id === id)?.status).toBe('manual')
  expect(JSON.stringify(report)).not.toContain('PRIVATE_VALUE')
})

test('privacy presence switches and DO_NOT_TRACK are interpreted separately in project settings', async () => {
  await data.write(
    '.claude/settings.json',
    JSON.stringify({
      env: { DISABLE_TELEMETRY: '0', DISABLE_ERROR_REPORTING: 'false', DO_NOT_TRACK: 'true' },
    }),
  )
  expect(
    (await scanProject(data.ctx, data.home)).findings.find((item) => item.id === 'project-privacy')
      ?.status,
  ).toBe('pass')
  await data.write(
    '.claude/settings.local.json',
    JSON.stringify({ env: { DISABLE_TELEMETRY: '', DO_NOT_TRACK: '0' } }),
  )
  const finding = (await scanProject(data.ctx, data.home)).findings.find(
    (item) => item.id === 'project-privacy',
  )!
  expect(finding.status).toBe('manual')
  expect(finding.summary).not.toContain('重新启用')
})

test('nonstring project env values are incomplete and never coerced into an endpoint', async () => {
  await data.write(
    '.claude/settings.json',
    JSON.stringify({ env: { ANTHROPIC_BASE_URL: { secret: 'PRIVATE_VALUE' } } }),
  )
  const report = await scanProject(data.ctx, data.home)
  expect(report.findings.find((item) => item.id === '.claude/settings.json')?.status).toBe('manual')
  expect(report.findings.find((item) => item.id === 'project-endpoint')?.status).toBe('manual')
  expect(JSON.stringify(report)).not.toContain('PRIVATE_VALUE')
})

test('permission structure, full-tool approval and hook source are reported without command content', async () => {
  await data.write(
    '.claude/settings.json',
    JSON.stringify({
      permissions: { allow: ['Bash(*)', 'PowerShell'], deny: ['Bash(rm *)'] },
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'PRIVATE_COMMAND' }] }] },
      enableAllProjectMcpServers: true,
    }),
  )
  let report = await scanProject(data.ctx, data.home)
  expect(
    report.findings.find((item) => item.id === '.claude/settings.json-permissions')?.status,
  ).toBe('manual')
  expect(report.findings.find((item) => item.id === '.claude/settings.json-hooks')?.status).toBe(
    'manual',
  )
  expect(
    report.findings.find((item) => item.id === '.claude/settings.json-mcp-approval')?.status,
  ).toBe('manual')
  expect(JSON.stringify(report)).not.toContain('PRIVATE_COMMAND')
  await data.write(
    '.claude/settings.json',
    JSON.stringify({ permissions: { allow: 'Bash' }, hooks: [] }),
  )
  report = await scanProject(data.ctx, data.home)
  expect(
    report.findings.find((item) => item.id === '.claude/settings.json-permissions')?.status,
  ).toBe('fail')
  expect(report.findings.find((item) => item.id === '.claude/settings.json-hooks')?.status).toBe(
    'fail',
  )
})

test('OAuth and other token-named fields are hidden in project credential findings', async () => {
  await data.write(
    '.claude/settings.local.json',
    JSON.stringify({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'PRIVATE_OAUTH_VALUE' } }),
  )
  const report = await scanProject(data.ctx, data.home)
  expect(report.findings.find((item) => item.id === 'project-secrets')?.status).toBe('warn')
  expect(JSON.stringify(report)).not.toContain('PRIVATE_OAUTH_VALUE')
})

test('Bun lockfiles count as lock metadata and invalid Git output is not called a commit', async () => {
  await data.write('package.json', '{}')
  await data.write('bun.lock', 'PRIVATE_LOCK_CONTENT')
  data.ctx.run = async () => ({ ok: true, stdout: 'unexpected PRIVATE_OUTPUT', stderr: '' })
  const report = await scanProject(data.ctx, data.home)
  expect(report.findings.find((item) => item.id === 'project-dependencies')?.status).toBe('pass')
  const git = report.findings.find((item) => item.id === 'project-git')!
  expect(git.status).toBe('warn')
  expect(git.summary).toContain('未确认')
  expect(JSON.stringify(report)).not.toMatch(/PRIVATE_LOCK_CONTENT|PRIVATE_OUTPUT/)
})

test('MCP credential references and empty fields are distinguished from literal secrets', async () => {
  await data.write(
    '.mcp.json',
    JSON.stringify({
      mcpServers: {
        remote: {
          type: 'http',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer ${PROJECT_API_KEY}' },
          env: { TOKEN: '', SECRET: '${PROJECT_SECRET:-}' },
        },
      },
    }),
  )
  const report = await scanProject(data.ctx, data.home)
  const secrets = report.findings.find((item) => item.id === 'project-secrets')!
  expect(secrets.status).toBe('manual')
  expect(secrets.summary).toContain('变量引用')
  const mcp = report.findings.find((item) => item.id === 'project-mcp')!
  expect(
    mcp.evidence.some((entry) => entry.label === '凭据变量引用' && entry.value.includes('2')),
  ).toBe(true)
  expect(JSON.stringify(report)).not.toContain('PROJECT_SECRET')
})

test('nonempty MCP credential defaults are stored literals and do not appear in evidence', async () => {
  await data.write(
    '.mcp.json',
    JSON.stringify({
      mcpServers: {
        remote: {
          type: 'http',
          url: 'https://example.com',
          headers: { Authorization: 'Bearer ${TOKEN:-PRIVATE_DEFAULT}' },
        },
      },
    }),
  )
  const report = await scanProject(data.ctx, data.home)
  expect(report.findings.find((item) => item.id === 'project-secrets')?.status).toBe('warn')
  expect(JSON.stringify(report)).not.toContain('PRIVATE_DEFAULT')
})

test('unsupported dynamic MCP credential expressions remain manual instead of guessed literals', async () => {
  await data.write(
    '.mcp.json',
    JSON.stringify({
      mcpServers: {
        local: {
          command: 'do-not-run',
          env: { TOKEN: '$PRIVATE_TOKEN', API_KEY: 'prefix-${PRIVATE_KEY}' },
        },
      },
    }),
  )
  const report = await scanProject(data.ctx, data.home)
  expect(report.findings.find((item) => item.id === 'project-secrets')?.status).toBe('manual')
  expect(report.findings.find((item) => item.id === 'project-secrets')?.summary).toContain(
    '无法静态判断',
  )
  expect(JSON.stringify(report)).not.toMatch(/PRIVATE_TOKEN|PRIVATE_KEY|do-not-run/)
})

test('MCP credential URL fields are detected without exposing addresses, paths or values', async () => {
  await data.write(
    '.mcp.json',
    JSON.stringify({
      mcpServers: {
        remote: {
          type: 'http',
          url: 'https://private-user:private-pass@example.com/PRIVATE_PATH?api_key=PRIVATE_QUERY',
        },
      },
    }),
  )
  const report = await scanProject(data.ctx, data.home)
  expect(report.findings.find((item) => item.id === 'project-secrets')?.status).toBe('warn')
  expect(JSON.stringify(report)).not.toMatch(/private-user|private-pass|PRIVATE_PATH|PRIVATE_QUERY/)
})

test('MCP entry structure failures cannot make the credential finding look fully checked', async () => {
  await data.write(
    '.mcp.json',
    JSON.stringify({
      mcpServers: {
        PRIVATE_SERVER: { command: 'do-not-run', env: ['PRIVATE_VALUE'], args: 'PRIVATE_ARGS' },
      },
    }),
  )
  const report = await scanProject(data.ctx, data.home)
  expect(report.findings.find((item) => item.id === 'project-mcp')?.status).toBe('fail')
  expect(report.findings.find((item) => item.id === 'project-secrets')?.status).toBe('manual')
  expect(JSON.stringify(report)).not.toMatch(/PRIVATE_SERVER|PRIVATE_VALUE|PRIVATE_ARGS/)
})

test('an untyped remote MCP URL requires an explicit transport, while a placeholder URL stays manual', async () => {
  await data.write(
    '.mcp.json',
    JSON.stringify({ mcpServers: { remote: { url: 'https://example.com' } } }),
  )
  expect(
    (await scanProject(data.ctx, data.home)).findings.find((item) => item.id === 'project-mcp')
      ?.status,
  ).toBe('fail')
  await data.write(
    '.mcp.json',
    JSON.stringify({ mcpServers: { remote: { type: 'http', url: '' } } }),
  )
  expect(
    (await scanProject(data.ctx, data.home)).findings.find((item) => item.id === 'project-mcp')
      ?.status,
  ).toBe('manual')
})

test('empty credentials in a project settings env do not produce a storage warning', async () => {
  await data.write('.claude/settings.json', JSON.stringify({ env: { ANTHROPIC_API_KEY: '' } }))
  expect(
    (await scanProject(data.ctx, data.home)).findings.find((item) => item.id === 'project-secrets')
      ?.status,
  ).toBe('pass')
})
