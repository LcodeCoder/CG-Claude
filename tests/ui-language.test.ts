import { expect, test } from 'vitest'
import { detectUiLanguage, languageFromLocale } from '../shared/ui-language'

test('selects Chinese only for Chinese POSIX or BCP 47 locales', () => {
  expect(languageFromLocale('zh_CN.UTF-8')).toBe('zh-CN')
  expect(languageFromLocale('zh_TW.Big5')).toBe('zh-CN')
  expect(languageFromLocale('zh-Hans-CN')).toBe('zh-CN')
  expect(languageFromLocale('zh')).toBe('zh-CN')
  expect(languageFromLocale('en_US.UTF-8')).toBe('en')
  expect(languageFromLocale('ja_JP.UTF-8')).toBe('en')
  expect(languageFromLocale('C.UTF-8')).toBeUndefined()
  expect(languageFromLocale('POSIX')).toBeUndefined()
  expect(languageFromLocale('')).toBeUndefined()
})

test('resolves LC_ALL before LANGUAGE, LC_MESSAGES and LANG', () => {
  expect(detectUiLanguage({ LC_ALL: 'zh_CN.UTF-8', LANG: 'en_US.UTF-8' })).toBe('zh-CN')
  expect(detectUiLanguage({ LC_MESSAGES: 'zh_CN.UTF-8', LANG: 'en_US.UTF-8' })).toBe('zh-CN')
  expect(detectUiLanguage({ LANG: 'zh_CN.UTF-8' })).toBe('zh-CN')
  expect(detectUiLanguage({ LANGUAGE: 'zh_CN:en_US' })).toBe('zh-CN')
  expect(detectUiLanguage({ LANG: 'en_US.UTF-8', LANGUAGE: 'zh_CN:en_US' })).toBe('zh-CN')
})

test('falls back to English outside Chinese environments', () => {
  expect(detectUiLanguage({})).toBe('en')
  expect(detectUiLanguage({ LANG: 'C.UTF-8' })).toBe('en')
  expect(detectUiLanguage({ LANG: 'fr_FR.UTF-8' })).toBe('en')
  expect(detectUiLanguage({ LANG: 'C.UTF-8', CG_SYSTEM_LOCALE: 'de-DE' })).toBe('en')
  expect(detectUiLanguage({ CG_SYSTEM_LOCALE: 'zh-CN' })).toBe('zh-CN')
})
