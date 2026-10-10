import type { CheckResult, ScanReport } from './types.js'
export type ReportChangeKind = 'new-attention' | 'now-passing' | 'changed' | 'added' | 'missing'
export interface ReportChange {
  id: string
  title: string
  kind: ReportChangeKind
  before?: CheckResult
  after?: CheckResult
}
export const reportChangeLabels: Record<ReportChangeKind, string> = {
  'new-attention': '新出现的关注项',
  'now-passing': '现已通过',
  changed: '结果或证据变化',
  added: '新增检测项',
  missing: '本次未包含',
}
const isAttention = (check: CheckResult) => check.status === 'warn' || check.status === 'fail'
function fingerprint(check: CheckResult): string {
  // Sorting evidence avoids treating presentation order alone as an environment change.
  return JSON.stringify({
    status: check.status,
    summary: check.summary,
    evidence: [...check.evidence].sort((a, b) =>
      (a.label + a.value).localeCompare(b.label + b.value),
    ),
  })
}
export function compareReports(before: ScanReport, after: ScanReport) {
  const oldChecks = new Map(before.checks.map((check) => [check.id, check]))
  const newChecks = new Map(after.checks.map((check) => [check.id, check]))
  const changes: ReportChange[] = []
  for (const current of after.checks) {
    const previous = oldChecks.get(current.id)
    if (!previous)
      changes.push({ id: current.id, title: current.title, kind: 'added', after: current })
    else if (fingerprint(previous) !== fingerprint(current)) {
      const kind: ReportChangeKind =
        !isAttention(previous) && isAttention(current)
          ? 'new-attention'
          : previous.status !== 'pass' && current.status === 'pass'
            ? 'now-passing'
            : 'changed'
      changes.push({ id: current.id, title: current.title, kind, before: previous, after: current })
    }
  }
  for (const previous of before.checks)
    if (!newChecks.has(previous.id))
      changes.push({ id: previous.id, title: previous.title, kind: 'missing', before: previous })
  const counts: Record<ReportChangeKind, number> = {
    'new-attention': 0,
    'now-passing': 0,
    changed: 0,
    added: 0,
    missing: 0,
  }
  for (const change of changes) counts[change.kind]++
  const preferenceKeys = new Set([
    ...Object.keys(before.preferences),
    ...Object.keys(after.preferences),
  ])
  const preferencesChanged = [...preferenceKeys].some(
    (key) =>
      before.preferences[key as keyof typeof before.preferences] !==
      after.preferences[key as keyof typeof after.preferences],
  )
  const networkScopeChanged = before.networkEnabled !== after.networkEnabled
  return {
    changes,
    counts,
    unchanged: after.checks.filter(
      (check) => oldChecks.has(check.id) && !changes.some((change) => change.id === check.id),
    ).length,
    preferencesChanged,
    networkScopeChanged,
    detectionRulesChanged:
      before.ruleset !== after.ruleset || before.checks.length !== after.checks.length,
  }
}
