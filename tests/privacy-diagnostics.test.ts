import { expect, test } from 'vitest'
import type { EnvironmentSources } from '../server/environment-sources'
import { privacyConfiguration } from '../server/privacy-diagnostics'
import { matchesPrivacyPreference } from '../shared/privacy'
import { defaultPreferences } from '../shared/types'
import { fixture } from './fixtures'
import { RepairEngine } from '../server/repairs'

function input(values: Record<string, string>): EnvironmentSources {
  return {
    sources: [
      { label: 'test process', kind: 'process', values, unresolved: [], hasApiKeyHelper: false },
    ],
    unavailable: [],
  }
}

test.each(['1', '0', 'false', 'anything', ' '])(
  'nonempty privacy switches opt out even when value is %s',
  (value) => {
    const check = privacyConfiguration(
      input({ DISABLE_TELEMETRY: value, DISABLE_ERROR_REPORTING: value }),
      defaultPreferences,
    )
    expect(check.status).toBe('pass')
    expect(check.fixIds).toEqual([])
  },
)

test.each(['1', 'true', 'YES', 'on'])(
  'DO_NOT_TRACK uses the documented boolean convention: %s',
  (value) => {
    expect(
      matchesPrivacyPreference({ DO_NOT_TRACK: value, DISABLE_ERROR_REPORTING: '1' }, 'balanced'),
    ).toBe(true)
  },
)

test.each(['0', 'false', '', 'random'])(
  'DO_NOT_TRACK does not behave like a presence switch: %s',
  (value) => {
    const check = privacyConfiguration(
      input({ DO_NOT_TRACK: value, DISABLE_ERROR_REPORTING: '1' }),
      defaultPreferences,
    )
    expect(check.status).toBe('warn')
  },
)

test('nonempty all-traffic switch satisfies both privacy choices without redundant flags', () => {
  const values = { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 'false' }
  for (const privacy of ['balanced', 'minimal'] as const) {
    expect(privacyConfiguration(input(values), { ...defaultPreferences, privacy }).status).toBe(
      'pass',
    )
  }
})

test('user settings empty override is honored and shell candidates are not asserted as active', () => {
  const sources = input({ DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1' })
  sources.sources.push({
    label: 'user settings',
    kind: 'claude',
    values: { DISABLE_TELEMETRY: '' },
    unresolved: [],
    hasApiKeyHelper: false,
  })
  expect(privacyConfiguration(sources, defaultPreferences).status).toBe('warn')
  sources.sources.push({
    label: 'shell',
    kind: 'shell',
    values: { DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1' },
    unresolved: [],
    hasApiKeyHelper: false,
  })
  const check = privacyConfiguration(sources, defaultPreferences)
  expect(check.status).toBe('manual')
  expect(check.summary).toContain('启动文件')
})

test('unreadable and conditional privacy configuration do not produce a false clean result', () => {
  const sources = input({ DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1' })
  sources.sources[0]!.unresolved.push('DO_NOT_TRACK')
  expect(privacyConfiguration(sources, defaultPreferences).status).toBe('manual')
  sources.sources[0]!.unresolved = []
  sources.unavailable.push('unreadable settings')
  expect(privacyConfiguration(sources, defaultPreferences).status).toBe('manual')
})

test('repair preview preserves equivalent privacy choices instead of rewriting user values', async () => {
  const item = await fixture()
  try {
    const original =
      JSON.stringify({
        env: { DO_NOT_TRACK: 'true', DISABLE_ERROR_REPORTING: '0' },
        permissions: { allow: [] },
      }) + '\n'
    await item.write('.claude/settings.json', original)
    const engine = new RepairEngine(item.ctx, item.storage)
    await expect(engine.preview(['claude-privacy'], defaultPreferences)).rejects.toThrow(
      '没有可自动修改',
    )
    expect(await item.read('.claude/settings.json')).toBe(original)
  } finally {
    await item.cleanup()
  }
})
