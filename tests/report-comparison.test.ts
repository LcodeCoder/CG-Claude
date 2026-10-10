import { expect, test } from 'vitest'
import { compareReports } from '../shared/report-comparison'
import { defaultPreferences } from '../shared/types'
import type { CheckResult, ScanReport } from '../shared/types'
function check(id: string, status: CheckResult['status'], summary = '相同摘要'): CheckResult {
  return {
    id,
    status,
    summary,
    title: id,
    description: '',
    category: 'claude',
    evidence: [],
    recommendation: '',
    fixIds: [],
    source: 'system',
  }
}
function report(checks: CheckResult[], overrides: Partial<ScanReport> = {}): ScanReport {
  return {
    id: 'report',
    createdAt: '2026-10-11T00:00:00.000Z',
    completedAt: '2026-10-11T00:00:00.000Z',
    machine: {
      platform: 'darwin',
      platformName: 'macOS',
      hostname: 'fixture',
      arch: 'arm64',
      osVersion: '1',
      timezone: 'Asia/Shanghai',
      nodeVersion: '22',
    },
    preferences: { ...defaultPreferences },
    checks,
    networkEnabled: false,
    counts: { pass: 0, warn: 0, fail: 0, manual: 0, skipped: 0 },
    ...overrides,
  }
}

test('distinguishes new attention passing evidence changes additions and missing checks', () => {
  const before = report([
    check('attention', 'pass'),
    check('passing', 'warn'),
    check('pending', 'fail'),
    check('evidence', 'pass'),
    check('missing', 'warn'),
    check('unchanged', 'pass'),
  ])
  const after = report([
    check('attention', 'warn'),
    check('passing', 'pass'),
    check('pending', 'manual'),
    check('evidence', 'pass', '证据摘要有变化'),
    check('added', 'warn'),
    check('unchanged', 'pass'),
  ])
  const result = compareReports(before, after)
  expect(result.counts).toEqual({
    'new-attention': 1,
    'now-passing': 1,
    changed: 2,
    added: 1,
    missing: 1,
  })
  expect(result.unchanged).toBe(1)
  expect(result.changes.find((change) => change.id === 'pending')?.kind).toBe('changed')
  expect(result.changes.find((change) => change.id === 'added')?.kind).toBe('added')
})

test('reordered evidence does not imply changed environment and inputs remain untouched', () => {
  const beforeCheck = {
    ...check('stable', 'pass'),
    evidence: [
      { label: 'A', value: '1' },
      { label: 'B', value: '2' },
    ],
  }
  const afterCheck = {
    ...check('stable', 'pass'),
    evidence: [
      { label: 'B', value: '2' },
      { label: 'A', value: '1' },
    ],
  }
  const result = compareReports(report([beforeCheck]), report([afterCheck]))
  expect(result.changes).toEqual([])
  expect(result.unchanged).toBe(1)
  expect(afterCheck.evidence[0]?.label).toBe('B')
})

test('evidence changes count even when status and summary do not change', () => {
  const before = { ...check('auth', 'pass'), evidence: [{ label: '来源', value: '进程' }] }
  const after = { ...check('auth', 'pass'), evidence: [{ label: '来源', value: '用户文件' }] }
  expect(compareReports(report([before]), report([after])).changes[0]?.kind).toBe('changed')
})

test('changed preferences and network scope are explicit comparison conditions', () => {
  const before = report([])
  const after = report([], {
    preferences: { ...defaultPreferences, routeMode: 'tun' },
    networkEnabled: true,
  })
  const result = compareReports(before, after)
  expect(result.preferencesChanged).toBe(true)
  expect(result.networkScopeChanged).toBe(true)
  expect(result.changes).toEqual([])
})

test('rule changes and expanded coverage are called out separately from environment changes', () => {
  const before = report([check('same', 'pass')])
  const after = report([check('same', 'pass'), check('added', 'pass')], { ruleset: 'new-rules' })
  expect(compareReports(before, after).detectionRulesChanged).toBe(true)
})

test('preference key order alone does not change comparison conditions', () => {
  const before = report([])
  const entries = Object.entries(defaultPreferences).reverse()
  const after = report([], {
    preferences: Object.fromEntries(entries) as typeof defaultPreferences,
  })
  expect(compareReports(before, after).preferencesChanged).toBe(false)
})
