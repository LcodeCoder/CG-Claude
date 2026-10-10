import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { defaultPreferences } from '../shared/types'
import { diagnosticCheckIds } from '../shared/diagnostic-checks'
import { readAllConfigs } from '../server/safety'
import { collectEnvironmentSources } from '../server/environment-sources'
import {
  authenticationSources,
  certificateConfiguration,
  proxyCompatibility,
} from '../server/configuration-diagnostics'
import { runDiagnostics } from '../server/diagnostics'
import { fixture } from './fixtures'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})
async function data(env: NodeJS.ProcessEnv = {}) {
  const fixtureData = await fixture({ env })
  cleanups.push(fixtureData.cleanup)
  return {
    ...fixtureData,
    sources: async () =>
      collectEnvironmentSources(fixtureData.ctx, await readAllConfigs(fixtureData.ctx)),
  }
}

test('proxy selection follows lowercase HTTPS precedence and hides URL credentials', async () => {
  const item = await data({
    https_proxy: 'http://user:PRIVATE_PASSWORD@localhost:7890',
    HTTPS_PROXY: 'http://localhost:7891',
  })
  const check = proxyCompatibility(await item.sources())
  expect(check.status).toBe('warn')
  expect(check.evidence[0]?.value).toContain('https_proxy · http://localhost:7890')
  expect(JSON.stringify(check)).not.toContain('PRIVATE_PASSWORD')
  expect(JSON.stringify(check)).not.toContain('user:')
})

test.each([
  { HTTPS_PROXY: 'socks5://localhost:1080' },
  { HTTP_PROXY: 'localhost:7890' },
  { ALL_PROXY: 'socks5://localhost:1080' },
])('unsupported or incomplete proxy configuration is a reviewable warning: %o', async (env) => {
  const item = await data(env)
  expect(proxyCompatibility(await item.sources()).status).toBe('warn')
})

test('NO_PROXY bypass is manual review rather than a faulty-route conclusion', async () => {
  const item = await data({
    HTTPS_PROXY: 'http://localhost:7890',
    NO_PROXY: 'localhost, .anthropic.com',
  })
  const check = proxyCompatibility(await item.sources())
  expect(check.status).toBe('manual')
  expect(check.summary).toContain('复核')
})

test('static shell literals are parsed without executing dynamic or conditional code', async () => {
  const item = await data()
  await item.write(
    '.zshrc',
    'export HTTPS_PROXY="http://localhost:7890" # literal\nif true; then\n  export ANTHROPIC_AUTH_TOKEN="sensitive-condition"\nfi\nexport NODE_EXTRA_CA_CERTS="$(touch should-never-run)"\n',
  )
  const input = await item.sources()
  const shell = input.sources.find((source) => source.kind === 'shell')!
  expect(shell.values.HTTPS_PROXY).toBe('http://localhost:7890')
  expect(shell.values.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
  expect(shell.unresolved).toEqual(['ANTHROPIC_AUTH_TOKEN', 'NODE_EXTRA_CA_CERTS'])
  expect(authenticationSources(input, defaultPreferences).status).toBe('manual')
  expect(JSON.stringify(authenticationSources(input, defaultPreferences))).not.toContain(
    'sensitive-condition',
  )
})

test('authentication reports names and existence while hiding all credential and helper content', async () => {
  const item = await data({
    ANTHROPIC_API_KEY: 'PLAIN_PRIVATE_KEY',
    CLAUDE_CODE_OAUTH_TOKEN: 'PLAIN_PRIVATE_OAUTH',
  })
  await item.write(
    '.claude/settings.json',
    JSON.stringify({
      apiKeyHelper: 'echo PRIVATE_HELPER_SCRIPT',
      env: { ANTHROPIC_AUTH_TOKEN: 'PRIVATE_BEARER' },
    }),
  )
  const check = authenticationSources(await item.sources(), defaultPreferences)
  expect(check.status).toBe('warn')
  const serialized = JSON.stringify(check)
  expect(serialized).toContain('ANTHROPIC_API_KEY')
  expect(serialized).toContain('apiKeyHelper')
  expect(serialized).not.toMatch(/PLAIN_PRIVATE|PRIVATE_HELPER|PRIVATE_BEARER/)
})

test('OAuth login is not declared missing when no explicit auth variables exist', async () => {
  const item = await data()
  const check = authenticationSources(await item.sources(), defaultPreferences)
  expect(check.status).toBe('manual')
  expect(check.summary).toContain('客户端确认')
  expect(check.fixIds).toEqual([])
})

test('multiple enabled cloud flags require review without guessing refresh-token prerequisites', async () => {
  const item = await data({
    CLAUDE_CODE_USE_BEDROCK: 'true',
    CLAUDE_CODE_USE_VERTEX: 'yes',
    CLAUDE_CODE_OAUTH_REFRESH_TOKEN: 'PRIVATE_REFRESH',
  })
  const check = authenticationSources(await item.sources(), {
    ...defaultPreferences,
    usageMode: 'bedrock',
  })
  expect(check.status).toBe('warn')
  expect(check.summary).toContain('多种认证')
  expect(JSON.stringify(check)).not.toContain('PRIVATE_REFRESH')
})

test('certificate metadata validates paired readable files without exposing file content', async () => {
  const item = await data()
  await item.write('certs/ca.pem', 'PRIVATE_CA_CONTENT')
  await item.write('certs/client.pem', 'PRIVATE_CERT_CONTENT')
  await item.write('certs/client.key', 'PRIVATE_KEY_CONTENT')
  item.ctx.env = {
    NODE_EXTRA_CA_CERTS: path.join(item.home, 'certs/ca.pem'),
    CLAUDE_CODE_CLIENT_CERT: path.join(item.home, 'certs/client.pem'),
    CLAUDE_CODE_CLIENT_KEY: path.join(item.home, 'certs/client.key'),
    CLAUDE_CODE_CLIENT_KEY_PASSPHRASE: 'PRIVATE_PASSPHRASE',
    CLAUDE_CODE_CERT_STORE: 'bundled,system',
  }
  const check = await certificateConfiguration(await item.sources())
  expect(check.status).toBe('pass')
  expect(check.summary).toContain('客户端验证')
  expect(JSON.stringify(check)).not.toMatch(/PRIVATE_|certs\/client/)
})

test('missing counterpart, empty certificate and unknown certificate store are reported', async () => {
  const item = await data()
  await item.write('empty.pem', '')
  item.ctx.env = {
    CLAUDE_CODE_CLIENT_CERT: path.join(item.home, 'empty.pem'),
    CLAUDE_CODE_CERT_STORE: 'invented',
  }
  const check = await certificateConfiguration(await item.sources())
  expect(check.status).toBe('warn')
  expect(check.evidence.some((entry) => entry.value.includes('其中一项'))).toBe(true)
  expect(check.evidence.some((entry) => entry.value.includes('文件为空'))).toBe(true)
  expect(check.evidence.some((entry) => entry.value.includes('未知来源'))).toBe(true)
})

test('relative certificate path is not guessed against the app working directory', async () => {
  const item = await data({ NODE_EXTRA_CA_CERTS: 'certs/ca.pem' })
  const check = await certificateConfiguration(await item.sources())
  expect(check.status).toBe('manual')
  expect(check.evidence[0]?.value).toContain('客户端工作目录')
})

test('unreadable or malformed user configuration cannot produce a complete clean result', async () => {
  const item = await data()
  await item.write('.claude/settings.json', '{malformed: private-data}')
  const input = await item.sources()
  expect(proxyCompatibility(input).status).toBe('manual')
  expect((await certificateConfiguration(input)).status).toBe('manual')
  expect(JSON.stringify(input.unavailable)).not.toContain('private-data')
})

test('full scan includes registry IDs once and catches TLS disabled in Claude settings', async () => {
  const item = await data()
  await item.write(
    '.claude/settings.json',
    JSON.stringify({ env: { NODE_TLS_REJECT_UNAUTHORIZED: '0' } }),
  )
  const report = await runDiagnostics(item.ctx, defaultPreferences, { network: false })
  expect(report.checks.map((check) => check.id).sort()).toEqual([...diagnosticCheckIds].sort())
  expect(report.checks.find((check) => check.id === 'tls-verification')?.status).toBe('fail')
  expect(Object.values(report.counts).reduce((sum, count) => sum + count, 0)).toBe(
    diagnosticCheckIds.length,
  )
  expect(await fs.readFile(path.join(item.home, '.claude/settings.json'), 'utf8')).toContain('"0"')
})

test('version-related OAuth refresh variables are not counted as a second login method', async () => {
  const item = await data({
    CLAUDE_CODE_OAUTH_TOKEN: 'PRIVATE_TOKEN',
    CLAUDE_CODE_OAUTH_REFRESH_TOKEN: 'PRIVATE_REFRESH',
  })
  const check = authenticationSources(await item.sources(), defaultPreferences)
  expect(check.status).toBe('manual')
  expect(check.summary).toContain('版本相关')
  expect(check.summary).not.toContain('多种认证')
  expect(JSON.stringify(check)).not.toMatch(/PRIVATE_TOKEN|PRIVATE_REFRESH/)
})

test('tilde in a settings env path is not expanded into a false certificate pass', async () => {
  const item = await data()
  await item.write('certs/ca.pem', 'EXISTS_BUT_NOT_THE_CONFIGURED_LITERAL_PATH')
  await item.write(
    '.claude/settings.json',
    JSON.stringify({ env: { NODE_EXTRA_CA_CERTS: '~/certs/ca.pem' } }),
  )
  const check = await certificateConfiguration(await item.sources())
  expect(check.status).toBe('manual')
  expect(check.evidence[0]?.value).toContain('不会展开')
})
