import { expect, test } from 'vitest'
import { browserLanguageCheck } from '../server/browser-language'
import { normalizeLanguage } from '../shared/browser-language'
import { defaultPreferences, preferencesSchema, browserSchema } from '../shared/types'

const browser = {
  timezone: 'America/Los_Angeles',
  language: 'en-US',
  languages: ['en-US', 'en'],
  platform: 'fixture',
}
test.each([
  ['en-US', 'pass'],
  ['en-CN', 'warn'],
  ['zh-CN', 'warn'],
  ['en-GB', 'warn'],
  ['invalid_tag', 'manual'],
])('checks %s separately from a matching timezone', (language, status) => {
  const result = browserLanguageCheck(defaultPreferences, {
    ...browser,
    language,
    languages: [language],
  })
  expect(result.status).toBe(status)
  expect(result.evidence.find((item) => item.label === '浏览器语言')?.value).toBe(language)
  expect(result.fixIds).toEqual([])
})
test('uses an explicitly selected target and detects conflicting preferred-language samples', () => {
  expect(
    browserLanguageCheck(
      { ...defaultPreferences, expectedBrowserLanguage: 'en' },
      { ...browser, language: 'en-GB', languages: ['en-GB'] },
    ).status,
  ).toBe('pass')
  expect(
    browserLanguageCheck(defaultPreferences, { ...browser, languages: ['zh-CN', 'en-US'] }).status,
  ).toBe('warn')
  expect(
    browserLanguageCheck(defaultPreferences, { ...browser, languages: ['invalid_tag'] }).status,
  ).toBe('manual')
  expect(browserLanguageCheck(defaultPreferences).status).toBe('skipped')
})
test('accepts legacy language samples and preferences while bounding untrusted sample lists', () => {
  expect(
    browserLanguageCheck(defaultPreferences, {
      timezone: 'Asia/Taipei',
      language: 'en-us',
      platform: 'legacy',
    }).status,
  ).toBe('pass')
  expect(preferencesSchema.parse({}).expectedBrowserLanguage).toBe('en-US')
  expect(preferencesSchema.safeParse({ expectedBrowserLanguage: 'arbitrary' }).success).toBe(false)
  expect(browserSchema.safeParse({ ...browser, languages: Array(21).fill('en-US') }).success).toBe(
    false,
  )
  expect(normalizeLanguage(' en-us ')).toBe('en-US')
})
