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
  expect(report.findings.find((item) => item.id === 'project-privacy')?.status).toBe('warn')
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
