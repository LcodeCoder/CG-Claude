import { expect, test } from 'vitest'
import { environmentTerms, troubleshootingGuides } from '../src/content/troubleshooting'
import { englishHelp } from '../src/i18n/en-help'
import { manualItems } from '../shared/types'

test('all authored help and glossary copy has an English entry', () => {
  const keys: string[] = []
  for (const guide of troubleshootingGuides)
    keys.push(
      guide.title,
      guide.meaning,
      ...guide.steps,
      ...guide.checks.map((check) => check.label),
    )
  for (const term of environmentTerms) {
    keys.push(term.term, term.definition)
  }
  keys.push(...manualItems.map((item) => item.description))
  const missing = [...new Set(keys)].filter(
    (key) => /[\u4e00-\u9fff]/.test(key) && !(key in englishHelp),
  )
  expect(missing).toEqual([])
})
