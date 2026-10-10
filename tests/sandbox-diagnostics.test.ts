import { expect, test } from 'vitest'
import { sandboxFinding } from '../server/sandbox-diagnostics'

const target = '.claude/settings.json'
test('missing declaration is skipped without asserting the effective sandbox is off', () => {
  const finding = sandboxFinding(target, undefined)
  expect(finding.status).toBe('skipped')
  expect(finding.summary).toContain('其他层')
})
test.each([
  null,
  [],
  'private-invalid-value',
  { enabled: 'private-invalid-value' },
  { excludedCommands: ['private-command', 4] },
  { filesystem: 'private-path' },
  { network: { allowLocalBinding: 'private-invalid-value' } },
])('rejects invalid checked fields without exposing values: %j', (value) => {
  const finding = sandboxFinding(target, value)
  expect(finding.status).toBe('fail')
  expect(JSON.stringify(finding)).not.toContain('private-')
})
test.each([
  { enabled: false },
  { enabled: true, enableWeakerNestedSandbox: true },
  { enabled: true, enableWeakerNetworkIsolation: true },
  { enabled: true, filesystem: { disabled: true } },
  { enabled: true, network: { allowAllUnixSockets: true } },
  { enabled: true, network: { allowLocalBinding: true } },
])('reports explicit disabled or weakened isolation declarations: %j', (value) => {
  expect(sandboxFinding(target, value).status).toBe('warn')
})
test('reports exception counts only and preserves the settings scope boundary', () => {
  const finding = sandboxFinding(target, {
    enabled: true,
    excludedCommands: ['private-command --key private-value'],
    unknownFutureKey: 'private-value',
  })
  expect(finding.status).toBe('manual')
  expect(finding.summary).toContain('1 条')
  expect(JSON.stringify(finding)).not.toContain('private-')
  expect(finding.evidence[0]?.value).toContain('未合并')
})
test('an enabled declaration still needs review if either fallback path is not constrained', () => {
  for (const value of [
    { enabled: true },
    { enabled: true, failIfUnavailable: true },
    { enabled: true, allowUnsandboxedCommands: false },
  ]) {
    expect(sandboxFinding(target, value).status).toBe('manual')
  }
})
test('passes only the inspected declaration with both fallback constraints', () => {
  const finding = sandboxFinding(target, {
    enabled: true,
    failIfUnavailable: true,
    allowUnsandboxedCommands: false,
    enableWeakerNetworkIsolation: false,
    filesystem: { disabled: false },
    excludedCommands: [],
  })
  expect(finding.status).toBe('pass')
  expect(finding.summary).toContain('声明')
  expect(finding.evidence[0]?.value).toContain('未启动沙箱')
})
