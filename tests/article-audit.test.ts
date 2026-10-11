import { expect, test } from 'vitest'
import { access } from 'node:fs/promises'
import { scanProject } from '../server/projects'
import { fixture } from './fixtures'
import { articleAuditEntries, articleModeDifferences } from '../shared/article-audit'
import { diagnosticCheckIds } from '../shared/diagnostic-checks'
import { defaultPreferences, fixIds, manualItems } from '../shared/types'

test('article links stay connected to implemented checks, manual records and files', async () => {
  expect(new Set(articleAuditEntries.map((entry) => entry.id)).size).toBe(
    articleAuditEntries.length,
  )
  for (const entry of articleAuditEntries) {
    for (const id of entry.checkIds ?? []) expect(diagnosticCheckIds).toContain(id)
    for (const id of entry.manualIds ?? []) expect(manualItems.map((item) => item.id)).toContain(id)
    for (const id of entry.fixIds ?? []) expect(fixIds).toContain(id)
    await expect(access(new URL('../' + entry.code, import.meta.url))).resolves.toBeUndefined()
    if (entry.coverage === 'automatic') expect(entry.checkIds?.length).toBeGreaterThan(0)
    if (entry.coverage === 'excluded') expect(entry.fixIds ?? []).toHaveLength(0)
  }
})
test('default mode differences remain visible even when individual checks pass', () => {
  expect(articleModeDifferences(defaultPreferences).map((item) => item.id)).toEqual([
    'route',
    'privacy',
  ])
  expect(
    articleModeDifferences({
      ...defaultPreferences,
      timezoneMode: 'manual',
      expectedTimezone: 'Asia/Shanghai',
      routeMode: 'custom',
      usageMode: 'custom',
    }).map((item) => item.id),
  ).toEqual(['timezone', 'route', 'endpoint', 'privacy'])
})
test('explicit article preferences have no mode difference while exit mode is labeled separately', () => {
  const preferences = {
    ...defaultPreferences,
    routeMode: 'tun' as const,
    privacy: 'minimal' as const,
  }
  expect(articleModeDifferences(preferences)).toEqual([])
  expect(
    articleModeDifferences({ ...preferences, timezoneMode: 'exit' }).map((item) => item.id),
  ).toEqual(['timezone'])
  expect(
    articleModeDifferences({
      ...preferences,
      timezoneMode: 'manual',
      expectedTimezone: 'Asia/Taipei',
    }),
  ).toEqual([])
})

test('every curated extension has a concrete adopted-section audit and implementation file', async () => {
  const { references } = await import('../shared/references')
  const { referenceAudits } = await import('../shared/reference-audit')
  expect(Object.keys(referenceAudits).sort()).toEqual(references.map((entry) => entry.id).sort())
  for (const entry of references) {
    const audit = referenceAudits[entry.id]!
    expect(audit.section.length).toBeGreaterThan(0)
    expect(audit.finding.length).toBeGreaterThan(0)
    await expect(access(new URL('../' + audit.code, import.meta.url))).resolves.toBeUndefined()
  }
})

test('article and reference project links resolve to findings produced by the scanner', async () => {
  const data = await fixture()
  try {
    const { references } = await import('../shared/references')
    // Per-file findings only exist when these optional project files are present.
    const settings = JSON.stringify({ hooks: {}, enableAllProjectMcpServers: true })
    await data.write('.claude/settings.json', settings)
    await data.write('.claude/settings.local.json', settings)
    const report = await scanProject(data.ctx, data.home)
    const ids = report.findings.map((finding) => finding.id)
    for (const entry of [...articleAuditEntries, ...references]) {
      for (const id of entry.projectCheckIds ?? []) expect(ids).toContain(id)
    }
  } finally {
    await data.cleanup()
  }
})
